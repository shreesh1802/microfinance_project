import { useState } from 'react';
import axios from 'axios';
import { CheckCircle, AlertTriangle, IndianRupee } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function calculateEMI(p, rate, n) {
  const r = rate / 12 / 100;
  if (r === 0) return Math.round(p / n);
  return Math.round(p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1));
}

export default function LoanOrigination() {
  const [form, setForm] = useState({ name: '', phone: '', amount: '', tenure: '12' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const emiPreview = form.amount && form.tenure
    ? calculateEMI(Number(form.amount), 18, Number(form.tenure))
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await axios.post(`${API}/api/loans/apply`, form);
      setResult(res.data);
      setForm({ name: '', phone: '', amount: '', tenure: '12' });
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    }
    setLoading(false);
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h1>New Loan Application</h1>
        <p>Register a borrower and disburse a new microloan</p>
      </div>

      <div className="two-col">
        {/* Form */}
        <div className="card fade-in">
          <div className="table-title" style={{marginBottom:'1.5rem'}}>Borrower & Loan Details</div>
          <form onSubmit={handleSubmit}>
            <div className="form-grid" style={{gap:'1.25rem'}}>
              <div className="form-group">
                <label className="form-label">Borrower Name</label>
                <input className="form-input" placeholder="e.g. Meera Devi"
                  value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input className="form-input" placeholder="10-digit mobile" maxLength={10}
                  value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Loan Amount (₹)</label>
                <input className="form-input" type="number" placeholder="e.g. 25000"
                  value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} required />
              </div>
              <div className="form-group">
                <label className="form-label">Tenure (Months)</label>
                <select className="form-select" value={form.tenure} onChange={e => setForm({...form, tenure: e.target.value})}>
                  {[6,9,12,18,24].map(t => <option key={t} value={t}>{t} months</option>)}
                </select>
              </div>
            </div>

            {error && (
              <div style={{marginTop:'1rem', padding:'0.75rem 1rem', background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:'0.5rem', color:'var(--danger)', fontSize:'0.875rem', display:'flex', gap:'0.5rem'}}>
                <AlertTriangle size={16}/> {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{width:'100%', marginTop:'1.5rem', padding:'0.75rem'}} disabled={loading}>
              {loading ? 'Processing...' : '🚀 Disburse Loan'}
            </button>
          </form>
        </div>

        {/* Preview / Result */}
        <div style={{display:'flex', flexDirection:'column', gap:'1.25rem'}}>
          {/* EMI Preview */}
          <div className="card fade-in stagger-1">
            <div className="table-title" style={{marginBottom:'1rem'}}>Loan Preview</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem'}}>
              <div>
                <div className="stat-label">Principal</div>
                <div style={{fontWeight:700, fontSize:'1.25rem'}}>₹{Number(form.amount||0).toLocaleString()}</div>
              </div>
              <div>
                <div className="stat-label">Interest Rate</div>
                <div style={{fontWeight:700, fontSize:'1.25rem'}}>18% p.a.</div>
              </div>
              <div>
                <div className="stat-label">Tenure</div>
                <div style={{fontWeight:700, fontSize:'1.25rem'}}>{form.tenure} months</div>
              </div>
              <div>
                <div className="stat-label">Monthly EMI</div>
                <div style={{fontWeight:800, fontSize:'1.4rem', color:'var(--accent)'}}>
                  {emiPreview ? `₹${emiPreview.toLocaleString()}` : '—'}
                </div>
              </div>
            </div>
            <div style={{marginTop:'1rem', padding:'0.75rem', background:'rgba(99,102,241,0.1)', borderRadius:'0.5rem', fontSize:'0.8rem', color:'var(--text-secondary)'}}>
              💡 Calculated using reducing balance EMI formula
            </div>
          </div>

          {/* What happens behind the scenes */}
          <div className="card fade-in stagger-2">
            <div className="table-title" style={{marginBottom:'1rem'}}>What Happens on Submit</div>
            <div className="timeline">
              {[
                { label: 'User registration (if new)', sub: 'INSERT INTO users', color: 'paid' },
                { label: 'Credit score initialized', sub: 'INSERT INTO credit_scores (600 base)', color: 'paid' },
                { label: 'Loan record created', sub: 'INSERT INTO loans', color: 'paid' },
                { label: `${form.tenure || '?'} EMIs auto-generated`, sub: 'generate_emi_schedule() procedure', color: 'paid' },
                { label: 'Disbursement logged', sub: 'trg_log_disbursement trigger fires', color: 'paid' },
              ].map((step, i) => (
                <div key={i} className="timeline-item">
                  <div className="timeline-line">
                    <div className={`timeline-dot ${step.color}`} />
                    {i < 4 && <div className="timeline-connector" />}
                  </div>
                  <div className="timeline-content">
                    <div className="timeline-title">{step.label}</div>
                    <div className="timeline-sub" style={{fontFamily:'monospace'}}>{step.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Success Result */}
          {result && (
            <div className="card fade-in" style={{borderColor:'rgba(16,185,129,0.4)', background:'rgba(16,185,129,0.06)'}}>
              <div style={{display:'flex', gap:'0.75rem', alignItems:'flex-start'}}>
                <CheckCircle size={24} color="var(--success)" style={{flexShrink:0, marginTop:2}}/>
                <div>
                  <div style={{fontWeight:700, marginBottom:'0.5rem'}}>Loan Disbursed Successfully!</div>
                  <div style={{fontSize:'0.875rem', color:'var(--text-secondary)'}}>
                    Loan ID: <strong style={{color:'var(--text-primary)'}}>#{result.data?.loan_id}</strong><br/>
                    Amount: <strong style={{color:'var(--success)'}}>₹{Number(result.data?.principal_amount).toLocaleString()}</strong><br/>
                    EMI: <strong style={{color:'var(--success)'}}>₹{Number(result.data?.monthly_emi).toLocaleString()}/month</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
