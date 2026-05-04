import { useState, useEffect } from 'react';
import axios from 'axios';
import { TrendingUp, CheckCircle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function CreditRing({ score }) {
  const r = 46, circ = 2 * Math.PI * r;
  const pct = Math.min(score / 1000, 1);
  const dash = pct * circ;
  const color = score >= 700 ? '#10b981' : score >= 500 ? '#f59e0b' : '#ef4444';

  return (
    <div className="score-ring">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8"/>
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
      </svg>
      <div className="score-text">
        <span style={{color}}>{score}</span>
        <span>/ 1000</span>
      </div>
    </div>
  );
}

export default function BorrowerView() {
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(1);

  useEffect(() => {
    // Fetch users for dropdown
    axios.get(`${API}/api/users`)
      .then(res => {
        setUsers(res.data);
        if (res.data.length > 0) {
          // Default to the most recently registered user if not set
          const latestUserId = res.data[0].user_id;
          if (selectedUserId === 1 && res.data.length > 3) {
             setSelectedUserId(latestUserId);
          }
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    axios.get(`${API}/api/borrower/dashboard?userId=${selectedUserId}`)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedUserId]);

  if (loading) return <div className="loading-screen"><div className="spinner"/><p>Loading profile...</p></div>;
  if (!data) return <div>No data found.</div>;

  const loan    = data.loan;
  const credit  = data.credit_score;
  const eligible = data.eligibility;
  const paidPct = loan ? Math.round(((loan.principal_amount - loan.outstanding_balance) / loan.principal_amount) * 100) : 0;

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Welcome, {data.name} 👋</h1>
          <p>Your personal loan & credit dashboard</p>
        </div>
        <div style={{ marginRight: '3.5rem' }}>
          <select 
            className="form-select" 
            value={selectedUserId} 
            onChange={(e) => setSelectedUserId(Number(e.target.value))}
            style={{ width: '200px' }}
          >
            {users.map(u => (
              <option key={u.user_id} value={u.user_id}>{u.name}</option>
            ))}
          </select>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem', textAlign: 'right' }}>Select Profile</div>
        </div>
      </div>

      <div className="two-col">
        {/* Loan Card */}
        <div className="card fade-in stagger-1">
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.5rem'}}>
            <div>
              <div className="stat-label">Active Loan</div>
              <div style={{fontSize:'2rem', fontWeight:800}}>₹{Number(loan?.principal_amount||0).toLocaleString()}</div>
            </div>
            {loan && <span className={`badge ${loan.status==='Active'?'badge-info':loan.status==='Closed'?'badge-success':'badge-danger'}`}>{loan.status}</span>}
          </div>

          {loan && (
            <>
              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1.5rem'}}>
                <div>
                  <div className="stat-label">Monthly EMI</div>
                  <div style={{fontWeight:700, fontSize:'1.1rem'}}>₹{Number(loan.monthly_emi).toLocaleString()}</div>
                </div>
                <div>
                  <div className="stat-label">Outstanding</div>
                  <div style={{fontWeight:700, fontSize:'1.1rem', color:'var(--warning)'}}>₹{Number(loan.outstanding_balance).toLocaleString()}</div>
                </div>
              </div>
              <div>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:'0.5rem'}}>
                  <span className="stat-label">Repayment Progress</span>
                  <span style={{fontSize:'0.8rem', fontWeight:600, color:'var(--success)'}}>{paidPct}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{width:`${paidPct}%`}}></div>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', marginTop:'0.4rem', fontSize:'0.75rem', color:'var(--text-secondary)'}}>
                  <span>₹{(loan.principal_amount - loan.outstanding_balance).toLocaleString()} paid</span>
                  <span>₹{Number(loan.outstanding_balance).toLocaleString()} left</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Credit Score Card */}
        {credit && (
          <div className="card fade-in stagger-2">
            <div className="stat-label" style={{marginBottom:'1rem'}}>Credit Score</div>
            <CreditRing score={credit.score} />
            <div style={{textAlign:'center', marginTop:'1rem'}}>
              <span className={`badge ${credit.risk_category === 'Low' || credit.risk_category === 'Very Low' ? 'badge-success' : credit.risk_category === 'Medium' ? 'badge-warning' : 'badge-danger'}`}>
                {credit.risk_category} Risk
              </span>
              <p style={{fontSize:'0.8rem', color:'var(--text-secondary)', marginTop:'0.75rem'}}>
                {credit.score >= 700
                  ? '✓ Excellent repayment history'
                  : credit.score >= 500
                  ? '⚡ Building credit history'
                  : '⚠️ Needs improvement'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Eligibility Card */}
      {eligible && (
        <div className="card fade-in" style={{marginTop:'1.5rem', borderColor:'rgba(16,185,129,0.3)', background:'rgba(16,185,129,0.05)'}}>
          <div style={{display:'flex', alignItems:'center', gap:'1rem'}}>
            <div style={{background:'rgba(16,185,129,0.2)', padding:'0.75rem', borderRadius:'50%'}}>
              <TrendingUp size={24} color="var(--success)"/>
            </div>
            <div>
              <div style={{fontWeight:700, fontSize:'1rem'}}>🎉 You've graduated! Next loan eligibility</div>
              <div style={{color:'var(--text-secondary)', fontSize:'0.875rem', marginTop:'0.25rem'}}>
                Based on your credit score of {credit?.score}, you qualify for:
                <strong style={{color:'var(--success)'}}> ₹{Number(eligible.amount).toLocaleString()}</strong> at
                <strong style={{color:'var(--success)'}}> {eligible.rate}% interest</strong>
              </div>
            </div>
            <button className="btn btn-success" style={{marginLeft:'auto', flexShrink:0}}>
              Apply Now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
