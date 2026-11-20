import { useEffect, useState } from 'react'
import './CustomerMaster.css'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://milk-delivery-api-bn26.onrender.com')
const INTERVAL_SEC = 120

export default function RouteManager({ session = 'Morning' }) {
  const today = new Date().toLocaleDateString('en-CA')
  const [selectedDate, setSelectedDate] = useState(today)
  const [routeCustomers, setRouteCustomers] = useState([])
  const [statusMap, setStatusMap] = useState({})
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [sentIds, setSentIds] = useState({})
  const [autoRunning, setAutoRunning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(INTERVAL_SEC)

  async function loadRoute() {
    setLoading(true); setError('')
    try {
      const [rRes, sRes] = await Promise.all([fetch(API_URL + '/routes/' + session), fetch(API_URL + '/delivery/session/' + selectedDate + '/' + session)])
      if (!rRes.ok) throw new Error(session + ' route load failed')
      const rData = await rRes.json()
      setRouteCustomers(Array.isArray(rData) ? rData : [])
      const map = {}
      if (sRes.ok) { const sData = await sRes.json(); (sData.Deliveries || []).forEach(d => { map[d.CustomerID] = d.DeliveryStatus }) }
      setStatusMap(map)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  useEffect(() => { loadRoute(); setSentIds({}); setAutoRunning(false); setSecondsLeft(INTERVAL_SEC) }, [session, selectedDate])

  const getStatus = id => statusMap[id] || 'Yet to Delivery'
  const formatPhone = num => { const c = String(num || '').replace(/\D/g, ''); return c.length === 10 ? '91' + c : c }

  const openWhatsAppDirect = cust => {
    const phone = formatPhone(cust.MobileNumber)
    if (!phone) return
    setSentIds(p => ({ ...p, [cust.CustomerID]: true }))
    const shiftTe = session === 'Morning' ? 'ఉదయం' : 'సాయంత్రం'
    const text = `నమస్తే *${cust.CustomerName || ''}* గారు \u{1F64F}\nమా డెలివరీ బాయ్ ఈరోజు ${shiftTe} పాలతో మీ రూట్‌లో బయలుదేరారు. మరికొద్ది నిమిషాల్లో మీ ఇంటికి చేరుకుంటారు. ధన్యవాదాలు! \u{1F6F5}\u{1F95B}`
    window.open(['https:/', 'wa.me', phone].join('/') + '?text=' + encodeURIComponent(text), '_blank', 'noopener,noreferrer')
  }

  const reachable = routeCustomers.filter(c => formatPhone(c.MobileNumber).length >= 10)
  const nextCust = reachable.find(c => !sentIds[c.CustomerID])
  const sentCount = reachable.filter(c => sentIds[c.CustomerID]).length

  useEffect(() => {
    if (!autoRunning) return
    if (!nextCust) { setAutoRunning(false); setSecondsLeft(INTERVAL_SEC); return }
    const t = setInterval(() => setSecondsLeft(s => (s <= 1 ? (setSentIds(p => ({ ...p, [nextCust.CustomerID]: true })), INTERVAL_SEC) : s - 1)), 1000)
    return () => clearInterval(t)
  }, [autoRunning, nextCust?.CustomerID])

  const startAuto = async () => {
    const pending = reachable.filter(c => !sentIds[c.CustomerID])
    if (!pending.length) return
    setSentIds(p => ({ ...p, [pending[0].CustomerID]: true }))
    setSecondsLeft(INTERVAL_SEC); setAutoRunning(true)
    await fetch(API_URL + '/routes/' + session + '/auto-alert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', customers: pending }) }).catch(() => {})
  }

  const stopAuto = async () => {
    setAutoRunning(false)
    await fetch(API_URL + '/routes/' + session + '/auto-alert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) }).catch(() => {})
  }

  const fmtTime = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
  const totalMilk = routeCustomers.reduce((s, c) => s + Number(c.DefaultMilkQuantity || 0), 0)
  const filtered = routeCustomers.filter(c => (statusFilter === 'All' || getStatus(c.CustomerID) === statusFilter) && (!search.trim() || [c.CustomerName, c.ReferenceName, c.CustomerCode, c.MobileNumber].some(v => (v || '').toLowerCase().includes(search.toLowerCase().trim()))))

  return (
    <div className="customer-master">
      <div className="customer-master-header">
        <div><h2>{session === 'Morning' ? '🌅 Morning Route' : '🌆 Evening Route'}</h2><p>Sudheer Field Delivery Sheet — {selectedDate}</p></div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button type="button" className="add-customer-btn" style={{ background: '#15803d' }} onClick={() => setShowModal(true)}>🚀 Start Route Telugu Alert ({reachable.length})</button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
          <button type="button" className="cancel-btn" onClick={loadRoute} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
        </div>
      </div>
      <div className="customer-summary-grid">
        <div className="customer-summary-card" onClick={() => setStatusFilter('All')}><span>All Route</span><h3>{routeCustomers.length}</h3></div>
        <div className="customer-summary-card" onClick={() => setStatusFilter('Yet to Delivery')}><span>Yet to Delivery</span><h3 style={{ color: '#d97706' }}>{routeCustomers.filter(c => getStatus(c.CustomerID) === 'Yet to Delivery').length}</h3></div>
        <div className="customer-summary-card" onClick={() => setStatusFilter('Delivered')}><span>Delivered</span><h3 style={{ color: '#15803d' }}>{routeCustomers.filter(c => getStatus(c.CustomerID) === 'Delivered').length}</h3></div>
        <div className="customer-summary-card" onClick={() => setStatusFilter('Undelivered')}><span>Undelivered</span><h3 style={{ color: '#b91c1c' }}>{routeCustomers.filter(c => getStatus(c.CustomerID) === 'Undelivered').length}</h3></div>
        <div className="customer-summary-card"><span>Expected Milk</span><h3>{totalMilk.toFixed(2)} L</h3></div>
      </div>
      <div className="customer-toolbar"><input type="text" placeholder="Search customer, reference, or mobile..." value={search} onChange={e => setSearch(e.target.value)} /></div>
      {error && <div className="customer-error">{error}</div>}
      <div className="customer-grid">
        {filtered.map((c, i) => {
          const st = getStatus(c.CustomerID); const badge = st === 'Delivered' ? 'no-due' : st === 'Undelivered' ? 'due' : 'partial'
          return (
            <div className="customer-card" key={c.CustomerID}>
              <div className="customer-card-header"><h3>#{c.RouteOrder || i + 1} — {c.CustomerName}</h3><span className={'card-payment-status ' + badge}>{st}</span></div>
              <p><strong>Reference:</strong> {c.ReferenceName || '-'}</p>
              <p><strong>Default Qty:</strong> {Number(c.DefaultMilkQuantity || 0).toFixed(2)} L (₹{c.MilkRate}/L)</p>
              <p><strong>Mobile:</strong> {c.MobileNumber || '-'}</p>
              {formatPhone(c.MobileNumber) && <div className="customer-card-actions" style={{ paddingTop: '10px' }}><a href={'tel:' + c.MobileNumber} style={{ flex: 1, textAlign: 'center', padding: '9px', borderRadius: '8px', background: '#e0f2fe', color: '#0369a1', fontWeight: 700, textDecoration: 'none', fontSize: '13px' }}>📞 Call</a><button type="button" onClick={() => openWhatsAppDirect(c)} style={{ flex: 1, padding: '9px', borderRadius: '8px', background: '#dcfce7', color: '#15803d', border: 'none', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}>💬 Telugu Alert</button></div>}
            </div>
          )
        })}
      </div>
      {showModal && (
        <div className="customer-modal-overlay" onClick={() => { setShowModal(false); stopAuto() }}>
          <div className="customer-modal" onClick={e => e.stopPropagation()}>
            <div className="customer-modal-header"><h2>🚀 {session} Route Telugu Alert (2-Min Auto)</h2><button type="button" onClick={() => { setShowModal(false); stopAuto() }}>✕</button></div>
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '12px', borderRadius: '10px', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}><strong style={{ color: '#15803d' }}>Sent: {sentCount} / {reachable.length}</strong>{autoRunning && nextCust && <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '20px', fontWeight: 700, fontSize: '13px' }}>⏱ Next ({nextCust.CustomerName}) in {fmtTime(secondsLeft)}</span>}</div>
              {nextCust ? <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>{!autoRunning ? <button type="button" className="add-customer-btn" style={{ flex: 1, background: '#15803d' }} onClick={startAuto}>▶ Start Auto-Send (Every 2 Mins)</button> : <button type="button" className="add-customer-btn" style={{ flex: 1, background: '#d97706' }} onClick={stopAuto}>⏸ Pause Timer</button>}<button type="button" className="cancel-btn" onClick={() => { openWhatsAppDirect(nextCust); setSecondsLeft(INTERVAL_SEC) }}>Send Now ({nextCust.CustomerName})</button></div> : <div style={{ fontWeight: 700, color: '#0f4c2e' }}>✅ All {reachable.length} route customers notified!</div>}
            </div>
                        <div style={{ display: 'grid', gap: '8px', maxHeight: '50vh', overflowY: 'auto' }}>
              {reachable.map((c, i) => (
                <div
                  key={c.CustomerID}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: sentIds[c.CustomerID] ? '#f0fdf4' : '#fff'
                  }}
                >
                  <div>
                    <strong>#{c.RouteOrder || i + 1} {c.CustomerName}</strong>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{c.MobileNumber}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openWhatsAppDirect(c)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '7px',
                      border: 'none',
                      fontWeight: 700,
                      cursor: 'pointer',
                      background: sentIds[c.CustomerID] ? '#dcfce7' : '#0f766e',
                      color: sentIds[c.CustomerID] ? '#15803d' : '#fff'
                    }}
                  >
                    {sentIds[c.CustomerID] ? '✓ Sent Again' : 'Send Telugu Msg'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
