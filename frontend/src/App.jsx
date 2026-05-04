import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { useState, useEffect } from 'react';
import ManagerDashboard from './pages/ManagerDashboard';
import AgentView from './pages/AgentView';
import BorrowerView from './pages/BorrowerView';
import LoanOrigination from './pages/LoanOrigination';
import QueryConsole from './pages/QueryConsole';
import ParticleCanvas from './components/ParticleCanvas';

const NavIcon = ({ d }) => (
  <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export default function App() {
  const [isDark, setIsDark] = useState(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (isDark) {
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  return (
    <Router>
      <ParticleCanvas isDark={isDark} />
      
      {/* Sleek Theme Toggle */}
      <button 
        onClick={() => setIsDark(!isDark)}
        className="btn"
        style={{
          position: 'fixed',
          top: '1.5rem',
          right: '2rem',
          zIndex: 50,
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-card-alt)',
          border: '1px solid var(--border-strong)',
          color: 'var(--text-secondary)',
          boxShadow: 'var(--shadow-sm)',
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--text-primary)';
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = 'var(--shadow)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-secondary)';
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
        }}
        title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      >
        {isDark ? (
          <NavIcon d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        ) : (
          <NavIcon d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        )}
      </button>

      <div className="layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1a7a4a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span>Sahara MFI<span className="logo-dot"></span></span>
          </div>

          <div className="sidebar-section-label">Management</div>
          <NavLink to="/" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`} end>
            <NavIcon d="M12 20V10M18 20V4M6 20v-4" />
            Portfolio Overview
          </NavLink>

          <div className="sidebar-section-label">Operations</div>
          <NavLink to="/loans/new" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <NavIcon d="M12 5v14M5 12h14" />
            New Loan Application
          </NavLink>
          <NavLink to="/agent" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <NavIcon d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            Agent Collections
          </NavLink>

          <div className="sidebar-section-label">Developer</div>
          <NavLink to="/query" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <NavIcon d="M8 9l3 3-3 3M13 15h3" />
            SQL Query Console
          </NavLink>

          <div className="sidebar-section-label">Borrower</div>
          <NavLink to="/borrower" className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}>
            <NavIcon d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
            Borrower Dashboard
          </NavLink>

          <div style={{marginTop:'auto', padding:'1rem', borderTop:'1px solid var(--border)', marginLeft:'-0.75rem', marginRight:'-0.75rem', paddingLeft:'0.75rem', paddingRight:'0.75rem'}}>
            <div style={{fontSize:'0.75rem', color:'var(--text-secondary)', fontWeight:600}}>Sahara Microfinance v1.0</div>
            <div style={{fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.2rem'}}>Powered by SQLite · DBMS Demo</div>
          </div>
        </aside>

        {/* Main */}
        <main className="main-content">
          <Routes>
            <Route path="/"          element={<ManagerDashboard />} />
            <Route path="/loans/new" element={<LoanOrigination />} />
            <Route path="/agent"     element={<AgentView />} />
            <Route path="/borrower"  element={<BorrowerView />} />
            <Route path="/query"     element={<QueryConsole />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
