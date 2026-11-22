import { useEffect, useMemo, useState } from 'react'
import './DeliveryEntry.css'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://' + 'milk-delivery-api-bn26' + '.onrender.com')

export default function DeliveryEntry() {
  const today = new Date().toLocaleDateString('en-CA')

  const [deliveryDate, setDeliveryDate] = useState(today)
  const [session, setSession] = useState('Morning')
  const [deliveryBoyID, setDeliveryBoyID] = useState('')
  const [customers, setCustomers] = useState([])
  const [deliveries, setDeliveries] = useState({})
  const [search, setSearch] = useState('')
  const [openNoteIds, setOpenNoteIds] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [completed, setCompleted] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [waModalList, setWaModalList] = useState([])
  const [waSentIds, setWaSentIds] = useState({})
  const [qtyModalList, setQtyModalList] = useState([])
  const [qtySentIds, setQtySentIds] = useState({})

  useEffect(() => {
    fetch(`${API_URL}/delivery/boys`)
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : []
        if (list.length > 0) setDeliveryBoyID(String(list[0].DeliveryBoyID))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    let isActive = true
    async function loadSessionData() {
      setLoading(true); setMessage(''); setCompleted(false); setCustomers([]); setDeliveries({})
      try {
        const cRes = await fetch(`${API_URL}/delivery/customers/${session}`)
        if (!cRes.ok) throw new Error('Customers API failed')
        const customerData = await cRes.json()
        if (!isActive) return
        setCustomers(customerData)

        const init = {}
        customerData.forEach(c => {
          init[c.CustomerID] = {
            DeliveryStatus: 'Delivered',
            MilkQuantity: Number(c.DefaultMilkQuantity ?? 0),
            VeenaPusaDelivered: false,
            VeenaPusaQuantity: 0,
            Notes: ''
          }
        })

        const dRes = await fetch(`${API_URL}/delivery/session/${deliveryDate}/${session}`)
        if (!dRes.ok) throw new Error('Existing delivery API failed')
        const deliveryData = await dRes.json()
        if (!isActive) return

        const updated = { ...init }
        customerData.forEach(c => {
          const ex = deliveryData.Deliveries?.find(i => i.CustomerID === c.CustomerID)
          if (ex) {
            updated[c.CustomerID] = {
              DeliveryStatus: ex.DeliveryStatus,
              MilkQuantity: Number(ex.MilkQuantity ?? 0),
              VeenaPusaDelivered: Boolean(ex.VeenaPusaDelivered),
              VeenaPusaQuantity: Number(ex.VeenaPusaQuantity ?? 0),
              Notes: ex.Notes || ''
            }
          }
        })

        setDeliveries(updated)
        const isDone = deliveryData.SessionStatus === 'Completed'
        setCompleted(isDone)
        if (deliveryData.DeliveryBoyID) setDeliveryBoyID(String(deliveryData.DeliveryBoyID))
        setMessage(isDone ? `${session} session completed (Read-only).` : deliveryData.Deliveries?.length ? 'Existing delivery records loaded.' : 'Tap Delivered / Undelivered or use − / + (0.25L).')
      } catch (err) {
        if (isActive) setMessage(`Data load failed: ${err.message}`)
      } finally {
        if (isActive) setLoading(false)
      }
    }
    loadSessionData()
    return () => { isActive = false }
  }, [deliveryDate, session, reloadKey])

  function updateDelivery(customerID, field, value) {
    if (completed) return
    setDeliveries(prev => {
      const cur = prev[customerID]
      if (!cur) return prev
      if (field === 'DeliveryStatus' && value === 'Undelivered') {
        return { ...prev, [customerID]: { ...cur, DeliveryStatus: 'Undelivered', MilkQuantity: 0 } }
      }
      if (field === 'DeliveryStatus' && value === 'Delivered') {
        const c = customers.find(x => x.CustomerID === customerID)
        const restored = Number(cur.MilkQuantity) > 0 ? cur.MilkQuantity : Number(c?.DefaultMilkQuantity ?? 0)
        return { ...prev, [customerID]: { ...cur, DeliveryStatus: 'Delivered', MilkQuantity: restored } }
      }
      return { ...prev, [customerID]: { ...cur, [field]: value } }
    })
  }

  function stepQuantity(customerID, delta) {
    if (completed) return
    const curVal = Number(deliveries[customerID]?.MilkQuantity || 0)
    const nextVal = Math.max(0, Math.round((curVal + delta) * 100) / 100)
    setDeliveries(prev => ({
      ...prev,
      [customerID]: {
        ...prev[customerID],
        DeliveryStatus: nextVal > 0 ? 'Delivered' : 'Undelivered',
        MilkQuantity: nextVal
      }
    }))
  }

  async function saveDeliveries() {
    if (completed) return
    setSaving(true); setMessage('')
    try {
      const res = await fetch(`${API_URL}/delivery/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          DeliveryDate: deliveryDate,
          Session: session,
          DeliveryBoyID: Number(deliveryBoyID || 1),
          Deliveries: customers.map(c => ({ CustomerID: c.CustomerID, ...deliveries[c.CustomerID] }))
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Save failed')
      setReloadKey(k => k + 1)
      setMessage('Delivery details saved successfully.')
    } catch (e) { setMessage(`Save failed: ${e.message}`) } finally { setSaving(false) }
  }

  async function completeSession() {
    if (completed) return
    const undeliveredList = customers.filter(c => deliveries[c.CustomerID]?.DeliveryStatus === 'Undelivered')
    if (!window.confirm(`${session} delivery complete చేయాలా?`)) return
    setSaving(true)
    try {
      await fetch(`${API_URL}/delivery/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          DeliveryDate: deliveryDate,
          Session: session,
          DeliveryBoyID: Number(deliveryBoyID || 1),
          Deliveries: customers.map(c => ({ CustomerID: c.CustomerID, ...deliveries[c.CustomerID] }))
        })
      })
      const res = await fetch(`${API_URL}/delivery/session/${deliveryDate}/${session}/complete`, { method: 'PUT' })
      if (!res.ok) throw new Error('Completion failed')
      setCompleted(true)
      if (undeliveredList.length > 0) {
        setWaSentIds({}); setWaModalList(undeliveredList)
        if (qtyChangedCustomers.length > 0) window._pendingQtyAlerts = qtyChangedCustomers
      } else if (qtyChangedCustomers.length > 0) {
        setQtySentIds({}); setQtyModalList(qtyChangedCustomers)
      }
      setMessage(`${session} session completed!`)
    } catch (e) { setMessage(`Complete failed: ${e.message}`) } finally { setSaving(false) }
  }
  function buildUndeliveredWaUrl(cust) {
    const clean = String(cust?.MobileNumber || '').replace(/\D/g, '').slice(-10)
    if (clean.length < 10) return '#'
    const shiftTe = session === 'Morning' ? 'ఉదయం' : 'సాయంత్రం'
    const dateTe = deliveryDate.split('-').reverse().join('-')
    const whenTe = deliveryDate === today ? `ఈరోజు (${dateTe})` : `${dateTe} తేదీన`
    const text = `నమస్తే *${cust.CustomerName}* గారు \u{1F64F}\n${whenTe} ${shiftTe} పాల సరఫరా జరగలేదు (Undelivered)\u{274C}\nఏదైనా సందేహం ఉంటే మమ్మల్ని సంప్రదించండి. ధన్యవాదాలు!`
    return ['https:/', 'wa.me', '91' + clean].join('/') + '?text=' + encodeURIComponent(text)
  }

  function buildQtyChangeWaUrl(cust) {
    const clean = String(cust?.MobileNumber || '').replace(/\D/g, '').slice(-10)
    if (clean.length < 10) return '#'
    const defQty = Number(cust.DefaultMilkQuantity || 0)
    const totQty = Number(cust.MilkQuantity || 0)
    const diff = Number((totQty - defQty).toFixed(2))
    const shiftTe = session === 'Morning' ? 'ఉదయం' : 'సాయంత్రం'
    const dateTe = deliveryDate.split('-').reverse().join('-')
    const whenTe = deliveryDate === today ? `ఈరోజు (${dateTe})` : `${dateTe} తేదీన`
    const changeTe = diff > 0 ? `అదనంగా *+${diff} లీటర్ల*` : `తక్కువగా *${diff} లీటర్ల*`
    const text = `నమస్తే *${cust.CustomerName}* గారు \u{1F64F}\n${whenTe} ${shiftTe} మీ సాధారణ కోటా (${defQty} లీ) కంటే ${changeTe} పాలు తీసుకున్నారు.\n\u{1F95B} మొత్తం డెలివరీ పాలు: *${totQty} లీటర్లు*\nధన్యవాదాలు!`
    return ['https:/', 'wa.me', '91' + clean].join('/') + '?text=' + encodeURIComponent(text)
  }

  const deliveredCount = Object.values(deliveries).filter(i => i.DeliveryStatus === 'Delivered').length
  const undeliveredCount = Object.values(deliveries).filter(i => i.DeliveryStatus === 'Undelivered').length
  const totalLitres = Object.values(deliveries).reduce((s, i) => s + (i.DeliveryStatus === 'Delivered' ? Number(i.MilkQuantity || 0) : 0), 0)

  const qtyChangedCustomers = customers
    .filter(c => {
      const it = deliveries[c.CustomerID]
      const defQ = Number(c.DefaultMilkQuantity || 0)
      return it?.DeliveryStatus === 'Delivered' && defQ > 0 && Number(it?.MilkQuantity || 0) !== defQ
    })
    .map(c => ({
      ...c,
      MilkQuantity: Number(deliveries[c.CustomerID]?.MilkQuantity || 0),
      Diff: Number((Number(deliveries[c.CustomerID]?.MilkQuantity || 0) - Number(c.DefaultMilkQuantity || 0)).toFixed(2))
    }))

  const filteredCustomers = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return customers
    return customers.filter(c =>
      [c.CustomerName, c.ReferenceName, c.CustomerCode, c.MobileNumber].some(v => (v || '').toLowerCase().includes(q))
    )
  }, [customers, search])

  const nextWaCust = waModalList.find(c => String(c.MobileNumber || '').replace(/\D/g, '').length >= 10 && !waSentIds[c.CustomerID])
  const nextQtyCust = qtyModalList.find(c => String(c.MobileNumber || '').replace(/\D/g, '').length >= 10 && !qtySentIds[c.CustomerID])

  return (
    <div className="delivery-page">
      <div className="delivery-header">
        <div>
          <h2>Daily Delivery</h2>
          <p>Customer / Reference Name with Default &amp; Today&apos;s Milk (0.25L − / +)</p>
        </div>
      </div>

      <div className="delivery-controls">
        <div>
          <label>Delivery Date</label>
          <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
        </div>
        <div>
          <label>Session</label>
          <div className="session-pill-group">
            <button type="button" className={`session-pill ${session === 'Morning' ? 'active-morning' : ''}`} onClick={() => setSession('Morning')}>🌅 Morning</button>
            <button type="button" className={`session-pill ${session === 'Evening' ? 'active-evening' : ''}`} onClick={() => setSession('Evening')}>🌆 Evening</button>
          </div>
        </div>
        <div>
          <label>Search Customer / Reference</label>
          <input type="text" placeholder="🔍 Type name or reference..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="delivery-summary" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="summary-box"><span>Route</span><strong>{customers.length}</strong></div>
        <div className="summary-box delivered-box"><span>Delivered</span><strong>{deliveredCount}</strong></div>
        <div className="summary-box undelivered-box"><span>Undelivered</span><strong>{undeliveredCount}</strong></div>
        <div className="summary-box"><span>Total Milk</span><strong style={{ color: '#0f766e' }}>{totalLitres.toFixed(2)} L</strong></div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {undeliveredCount > 0 && (
          <button type="button" onClick={() => setWaModalList(customers.filter(c => deliveries[c.CustomerID]?.DeliveryStatus === 'Undelivered'))} style={{ flex: 1, minWidth: '220px', padding: '10px 14px', background: '#15803d', color: '#fff', border: 'none', borderRadius: '9px', fontWeight: 700, cursor: 'pointer' }}>
            💬 Send Undelivered Alerts ({undeliveredCount})
          </button>
        )}
        {qtyChangedCustomers.length > 0 && (
          <button type="button" onClick={() => { setQtySentIds({}); setQtyModalList(qtyChangedCustomers) }} style={{ flex: 1, minWidth: '220px', padding: '10px 14px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '9px', fontWeight: 700, cursor: 'pointer' }}>
            🥛 Send Extra / Less Alerts ({qtyChangedCustomers.length})
          </button>
        )}
      </div>

      {message && <div className="delivery-message">{message}</div>}
      {loading ? <p>Loading customers...</p> : (
        <>
          <div className="delivery-customer-list">
            {filteredCustomers.map((customer, index) => {
              const item = deliveries[customer.CustomerID]
              if (!item) return null
              const isUndelivered = item.DeliveryStatus === 'Undelivered'
              const defQty = Number(customer.DefaultMilkQuantity ?? 0)
              const curQty = Number(item.MilkQuantity ?? 0)
              const diff = Number((curQty - defQty).toFixed(2))
              const amt = isUndelivered ? 0 : curQty * Number(customer.MilkRate || 0)
              const noteOpen = Boolean(openNoteIds[customer.CustomerID] || item.Notes)

              return (
                <div key={customer.CustomerID} className={`delivery-card ${isUndelivered ? 'undelivered-card' : 'delivered-card'}`} style={{ padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span className="route-number">#{customer.RouteOrder || index + 1}</span>
                        <strong style={{ fontSize: '16px', color: '#0f172a' }}>{customer.CustomerName}</strong>
                        {customer.ReferenceName && (
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f766e', background: '#f0fdfa', padding: '1px 7px', borderRadius: '6px', border: '1px solid #99f6e4' }}>
                            {customer.ReferenceName}
                          </span>
                        )}
                      </div>
                      <div style={{ marginTop: '5px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '13px', color: '#475569' }}>
                        <span>Default: <strong style={{ color: '#0f172a' }}>{defQty} L</strong></span>
                        <span>•</span>
                        <span>Today: <strong style={{ color: isUndelivered ? '#dc2626' : '#15803d' }}>{isUndelivered ? '0 L' : `${curQty} L`}</strong></span>
                        {!isUndelivered && diff !== 0 && (
                          <span style={{ fontWeight: 800, fontSize: '11.5px', color: diff > 0 ? '#b45309' : '#0369a1', background: diff > 0 ? '#fef3c7' : '#e0f2fe', padding: '1px 6px', borderRadius: '5px' }}>
                            {diff > 0 ? `+${diff}L` : `${diff}L`}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={completed}
                      onClick={() => updateDelivery(customer.CustomerID, 'DeliveryStatus', isUndelivered ? 'Delivered' : 'Undelivered')}
                      style={{ padding: '7px 12px', borderRadius: '8px', border: 'none', fontWeight: 800, fontSize: '12.5px', cursor: 'pointer', flexShrink: 0, background: isUndelivered ? '#dc2626' : '#16a34a', color: '#fff' }}
                    >
                      {isUndelivered ? '✕ Undelivered' : '✓ Delivered'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button type="button" disabled={completed} onClick={() => stepQuantity(customer.CustomerID, -0.25)} style={{ width: '38px', height: '34px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 900, fontSize: '18px', cursor: 'pointer' }}>−</button>
                      <span style={{ minWidth: '62px', textAlign: 'center', fontWeight: 800, fontSize: '15px', color: isUndelivered ? '#dc2626' : '#0f172a', background: '#f8fafc', padding: '5px 8px', borderRadius: '7px', border: '1px solid #e2e8f0' }}>
                        {isUndelivered ? '0 L' : `${curQty} L`}
                      </span>
                      <button type="button" disabled={completed} onClick={() => stepQuantity(customer.CustomerID, 0.25)} style={{ width: '38px', height: '34px', borderRadius: '7px', border: '1px solid #cbd5e1', background: '#f8fafc', fontWeight: 900, fontSize: '18px', cursor: 'pointer' }}>+</button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {!isUndelivered && defQty > 0 && curQty !== defQty && (
                        <a href={buildQtyChangeWaUrl({ ...customer, MilkQuantity: curQty })} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', padding: '5px 9px', background: diff > 0 ? '#d97706' : '#0284c7', color: '#fff', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>💬 WA</a>
                      )}
                      {customer.MobileNumber && (
                        <a href={`tel:${customer.MobileNumber}`} style={{ textDecoration: 'none', padding: '5px 8px', background: '#e0f2fe', color: '#0369a1', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700 }}>📞</a>
                      )}
                      {!completed && (
                        <button type="button" onClick={() => setOpenNoteIds(p => ({ ...p, [customer.CustomerID]: !p[customer.CustomerID] }))} style={{ padding: '5px 8px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}>📝</button>
                      )}
                      <strong style={{ fontSize: '15.5px', color: '#0f4c2e', minWidth: '68px', textAlign: 'right' }}>₹{amt.toFixed(2)}</strong>
                    </div>
                  </div>

                  {noteOpen && (
                    <div style={{ marginTop: '8px' }}>
                      <input type="text" placeholder="Optional note..." value={item.Notes} disabled={completed} onChange={e => updateDelivery(customer.CustomerID, 'Notes', e.target.value)} style={{ padding: '7px 10px', fontSize: '12.5px' }} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="delivery-actions sticky-mobile-actions">
            <button className="save-delivery-btn" onClick={saveDeliveries} disabled={saving || loading || completed || customers.length === 0}>
              {saving ? 'Saving...' : '💾 Save Deliveries'}
            </button>
            <button className="complete-delivery-btn" onClick={completeSession} disabled={saving || completed || customers.length === 0}>
              ✅ Complete Session
            </button>
          </div>
        </>
      )}

      {completed && <div className="completed-notice">This delivery session is completed and locked.</div>}

      {waModalList.length > 0 && (
        <div className="customer-modal-overlay" onClick={() => { setWaModalList([]); if (window._pendingQtyAlerts?.length) { setQtySentIds({}); setQtyModalList(window._pendingQtyAlerts); window._pendingQtyAlerts = null } }}>
          <div className="customer-modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="customer-modal-header">
              <h2>💬 Undelivered Telugu WhatsApp Alerts ({waModalList.length})</h2>
              <button type="button" onClick={() => { setWaModalList([]); if (window._pendingQtyAlerts?.length) { setQtySentIds({}); setQtyModalList(window._pendingQtyAlerts); window._pendingQtyAlerts = null } }}>✕</button>
            </div>
            {nextWaCust ? (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '10px 12px', borderRadius: '10px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: '#15803d' }}>Next: {nextWaCust.CustomerName}</strong>
                <a href={buildUndeliveredWaUrl(nextWaCust)} target="_blank" rel="noopener noreferrer" onClick={() => setWaSentIds(p => ({ ...p, [nextWaCust.CustomerID]: true }))} style={{ textDecoration: 'none', padding: '7px 14px', background: '#15803d', color: '#fff', borderRadius: '8px', fontWeight: 700 }}>▶ Send Next</a>
              </div>
            ) : <div style={{ background: '#dcfce7', color: '#15803d', padding: '10px', borderRadius: '8px', fontWeight: 700, marginBottom: '12px' }}>✅ అందరికీ పంపడం పూర్తయింది!</div>}
            <div style={{ display: 'grid', gap: '8px', maxHeight: '50vh', overflowY: 'auto' }}>
              {waModalList.map((c, idx) => (
                <div key={c.CustomerID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: waSentIds[c.CustomerID] ? '#f0fdf4' : '#fff' }}>
                  <div><strong>{idx + 1}. {c.CustomerName}</strong><div style={{ fontSize: '12px', color: '#64748b' }}>{c.MobileNumber || 'No Mobile'}</div></div>
                  {String(c.MobileNumber || '').replace(/\D/g, '').length >= 10 && (
                    <a href={buildUndeliveredWaUrl(c)} target="_blank" rel="noopener noreferrer" onClick={() => setWaSentIds(p => ({ ...p, [c.CustomerID]: true }))} style={{ textDecoration: 'none', padding: '6px 12px', borderRadius: '7px', fontWeight: 700, background: waSentIds[c.CustomerID] ? '#dcfce7' : '#0f766e', color: waSentIds[c.CustomerID] ? '#15803d' : '#fff' }}>{waSentIds[c.CustomerID] ? '✓ Sent' : '💬 Send'}</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {qtyModalList.length > 0 && (
        <div className="customer-modal-overlay" onClick={() => setQtyModalList([])}>
          <div className="customer-modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="customer-modal-header">
              <h2>🥛 Extra / Less Milk Alerts ({qtyModalList.length})</h2>
              <button type="button" onClick={() => setQtyModalList([])}>✕</button>
            </div>
            {nextQtyCust ? (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', padding: '10px 12px', borderRadius: '10px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ color: '#b45309' }}>Next: {nextQtyCust.CustomerName} ({nextQtyCust.Diff > 0 ? `+${nextQtyCust.Diff}L` : `${nextQtyCust.Diff}L`})</strong>
                <a href={buildQtyChangeWaUrl(nextQtyCust)} target="_blank" rel="noopener noreferrer" onClick={() => setQtySentIds(p => ({ ...p, [nextQtyCust.CustomerID]: true }))} style={{ textDecoration: 'none', padding: '7px 14px', background: '#d97706', color: '#fff', borderRadius: '8px', fontWeight: 700 }}>▶ Send Next</a>
              </div>
            ) : <div style={{ background: '#dcfce7', color: '#15803d', padding: '10px', borderRadius: '8px', fontWeight: 700, marginBottom: '12px' }}>✅ అందరికీ పంపడం పూర్తయింది!</div>}
            <div style={{ display: 'grid', gap: '8px', maxHeight: '50vh', overflowY: 'auto' }}>
              {qtyModalList.map((c, idx) => (
                <div key={c.CustomerID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: qtySentIds[c.CustomerID] ? '#f0fdf4' : '#fff' }}>
                  <div><strong>{idx + 1}. {c.CustomerName}</strong> <span style={{ fontSize: '12px', fontWeight: 700, color: c.Diff > 0 ? '#d97706' : '#0284c7' }}>({c.Diff > 0 ? `+${c.Diff}L` : `${c.Diff}L`})</span><div style={{ fontSize: '12px', color: '#64748b' }}>Default: {c.DefaultMilkQuantity}L → Today: {c.MilkQuantity}L</div></div>
                  {String(c.MobileNumber || '').replace(/\D/g, '').length >= 10 && (
                    <a href={buildQtyChangeWaUrl(c)} target="_blank" rel="noopener noreferrer" onClick={() => setQtySentIds(p => ({ ...p, [c.CustomerID]: true }))} style={{ textDecoration: 'none', padding: '6px 12px', borderRadius: '7px', fontWeight: 700, background: qtySentIds[c.CustomerID] ? '#dcfce7' : '#d97706', color: qtySentIds[c.CustomerID] ? '#15803d' : '#fff' }}>{qtySentIds[c.CustomerID] ? '✓ Sent' : '💬 Send'}</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
