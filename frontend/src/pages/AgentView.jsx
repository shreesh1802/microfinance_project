import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { CheckCircle, AlertTriangle, Clock, User } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`toast ${type}`}>
      {type === 'success' ? <CheckCircle size={16} color="var(--success)" /> : <AlertTriangle size={16} color="var(--danger)" />}
      {msg}
    </div>
  );
}

export default function AgentView() {
  const [data, setData]         = useState([]);
  const [agents, setAgents]     = useState([]);
  const [currentAgentId, setCurrentAgentId] = useState(1);
  const [loading, setLoading]   = useState(true);
  const [collecting, setCollecting] = useState(null);
  const [toast, setToast]       = useState(null);
  const [historyLog, setHistoryLog] = useState([]);

  const fetchAgents = useCallback(() => {
    axios.get(`${API}/api/agents`)
      .then(res => {
        setAgents(res.data);
      })
      .catch(console.error);
  }, []);

  const fetch = useCallback(() => {
    if (!currentAgentId) return;
    setLoading(true);
    axios.get(`${API}/api/agent/collection?agentId=${currentAgentId}`)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [currentAgentId]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);
  useEffect(() => { fetch(); }, [fetch]);

  const handleCollect = async (row) => {
    setCollecting(row.loan_id);
    try {
      const res = await axios.post(`${API}/api/repayments`, {
        loan_id: row.loan_id,
        due_date: row.due_date,
        amount_paid: row.emi_amount,
        payment_mode: 'Cash',
        collected_by: row.agent_id
      });
      const time = new Date().toLocaleTimeString();
      const isLate = row.urgency === 'OVERDUE';
      setHistoryLog(prev => [{
        name: row.borrower_name,
        amount: row.emi_amount,
        status: isLate ? 'Late' : 'On Time',
        penalty: isLate ? (row.emi_amount * 0.02).toFixed(0) : 0,
        time
      }, ...prev]);
      setToast({ msg: `✓ Collected ₹${row.emi_amount} from ${row.borrower_name}`, type: 'success' });
      fetch();
    } catch (e) {
      setToast({ msg: 'Error recording payment', type: 'error' });
    }
    setCollecting(null);
  };

  const urgencyClass = u => u === 'OVERDUE' ? 'badge-danger' : u === 'DUE TODAY' ? 'badge-warning' : 'badge-info';
  const urgencyIcon  = u => u === 'OVERDUE' ? <AlertTriangle size={12}/> : u === 'DUE TODAY' ? <Clock size={12}/> : null;

  return (
    <div className="fade-in">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Agent Collection View</h1>
          <p>Agent Panel</p>
        </div>
        <div>
          <select 
            className="input-field" 
            style={{ width: '250px', padding: '0.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}
            value={currentAgentId} 
            onChange={e => setCurrentAgentId(Number(e.target.value))}
          >
            {agents.map(a => (
              <option key={a.agent_id} value={a.agent_id}>
                {a.name} — {a.region}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="stats-grid" style={{gridTemplateColumns:'repeat(3, 1fr)'}}>
        <div className="stat-card amber fade-in stagger-1">
          <div className="stat-label">Pending Today</div>
          <div className="stat-value">{data.filter(d => d.urgency === 'DUE TODAY').length}</div>
        </div>
        <div className="stat-card red fade-in stagger-2">
          <div className="stat-label">Overdue</div>
          <div className="stat-value">{data.filter(d => d.urgency === 'OVERDUE').length}</div>
        </div>
        <div className="stat-card green fade-in stagger-3">
          <div className="stat-label">Collected Today</div>
          <div className="stat-value">{historyLog.length}</div>
        </div>
      </div>

      <div className="two-col">
        <div>
          <div className="table-wrapper fade-in">
            <div className="table-header">
              <span className="table-title">Collection List</span>
              {loading && <div className="spinner" style={{width:20,height:20,borderWidth:2}} />}
            </div>
            <table>
              <thead>
                <tr><th>Borrower</th><th>Phone</th><th>EMI</th><th>Due Date</th><th>Priority</th><th>Action</th></tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
                        <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(99,102,241,0.2)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          <User size={14} color="#818cf8"/>
                        </div>
                        <span style={{fontWeight:600}}>{row.borrower_name}</span>
                      </div>
                    </td>
                    <td style={{color:'var(--text-secondary)'}}>{row.borrower_phone}</td>
                    <td style={{fontWeight:700}}>₹{Number(row.emi_amount).toLocaleString()}</td>
                    <td style={{color:'var(--text-secondary)'}}>{new Date(row.due_date).toLocaleDateString('en-IN')}</td>
                    <td>
                      <span className={`badge ${urgencyClass(row.urgency)}`} style={{display:'inline-flex',alignItems:'center',gap:'4px'}}>
                        {urgencyIcon(row.urgency)} {row.urgency}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-success"
                        onClick={() => handleCollect(row)}
                        disabled={collecting === row.loan_id}
                      >
                        {collecting === row.loan_id ? '...' : `Collect ₹${Number(row.emi_amount).toLocaleString()}`}
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && data.length === 0 && (
                  <tr><td colSpan="6">
                    <div className="empty-state"><CheckCircle size={32} color="var(--success)"/><p>All collections done! 🎉</p></div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card fade-in">
          <div className="table-title" style={{marginBottom:'1rem'}}>Today's Collection Log</div>
          {historyLog.length === 0
            ? <p style={{color:'var(--text-secondary)',fontSize:'0.875rem'}}>No collections yet today.</p>
            : historyLog.map((log, i) => (
                <div key={i} className="audit-item">
                  <div className="audit-dot" style={{background: log.status === 'Late' ? 'var(--warning)' : 'var(--success)'}} />
                  <div style={{flex:1}}>
                    <div style={{fontSize:'0.875rem',fontWeight:600}}>{log.name} — ₹{Number(log.amount).toLocaleString()}</div>
                    <div className="audit-time">
                      {log.status === 'Late' ? `⚠️ Late — ₹${log.penalty} penalty applied` : '✓ On Time'} · {log.time}
                    </div>
                  </div>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
}
