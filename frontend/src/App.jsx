import { useEffect, useState } from 'react'
import CustomerMaster from './CustomerMaster'
import RouteManager from './RouteManager'
import DeliveryEntry from './DeliveryEntry'
import MonthlyBilling from './MonthlyBilling'
import Reports from './Reports'
import MarketingAds from './MarketingAds'
import AuditLog from './AuditLog'
import PartnerPortal from './PartnerPortal'
import './App.css'
import CustomerPayments, { parseLedgerBalances } from './CustomerPayments'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://' + 'milk-delivery-api-bn26' + '.onrender.com')

const ALL_MENU = [
  ['dashboard', 'Dashboard', '📊', ['Admin', 'User']],
  ['customers', 'Customer Master', '👥', ['Admin', 'User']],
  ['morningRoute', 'Morning Route', '🌅', ['Admin', 'User']],
  ['eveningRoute', 'Evening Route', '🌆', ['Admin', 'User']],
  ['dailyDelivery', 'Daily Delivery', '🚚', ['Admin', 'User']],
  ['monthlyBills', 'Monthly Bills', '🧾', ['Admin']],
  ['payments', 'Payments', '💳', ['Admin', 'User']],
  ['reports', 'Reports', '📈', ['Admin']],
  ['marketingAds', 'Veenapusa Ads', '🧈', ['Admin']],
  ['auditLog', 'Audit Log', '🛡️', ['Admin']],
  ['coOwnerView', 'Co-Owner Telugu View', '🎙️', ['Admin']]
]

const CARDS = [
  ['customers', '👥', 'Customer Master', 'Manage customer rates & details', ['Admin', 'User']],
  ['dailyDelivery', '🚚', 'Daily Delivery', 'Morning & Evening milk entries', ['Admin', 'User']],
  ['monthlyBills', '🧾', 'Monthly Bills', 'Telugu calendar bill & finalize', ['Admin']],
  ['morningRoute', '🌅', 'Morning Route', 'Morning delivery sequence', ['Admin', 'User']],
  ['eveningRoute', '🌆', 'Evening Route', 'Evening delivery sequence', ['Admin', 'User']],
  ['payments', '💳', 'Customer Payments', 'Record payments & receipts', ['Admin', 'User']],
  ['auditLog', '🛡️', 'Security Audit Log', 'Track who updated what & when', ['Admin']]
]

export default function App() {
  const [adminAuth, setAdminAuth] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mm_admin_auth') || 'null') } catch { return null }
  })
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [loginForm, setLoginForm] = useState({ username: 'staff', pin: '' })
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
        let totalDue = 0
        let pendingCount = 0
        if (adminAuth.role === 'Admin') {
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
          totalDue = positiveBalances.reduce((sum, val) => sum + val, 0)
          pendingCount = positiveBalances.length
        }
        if (!active) return
        setStats({
          total: activeList.length,
          morning: activeList.filter(c => c.MorningDelivery).length,
          evening: activeList.filter(c => c.EveningDelivery).length,
          due: totalDue,
          pendingCount
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
      setShowLoginModal(false)
      setTab('dashboard')
      setLoginForm({ username: 'staff', pin: '' })
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoggingIn(false)
    }
  }

  function logoutAdmin() {
    localStorage.removeItem('mm_admin_auth')
    setAdminAuth(null)
    setTab('dashboard')
  }

  if (!adminAuth) {
    return (
      <div style={{ minHeight: '100vh', background: '#f1f5f9', padding: '14px' }}>
        <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', background: '#fff', padding: '14px 20px', borderRadius: '14px', marginBottom: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '26px' }}>🥛</span>
              <div>
                <strong style={{ fontSize: '17px', color: '#0f4c2e', display: 'block' }}>కో-ఓనర్ రిపోర్ట్స్ & తెలుగు వాయిస్ పోర్టల్</strong>
                <span style={{ fontSize: '12px', color: '#64748b' }}>Read-Only Financial & Payment Summary</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setLoginError(''); setShowLoginModal(true) }}
              style={{ padding: '9px 16px', borderRadius: '10px', border: 'none', background: '#0f4c2e', color: '#fff', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
            >
              🔐 Admin / User Login
            </button>
          </div>

          <PartnerPortal />
        </div>

        {showLoginModal && (
          <div onClick={() => setShowLoginModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 9999 }}>
            <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '390px', background: '#fff', borderRadius: '20px', padding: '26px 22px', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, color: '#0f3d28' }}>🛡️ Admin / User Access</h3>
                <button type="button" onClick={() => setShowLoginModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}>✕</button>
              </div>
              {loginError && <div style={{ padding: '10px', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>{loginError}</div>}
              <form onSubmit={handleAdminLogin} style={{ display: 'grid', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '5px' }}>Select Role *</label>
                  <select value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} style={{ width: '100%', padding: '11px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontWeight: 700 }}>
                    <option value="admin">Admin</option>
                    <option value="staff">User</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '5px' }}>Security PIN *</label>
                  <input required type="password" inputMode="numeric" placeholder="Enter PIN" value={loginForm.pin} onChange={e => setLoginForm({ ...loginForm, pin: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '16px', letterSpacing: '3px' }} />
                </div>
                <button type="submit" disabled={loggingIn} style={{ marginTop: '4px', padding: '12px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '14.5px', cursor: 'pointer' }}>
                  {loggingIn ? 'Verifying...' : 'Unlock Workspace →'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }
  const role = adminAuth.role || 'User'
  const visibleMenu = ALL_MENU.filter(item => item[3].includes(role))
  const visibleCards = CARDS.filter(item => item[4].includes(role))
  const bottomTabs = role === 'Admin'
    ? [['dashboard', 'Home', '📊'], ['dailyDelivery', 'Delivery', '🚚'], ['monthlyBills', 'Bills', '🧾'], ['payments', 'Pay', '💳'], ['auditLog', 'Audit', '🛡️']]
    : [['dashboard', 'Home', '📊'], ['dailyDelivery', 'Delivery', '🚚'], ['morningRoute', 'Morning', '🌅'], ['eveningRoute', 'Evening', '🌆'], ['payments', 'Pay', '💳']]

  const go = id => { setTab(id); setDrawer(false) }
  const activeMenu = visibleMenu.find(item => item[0] === tab)
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
          {visibleMenu.map(([id, label, icon]) => (
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
            <span className="admin-badge">{role === 'Admin' ? '🛡️ Admin' : '👤 User'}</span>
            <button type="button" onClick={logoutAdmin} style={{ padding: '6px 12px', borderRadius: '20px', border: '1px solid #cbd5e1', background: '#fff', color: '#b91c1c', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
              Exit to Co-Owner View
            </button>
          </div>
        </header>

        <main className="app-content">
          {!online && <div className="offline-banner">Backend offline on port 8000.</div>}
          {tab === 'dashboard' && (
            <div className="dashboard-container">
              <div className="welcome-hero-card">
                <div>
                  <h2>Milk Delivery Management</h2>
                  <p>Signed in as <strong>{role}</strong> • All updates are recorded with timestamp.</p>
                </div>
                <button className="hero-primary-btn" onClick={() => go('dailyDelivery')}>🚚 Start Daily Delivery</button>
              </div>
              <div className="kpi-grid">
                <div className="kpi-card" onClick={() => go('customers')}><span className="kpi-label">Active Customers</span><strong className="kpi-value">{stats.total}</strong></div>
                <div className="kpi-card" onClick={() => go('morningRoute')}><span className="kpi-label">Morning Route</span><strong className="kpi-value">{stats.morning}</strong></div>
                <div className="kpi-card" onClick={() => go('eveningRoute')}><span className="kpi-label">Evening Route</span><strong className="kpi-value">{stats.evening}</strong></div>
                {role === 'Admin' && (
                  <div className="kpi-card highlight" onClick={() => go('payments')}>
                    <span className="kpi-label">Outstanding ({stats.pendingCount} Customers)</span>
                    <strong className="kpi-value">₹{stats.due.toLocaleString('en-IN')}</strong>
                  </div>
                )}
              </div>
              <div className="quick-access-grid">
                {visibleCards.map(([id, icon, title, desc]) => (
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
          {tab === 'monthlyBills' && role === 'Admin' && <MonthlyBilling />}
          {tab === 'payments' && <CustomerPayments />}
          {tab === 'reports' && role === 'Admin' && <Reports />}
          {tab === 'marketingAds' && role === 'Admin' && <MarketingAds />}
          {tab === 'auditLog' && role === 'Admin' && <AuditLog currentUser={adminAuth} />}
          {tab === 'coOwnerView' && role === 'Admin' && <PartnerPortal />}
        </main>
      </div>

      <nav className="mobile-bottom-nav">
        {bottomTabs.map(([id, label, icon]) => (
          <button key={id} className={`bottom-nav-btn ${tab === id ? 'active' : ''}`} onClick={() => go(id)}>
            <span className="bottom-nav-icon">{icon}</span><span className="bottom-nav-text">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
