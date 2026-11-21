import { useEffect, useMemo, useState } from 'react'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://onrender.com')

const MODULE_COLORS = {
  'Daily Delivery': { bg: '#ccfbf1', fg: '#0f766e', icon: '🚚' },
  'Delivery Correction': { bg: '#fee2e2', fg: '#b91c1c', icon: '✏️' },
  'Payments': { bg: '#dcfce7', fg: '#15803d', icon: '💳' },
  'Monthly Bills': { bg: '#fef3c7', fg: '#b45309', icon: '🧾' },
  'Customer Master': { bg: '#e0e7ff', fg: '#4338ca', icon: '👥' },
  'Route Order': { bg: '#f3e8ff', fg: '#7e22ce', icon: '🗺️' },
  'Admin Security': { bg: '#fce7f3', fg: '#be185d', icon: '🔑' }
}

export default function AuditLog({ currentUser }) {
  const [logs, setLogs] = useState([])
  const [users, setUsers] = useState([])
  const [custMap, setCustMap] = useState({})
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('All')
  const [roleFilter, setRoleFilter] = useState('All')
  const [loading, setLoading] = useState(false)
  const [userForm, setUserForm] = useState({ username: '', full_name: '', role: 'User', pin: '' })
  const [msg, setMsg] = useState('')

  async function loadAll() {
    setLoading(true)
    try {
      const [lRes, uRes, cRes] = await Promise.all([
        fetch(`${API_URL}/admin/audit-logs?limit=250`),
        fetch(`${API_URL}/admin/users`),
        fetch(`${API_URL}/customers`)
      ])
      if (lRes.ok) setLogs(await lRes.json())
      if (uRes.ok) setUsers(await uRes.json())
      if (cRes.ok) {
        const cList = await cRes.json()
        const map = {}
        ;(Array.isArray(cList) ? cList : []).forEach(c => {
          map[String(c.CustomerID)] = `${c.CustomerName} (${c.CustomerCode})`
        })
        setCustMap(map)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  async function saveUser(e) {
    e.preventDefault()
    setMsg('')
    const res = await fetch(`${API_URL}/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userForm)
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return setMsg(data.detail || 'Failed to save user')
    setMsg(data.message || 'User PIN saved!')
    setUserForm({ username: '', full_name: '', role: 'User', pin: '' })
    loadAll()
  }

  function formatSummary(summary) {
    if (!summary) return '-'
    return summary.replace(/Customer ID #(\d+)/g, (_, id) => custMap[id] || `Customer #${id}`)
  }

  const todayStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '-')
  const todayCount = logs.filter(l => (l.CreatedAt || '').startsWith(todayStr)).length
  const adminCount = logs.filter(l => l.ActorRole === 'Admin').length
  const userCount = logs.filter(l => l.ActorRole !== 'Admin').length

  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (moduleFilter !== 'All' && l.ModuleName !== moduleFilter) return false
      if (roleFilter !== 'All' && l.ActorRole !== roleFilter) return false
      const pretty = formatSummary(l.Summary)
      const q = search.toLowerCase().trim()
      return !q || [l.ActorRole, l.ModuleName, pretty, l.CreatedAt].some(v => (v || '').toLowerCase().includes(q))
    })
  }, [logs, moduleFilter, roleFilter, search, custMap])

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div style={{ background: 'linear-gradient(135deg, #0f4c2e 0%, #0f766e 100%)', color: '#fff', padding: '20px 24px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', boxShadow: '0 4px 14px rgba(15,76,46,0.16)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '21px' }}>🛡️ Security Audit Trail (ఎవరు • ఎప్పుడు • ఏమి మార్చారు)</h2>
          <p style={{ margin: '5px 0 0', fontSize: '13px', color: '#ccfbf1' }}>
            Real-time activity log with Role, IST Timestamp & Customer Details
          </p>
        </div>
        <button type="button" onClick={loadAll} disabled={loading} style={{ padding: '10px 18px', background: '#fff', color: '#0f4c2e', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}>
          {loading ? 'Refreshing...' : '↻ Refresh Logs'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
        <div onClick={() => setRoleFilter('All')} style={{ background: '#fff', padding: '14px 16px', borderRadius: '12px', border: roleFilter === 'All' ? '2px solid #0f766e' : '1px solid #e2e8f0', cursor: 'pointer' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Total Activities</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{logs.length}</div>
        </div>
        <div style={{ background: '#fff', padding: '14px 16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Today&apos;s Updates</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f766e', marginTop: '4px' }}>{todayCount}</div>
        </div>
        <div onClick={() => setRoleFilter('Admin')} style={{ background: '#fff', padding: '14px 16px', borderRadius: '12px', border: roleFilter === 'Admin' ? '2px solid #15803d' : '1px solid #e2e8f0', cursor: 'pointer' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Admin Edits</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#15803d', marginTop: '4px' }}>{adminCount}</div>
        </div>
        <div onClick={() => setRoleFilter('User')} style={{ background: '#fff', padding: '14px 16px', borderRadius: '12px', border: roleFilter === 'User' ? '2px solid #0369a1' : '1px solid #e2e8f0', cursor: 'pointer' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>User Edits</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0369a1', marginTop: '4px' }}>{userCount}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', background: '#fff', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <input type="text" placeholder="🔍 Search customer name, code, amount, or date..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: '220px', padding: '10px 14px', borderRadius: '9px', border: '1px solid #cbd5e1', fontSize: '13.5px' }} />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ padding: '10px 14px', borderRadius: '9px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '13px' }}>
          <option value="All">All Roles</option>
          <option value="Admin">🛡️ Admin Only</option>
          <option value="User">👤 User Only</option>
        </select>
        <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} style={{ padding: '10px 14px', borderRadius: '9px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '13px' }}>
          <option value="All">All Modules ({logs.length})</option>
          <option value="Daily Delivery">🚚 Daily Delivery</option>
          <option value="Delivery Correction">✏️ Delivery Correction</option>
          <option value="Payments">💳 Payments</option>
          <option value="Monthly Bills">🧾 Monthly Bills</option>
          <option value="Customer Master">👥 Customer Master</option>
          <option value="Route Order">🗺️ Route Order</option>
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflowX: 'auto', boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
              <th style={{ padding: '13px 16px' }}>When (ఎప్పుడు - IST)</th>
              <th style={{ padding: '13px 16px' }}>Who (ఎవరు)</th>
              <th style={{ padding: '13px 16px' }}>Module</th>
              <th style={{ padding: '13px 16px' }}>What Changed (ఏమి మార్చారు)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="4" style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>No matching audit records found.</td></tr>
            ) : filtered.map((row, idx) => {
              const isAdmin = row.ActorRole === 'Admin'
              const modStyle = MODULE_COLORS[row.ModuleName] || { bg: '#f1f5f9', fg: '#334155', icon: '📌' }
              return (
                <tr key={row.LogID} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc' }}>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', fontWeight: 600, color: '#475569', fontSize: '13px' }}>
                    🕒 {row.CreatedAt}
                  </td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '4px 11px', borderRadius: '999px', background: isAdmin ? '#dcfce7' : '#e0f2fe', color: isAdmin ? '#15803d' : '#0369a1', fontWeight: 800 }}>
                      {isAdmin ? '🛡️ Admin' : '👤 User'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '8px', background: modStyle.bg, color: modStyle.fg, fontWeight: 700, fontSize: '12px' }}>
                      {modStyle.icon} {row.ModuleName}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', color: '#0f172a', fontWeight: 600 }}>
                    {formatSummary(row.Summary)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {currentUser?.role === 'Admin' && (
        <div style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ marginTop: 0, color: '#0f172a' }}>🔑 Manage Admin & User Access PINs</h3>
          {msg && <div style={{ padding: '10px', background: '#dcfce7', color: '#15803d', borderRadius: '8px', marginBottom: '12px', fontWeight: 600 }}>{msg}</div>}
          <form onSubmit={saveUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            <input required placeholder="Username (admin / user)" value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <input required placeholder="Display Label (Admin / User)" value={userForm.full_name} onChange={e => setUserForm({ ...userForm, full_name: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 600 }}>
              <option value="User">User</option>
              <option value="Admin">Admin</option>
            </select>
            <input required type="password" placeholder="New PIN (4+ digits)" value={userForm.pin} onChange={e => setUserForm({ ...userForm, pin: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <button type="submit" style={{ padding: '10px 16px', background: '#0f4c2e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Save PIN</button>
          </form>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {users.map(u => (
              <div key={u.UserID} style={{ padding: '8px 14px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '13px' }}>
                <strong>{u.FullName}</strong> (@{u.Username}) • <span style={{ color: '#0f766e', fontWeight: 700 }}>{u.Role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
