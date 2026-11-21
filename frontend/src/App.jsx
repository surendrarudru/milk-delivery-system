import { useEffect, useState } from 'react'
import CustomerMaster from './CustomerMaster'
import RouteManager from './RouteManager'
import DeliveryEntry from './DeliveryEntry'
import MonthlyBilling from './MonthlyBilling'
import Reports from './Reports'
import MarketingAds from './MarketingAds'
import AuditLog from './AuditLog'
import './App.css'
import CustomerPayments, { parseLedgerBalances } from './CustomerPayments'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://milk-delivery-api-bn26.onrender.com')

const MENU = [
  ['dashboard', 'Dashboard', '📊'],
  ['customers', 'Customer Master', '👥'],
  ['morningRoute', 'Morning Route', '🌅'],
  ['eveningRoute', 'Evening Route', '🌆'],
  ['dailyDelivery', 'Daily Delivery', '🚚'],
  ['monthlyBills', 'Monthly Bills', '🧾'],
  ['payments', 'Payments', '💳'],
  ['reports', 'Reports', '📈'],
  ['marketingAds', 'Veenapusa Ads', '🧈'],
  ['auditLog', 'Audit Log', '🛡️']
]

const BOTTOM_TABS = [
  ['dashboard', 'Home', '📊'],
  ['dailyDelivery', 'Delivery', '🚚'],
  ['monthlyBills', 'Bills', '🧾'],
  ['payments', 'Pay', '💳'],
  ['auditLog', 'Audit', '🛡️']
]

const CARDS = [
  ['customers', '👥', 'Customer Master', 'Manage customer rates & details'],
  ['dailyDelivery', '🚚', 'Daily Delivery', 'Morning & Evening milk entries'],
  ['monthlyBills', '🧾', 'Monthly Bills', 'Telugu calendar bill & finalize'],
  ['morningRoute', '🌅', 'Morning Route', 'Morning delivery sequence'],
  ['eveningRoute', '🌆', 'Evening Route', 'Evening delivery sequence'],
  ['payments', '💳', 'Customer Payments', 'Record payments & receipts'],
  ['auditLog', '🛡️', 'Security Audit Log', 'Track who updated what & when']
]

export default function App() {
  const [adminAuth, setAdminAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mm_admin_auth') || 'null') } catch { return null }
  })
  const [loginForm, setLoginForm] = useState({ username: 'admin', pin: '' })
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  const [tab, setTab] = useState('dashboard')
  const [drawer, setDrawer] = useState(false)
  const [online, setOnline] = useState(true)
  const [stats, setStats] = useState({ total: 0, morning: 0, evening: 0, due: 0, pendingCount: 0 })

  useEffect(() => {
    const onAutoLogout = () => setAdminAuth(null)
    window.addEventListener('mm-admin-logout', onAutoLogout)
    return () => window.removeEventListener('mm-admin-logout', onAutoLogout)
  }, [])

  useEffect(() => {
    if (!adminAuth) return
    let active = true
    fetch(`${API_URL}/customers`)
      .then(r => r.json())
      .then(async data => {
        if (!active) return
        const activeList = (Array.isArray(data) ? data : []).filter(c => c.IsActive)
        const balances = await Promise.all(
          activeList.map(async c => {
            try {
              const res = await fetch(`${API_URL}/customers/${c.CustomerID}/ledger`)
              if (res.ok) return parseLedgerBalances(await res.json()).total
            } catch {}
            return Number(c.OpeningBalance || 0)
          })
        )
        const positiveBalances = balances.filter(val => val > 0)
        const totalDue = positiveBalances.reduce((sum, val) => sum + val, 0)
        if (!active) return
        setStats({
          total: activeList.length,
          morning: activeList.filter(c => c.MorningDelivery).length,
          evening: activeList.filter(c => c.EveningDelivery).length,
          due: totalDue,
          pendingCount: positiveBalances.length
        })
        setOnline(true)
      })
      .catch(() => { if (active) setOnline(false) })
    return () => { active = false }
  }, [tab, adminAuth])

  async function handleAdminLogin(e) {
    e.preventDefault()
    setLoggingIn(true); setLoginError('')
    try {
      const res = await fetch(`${API_URL}/auth/admin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Invalid Username or PIN')
      localStorage.setItem('mm_admin_auth', JSON.stringify(data))
      setAdminAuth(data)
      setLoginForm({ username: 'admin', pin: '' })
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoggingIn(false)
    }
  }

  function logoutAdmin() {
    localStorage.removeItem('mm_admin_auth')
    setAdminAuth(null)
  }

  if (!adminAuth) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #062819 0%, #0f4c2e 60%, #166534 100%)', padding: '20px' }}>
        <div style={{ width: '100%', maxWidth: '400px', background: '#fff', borderRadius: '22px', padding: '28px 24px', boxShadow: '0 24px 60px rgba(0,0,0,0.35)' }}>
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <div style={{ fontSize: '40px' }}>🥛🛡️</div>
            <h2 style={{ margin: '6px 0 4px', color: '#0f3d28' }}>Milk Manager Admin</h2>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Secure Login • All edits are tracked with User & Time</p>
          </div>
          {loginError && <div style={{ padding: '10px', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>{loginError}</div>}
          <form onSubmit={handleAdminLogin} style={{ display: 'grid', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '5px' }}>Select Account *</label>
              <select value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} style={{ width: '100%', padding: '11px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontWeight: 700 }}>
                <option value="admin">Surendra (Owner)</option>
                <option value="staff">Sudheer (Staff)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '5px' }}>Security PIN *</label>
              <input required type="password" inputMode="numeric" placeholder="Enter PIN" value={loginForm.pin} onChange={e => setLoginForm({ ...loginForm, pin: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '16px', letterSpacing: '3px' }} />
            </div>
            <button type="submit" disabled={loggingIn} style={{ marginTop: '4px', padding: '13px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '15px', cursor: 'pointer' }}>
              {loggingIn ? 'Verifying...' : 'Unlock Admin System →'}
            </button>
          </form>
        </div>
      </div>
    )
  }
  const go = id => { setTab(id); setDrawer(false) }
  const activeMenu = MENU.find(item => item[0] === tab)
  const currentTitle = activeMenu ? activeMenu[1] : 'Dashboard'

  return (
    <div className="app-shell">
      {drawer && <div className="mobile-drawer-backdrop" onClick={() => setDrawer(false)} />}
      <aside className={`app-sidebar ${drawer ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-title-row">
            <span className="brand-logo">🥛</span>
            <div><h2>Milk Manager</h2><p>Delivery System</p></div>
          </div>
          <button className="mobile-close-btn" onClick={() => setDrawer(false)}>✕</button>
        </div>
        <nav className="sidebar-nav">
          {MENU.map(([id, label, icon]) => (
            <button key={id} className={`sidebar-nav-btn ${tab === id ? 'active' : ''}`} onClick={() => go(id)}>
              <span className="nav-icon">{icon}</span><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className={`connection-pill ${online ? 'online' : 'offline'}`}>
            <span className="status-dot" />{online ? 'Server Connected' : 'Server Offline'}
          </div>
        </div>
      </aside>

      <div className="app-main-wrapper">
        <header className="app-topbar">
          <div className="topbar-left">
            <button className="hamburger-btn" onClick={() => setDrawer(true)}>☰</button>
            <div><h1 className="topbar-title">{currentTitle}</h1></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="admin-badge">🛡️ {adminAuth.full_name}</span>
            <button type="button" onClick={logoutAdmin} style={{ padding: '6px 12px', borderRadius: '20px', border: '1px solid #cbd5e1', background: '#fff', color: '#b91c1c', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>Logout</button>
          </div>
        </header>

        <main className="app-content">
          {!online && <div className="offline-banner">Backend offline on port 8000.</div>}
          {tab === 'dashboard' && (
            <div className="dashboard-container">
              <div className="welcome-hero-card">
                <div><h2>Milk Delivery Management</h2><p>Logged in as <strong>{adminAuth.full_name}</strong> ({adminAuth.role}) • All changes tracked.</p></div>
                <button className="hero-primary-btn" onClick={() => go('dailyDelivery')}>🚚 Start Daily Delivery</button>
              </div>
              <div className="kpi-grid">
                <div className="kpi-card" onClick={() => go('customers')}><span className="kpi-label">Active Customers</span><strong className="kpi-value">{stats.total}</strong></div>
                <div className="kpi-card" onClick={() => go('morningRoute')}><span className="kpi-label">Morning Route</span><strong className="kpi-value">{stats.morning}</strong></div>
                <div className="kpi-card" onClick={() => go('eveningRoute')}><span className="kpi-label">Evening Route</span><strong className="kpi-value">{stats.evening}</strong></div>
                <div className="kpi-card highlight" onClick={() => go('payments')}>
                  <span className="kpi-label">Outstanding ({stats.pendingCount} Customers)</span>
                  <strong className="kpi-value">₹{stats.due.toLocaleString('en-IN')}</strong>
                </div>
              </div>
              <div className="quick-access-grid">
                {CARDS.map(([id, icon, title, desc]) => (
                  <div className="quick-card" key={id}>
                    <div className="quick-card-icon">{icon}</div><h4>{title}</h4><p>{desc}</p>
                    <button onClick={() => go(id)}>Open {title}</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === 'customers' && <CustomerMaster />}
          {tab === 'morningRoute' && <RouteManager key="Morning" session="Morning" />}
          {tab === 'eveningRoute' && <RouteManager key="Evening" session="Evening" />}
          {tab === 'dailyDelivery' && <DeliveryEntry />}
          {tab === 'monthlyBills' && <MonthlyBilling />}
          {tab === 'payments' && <CustomerPayments />}
          {tab === 'reports' && <Reports />}
          {tab === 'marketingAds' && <MarketingAds />}
          {tab === 'auditLog' && <AuditLog currentUser={adminAuth} />}
        </main>
      </div>

      <nav className="mobile-bottom-nav">
        {BOTTOM_TABS.map(([id, label, icon]) => (
          <button key={id} className={`bottom-nav-btn ${tab === id ? 'active' : ''}`} onClick={() => go(id)}>
            <span className="bottom-nav-icon">{icon}</span><span className="bottom-nav-text">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
