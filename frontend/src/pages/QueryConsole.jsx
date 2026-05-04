import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const PRESET_QUERIES = [
  {
    label: '📋 All Borrowers',
    category: 'Basic SELECT',
    sql: `SELECT user_id, name, phone, village, district, occupation, monthly_income, status
FROM users
ORDER BY user_id;`
  },
  {
    label: '🏦 Active Loans',
    category: 'Basic SELECT',
    sql: `SELECT l.loan_id, u.name AS borrower, l.principal_amount, 
       l.interest_rate, l.monthly_emi,
       l.outstanding_balance, l.status
FROM loans l
JOIN users u ON l.user_id = u.user_id
WHERE l.status = 'Active';`
  },
  {
    label: '📅 EMI Schedule',
    category: 'Basic SELECT',
    sql: `SELECT es.loan_id, u.name AS borrower, es.emi_number,
       es.due_date, es.emi_amount, es.status
FROM emi_schedule es
JOIN loans l ON es.loan_id = l.loan_id
JOIN users u ON l.user_id = u.user_id
ORDER BY es.loan_id, es.emi_number;`
  },
  {
    label: '💳 Repayment History',
    category: 'JOIN Queries',
    sql: `SELECT u.name, r.loan_id, r.due_date, r.payment_date,
       r.amount_paid, r.status, r.penalty_amount,
       fa.name AS collected_by
FROM repayments r
JOIN loans l ON r.loan_id = l.loan_id
JOIN users u ON l.user_id = u.user_id
LEFT JOIN field_agents fa ON r.collected_by = fa.agent_id
ORDER BY r.payment_date DESC;`
  },
  {
    label: '🔍 Overdue Payments',
    category: 'JOIN Queries',
    sql: `SELECT u.name, u.phone, u.district, l.loan_id,
       es.due_date, es.emi_amount,
       (julianday('now') - julianday(es.due_date)) AS days_overdue
FROM emi_schedule es
JOIN loans l ON es.loan_id = l.loan_id
JOIN users u ON l.user_id = u.user_id
WHERE es.status = 'Pending' AND es.due_date < date('now')
ORDER BY days_overdue DESC;`
  },
  {
    label: '🌐 Manager Portfolio View',
    category: 'Views',
    sql: `SELECT * FROM vw_manager_portfolio;`
  },
  {
    label: '🚗 Agent Collection View',
    category: 'Views',
    sql: `SELECT * FROM vw_agent_collection;`
  },
  {
    label: '📈 Credit Score Trend',
    category: 'Views',
    sql: `SELECT * FROM vw_credit_trend;`
  },
  {
    label: '🌍 Social Impact',
    category: 'Views',
    sql: `SELECT * FROM vw_social_impact;`
  },
  {
    label: '🏆 Loan Eligibility',
    category: 'Aggregate',
    sql: `SELECT u.name, cs.score, cs.risk_category,
       l.principal_amount AS prev_loan,
       l.interest_rate,
       CASE
           WHEN cs.score >= 800 THEN l.principal_amount * 2.5
           WHEN cs.score >= 700 THEN l.principal_amount * 2.0
           WHEN cs.score >= 600 THEN l.principal_amount * 1.5
           ELSE l.principal_amount
       END AS max_eligible,
       CASE
           WHEN cs.score >= 700 THEN MAX(10, l.interest_rate - 2)
           ELSE l.interest_rate
       END AS new_rate
FROM users u
JOIN credit_scores cs ON u.user_id = cs.user_id
JOIN loans l ON u.user_id = l.user_id;`
  },
  {
    label: '📊 SHG Repayment Rate',
    category: 'Aggregate',
    sql: `SELECT s.group_name, s.village,
       COUNT(l.loan_id) AS total_loans,
       SUM(l.principal_amount) AS total_disbursed,
       ROUND(
         COUNT(CASE WHEN r.status='On_Time' THEN 1 END) * 100.0 /
         MAX(COUNT(r.repayment_id), 1), 1
       ) AS on_time_pct
FROM self_help_groups s
JOIN users u ON u.group_id = s.group_id
JOIN loans l ON l.user_id = u.user_id
LEFT JOIN repayments r ON r.loan_id = l.loan_id
GROUP BY s.group_id;`
  },
  {
    label: '🔔 Audit Log',
    category: 'System',
    sql: `SELECT * FROM audit_log ORDER BY log_time DESC;`
  },
  {
    label: '🗂️ All Tables & Views',
    category: 'System',
    sql: `SELECT name, type FROM sqlite_master
WHERE type IN ('table','view')
  AND name NOT LIKE 'sqlite_%'
ORDER BY type DESC, name;`
  },
  {
    label: '✍️ Insert New SHG',
    category: 'DML – Write',
    sql: `INSERT INTO self_help_groups (group_name, village, district, total_members, formed_date, monthly_savings)
VALUES ('Nari Shakti Group', 'Shahpura', 'Jaipur', 8, '2024-01-10', 300.00);`
  },
  {
    label: '✍️ Add Field Agent',
    category: 'DML – Write',
    sql: `INSERT INTO field_agents (name, phone, region, village_assigned)
VALUES ('Vikram Singh', '9812345678', 'Jaipur South', 'Shahpura');`
  },
  {
    label: '✏️ Update Credit Score',
    category: 'DML – Write',
    sql: `UPDATE credit_scores
SET score = 780, risk_category = 'Low',
    notes = 'Manually updated after field review'
WHERE user_id = 2;`
  },
  {
    label: '🗑️ Delete EMI Schedule',
    category: 'DML – Write',
    sql: `-- CAUTION: Deletes data
DELETE FROM emi_schedule 
WHERE loan_id = 1 AND status = 'Pending';`
  },
  {
    label: '🗑️ Delete User',
    category: 'DML – Write',
    sql: `-- CAUTION: Will fail if user has active loans (Foreign Key constraint)
DELETE FROM users WHERE user_id = 3;`
  },
];

const CATEGORIES = [...new Set(PRESET_QUERIES.map(q => q.category))];

export default function QueryConsole() {
  const [sql, setSql]         = useState(PRESET_QUERIES[0].sql);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [tables, setTables]   = useState([]);
  const [activeCategory, setActiveCategory] = useState('Basic SELECT');
  const textareaRef           = useRef(null);

  useEffect(() => {
    axios.get(`${API}/api/tables`).then(r => setTables(r.data)).catch(() => {});
  }, []);

  const runQuery = useCallback(async (querySql) => {
    const q = querySql || sql;
    if (!q.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await axios.post(`${API}/api/query`, { sql: q });
      setResult(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Query failed');
    }
    setLoading(false);
  }, [sql]);

  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runQuery(); }
    if (e.key === 'Tab') { e.preventDefault(); const s=e.target.selectionStart,en=e.target.selectionEnd; setSql(sql.substring(0,s)+'    '+sql.substring(en)); setTimeout(()=>{e.target.selectionStart=e.target.selectionEnd=s+4;},0); }
  };

  const selectPreset = (q) => { setSql(q.sql); setResult(null); setError(''); };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>SQL Query Console</h1>
        <p>Run live queries against the real SQLite database — Press <kbd style={{background:'rgba(255,255,255,0.1)',padding:'0.1rem 0.4rem',borderRadius:'0.25rem',fontSize:'0.8rem'}}>Ctrl+Enter</kbd> to execute</p>
      </div>

      <div style={{display:'grid', gridTemplateColumns:'240px 1fr', gap:'1.5rem', alignItems:'start'}}>

        {/* LEFT — Sidebar: Tables + Presets */}
        <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
          {/* Table list */}
          <div className="card" style={{padding:'1rem'}}>
            <div style={{fontSize:'0.75rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-secondary)',marginBottom:'0.75rem'}}>Database Objects</div>
            {tables.map((t, i) => (
              <div key={i}
                onClick={() => { const q = `SELECT * FROM ${t.name} LIMIT 20;`; setSql(q); runQuery(q); }}
                style={{display:'flex',alignItems:'center',gap:'0.5rem',padding:'0.4rem 0.5rem',borderRadius:'0.4rem',cursor:'pointer',fontSize:'0.8rem',transition:'background 0.15s'}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.05)'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}
              >
                <span style={{color: t.type==='view' ? '#a78bfa' : '#60a5fa', fontFamily:'monospace', fontSize:'0.65rem', fontWeight:700, background:'rgba(255,255,255,0.05)', padding:'0.1rem 0.4rem', borderRadius:'0.25rem'}}>
                  {t.type==='view' ? 'VIEW' : 'TBL'}
                </span>
                <span style={{color:'var(--text-secondary)'}}>{t.name}</span>
              </div>
            ))}
          </div>

          {/* Preset category tabs */}
          <div className="card" style={{padding:'1rem'}}>
            <div style={{fontSize:'0.75rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-secondary)',marginBottom:'0.75rem'}}>Preset Queries</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:'0.35rem',marginBottom:'0.75rem'}}>
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={`btn ${activeCategory===cat ? 'btn-primary' : 'btn-ghost'}`}
                  style={{padding:'0.2rem 0.5rem',fontSize:'0.7rem'}}>
                  {cat}
                </button>
              ))}
            </div>
            {PRESET_QUERIES.filter(q => q.category === activeCategory).map((q, i) => (
              <div key={i} onClick={() => selectPreset(q)}
                style={{padding:'0.5rem 0.6rem',borderRadius:'0.4rem',cursor:'pointer',fontSize:'0.8rem',marginBottom:'0.25rem',border:'1px solid transparent',transition:'all 0.15s'}}
                onMouseEnter={e=>{e.currentTarget.style.background='rgba(99,102,241,0.1)';e.currentTarget.style.borderColor='rgba(99,102,241,0.3)';}}
                onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.borderColor='transparent';}}
              >
                {q.label}
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Editor + Results */}
        <div style={{display:'flex',flexDirection:'column',gap:'1.25rem'}}>
          {/* Editor */}
          <div className="card" style={{padding:'0'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.75rem 1rem',borderBottom:'1px solid var(--border)'}}>
              <span style={{fontFamily:'monospace',fontSize:'0.8rem',color:'var(--text-secondary)'}}>sahara.db</span>
              <button className="btn btn-primary" onClick={() => runQuery()} disabled={loading} style={{padding:'0.4rem 1.25rem'}}>
                {loading ? '⟳ Running...' : '▶ Run Query'}
              </button>
            </div>
            <textarea
              ref={textareaRef}
              value={sql}
              onChange={e => setSql(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              style={{
                width:'100%', minHeight:'180px', padding:'1.25rem',
                background:'transparent', border:'none', outline:'none',
                color:'var(--text-primary)', fontFamily:'monospace', fontSize:'0.875rem',
                lineHeight:'1.6', resize:'vertical'
              }}
              placeholder="-- Type your SQL query here and press Ctrl+Enter to run..."
            />
          </div>

          {/* Error */}
          {error && (
            <div style={{padding:'1rem',background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'0.75rem',color:'var(--danger)',fontFamily:'monospace',fontSize:'0.875rem'}}>
              ⚠ {error}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="card" style={{padding:0}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.75rem 1.25rem',borderBottom:'1px solid var(--border)'}}>
                <span style={{fontWeight:700}}>
                  {result.type === 'select'
                    ? `${result.rows.length} row${result.rows.length !== 1 ? 's' : ''} returned`
                    : `✓ ${result.changes} row${result.changes !== 1 ? 's' : ''} affected`}
                </span>
                <span style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>⚡ {result.duration}ms</span>
              </div>

              {result.type === 'select' && result.rows.length > 0 ? (
                <div style={{overflowX:'auto'}}>
                  <table>
                    <thead>
                      <tr>
                        {result.columns.map(col => <th key={col}>{col}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((row, i) => (
                        <tr key={i}>
                          {result.columns.map(col => {
                            const v = row[col];
                            let badge = null;
                            if (col === 'status' || col === 'emi_status') {
                              const cls = v === 'Active' || v === 'On_Time' || v === 'Paid' || v === 'Approved' ? 'badge-success'
                                        : v === 'Late' || v === 'Pending' ? 'badge-warning'
                                        : v === 'Defaulted' || v === 'Blocked' ? 'badge-danger' : 'badge-info';
                              badge = <span className={`badge ${cls}`}>{v}</span>;
                            }
                            if (col === 'urgency') {
                              const cls = v === 'OVERDUE' ? 'badge-danger' : v === 'DUE TODAY' ? 'badge-warning' : 'badge-info';
                              badge = <span className={`badge ${cls}`}>{v}</span>;
                            }
                            return (
                              <td key={col} style={{fontFamily: typeof v === 'number' ? 'monospace' : 'inherit'}}>
                                {badge || (v === null ? <span style={{color:'var(--text-secondary)',fontStyle:'italic'}}>NULL</span> : String(v))}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : result.type === 'select' ? (
                <div className="empty-state"><p>Query returned 0 rows</p></div>
              ) : (
                <div style={{padding:'1.25rem',color:'var(--success)',fontWeight:600}}>
                  ✓ Query executed successfully. Rows affected: {result.changes}
                  {result.lastId > 0 && <span style={{color:'var(--text-secondary)',fontWeight:400}}> · New ID: {result.lastId}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
