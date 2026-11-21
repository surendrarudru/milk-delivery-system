import { useEffect, useState } from 'react'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://milk-delivery-api-bn26.onrender.com')

export default function AuditLog({ currentUser }) {
  const [logs, setLogs] = useState([])
  const [users, setUsers] = useState([])
  const [search, setSearch] = useState('')
  const [moduleFilter, setModuleFilter] = useState('All')
  const [loading, setLoading] = useState(false)
  const [userForm, setUserForm] = useState({ username: '', full_name: '', role: 'Staff', pin: '' })
  const [msg, setMsg] = useState('')

  async function loadAll() {
    setLoading(true)
    try {
      const [lRes, uRes] = await Promise.all([
        fetch(`${API_URL}/admin/audit-logs?limit=200`),
        fetch(`${API_URL}/admin/users`)
      ])
      if (lRes.ok) setLogs(await lRes.json())
      if (uRes.ok) setUsers(await uRes.json())
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
    setMsg(data.message || 'User saved!')
    setUserForm({ username: '', full_name: '', role: 'Staff', pin: '' })
    loadAll()
  }

  const filtered = logs.filter(l => {
    if (moduleFilter !== 'All' && l.ModuleName !== moduleFilter) return false
    const q = search.toLowerCase().trim()
    return !q || [l.ActorName, l.ModuleName, l.Summary, l.CreatedAt].some(v => (v || '').toLowerCase().includes(q))
  })

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ margin: 0 }}>🛡️ Security Audit Trail (ఎవరు • ఎప్పుడు • ఏమి మార్చారు)</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Every delivery, payment, bill & customer update is logged with user & IST timestamp</p>
        </div>
        <button type="button" onClick={loadAll} disabled={loading} style={{ padding: '10px 16px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
          {loading ? 'Loading...' : 'Refresh Logs'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search by user, customer, amount, or date..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: '220px', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1' }} />
        <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontWeight: 600 }}>
          <option value="All">All Modules ({logs.length})</option>
          <option value="Daily Delivery">Daily Delivery</option>
          <option value="Delivery Correction">Delivery Correction</option>
          <option value="Payments">Payments</option>
          <option value="Monthly Bills">Monthly Bills</option>
          <option value="Customer Master">Customer Master</option>
          <option value="Route Order">Route Order</option>
        </select>
      </div>

      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '12px' }}>When (ఎప్పుడు - IST)</th>
              <th style={{ padding: '12px' }}>Who (ఎవరు)</th>
              <th style={{ padding: '12px' }}>Module</th>
              <th style={{ padding: '12px' }}>What Changed (ఏమి మార్చారు)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>No audit records found yet. Any update made now will appear here immediately!</td></tr>
            ) : filtered.map(row => (
              <tr key={row.LogID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ padding: '11px 12px', whiteSpace: 'nowrap', fontWeight: 600, color: '#475569' }}>{row.CreatedAt}</td>
                <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                  <strong>{row.ActorName}</strong>
                  <span style={{ marginLeft: '6px', fontSize: '11px', padding: '2px 8px', borderRadius: '999px', background: row.ActorRole === 'Owner' ? '#dcfce7' : '#e0f2fe', color: row.ActorRole === 'Owner' ? '#15803d' : '#0369a1', fontWeight: 700 }}>{row.ActorRole}</span>
                </td>
                <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}><span style={{ padding: '3px 9px', borderRadius: '6px', background: '#f1f5f9', fontWeight: 700, fontSize: '12px' }}>{row.ModuleName}</span></td>
                <td style={{ padding: '11px 12px', color: '#0f172a', fontWeight: 600 }}>{row.Summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {currentUser?.role === 'Owner' && (
        <div style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ marginTop: 0 }}>🔑 Manage Admin & Staff Access PINs</h3>
          {msg && <div style={{ padding: '10px', background: '#dcfce7', color: '#15803d', borderRadius: '8px', marginBottom: '12px', fontWeight: 600 }}>{msg}</div>}
          <form onSubmit={saveUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            <input required placeholder="Username (e.g. sudheer)" value={userForm.username} onChange={e => setUserForm({ ...userForm, username: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <input required placeholder="Full Name (e.g. Sudheer)" value={userForm.full_name} onChange={e => setUserForm({ ...userForm, full_name: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <select value={userForm.role} onChange={e => setUserForm({ ...userForm, role: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <option value="Staff">Staff</option>
              <option value="Owner">Owner</option>
            </select>
            <input required type="password" placeholder="New PIN (4+ digits)" value={userForm.pin} onChange={e => setUserForm({ ...userForm, pin: e.target.value })} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
            <button type="submit" style={{ padding: '10px 16px', background: '#0f4c2e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Save User PIN</button>
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
