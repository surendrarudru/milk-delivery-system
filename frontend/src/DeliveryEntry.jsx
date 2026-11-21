import { useEffect, useState } from 'react'
import './DeliveryEntry.css'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://milk-delivery-api-bn26.onrender.com')


function DeliveryEntry() {
  const today = new Date().toLocaleDateString('en-CA')

  const [deliveryDate, setDeliveryDate] = useState(today)
  const [session, setSession] = useState('Morning')
  const [deliveryBoyID, setDeliveryBoyID] = useState('')
  const [deliveryBoys, setDeliveryBoys] = useState([])
  const [customers, setCustomers] = useState([])
  const [deliveries, setDeliveries] = useState({})
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
    async function fetchDeliveryBoys() {
      try {
        const response = await fetch(`${API_URL}/delivery/boys`)
        if (!response.ok) throw new Error('Delivery boys API failed')
        const data = await response.json()
        setDeliveryBoys(data)
        if (data.length > 0) {
          setDeliveryBoyID(String(data[0].DeliveryBoyID))
        }
      } catch (error) {
        setMessage('Delivery Boy details load కాలేదు. Backend API check చేయండి.')
      }
    }
    fetchDeliveryBoys()
  }, [])

  useEffect(() => {
    let isActive = true

    async function loadSessionData() {
      setLoading(true)
      setMessage('')
      setCompleted(false)
      setCustomers([])
      setDeliveries({})

      try {
        const customerResponse = await fetch(
          `${API_URL}/delivery/customers/${session}`
        )
        if (!customerResponse.ok) throw new Error('Customers API failed')
        const customerData = await customerResponse.json()
        if (!isActive) return
        setCustomers(customerData)

        const initialDeliveries = {}
        customerData.forEach((customer) => {
          initialDeliveries[customer.CustomerID] = {
            DeliveryStatus: 'Delivered',
            MilkQuantity: customer.DefaultMilkQuantity ?? 0,
            VeenaPusaDelivered: false,
            VeenaPusaQuantity: 0,
            Notes: ''
          }
        })

        const deliveryResponse = await fetch(
          `${API_URL}/delivery/session/${deliveryDate}/${session}`
        )
        if (!deliveryResponse.ok) throw new Error('Existing delivery API failed')
        const deliveryData = await deliveryResponse.json()
        if (!isActive) return

        const updatedDeliveries = { ...initialDeliveries }
        customerData.forEach((customer) => {
          const existing = deliveryData.Deliveries?.find(
            (item) => item.CustomerID === customer.CustomerID
          )
          if (existing) {
            updatedDeliveries[customer.CustomerID] = {
              DeliveryStatus: existing.DeliveryStatus,
              MilkQuantity: existing.MilkQuantity,
              VeenaPusaDelivered: existing.VeenaPusaDelivered,
              VeenaPusaQuantity: existing.VeenaPusaQuantity,
              Notes: existing.Notes || ''
            }
          }
        })

        setDeliveries(updatedDeliveries)
        const isCompleted = deliveryData.SessionStatus === 'Completed'
        setCompleted(isCompleted)

        if (deliveryData.DeliveryBoyID) {
          setDeliveryBoyID(String(deliveryData.DeliveryBoyID))
        }

        if (isCompleted) {
          setMessage(`${session} session already completed. Records are read-only.`)
        } else if (deliveryData.Deliveries?.length > 0) {
          setMessage('Existing delivery records loaded.')
        } else {
          setMessage('New delivery session. Tap Delivered / Undelivered below.')
        }
      } catch (error) {
        if (isActive) {
          setMessage(`Data load failed: ${error.message}`)
        }
      } finally {
        if (isActive) {
          setLoading(false)
        }
      }
    }

    loadSessionData()
    return () => {
      isActive = false
    }
  }, [deliveryDate, session, reloadKey])

  function updateDelivery(customerID, field, value) {
    if (completed) return

    setDeliveries((previous) => {
      const current = previous[customerID]
      if (!current) return previous

      if (field === 'DeliveryStatus' && value === 'Undelivered') {
        return {
          ...previous,
          [customerID]: {
            ...current,
            DeliveryStatus: 'Undelivered',
            MilkQuantity: 0,
            VeenaPusaDelivered: false,
            VeenaPusaQuantity: 0
          }
        }
      }

      if (field === 'DeliveryStatus' && value === 'Delivered') {
        const customer = customers.find((item) => item.CustomerID === customerID)
        return {
          ...previous,
          [customerID]: {
            ...current,
            DeliveryStatus: 'Delivered',
            MilkQuantity:
              Number(current.MilkQuantity) > 0
                ? current.MilkQuantity
                : (customer?.DefaultMilkQuantity ?? 0)
          }
        }
      }

      return {
        ...previous,
        [customerID]: {
          ...current,
          [field]: value
        }
      }
    })
  }

  function stepQuantity(customerID, field, delta) {
    if (completed) return
    const currentVal = Number(deliveries[customerID]?.[field] || 0)
    const nextVal = Math.max(0, Math.round((currentVal + delta) * 100) / 100)
    updateDelivery(customerID, field, nextVal)
  }

  async function saveDeliveries() {
    if (completed) {
      alert('This session is already completed.')
      return
    }

    if (!deliveryBoyID) {
      alert('Delivery Boy select చేయండి.')
      return
    }

    const payload = {
      DeliveryDate: deliveryDate,
      Session: session,
      DeliveryBoyID: Number(deliveryBoyID),
      Deliveries: customers.map((customer) => ({
        CustomerID: customer.CustomerID,
        ...deliveries[customer.CustomerID]
      }))
    }

    setSaving(true)
    setMessage('')

    try {
      const response = await fetch(`${API_URL}/delivery/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Save failed')

      setReloadKey((k) => k + 1)
      setMessage('Delivery details successfully saved.')
    } catch (error) {
      setMessage(`Save failed: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

    async function completeSession() {
    if (completed) return

    const undeliveredList = customers
      .filter((c) => deliveries[c.CustomerID]?.DeliveryStatus === 'Undelivered')
      .map((c) => ({
        CustomerID: c.CustomerID,
        CustomerName: c.CustomerName,
        MobileNumber: c.MobileNumber,
        DeliveryStatus: 'Undelivered'
      }))

    const confirmMsg =
      undeliveredList.length > 0
        ? `${session} delivery complete చేయాలా? Complete చేసిన తర్వాత ${undeliveredList.length} మంది Undelivered customers కి automatic గా Telugu WhatsApp alert వెళ్తుంది.`
        : `${session} delivery complete చేయాలా? (Undelivered customers ఎవరూ లేరు.)`

    if (!window.confirm(confirmMsg)) return

    setSaving(true)
    try {
      // Save latest statuses first so Undelivered records are stored in DB
      await fetch(`${API_URL}/delivery/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          DeliveryDate: deliveryDate,
          Session: session,
          DeliveryBoyID: Number(deliveryBoyID),
          Deliveries: customers.map((customer) => ({
            CustomerID: customer.CustomerID,
            ...deliveries[customer.CustomerID]
          }))
        })
      })

      const response = await fetch(
        `${API_URL}/delivery/session/${deliveryDate}/${session}/complete`,
        { method: 'PUT' }
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Completion failed')

      setCompleted(true)

      if (undeliveredList.length > 0) {
        setWaSentIds({})
        setWaModalList(undeliveredList)
        setMessage(
          `${session} session completed! ${undeliveredList.length} మంది Undelivered customers కి కింద ఉన్న బటన్లతో Telugu WhatsApp alerts పంపండి.`
        )
      } else {
        setMessage('Delivery session completed successfully. అందరికీ పాలు డెలివరీ అయ్యాయి.')
      }
    } catch (error) {
      setMessage(`Complete failed: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  const deliveredCount = Object.values(deliveries).filter(
    (item) => item.DeliveryStatus === 'Delivered'
  ).length

  const undeliveredCount = Object.values(deliveries).filter(
    (item) => item.DeliveryStatus === 'Undelivered'
  ).length

  function buildUndeliveredWaUrl(cust) {
    if (!cust) return '#';
    const clean = String(cust.MobileNumber || '').replace(/\D/g, '').slice(-10);
    if (clean.length < 10) return '#';
    const shiftTe = session === 'Morning' ? 'ఉదయం' : 'సాయంత్రం';
    const dateTe = deliveryDate.split('-').reverse().join('-');
    const whenTe = deliveryDate === today ? `ఈరోజు (${dateTe})` : `${dateTe} తేదీన`; const text = `నమస్తే *${cust.CustomerName}* గారు \u{1F64F}\n${whenTe} ${shiftTe} పాల సరఫరా జరగలేదు (Undelivered)\u{274C}\nఏదైనా సందేహం ఉంటే మమ్మల్ని సంప్రదించండి. ధన్యవాదాలు!`;
    return ['https:/', 'wa.me', '91' + clean].join('/') + '?text=' + encodeURIComponent(text);
  }
  function buildQtyChangeWaUrl(cust) {
    if (!cust) return '#'
    const clean = String(cust.MobileNumber || '').replace(/\D/g, '').slice(-10)
    if (clean.length < 10) return '#'
    const defQty = Number(cust.DefaultMilkQuantity || 0)
    const totQty = Number(cust.MilkQuantity || 0)
    const diff = Number((totQty - defQty).toFixed(2))
    const isExtra = diff > 0
    const shiftTe = session === 'Morning' ? 'ఉదయం' : 'సాయంత్రం'
    const dateTe = deliveryDate.split('-').reverse().join('-')
    const whenTe = deliveryDate === today ? `ఈరోజు (${dateTe})` : `${dateTe} తేదీన`
    const changeTe = isExtra ? `అదనంగా *+${diff} లీటర్ల*` : `తక్కువగా *${diff} లీటర్ల*`
    const text = `నమస్తే *${cust.CustomerName}* గారు \u{1F64F}\n${whenTe} ${shiftTe} మీ సాధారణ కోటా (${defQty} లీ) కంటే ${changeTe} పాలు తీసుకున్నారు.\n\u{1F95B} మొత్తం డెలివరీ పాలు: *${totQty} లీటర్లు*\nధన్యవాదాలు!`
    return ['https:/', 'wa.me', '91' + clean].join('/') + '?text=' + encodeURIComponent(text)
  }

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

  const nextQtyCust = qtyModalList.find(c => String(c.MobileNumber || '').replace(/\D/g, '').length >= 10 && !qtySentIds[c.CustomerID])

  function openAllUndeliveredModal() {
    const list = customers
      .filter(c => deliveries[c.CustomerID]?.DeliveryStatus === 'Undelivered')
      .map(c => ({
        CustomerID: c.CustomerID,
        CustomerName: c.CustomerName,
        MobileNumber: c.MobileNumber,
        DeliveryStatus: 'Undelivered'
      }))
    if (!list.length) return alert('Undelivered customers ఎవరూ లేరు.')
    setWaModalList(list)
  }

  const nextWaCust = waModalList.find(c => String(c.MobileNumber || '').replace(/\D/g, '').length >= 10 && !waSentIds[c.CustomerID])

  return (
    <div className="delivery-page">
      <div className="delivery-header">
        <div>
          <h1>Daily Delivery</h1>
          <p>Mobile One-Tap Milk & Veena Pusa Delivery Entry</p>
        </div>
      </div>

      <div className="delivery-controls">
        <div>
          <label>Delivery Date</label>
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
          />
        </div>

        <div>
          <label>Delivery Session</label>
          <div className="session-pill-group">
            <button
              type="button"
              className={`session-pill ${session === 'Morning' ? 'active-morning' : ''}`}
              onClick={() => setSession('Morning')}
            >
              🌅 Morning
            </button>
            <button
              type="button"
              className={`session-pill ${session === 'Evening' ? 'active-evening' : ''}`}
              onClick={() => setSession('Evening')}
            >
              🌆 Evening
            </button>
          </div>
        </div>

        <div>
          <label>Delivery Boy</label>
          <select
            value={deliveryBoyID}
            onChange={(e) => setDeliveryBoyID(e.target.value)}
            disabled={completed}
          >
            {deliveryBoys.map((boy) => (
              <option key={boy.DeliveryBoyID} value={boy.DeliveryBoyID}>
                {boy.DeliveryBoyName}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="delivery-summary">
        <div className="summary-box">
          <span>Route Total</span>
          <strong>{customers.length}</strong>
        </div>

        <div className="summary-box delivered-box">
          <span>Delivered</span>
          <strong>{deliveredCount}</strong>
        </div>

        <div className="summary-box undelivered-box">
          <span>Undelivered</span>
          <strong>{undeliveredCount}</strong>
        </div>
      </div>

      {undeliveredCount > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <button
            type="button"
            onClick={openAllUndeliveredModal}
            style={{ width: '100%', padding: '12px', background: '#15803d', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
          >
            💬 Send Undelivered Telugu WhatsApp Alerts ({undeliveredCount})
          </button>
        </div>
      )}

      {qtyChangedCustomers.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <button
            type="button"
            onClick={() => { setQtySentIds({}); setQtyModalList(qtyChangedCustomers) }}
            style={{ width: '100%', padding: '12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
          >
            🥛 Send Extra / Less Milk WhatsApp Alerts ({qtyChangedCustomers.length})
          </button>
        </div>
      )}

      <div style={{ display: 'none' }}>
      </div>

      {message && <div className="delivery-message">{message}</div>}

      {loading ? (
        <p>Loading customers...</p>
      ) : (
        <>
          <div className="delivery-customer-list">
            {customers.map((customer, index) => {
              const item = deliveries[customer.CustomerID]
              if (!item) return null

              const isUndelivered = item.DeliveryStatus === 'Undelivered'

              return (
                <div
                  className={`delivery-card ${isUndelivered ? 'undelivered-card' : 'delivered-card'}`}
                  key={customer.CustomerID}
                >
                  <div className="delivery-card-header">
                    <div>
                      <span className="route-number">
                        Route #{customer.RouteOrder || index + 1}
                      </span>
                      <h3>{customer.CustomerName}</h3>
                      <p>
                        {customer.ReferenceName || 'No Reference'}
                        {customer.MobileNumber ? ` • ${customer.MobileNumber}` : ''}
                      </p>
                    </div>

                    {customer.MobileNumber && (
                      <a
                        href={`tel:${customer.MobileNumber}`}
                        className="quick-call-chip"
                      >
                        📞 Call
                      </a>
                    )}
                  </div>

                  {/* BIG ONE-TAP MOBILE TOGGLE BUTTONS */}
                  <div className="one-tap-toggle-row">
                    <button
                      type="button"
                      disabled={completed}
                      className={`one-tap-btn delivered-btn ${!isUndelivered ? 'selected' : ''}`}
                      onClick={() =>
                        updateDelivery(customer.CustomerID, 'DeliveryStatus', 'Delivered')
                      }
                    >
                      ✓ Delivered
                    </button>

                    <button
                      type="button"
                      disabled={completed}
                      className={`one-tap-btn undelivered-btn ${isUndelivered ? 'selected' : ''}`}
                      onClick={() =>
                        updateDelivery(customer.CustomerID, 'DeliveryStatus', 'Undelivered')
                      }
                    >
                      ✕ Undelivered
                    </button>
                  </div>

                  {!isUndelivered && (
                    <>
                      <div className="delivery-fields">
                        <div>
                          <label>Milk Quantity (L) — Default: {customer.DefaultMilkQuantity ?? 0}L</label>
                          <div className="qty-stepper-row">
                            <button
                              type="button"
                              className="stepper-btn"
                              disabled={completed}
                              onClick={() => stepQuantity(customer.CustomerID, 'MilkQuantity', -0.25)}
                            >
                              -0.25
                            </button>
                            <input
                              type="number"
                              min="0"
                              step="0.25"
                              value={item.MilkQuantity}
                              disabled={completed}
                              onChange={(e) =>
                                updateDelivery(
                                  customer.CustomerID,
                                  'MilkQuantity',
                                  Math.max(0, Number(e.target.value))
                                )
                              }
                            />
                            <button
                              type="button"
                              className="stepper-btn"
                              disabled={completed}
                              onClick={() => stepQuantity(customer.CustomerID, 'MilkQuantity', 0.25)}
                            >
                              +0.25
                            </button>
                          </div>
                          <small>Rate: ₹{customer.MilkRate}/L</small>
                        </div>

                        <div className="amount-display-box">
                          <label>Milk Amount</label>
                          <strong>
                            ₹{(Number(item.MilkQuantity) * Number(customer.MilkRate)).toFixed(2)}
                          </strong>
                        </div>
                      </div>

                      <div className="veena-section">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={item.VeenaPusaDelivered}
                            disabled={completed}
                            onChange={(e) =>
                              updateDelivery(
                                customer.CustomerID,
                                'VeenaPusaDelivered',
                                e.target.checked
                              )
                            }
                          />
                          Veena Pusa Delivered Today (₹{customer.VennaPusaRate}/KG)
                        </label>

                        {item.VeenaPusaDelivered && (
                          <div className="delivery-fields" style={{ marginTop: '12px' }}>
                            <div>
                              <label>Veena Pusa Qty (KG)</label>
                              <div className="qty-stepper-row">
                                <button
                                  type="button"
                                  className="stepper-btn"
                                  disabled={completed}
                                  onClick={() => stepQuantity(customer.CustomerID, 'VeenaPusaQuantity', -0.5)}
                                >
                                  -0.5
                                </button>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.50"
                                  value={item.VeenaPusaQuantity}
                                  disabled={completed}
                                  onChange={(e) =>
                                    updateDelivery(
                                      customer.CustomerID,
                                      'VeenaPusaQuantity',
                                      Math.max(0, Number(e.target.value))
                                    )
                                  }
                                />
                                <button
                                  type="button"
                                  className="stepper-btn"
                                  disabled={completed}
                                  onClick={() => stepQuantity(customer.CustomerID, 'VeenaPusaQuantity', 0.5)}
                                >
                                  +0.5
                                </button>
                              </div>
                            </div>

                            <div className="amount-display-box">
                              <label>Veena Pusa Amount</label>
                              <strong>
                                ₹{(Number(item.VeenaPusaQuantity) * Number(customer.VennaPusaRate)).toFixed(2)}
                              </strong>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <div className="delivery-notes">
                    <input
                      type="text"
                      placeholder="Optional notes..."
                      value={item.Notes}
                      disabled={completed}
                      onChange={(e) =>
                        updateDelivery(customer.CustomerID, 'Notes', e.target.value)
                      }
                    />
                  </div>

                  <div className="delivery-card-total">
                    <span>Customer Total</span>
                    <strong>
                      ₹
                      {isUndelivered
                        ? '0.00'
                        : (
                            Number(item.MilkQuantity) * Number(customer.MilkRate) +
                            (item.VeenaPusaDelivered
                              ? Number(item.VeenaPusaQuantity) * Number(customer.VennaPusaRate)
                              : 0)
                          ).toFixed(2)}
                    </strong>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="delivery-actions sticky-mobile-actions">
            <button
              className="save-delivery-btn"
              onClick={saveDeliveries}
              disabled={saving || loading || completed || customers.length === 0}
            >
              {saving ? 'Saving...' : '💾 Save Deliveries'}
            </button>

            <button
              className="complete-delivery-btn"
              onClick={completeSession}
              disabled={saving || completed || customers.length === 0}
            >
              ✅ Complete Session
            </button>
          </div>
        </>
      )}

      {completed && (
        <div className="completed-notice">
          This delivery session is completed and locked.
        </div>
      )}
      {waModalList.length > 0 && (
        <div className="customer-modal-overlay" onClick={() => setWaModalList([])}>
          <div className="customer-modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="customer-modal-header">
              <h2>💬 Undelivered Telugu WhatsApp Alerts ({waModalList.length})</h2>
              <button type="button" onClick={() => setWaModalList([])}>✕</button>
            </div>

            {nextWaCust ? (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', padding: '12px', borderRadius: '10px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <strong style={{ color: '#15803d' }}>Next: {nextWaCust.CustomerName}</strong>
                <a href={buildUndeliveredWaUrl(nextWaCust)} target="_blank" rel="noopener noreferrer" onClick={() => setWaSentIds(prev => ({ ...prev, [nextWaCust.CustomerID]: true }))} style={{ textDecoration: 'none', display: 'inline-block',  padding: '8px 14px', background: '#15803d', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer'  }}>▶ Send Next ({nextWaCust.CustomerName})</a>
              </div>
            ) : (
              <div style={{ background: '#dcfce7', color: '#15803d', padding: '10px', borderRadius: '8px', fontWeight: 700, marginBottom: '12px' }}>
                ✅ అందరి Undelivered customers కి WhatsApp alerts పూర్తయ్యాయి!
              </div>
            )}

            <div style={{ display: 'grid', gap: '8px', maxHeight: '55vh', overflowY: 'auto' }}>
              {waModalList.map((c, idx) => {
                const hasPhone = String(c.MobileNumber || '').replace(/\D/g, '').length >= 10
                const isSent = Boolean(waSentIds[c.CustomerID])
                return (
                  <div key={c.CustomerID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: isSent ? '#f0fdf4' : '#fff' }}>
                    <div>
                      <strong>{idx + 1}. {c.CustomerName}</strong>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{c.MobileNumber || 'No Mobile Number'}</div>
                    </div>
                    {hasPhone ? (
                      <a href={buildUndeliveredWaUrl(c)} target="_blank" rel="noopener noreferrer" onClick={() => setWaSentIds(prev => ({ ...prev, [c.CustomerID]: true }))} style={{ textDecoration: 'none', display: 'inline-block',  padding: '7px 12px', borderRadius: '7px', border: 'none', fontWeight: 700, cursor: 'pointer', background: isSent ? '#dcfce7' : '#0f766e', color: isSent ? '#15803d' : '#fff'  }}>{isSent ? '✓ Sent Again' : '💬 Send Telugu Msg'}</a>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>No Mobile</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
      {qtyModalList.length > 0 && (
        <div className="customer-modal-overlay" onClick={() => setQtyModalList([])}>
          <div className="customer-modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="customer-modal-header">
              <h2>🥛 Extra / Less Milk WhatsApp Alerts ({qtyModalList.length})</h2>
              <button type="button" onClick={() => setQtyModalList([])}>✕</button>
            </div>
            {nextQtyCust ? (
              <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', padding: '12px', borderRadius: '10px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <strong style={{ color: '#b45309' }}>Next: {nextQtyCust.CustomerName} ({nextQtyCust.Diff > 0 ? `+${nextQtyCust.Diff}L` : `${nextQtyCust.Diff}L`})</strong>
                <a href={buildQtyChangeWaUrl(nextQtyCust)} target="_blank" rel="noopener noreferrer" onClick={() => setQtySentIds(prev => ({ ...prev, [nextQtyCust.CustomerID]: true }))} style={{ textDecoration: 'none', padding: '8px 14px', background: '#d97706', color: '#fff', borderRadius: '8px', fontWeight: 700 }}>▶ Send Next ({nextQtyCust.CustomerName})</a>
              </div>
            ) : (
              <div style={{ background: '#dcfce7', color: '#15803d', padding: '10px', borderRadius: '8px', fontWeight: 700, marginBottom: '12px' }}>
                ✅ అందరి Extra / Less Milk customers కి WhatsApp alerts పూర్తయ్యాయి!
              </div>
            )}
            <div style={{ display: 'grid', gap: '8px', maxHeight: '55vh', overflowY: 'auto' }}>
              {qtyModalList.map((c, idx) => {
                const hasPhone = String(c.MobileNumber || '').replace(/\D/g, '').length >= 10
                const isSent = Boolean(qtySentIds[c.CustomerID])
                const isExtra = c.Diff > 0
                return (
                  <div key={c.CustomerID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: isSent ? '#f0fdf4' : '#fff' }}>
                    <div>
                      <strong>{idx + 1}. {c.CustomerName}</strong> <span style={{ fontSize: '12px', fontWeight: 800, color: isExtra ? '#d97706' : '#0284c7' }}>({isExtra ? `+${c.Diff}L Extra` : `${c.Diff}L Less`})</span>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Default: {c.DefaultMilkQuantity}L → Delivered: {c.MilkQuantity}L</div>
                    </div>
                    {hasPhone ? (
                      <a href={buildQtyChangeWaUrl(c)} target="_blank" rel="noopener noreferrer" onClick={() => setQtySentIds(prev => ({ ...prev, [c.CustomerID]: true }))} style={{ textDecoration: 'none', padding: '7px 12px', borderRadius: '7px', fontWeight: 700, background: isSent ? '#dcfce7' : (isExtra ? '#d97706' : '#0284c7'), color: isSent ? '#15803d' : '#fff' }}>{isSent ? '✓ Sent Again' : '💬 Send Msg'}</a>
                    ) : (
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>No Mobile</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default DeliveryEntry
