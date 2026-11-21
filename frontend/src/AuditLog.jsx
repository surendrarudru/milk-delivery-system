import { useEffect, useMemo, useState } from 'react'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const PROD_API = ['https:/', '://onrender.com'].join('/')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://' + 'milk-delivery-api-bn26' + '.onrender.com')

const MODULE_STYLES = {
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
  const [expandedId, setExpandedId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [userForm, setUserForm] = useState({ username: '', full_name: '', role: 'User', pin: '' })
  const [msg, setMsg] = useState('')

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [lRes, uRes, cRes] = await Promise.all([
        fetch(`${API_URL}/admin/audit-logs?limit=250`),
        fetch(`${API_URL}/admin/users`),
        fetch(`${API_URL}/customers`)
      ])
      if (!lRes.ok) {
        const errData = await lRes.json().catch(() => ({}))
        throw new Error(errData.detail || 'Failed to load audit logs')
      }
      setLogs(await lRes.json())
      if (uRes.ok) setUsers(await uRes.json())
      if (cRes.ok) {
        const cList = await cRes.json()
        const map = {}
        ;(Array.isArray(cList) ? cList : []).forEach(c => {
          map[String(c.CustomerID)] = `${c.CustomerName} (${c.CustomerCode})`
        })
        setCustMap(map)
      }
    } catch (e) {
      setError(e.message)
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
    if (!res.ok) return setMsg(data.detail || 'Failed to save access PIN')
    setMsg(data.message || 'Access PIN saved successfully!')
    setUserForm({ username: '', full_name: '', role: 'User', pin: '' })
    loadAll()
  }

  function formatSummary(summary) {
    if (!summary) return '-'
    return summary.replace(/Customer ID #(\d+)/g, (_, id) => custMap[id] || `Customer #${id}`)
  }

  function buildDetailChips(row) {
    if (!row?.Details) return []
    try {
      const d = JSON.parse(row.Details)
      if (!d || typeof d !== 'object') return []
      const chips = []

      if (d.CustomerCode) chips.push(`Code: ${d.CustomerCode}`)
      if (d.CustomerName) chips.push(`Name: ${d.CustomerName}`)
      if (d.MobileNumber) chips.push(`Mobile: ${d.MobileNumber}`)
      if (d.MilkRate !== undefined) chips.push(`Milk Rate: ₹${d.MilkRate}/L`)
      if (d.DefaultMilkQuantity !== undefined && d.DefaultMilkQuantity !== null) chips.push(`Default Qty: ${d.DefaultMilkQuantity}L`)
      if (d.MorningDelivery !== undefined || d.EveningDelivery !== undefined) {
        const shifts = [d.MorningDelivery && 'Morning', d.EveningDelivery && 'Evening'].filter(Boolean)
        if (shifts.length) chips.push(`Shift: ${shifts.join(' & ')}`)
      }
      if (d.IsActive !== undefined) chips.push(`Status: ${d.IsActive ? 'Active' : 'Inactive'}`)

      if (d.PaymentMode) chips.push(`Mode: ${d.PaymentMode}`)
      if (d.PaymentDate) chips.push(`Date: ${d.PaymentDate}`)
      if (Number(d.OpeningBalanceAmount || 0) > 0) chips.push(`Opening Paid: ₹${d.OpeningBalanceAmount}`)
      if (Number(d.MilkAmount || 0) > 0) chips.push(`Milk Paid: ₹${d.MilkAmount}`)
      if (Number(d.VeenaPusaAmount || 0) > 0) chips.push(`Veena Pusa Paid: ₹${d.VeenaPusaAmount}`)

      if (d.DeliveryDate && d.Session) chips.push(`Session: ${d.DeliveryDate} (${d.Session})`)
      if (Array.isArray(d.Deliveries)) {
        const del = d.Deliveries.filter(x => x.DeliveryStatus === 'Delivered').length
        const undel = d.Deliveries.filter(x => x.DeliveryStatus === 'Undelivered').length
        chips.push(`Delivered: ${del}`)
        chips.push(`Undelivered: ${undel}`)
      }
      if (d.DeliveryStatus && !Array.isArray(d.Deliveries)) chips.push(`New Status: ${d.DeliveryStatus}`)
      if (d.MilkQuantity !== undefined && !Array.isArray(d.Deliveries)) chips.push(`Milk Qty: ${d.MilkQuantity}L`)
      if (d.Notes) chips.push(`Notes: ${d.Notes}`)

      return chips
    } catch {
      return []
    }
  }

  function exportCSV() {
    const rows = [['Timestamp (IST)', 'Role', 'Action', 'Module', 'Summary', 'Detailed Changes']]
    filtered.forEach(r => {
      rows.push([
        r.CreatedAt,
        r.ActorRole,
        r.ActionType,
        r.ModuleName,
        formatSummary(r.Summary),
        buildDetailChips(r).join(' | ')
      ])
    })
    const csv = rows.map(r => r.map(v => '"' + String(v || '').replace(/"/g, '""') + '"').join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `MilkManager_AuditLog_${new Date().toLocaleDateString('en-CA')}.csv`
    a.click()
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
      const detailText = buildDetailChips(l).join(' ')
      const q = search.toLowerCase().trim()
      return !q || [l.ActorRole, l.ModuleName, pretty, detailText, l.CreatedAt].some(v => (v || '').toLowerCase().includes(q))
    })
  }, [logs, moduleFilter, roleFilter, search, custMap])

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div style={{ background: 'linear-gradient(135deg, #0f4c2e 0%, #0f766e 100%)', color: '#fff', padding: '22px 26px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', boxShadow: '0 4px 14px rgba(15,76,46,0.16)' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '21px', letterSpacing: '-0.2px' }}>🛡️ Security & Activity Audit Log</h2>
          <p style={{ margin: '5px 0 0', fontSize: '13px', color: '#ccfbf1' }}>
            Complete system accountability — tracks user role, IST timestamp, module, and detailed field-level changes
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={exportCSV} disabled={!filtered.length} style={{ padding: '10px 15px', background: 'rgba(255,255,255,0.16)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '10px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>
            📥 Export CSV
          </button>
          <button type="button" onClick={loadAll} disabled={loading} style={{ padding: '10px 18px', background: '#fff', color: '#0f4c2e', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '13px', cursor: 'pointer' }}>
            {loading ? 'Refreshing...' : '↻ Refresh Logs'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#b91c1c', borderRadius: '10px', fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px' }}>
        <div onClick={() => { setRoleFilter('All'); setModuleFilter('All') }} style={{ background: '#fff', padding: '15px 18px', borderRadius: '12px', border: roleFilter === 'All' && moduleFilter === 'All' ? '2px solid #0f766e' : '1px solid #e2e8f0', cursor: 'pointer' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total Activities</span>
          <div style={{ fontSize: '25px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>{logs.length}</div>
        </div>
        <div style={{ background: '#fff', padding: '15px 18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Today&apos;s Updates</span>
          <div style={{ fontSize: '25px', fontWeight: 800, color: '#0f766e', marginTop: '4px' }}>{todayCount}</div>
        </div>
        <div onClick={() => setRoleFilter('Admin')} style={{ background: '#fff', padding: '15px 18px', borderRadius: '12px', border: roleFilter === 'Admin' ? '2px solid #15803d' : '1px solid #e2e8f0', cursor: 'pointer' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Admin Updates</span>
          <div style={{ fontSize: '25px', fontWeight: 800, color: '#15803d', marginTop: '4px' }}>{adminCount}</div>
        </div>
        <div onClick={() => setRoleFilter('User')} style={{ background: '#fff', padding: '15px 18px', borderRadius: '12px', border: roleFilter === 'User' ? '2px solid #0369a1' : '1px solid #e2e8f0', cursor: 'pointer' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>User Updates</span>
          <div style={{ fontSize: '25px', fontWeight: 800, color: '#0369a1', marginTop: '4px' }}>{userCount}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', background: '#fff', padding: '12px 14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <input type="text" placeholder="🔍 Search by customer name, code, amount, status, or date..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: '230px', padding: '10px 14px', borderRadius: '9px', border: '1px solid #cbd5e1', fontSize: '13.5px' }} />
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
        {(search || roleFilter !== 'All' || moduleFilter !== 'All') && (
          <button type="button" onClick={() => { setSearch(''); setRoleFilter('All'); setModuleFilter('All') }} style={{ padding: '10px 14px', borderRadius: '9px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 700, fontSize: '12.5px', cursor: 'pointer' }}>
            Reset Filters
          </button>
        )}
      </div>
      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflowX: 'auto', boxShadow: '0 2px 8px rgba(15,23,42,0.04)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
          <thead>
            <tr style={{ background: '#0f4c2e', color: '#ffffff' }}>
              <th style={{ padding: '13px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>Timestamp (IST)</th>
              <th style={{ padding: '13px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>Performed By</th>
              <th style={{ padding: '13px 16px', fontWeight: 700, whiteSpace: 'nowrap' }}>Module</th>
              <th style={{ padding: '13px 16px', fontWeight: 700 }}>Detailed Change Summary</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="4" style={{ padding: '26px', textAlign: 'center', color: '#64748b' }}>No audit log entries match your current filter.</td></tr>
            ) : filtered.map((row, idx) => {
              const isAdmin = row.ActorRole === 'Admin'
              const modStyle = MODULE_STYLES[row.ModuleName] || { bg: '#f1f5f9', fg: '#334155', icon: '📌' }
              const chips = buildDetailChips(row)
              const isExpanded = expandedId === row.LogID
              return (
                <tr key={row.LogID} style={{ borderBottom: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', verticalAlign: 'top' }}>
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap', fontWeight: 600, color: '#475569', fontSize: '13px' }}>
                    🕒 {row.CreatedAt}
                  </td>
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px', padding: '4px 11px', borderRadius: '999px', background: isAdmin ? '#dcfce7' : '#e0f2fe', color: isAdmin ? '#15803d' : '#0369a1', fontWeight: 800 }}>
                      {isAdmin ? '🛡️ Admin' : '👤 User'}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '8px', background: modStyle.bg, color: modStyle.fg, fontWeight: 700, fontSize: '12px' }}>
                      {modStyle.icon} {row.ModuleName}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ color: '#0f172a', fontWeight: 700 }}>{formatSummary(row.Summary)}</span>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', background: '#f1f5f9', color: '#475569' }}>
                        {row.ActionType}
                      </span>
                    </div>
                    {chips.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '7px' }}>
                        {chips.map((chip, cIdx) => (
                          <span key={cIdx} style={{ fontSize: '11.5px', fontWeight: 600, padding: '3px 9px', borderRadius: '6px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}>
                            {chip}
                          </span>
                        ))}
                      </div>
                    )}
                    {row.Details && (
                      <div style={{ marginTop: '6px' }}>
                        <button type="button" onClick={() => setExpandedId(isExpanded ? null : row.LogID)} style={{ background: 'none', border: 'none', padding: 0, color: '#0f766e', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}>
                          {isExpanded ? 'Hide Raw Payload' : 'View Raw Payload'}
                        </button>
                        {isExpanded && (
                          <pre style={{ marginTop: '6px', padding: '8px 10px', background: '#0f172a', color: '#e2e8f0', borderRadius: '8px', fontSize: '11px', overflowX: 'auto', maxWidth: '520px' }}>
                            {row.Details}
                          </pre>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {currentUser?.role === 'Admin' ? (
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
      ) : (
        <div style={{ padding: '12px 16px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px', fontSize: '13px', color: '#475569' }}>
          ℹ️ Signed in as <strong>User</strong>. Log out and sign in with <strong>Admin</strong> to manage security PINs.
        </div>
      )}
    </div>
  )
}
