const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Create connection pool
let pool;
if (process.env.MYSQL_URL) {
    // Railway provides MYSQL_URL automatically when a MySQL plugin is added
    // We append multipleStatements=true to allow the query console to run complex scripts
    const separator = process.env.MYSQL_URL.includes('?') ? '&' : '?';
    pool = mysql.createPool(process.env.MYSQL_URL + separator + 'multipleStatements=true');
} else {
    pool = mysql.createPool({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'sahara',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        multipleStatements: true // useful for /api/query
    });
}

app.get('/', (req, res) => {
    res.send('<h1>Sahara MFI API (MySQL) is Live!</h1><p>The backend is running successfully and ready to serve data.</p>');
});

app.get('/api/manager/portfolio', async (req, res) => {
    try { 
        const [rows] = await pool.query('SELECT * FROM vw_manager_portfolio');
        res.json(rows); 
    }
    catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users', async (req, res) => {
    try { 
        const [rows] = await pool.query('SELECT user_id, name FROM users ORDER BY user_id DESC');
        res.json(rows); 
    }
    catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/agents', async (req, res) => {
    try { 
        const [rows] = await pool.query('SELECT agent_id, name, region FROM field_agents ORDER BY agent_id ASC');
        res.json(rows); 
    }
    catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/agent/collection', async (req, res) => {
    const agentId = Number(req.query.agentId) || null;
    try { 
        let query = 'SELECT * FROM vw_agent_collection';
        let params = [];
        if (agentId) {
            query += ' WHERE agent_id = ?';
            params.push(agentId);
        }
        const [rows] = await pool.query(query, params);
        res.json(rows); 
    }
    catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/borrower/dashboard', async (req, res) => {
    const userId = Number(req.query.userId) || 1;
    try {
        const [userRows] = await pool.query('SELECT * FROM users WHERE user_id=?', [userId]);
        const user = userRows[0] || null;
        
        const [loanRows] = await pool.query('SELECT * FROM loans WHERE user_id=? ORDER BY loan_id DESC', [userId]);
        const loan = loanRows[0] || null;
        
        const [creditRows] = await pool.query('SELECT * FROM credit_scores WHERE user_id=? ORDER BY score_id DESC', [userId]);
        const credit = creditRows[0] || null;
        
        let eligibility = null;
        if (loan && loan.status === 'Closed' && credit) {
            const mult = credit.score >= 800 ? 2.5 : credit.score >= 700 ? 2.0 : 1.5;
            eligibility = {
                amount: loan.principal_amount * mult,
                rate: Math.max(10, loan.interest_rate - (credit.score >= 700 ? 2 : 0))
            };
        }
        res.json({ name: user?.name, loan, credit_score: credit, eligibility });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/loans/apply', async (req, res) => {
    const { name, phone, amount, tenure } = req.body;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // 1. Upsert user
        let [userRows] = await connection.query('SELECT * FROM users WHERE phone=?', [phone]);
        let userId;
        if (userRows.length === 0) {
            const [insR] = await connection.query('INSERT INTO users (name, phone, village, district, occupation, monthly_income, group_id) VALUES (?,?,?,?,?,?,?)', 
                [name, phone, 'Ramgarh', 'Jaipur', 'Self-Employed', 3000, 1]);
            userId = insR.insertId;
            await connection.query(`INSERT INTO credit_scores (user_id, score, risk_category, notes) VALUES (?,600,'Medium','New borrower - initial score')`, [userId]);
            await connection.query(`INSERT INTO credit_score_history (user_id, score, risk_category, change_reason) VALUES (?,600,'Medium','Initial registration')`, [userId]);
        } else {
            userId = userRows[0].user_id;
        }

        // 2. Create application
        const [appR] = await connection.query(`INSERT INTO loan_applications (user_id, agent_id, amount_requested, purpose, tenure_requested, status, reviewed_by, review_date) VALUES (?,1,?,?,?,?,?,CURDATE())`, 
            [userId, amount, 'Microloan', tenure, 'Approved', 'Manager']);
        
        // 3. Calculate EMI (using MySQL PL/SQL function from schema)
        const [emiRows] = await connection.query('SELECT calculate_emi(?, 18, ?) AS emi', [amount, tenure]);
        const emi = emiRows[0].emi;
        
        // 4. Create loan
        const [loanR] = await connection.query(`INSERT INTO loans (application_id, user_id, principal_amount, interest_rate, tenure_months, monthly_emi, disbursement_date, maturity_date, outstanding_balance) VALUES (?,?,?,18,?,?,CURDATE(),DATE_ADD(CURDATE(), INTERVAL ? MONTH),?)`, 
            [appR.insertId, userId, amount, tenure, emi, tenure, amount]);
        const loanId = loanR.insertId;

        // 5. Generate EMI schedule via stored procedure
        await connection.query(`CALL generate_emi_schedule(?)`, [loanId]);
        
        // 6. Disbursement record (will fire log_disbursement trigger)
        await connection.query(`INSERT INTO disbursements (loan_id, amount, disbursement_method, disbursed_by, disbursement_date, recipient_signature) VALUES (?,?,'Cash',1,CURDATE(),1)`, 
            [loanId, amount]);
        
        await connection.commit();
        res.json({ message: 'Loan disbursed successfully!', data: { loan_id: loanId, user_id: userId, monthly_emi: emi, principal_amount: Number(amount) } });
    } catch(e) { 
        await connection.rollback();
        res.status(500).json({ error: e.message }); 
    } finally {
        connection.release();
    }
});

app.post('/api/repayments', async (req, res) => {
    const { loan_id, due_date, amount_paid, payment_mode, collected_by } = req.body;
    
    // Status and penalty will actually be handled by the BEFORE INSERT trigger trg_check_late_payment
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // We let the trigger calculate penalty and status!
        await connection.query(`INSERT INTO repayments (loan_id, due_date, payment_date, amount_paid, payment_mode, collected_by) VALUES (?,?,CURDATE(),?,?,?)`, 
            [loan_id, due_date, amount_paid, payment_mode || 'Cash', collected_by || 1]);
        
        // The trg_auto_close_loan trigger will auto-close the loan if balance reaches 0
        await connection.query('UPDATE loans SET outstanding_balance = GREATEST(0, outstanding_balance - ?) WHERE loan_id=?', [amount_paid, loan_id]);
        await connection.query("UPDATE emi_schedule SET status='Paid' WHERE loan_id=? AND due_date=?", [loan_id, due_date]);
        
        const [loanRows] = await connection.query('SELECT * FROM loans WHERE loan_id=?', [loan_id]);
        const loan = loanRows[0];
        
        // Call the PL/SQL stored procedure to update the credit score based on new data
        await connection.query(`CALL calculate_credit_score(?)`, [loan.user_id]);

        await connection.commit();
        res.json({ message: 'Repayment recorded' });
    } catch(e) { 
        await connection.rollback();
        res.status(500).json({ error: e.message }); 
    } finally {
        connection.release();
    }
});

// ─── QUERY CONSOLE ───────────────────────────────────────────────────────────
app.post('/api/query', async (req, res) => {
    const { sql } = req.body;
    if (!sql || !sql.trim()) return res.status(400).json({ error: 'Empty query' });
    try {
        const start = Date.now();
        const isSelect = /^\s*(select|with|explain|show|describe)/i.test(sql.trim());
        const [result, fields] = await pool.query(sql);
        
        if (isSelect) {
            // fields might be undefined for some queries
            const cols = fields ? fields.map(f => f.name) : [];
            res.json({ type: 'select', columns: cols, rows: result, duration: Date.now() - start });
        } else {
            // if multipleStatements was true and it ran multiple queries, result is an array
            const changes = Array.isArray(result) ? result.reduce((acc, r) => acc + (r.affectedRows || 0), 0) : result.affectedRows;
            const lastId = Array.isArray(result) ? result[result.length - 1].insertId : result.insertId;
            res.json({ type: 'write', changes: changes, lastId: lastId, duration: Date.now() - start });
        }
    } catch(e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/tables', async (req, res) => {
    try {
        const [rows] = await pool.query(`SELECT table_name AS name, table_type AS type FROM information_schema.tables WHERE table_schema = DATABASE()`);
        res.json(rows.map(r => ({ name: r.name, type: r.type === 'VIEW' ? 'view' : 'table' })));
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/audit-log', async (req, res) => {
    try { 
        const [rows] = await pool.query('SELECT * FROM audit_log ORDER BY log_time DESC LIMIT 20');
        res.json(rows); 
    }
    catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`\n🚀 Sahara MFI API (MySQL) running on port ${PORT}\n`);
    try {
        const [res] = await pool.query('SELECT 1');
        console.log('✓ Successfully connected to MySQL database');
    } catch (err) {
        console.error('✗ Failed to connect to MySQL database:', err.message);
    }
});
