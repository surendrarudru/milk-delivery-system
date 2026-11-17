import { useEffect, useState } from 'react'
import CustomerMaster from './CustomerMaster'
import RouteManager from './RouteManager'
import DeliveryEntry from './DeliveryEntry'
import MonthlyBilling from './MonthlyBilling'
import Reports from './Reports'
import MarketingAds from './MarketingAds'
import './App.css'
import CustomerPayments, { parseLedgerBalances } from './CustomerPayments'


const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`

const MENU = [
  ['dashboard', 'Dashboard', '📊'],
  ['customers', 'Customer Master', '👥'],
  ['morningRoute', 'Morning Route', '🌅'],
  ['eveningRoute', 'Evening Route', '🌆'],
  ['dailyDelivery', 'Daily Delivery', '🚚'],
  ['monthlyBills', 'Monthly Bills', '🧾'],
  ['payments', 'Payments', '💳'],
  ['reports', 'Reports', '📈'],
  ['marketingAds', 'Veenapusa Ads', '🧈']
]

const BOTTOM_TABS = [
  ['dashboard', 'Home', '📊'],
  ['dailyDelivery', 'Delivery', '🚚'],
  ['monthlyBills', 'Bills', '🧾'],
  ['payments', 'Pay', '💳'],
  ['customers', 'Customers', '👥']
]

const CARDS = [
  ['customers', '👥', 'Customer Master', 'Manage customer rates & details'],
  ['dailyDelivery', '🚚', 'Daily Delivery', 'Morning & Evening milk entries'],
  ['monthlyBills', '🧾', 'Monthly Bills', 'Telugu calendar bill & finalize'],
  ['morningRoute', '🌅', 'Morning Route', 'Morning delivery sequence'],
  ['eveningRoute', '🌆', 'Evening Route', 'Evening delivery sequence'],
  ['payments', '💳', 'Customer Payments', 'Record payments & receipts'],
  ['marketingAds', '🧈', 'Veenapusa Ads', 'Festival wishes & butter posters']
]

export default function App() {
  const [tab, setTab] = useState('dashboard')
  const [drawer, setDrawer] = useState(false)
  const [online, setOnline] = useState(true)
  const [stats, setStats] = useState({ total: 0, morning: 0, evening: 0, due: 0, pendingCount: 0 })
  
      useEffect(() => {
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
  }, [tab])


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
          <span className="admin-badge">Admin</span>
        </header>

        <main className="app-content">
          {!online && <div className="offline-banner">Backend offline on port 8000.</div>}
          {tab === 'dashboard' && (
            <div className="dashboard-container">
              <div className="welcome-hero-card">
                <div><h2>Milk Delivery Management</h2><p>Daily deliveries, Telugu bills & payments.</p></div>
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
