const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('<h1>Sahara MFI API is Live!</h1><p>The backend is running successfully and ready to serve data.</p>');
});

// ─── Setup SQLite Database ──────────────────────────────────────────────────
const db = new Database(path.join(__dirname, 'sahara.db'), { verbose: console.log });

// Enable foreign keys and WAL mode
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// ─── Schema ─────────────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS self_help_groups (
    group_id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT NOT NULL,
    village TEXT NOT NULL,
    district TEXT NOT NULL,
    total_members INTEGER DEFAULT 0,
    formed_date TEXT NOT NULL,
    monthly_savings REAL DEFAULT 0.00,
    status TEXT DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    aadhaar TEXT UNIQUE,
    village TEXT,
    district TEXT,
    occupation TEXT,
    monthly_income REAL,
    education TEXT,
    has_bank_account INTEGER DEFAULT 0,
    group_id INTEGER,
    registration_date TEXT DEFAULT (date('now')),
    status TEXT DEFAULT 'Active',
    FOREIGN KEY (group_id) REFERENCES self_help_groups(group_id)
);

CREATE TABLE IF NOT EXISTS field_agents (
    agent_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    region TEXT NOT NULL,
    village_assigned TEXT,
    join_date TEXT DEFAULT (date('now')),
    status TEXT DEFAULT 'Active'
);

CREATE TABLE IF NOT EXISTS loan_applications (
    application_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    agent_id INTEGER,
    amount_requested REAL NOT NULL,
    purpose TEXT,
    tenure_requested INTEGER,
    application_date TEXT DEFAULT (date('now')),
    status TEXT DEFAULT 'Pending',
    reviewed_by TEXT,
    review_date TEXT,
    rejection_reason TEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (agent_id) REFERENCES field_agents(agent_id)
);

CREATE TABLE IF NOT EXISTS loans (
    loan_id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    principal_amount REAL NOT NULL,
    interest_rate REAL NOT NULL,
    tenure_months INTEGER NOT NULL,
    monthly_emi REAL,
    disbursement_date TEXT,
    maturity_date TEXT,
    outstanding_balance REAL,
    status TEXT DEFAULT 'Active',
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (application_id) REFERENCES loan_applications(application_id)
);

CREATE TABLE IF NOT EXISTS guarantors (
    guarantor_id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER NOT NULL,
    guarantor_user_id INTEGER,
    name TEXT NOT NULL,
    phone TEXT,
    relationship TEXT,
    monthly_income REAL,
    village TEXT,
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id),
    FOREIGN KEY (guarantor_user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS disbursements (
    disbursement_id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER NOT NULL UNIQUE,
    amount REAL NOT NULL,
    disbursement_method TEXT DEFAULT 'Cash',
    disbursed_by INTEGER,
    disbursement_date TEXT NOT NULL,
    recipient_signature INTEGER DEFAULT 0,
    witness_name TEXT,
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id),
    FOREIGN KEY (disbursed_by) REFERENCES field_agents(agent_id)
);

CREATE TABLE IF NOT EXISTS emi_schedule (
    emi_id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER NOT NULL,
    emi_number INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    emi_amount REAL NOT NULL,
    status TEXT DEFAULT 'Pending',
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id)
);

CREATE TABLE IF NOT EXISTS repayments (
    repayment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    loan_id INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    payment_date TEXT NOT NULL,
    amount_paid REAL NOT NULL,
    penalty_amount REAL DEFAULT 0.00,
    payment_mode TEXT DEFAULT 'Cash',
    collected_by INTEGER,
    status TEXT DEFAULT 'On_Time',
    remarks TEXT,
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id),
    FOREIGN KEY (collected_by) REFERENCES field_agents(agent_id)
);

CREATE TABLE IF NOT EXISTS credit_scores (
    score_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    risk_category TEXT NOT NULL,
    calculated_date TEXT DEFAULT (date('now')),
    notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS credit_score_history (
    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    score INTEGER NOT NULL,
    risk_category TEXT NOT NULL,
    recorded_date TEXT DEFAULT (date('now')),
    change_reason TEXT,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS business_impact (
    impact_id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    loan_id INTEGER NOT NULL,
    business_type TEXT,
    assets_purchased TEXT,
    monthly_revenue REAL DEFAULT 0,
    monthly_profit REAL DEFAULT 0,
    employment_generated INTEGER DEFAULT 0,
    customers_served INTEGER DEFAULT 0,
    assessment_date TEXT DEFAULT (date('now')),
    FOREIGN KEY (user_id) REFERENCES users(user_id),
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
    log_id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    ref_id INTEGER,
    description TEXT,
    log_time TEXT DEFAULT (datetime('now', 'localtime'))
);
`);

// ─── SQLite Triggers ────────────────────────────────────────────────────────
db.exec(`
CREATE TRIGGER IF NOT EXISTS trg_check_late_payment
BEFORE INSERT ON repayments
BEGIN
    SELECT CASE
        WHEN NEW.payment_date > NEW.due_date THEN
            RAISE(IGNORE) -- handled in app layer for SQLite
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_log_disbursement
AFTER INSERT ON disbursements
BEGIN
    INSERT INTO audit_log (action, ref_id, description)
    VALUES ('Loan_Disbursed', NEW.loan_id,
        'Amount: ' || NEW.amount || ', Method: ' || NEW.disbursement_method);
END;
`);

// ─── EMI Helper ─────────────────────────────────────────────────────────────
function calcEMI(p, annualRate, n) {
    const r = annualRate / 12 / 100;
    if (r === 0) return Math.round(p / n);
    return Math.round(p * r * Math.pow(1+r, n) / (Math.pow(1+r, n) - 1));
}

// ─── Seed Data ───────────────────────────────────────────────────────────────
const seedDone = db.prepare("SELECT count(*) as c FROM self_help_groups").get();
if (seedDone.c === 0) {
    db.exec(`
        INSERT INTO self_help_groups (group_name, village, district, total_members, formed_date, monthly_savings)
        VALUES ('Mahila Shakti Group', 'Ramgarh', 'Jaipur', 10, '2023-05-15', 500.00);

        INSERT INTO field_agents (name, phone, region, village_assigned)
        VALUES ('Rajesh Kumar', '9988776655', 'Jaipur Rural', 'Ramgarh');

        INSERT INTO users (name, phone, aadhaar, village, district, occupation, monthly_income, education, has_bank_account, group_id)
        VALUES
            ('Lakshmi Devi',  '9876543210', '123456789012', 'Ramgarh', 'Jaipur', 'Homemaker', 3000, '8th Grade', 0, 1),
            ('Sunita Meena',  '9871234567', '567890123456', 'Ramgarh', 'Jaipur', 'Farmer',    4000, '5th Grade', 1, 1),
            ('Radha Kumari',  '9876543211', '234567890123', 'Ramgarh', 'Jaipur', 'Tailor',    5000, '10th Grade',1, 1);

        INSERT INTO loan_applications (user_id, agent_id, amount_requested, purpose, tenure_requested, status, reviewed_by, review_date)
        VALUES
            (1, 1, 25000, 'Small business - Tailoring', 18, 'Approved', 'Manager Priya', '2024-11-20'),
            (2, 1, 15000, 'Agriculture equipment',     12, 'Approved', 'Manager Priya', '2024-12-01');

        INSERT INTO loans (application_id, user_id, principal_amount, interest_rate, tenure_months, monthly_emi, disbursement_date, maturity_date, outstanding_balance, status)
        VALUES
            (1, 1, 25000, 18, 18, 1595, '2024-11-25', '2026-05-25', 15000, 'Active'),
            (2, 2, 15000, 15, 12, 1353, '2024-12-01', '2025-12-01', 10000, 'Active');

        INSERT INTO disbursements (loan_id, amount, disbursement_method, disbursed_by, disbursement_date, recipient_signature, witness_name)
        VALUES
            (1, 25000, 'Cash',         1, '2024-11-25', 1, 'SHG Leader Sunita'),
            (2, 15000, 'Bank Transfer',1, '2024-12-01', 1, 'Agent Rajesh');

        INSERT INTO credit_scores (user_id, score, risk_category, notes)
        VALUES
            (1, 720, 'Low',    'Good SHG history, consistent savings'),
            (2, 650, 'Medium', 'First-time borrower, verified by SHG'),
            (3, 780, 'Low',    'Experienced tailor, strong income');

        INSERT INTO credit_score_history (user_id, score, risk_category, change_reason) VALUES
            (1, 600, 'Medium', 'Initial assessment Nov 2024'),
            (1, 680, 'Low',    '3 months on-time payments Feb 2025'),
            (1, 720, 'Low',    '6 months consistent repayment May 2025'),
            (2, 650, 'Medium', 'Initial assessment Dec 2024');

        INSERT INTO repayments (loan_id, due_date, payment_date, amount_paid, payment_mode, collected_by, status, penalty_amount, remarks)
        VALUES
            (1, '2024-12-25', '2024-12-23', 1595, 'Cash', 1, 'On_Time', 0,    'Paid 2 days early'),
            (1, '2025-01-25', '2025-01-25', 1595, 'Cash', 1, 'On_Time', 0,    'Paid on due date'),
            (1, '2025-02-25', '2025-02-28', 1000, 'Cash', 1, 'Late',    20,   'Partial - medical emergency'),
            (2, '2025-01-01', '2025-01-01', 1353, 'UPI',  1, 'On_Time', 0,    'On time via UPI');

        INSERT INTO emi_schedule (loan_id, emi_number, due_date, emi_amount, status)
        VALUES
            (1, 1, '2024-12-25', 1595, 'Paid'),
            (1, 2, '2025-01-25', 1595, 'Paid'),
            (1, 3, '2025-02-25', 1595, 'Late'),
            (1, 4, date('now', '+3 days'), 1595, 'Pending'),
            (2, 1, '2025-01-01', 1353, 'Paid'),
            (2, 2, date('now'), 1353, 'Pending');

        INSERT INTO business_impact (user_id, loan_id, business_type, assets_purchased, monthly_revenue, monthly_profit, employment_generated, customers_served)
        VALUES (1, 1, 'Tailoring', 'Sewing machine (15000), Raw materials (10000)', 8000, 4500, 1, 25);
    `);
    console.log('✓ Database seeded with sample data');
}

// ─── Views ───────────────────────────────────────────────────────────────────
db.exec(`
CREATE VIEW IF NOT EXISTS vw_manager_portfolio AS
SELECT
    s.group_name, s.village,
    COUNT(DISTINCT l.loan_id) AS total_loans,
    COALESCE(SUM(l.principal_amount),0) AS total_disbursed,
    COALESCE(SUM(l.outstanding_balance),0) AS total_outstanding,
    COUNT(CASE WHEN l.status='Active'    THEN 1 END) AS active_loans,
    COUNT(CASE WHEN l.status='Defaulted' THEN 1 END) AS defaulted_loans
FROM self_help_groups s
LEFT JOIN users u ON u.group_id = s.group_id
LEFT JOIN loans l ON l.user_id = u.user_id
GROUP BY s.group_id;

CREATE VIEW IF NOT EXISTS vw_agent_collection AS
SELECT
    fa.agent_id, fa.name AS agent_name,
    u.name AS borrower_name, u.phone AS borrower_phone, u.village AS borrower_village,
    l.loan_id, es.emi_amount, es.due_date, es.status AS emi_status,
    CASE
        WHEN es.due_date < date('now') THEN 'OVERDUE'
        WHEN es.due_date = date('now') THEN 'DUE TODAY'
        ELSE 'UPCOMING'
    END AS urgency
FROM field_agents fa
JOIN loan_applications la ON fa.agent_id = la.agent_id
JOIN loans l ON la.application_id = l.application_id
JOIN users u ON l.user_id = u.user_id
JOIN emi_schedule es ON l.loan_id = es.loan_id
WHERE l.status = 'Active' AND es.status IN ('Pending','Late');

CREATE VIEW IF NOT EXISTS vw_credit_trend AS
SELECT
    u.name, csh.score, csh.risk_category, csh.recorded_date, csh.change_reason
FROM credit_score_history csh
JOIN users u ON csh.user_id = u.user_id
ORDER BY csh.recorded_date;

CREATE VIEW IF NOT EXISTS vw_social_impact AS
SELECT
    u.village, u.district,
    COUNT(DISTINCT u.user_id)     AS total_borrowers,
    COUNT(DISTINCT l.loan_id)     AS total_loans,
    SUM(l.principal_amount)       AS total_disbursed,
    COUNT(CASE WHEN l.status='Closed' THEN 1 END) AS loans_completed,
    COUNT(DISTINCT bi.impact_id)  AS businesses_tracked,
    COALESCE(SUM(bi.employment_generated),0)   AS total_employment,
    COALESCE(ROUND(AVG(bi.monthly_revenue),0), 0) AS avg_revenue
FROM users u
LEFT JOIN loans l ON u.user_id = l.user_id
LEFT JOIN business_impact bi ON u.user_id = bi.user_id
WHERE u.user_id IN (SELECT user_id FROM loans)
GROUP BY u.village, u.district;
`);

// ─── API ROUTES ───────────────────────────────────────────────────────────────

app.get('/api/manager/portfolio', (req, res) => {
    try { res.json(db.prepare('SELECT * FROM vw_manager_portfolio').all()); }
    catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/users', (req, res) => {
    try { res.json(db.prepare('SELECT user_id, name FROM users ORDER BY user_id DESC').all()); }
    catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/agent/collection', (req, res) => {
    try { res.json(db.prepare('SELECT * FROM vw_agent_collection').all()); }
    catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/borrower/dashboard', (req, res) => {
    const userId = Number(req.query.userId) || 1;
    try {
        const user   = db.prepare('SELECT * FROM users WHERE user_id=?').get(userId);
        const loans_ = db.prepare('SELECT * FROM loans WHERE user_id=? ORDER BY loan_id DESC').all(userId);
        const loan   = loans_[0] || null;
        const credit = db.prepare('SELECT * FROM credit_scores WHERE user_id=? ORDER BY score_id DESC').get(userId);
        
        let eligibility = null;
        if (loan && loan.status === 'Closed' && credit) {
            const mult = credit.score >= 800 ? 2.5 : credit.score >= 700 ? 2.0 : 1.5;
            eligibility = {
                amount: loan.principal_amount * mult,
                rate: Math.max(10, loan.interest_rate - (credit.score >= 700 ? 2 : 0))
            };
        }
        res.json({ name: user.name, loan, credit_score: credit, eligibility });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/loans/apply', (req, res) => {
    const { name, phone, amount, tenure } = req.body;
    const applyLoan = db.transaction(() => {
        // 1. Upsert user
        let user = db.prepare('SELECT * FROM users WHERE phone=?').get(phone);
        if (!user) {
            const ins = db.prepare('INSERT INTO users (name, phone, village, district, occupation, monthly_income, group_id) VALUES (?,?,?,?,?,?,?)');
            const r = ins.run(name, phone, 'Ramgarh', 'Jaipur', 'Self-Employed', 3000, 1);
            user = { user_id: r.lastInsertRowid };
            db.prepare(`INSERT INTO credit_scores (user_id, score, risk_category, notes) VALUES (?,600,'Medium','New borrower - initial score')`).run(user.user_id);
            db.prepare(`INSERT INTO credit_score_history (user_id, score, risk_category, change_reason) VALUES (?,600,'Medium','Initial registration')`).run(user.user_id);
        }
        // 2. Create application
        const app_ = db.prepare(`INSERT INTO loan_applications (user_id, agent_id, amount_requested, purpose, tenure_requested, status, reviewed_by, review_date) VALUES (?,1,?,?,?,?,?,date('now'))`)
            .run(user.user_id, amount, 'Microloan', tenure, 'Approved', 'Manager');
        // 3. Calculate EMI
        const emi = calcEMI(Number(amount), 18, Number(tenure));
        // 4. Create loan
        const loanR = db.prepare(`INSERT INTO loans (application_id, user_id, principal_amount, interest_rate, tenure_months, monthly_emi, disbursement_date, maturity_date, outstanding_balance) VALUES (?,?,?,18,?,?,date('now'),date('now','+'||?||' months'),?)`)
            .run(app_.lastInsertRowid, user.user_id, amount, tenure, emi, tenure, amount);
        const loanId = loanR.lastInsertRowid;
        // 5. Generate EMI schedule
        const insEmi = db.prepare(`INSERT INTO emi_schedule (loan_id, emi_number, due_date, emi_amount) VALUES (?,?,date('now','+'||?||' months'),?)`);
        for (let i = 1; i <= tenure; i++) insEmi.run(loanId, i, i, emi);
        // 6. Disbursement record (trigger fires here → audit_log)
        db.prepare(`INSERT INTO disbursements (loan_id, amount, disbursement_method, disbursed_by, disbursement_date, recipient_signature) VALUES (?,?,'Cash',1,date('now'),1)`)
            .run(loanId, amount);
        return { loan_id: loanId, user_id: user.user_id, monthly_emi: emi, principal_amount: Number(amount) };
    });
    try {
        const result = applyLoan();
        res.json({ message: 'Loan disbursed successfully!', data: result });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/repayments', (req, res) => {
    const { loan_id, due_date, amount_paid, payment_mode, collected_by } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const isLate = today > due_date;
    const penalty = isLate ? amount_paid * 0.02 : 0;
    const status  = isLate ? 'Late' : 'On_Time';
    try {
        const doPayment = db.transaction(() => {
            db.prepare(`INSERT INTO repayments (loan_id, due_date, payment_date, amount_paid, penalty_amount, payment_mode, collected_by, status) VALUES (?,?,date('now'),?,?,?,?,?)`)
                .run(loan_id, due_date, amount_paid, penalty, payment_mode || 'Cash', collected_by || 1, status);
            db.prepare('UPDATE loans SET outstanding_balance = MAX(0, outstanding_balance - ?) WHERE loan_id=?').run(amount_paid, loan_id);
            db.prepare("UPDATE emi_schedule SET status='Paid' WHERE loan_id=? AND due_date=?").run(loan_id, due_date);
            
            const loan = db.prepare('SELECT * FROM loans WHERE loan_id=?').get(loan_id);
            
            // Incremental credit score update
            const scoreBump = isLate ? -15 : 5;
            db.prepare("UPDATE credit_scores SET score=MAX(300, MIN(1000, score+?)), risk_category=CASE WHEN score+?>=800 THEN 'Very Low' WHEN score+?>=700 THEN 'Low' WHEN score+?>=500 THEN 'Medium' ELSE 'High' END WHERE user_id=?").run(scoreBump, scoreBump, scoreBump, scoreBump, loan.user_id);
            db.prepare("INSERT INTO credit_score_history (user_id, score, risk_category, change_reason) SELECT user_id, score, risk_category, ? FROM credit_scores WHERE user_id=?").run(isLate ? 'Late EMI penalty' : 'On-time EMI boost', loan.user_id);

            if (loan.outstanding_balance <= 0) {
                db.prepare("UPDATE loans SET status='Closed' WHERE loan_id=?").run(loan_id);
                db.prepare("INSERT INTO audit_log (action, ref_id, description) VALUES ('Loan_Closed',?,'Loan fully repaid and auto-closed')").run(loan_id);
                db.prepare("UPDATE credit_scores SET score=MIN(1000,score+50), risk_category=CASE WHEN score+50>=800 THEN 'Very Low' WHEN score+50>=700 THEN 'Low' WHEN score+50>=500 THEN 'Medium' ELSE 'High' END WHERE user_id=?").run(loan.user_id);
                db.prepare("INSERT INTO credit_score_history (user_id, score, risk_category, change_reason) SELECT user_id, score, risk_category, 'Loan fully repaid completion bonus' FROM credit_scores WHERE user_id=?").run(loan.user_id);
            }
        });
        doPayment();
        res.json({ message: 'Repayment recorded', status, penalty });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── QUERY CONSOLE ───────────────────────────────────────────────────────────
app.post('/api/query', (req, res) => {
    const { sql } = req.body;
    if (!sql || !sql.trim()) return res.status(400).json({ error: 'Empty query' });
    try {
        const start = Date.now();
        const isSelect = /^\s*(select|with|explain)/i.test(sql.trim());
        if (isSelect) {
            const rows = db.prepare(sql).all();
            const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
            res.json({ type: 'select', columns: cols, rows, duration: Date.now() - start });
        } else {
            const result = db.prepare(sql).run();
            res.json({ type: 'write', changes: result.changes, lastId: result.lastInsertRowid, duration: Date.now() - start });
        }
    } catch(e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/tables', (req, res) => {
    const tables = db.prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type DESC, name").all();
    res.json(tables);
});

app.get('/api/audit-log', (req, res) => {
    try { res.json(db.prepare('SELECT * FROM audit_log ORDER BY log_time DESC LIMIT 20').all()); }
    catch(e) { res.status(500).json({ error: e.message }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`\n🚀 Sahara MFI API running on http://0.0.0.0:${PORT}\n✓ SQLite database ready with real SQL support\n`));
