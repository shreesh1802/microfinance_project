import { useState, useEffect } from 'react';
import axios from 'axios';
import { BarChart3, AlertCircle } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function ManagerDashboard() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/api/manager/portfolio`)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-screen"><div className="spinner" /><p>Loading portfolio...</p></div>;

  const totalDisbursed = data.reduce((a, r) => a + Number(r.total_disbursed || 0), 0);
  const totalActive   = data.reduce((a, r) => a + Number(r.active_loans || 0), 0);
  const totalDefault  = data.reduce((a, r) => a + Number(r.defaulted_loans || 0), 0);
  const totalLoans    = data.reduce((a, r) => a + Number(r.total_loans || 0), 0);

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>Portfolio Overview</h1>
        <p>Real-time overview of all SHG loan portfolios</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card indigo fade-in stagger-1">
          <div className="stat-label">Total Disbursed</div>
          <div className="stat-value">₹{totalDisbursed.toLocaleString()}</div>
          <div className="stat-sub">Across all SHGs</div>
        </div>
        <div className="stat-card green fade-in stagger-2">
          <div className="stat-label">Total Loans</div>
          <div className="stat-value">{totalLoans}</div>
          <div className="stat-sub">All time</div>
        </div>
        <div className="stat-card blue fade-in stagger-3">
          <div className="stat-label">Active Loans</div>
          <div className="stat-value">{totalActive}</div>
          <div className="stat-sub">Currently repaying</div>
        </div>
        <div className="stat-card red fade-in stagger-4">
          <div className="stat-label">Defaulted Loans</div>
          <div className="stat-value" style={{color: totalDefault > 0 ? 'var(--danger)' : 'inherit'}}>{totalDefault}</div>
          <div className="stat-sub">{totalLoans > 0 ? ((totalDefault/totalLoans)*100).toFixed(1) : 0}% default rate</div>
        </div>
      </div>

      <div className="table-wrapper fade-in">
        <div className="table-header">
          <span className="table-title">SHG Portfolio Breakdown</span>
          <span className="badge badge-info">{data.length} groups</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>SHG Name</th><th>Village</th><th>Total Loans</th>
              <th>Disbursed</th><th>Active</th><th>Defaulted</th><th>Health</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const defaultRate = row.total_loans > 0 ? (row.defaulted_loans / row.total_loans) * 100 : 0;
              return (
                <tr key={i}>
                  <td style={{fontWeight: 600}}>{row.group_name}</td>
                  <td style={{color: 'var(--text-secondary)'}}>{row.village}</td>
                  <td>{row.total_loans}</td>
                  <td>₹{Number(row.total_disbursed||0).toLocaleString()}</td>
                  <td><span className="badge badge-info">{row.active_loans}</span></td>
                  <td><span className={`badge ${row.defaulted_loans > 0 ? 'badge-danger' : 'badge-success'}`}>{row.defaulted_loans}</span></td>
                  <td>
                    <div style={{display:'flex', alignItems:'center', gap:'0.5rem'}}>
                      <div className="progress-bar" style={{width:'80px'}}>
                        <div className="progress-fill" style={{width:`${100 - defaultRate}%`, background: defaultRate > 10 ? 'var(--danger)' : 'linear-gradient(90deg, var(--accent), #34d399)'}}></div>
                      </div>
                      <span style={{fontSize:'0.75rem', color:'var(--text-secondary)'}}>{(100 - defaultRate).toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {data.length === 0 && (
              <tr><td colSpan="7"><div className="empty-state"><AlertCircle size={32} /><p>No portfolio data</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
