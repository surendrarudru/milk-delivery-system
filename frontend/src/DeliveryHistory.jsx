import { useEffect, useState } from 'react'
import './DeliveryHistory.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://' + window.location.hostname + ':8000'

export default function DeliveryHistory({ customer, initialYear = null, initialMonth = null }) {
  const today = new Date()
  const [year, setYear] = useState(initialYear || today.getFullYear())
  const [month, setMonth] = useState(initialMonth || today.getMonth() + 1)
  const [calendarData, setCalendarData] = useState(null)
  const [selectedDate, setSelectedDate] = useState(
    (initialYear || today.getFullYear()) + '-' + String(initialMonth || today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
  )
  const [historyData, setHistoryData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState('')
  const [editingRecord, setEditingRecord] = useState(null)
  const [editForm, setEditForm] = useState({ DeliveryStatus: 'Delivered', MilkQuantity: 0, VeenaPusaDelivered: false, VeenaPusaQuantity: 0, Notes: '' })
  const [savingCorrection, setSavingCorrection] = useState(false)
  const [correctionMessage, setCorrectionMessage] = useState('')

  useEffect(() => {
    if (initialYear) setYear(initialYear)
    if (initialMonth) setMonth(initialMonth)
  }, [customer?.CustomerID, initialYear, initialMonth])

  useEffect(() => {
    if (!customer?.CustomerID) return
    async function loadCalendar() {
      setLoading(true); setError('')
      try {
        const res = await fetch(API_URL + '/customers/' + customer.CustomerID + '/delivery-calendar/' + year + '/' + month)
        if (!res.ok) throw new Error('Calendar load failed.')
        setCalendarData(await res.json())
      } catch (err) { setError(err.message); setCalendarData(null) } finally { setLoading(false) }
    }
    loadCalendar()
  }, [customer?.CustomerID, year, month])

  useEffect(() => {
    if (!customer?.CustomerID || !selectedDate) return
    async function loadHistory() {
      setHistoryLoading(true); setHistoryData(null)
      try {
        const res = await fetch(API_URL + '/customers/' + customer.CustomerID + '/delivery-history/' + selectedDate)
        if (!res.ok) throw new Error('Selected date details load failed.')
        setHistoryData(await res.json())
      } catch (err) { setHistoryData({ error: err.message }) } finally { setHistoryLoading(false) }
    }
    loadHistory()
  }, [customer?.CustomerID, selectedDate])

  function previousMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) } else { setMonth(m => m - 1) }
  }

  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) } else { setMonth(m => m + 1) }
  }

  const monthName = new Date(year, month - 1).toLocaleString('en-IN', { month: 'long' })
  const totalDays = new Date(year, month, 0).getDate()
  const firstDay = new Date(year, month - 1, 1).getDay()
  const calendarDays = []
  for (let i = 0; i < firstDay; i++) calendarDays.push(null)
  for (let day = 1; day <= totalDays; day++) {
    const dateString = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
    const dayData = calendarData?.Days?.find(item => item.Date === dateString)
    calendarDays.push({ day, dateString, color: dayData?.Color || 'Grey' })
  }

  const selectedDayData = calendarData?.Days?.find(item => item.Date === selectedDate)
  function getSessionRecord(sessionName) {
    if (Array.isArray(historyData?.Sessions)) return historyData.Sessions.find(i => i.Session === sessionName) || null
    if (Array.isArray(historyData?.Deliveries)) return historyData.Deliveries.find(i => i.Session === sessionName) || null
    return selectedDayData?.[sessionName] || null
  }

  const morningRecord = getSessionRecord('Morning')
  const eveningRecord = getSessionRecord('Evening')
  const formatDate = ds => (ds ? ds.split('-').reverse().join('-') : '')

  function startEdit(record) {
    if (!record?.DeliveryDetailID) return alert('Delivery record not found.')
    if (record.SessionStatus !== 'Completed') return alert('This session is Open. Please edit it from Daily Delivery Entry.')
    setEditingRecord(record)
    setEditForm({ DeliveryStatus: record.DeliveryStatus || 'Delivered', MilkQuantity: record.MilkQuantity ?? 0, VeenaPusaDelivered: Boolean(record.VeenaPusaDelivered), VeenaPusaQuantity: record.VeenaPusaQuantity ?? 0, Notes: record.Notes || '' })
    setCorrectionMessage('')
  }

  function handleEditChange(e) {
    const { name, value, type, checked } = e.target
    setEditForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }))
  }

  async function saveCorrection(e) {
    e.preventDefault()
    if (!editingRecord?.DeliveryDetailID) return
    if (!window.confirm('Are you sure you want to correct this delivery record?')) return
    setSavingCorrection(true); setCorrectionMessage('')
    try {
      const payload = {
        DeliveryStatus: editForm.DeliveryStatus,
        MilkQuantity: editForm.DeliveryStatus === 'Undelivered' ? 0 : Number(editForm.MilkQuantity),
        VeenaPusaDelivered: editForm.DeliveryStatus === 'Undelivered' ? false : Boolean(editForm.VeenaPusaDelivered),
        VeenaPusaQuantity: editForm.DeliveryStatus === 'Undelivered' || !editForm.VeenaPusaDelivered ? 0 : Number(editForm.VeenaPusaQuantity),
        Notes: editForm.Notes, ChangedBy: 'System'
      }
      const res = await fetch(API_URL + '/delivery/correction/' + editingRecord.DeliveryDetailID, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await res.json()
      if (!res.ok) throw new Error(result.detail || 'Delivery correction failed')
      setEditingRecord(null); setCorrectionMessage('Delivery record corrected successfully.')
      const [hRes, cRes] = await Promise.all([
        fetch(API_URL + '/customers/' + customer.CustomerID + '/delivery-history/' + selectedDate),
        fetch(API_URL + '/customers/' + customer.CustomerID + '/delivery-calendar/' + year + '/' + month)
      ])
      if (hRes.ok) setHistoryData(await hRes.json())
      if (cRes.ok) setCalendarData(await cRes.json())
    } catch (err) { setCorrectionMessage(err.message) } finally { setSavingCorrection(false) }
  }
  function renderSession(title, record) {
    return (
      <div className="dh-session-card">
        <h4>{title}</h4>
        {!record ? (
          <p className="dh-no-record">No delivery record found.</p>
        ) : (
          <>
            <div className="dh-detail-row"><span>Delivery Status</span><strong>{record.DeliveryStatus || 'Not Available'}</strong></div>
            <div className="dh-detail-row"><span>Session Status</span><strong>{record.SessionStatus || 'Not Available'}</strong></div>
            <div className="dh-detail-row"><span>Milk Quantity</span><strong>{record.MilkQuantity ?? 0} L</strong></div>
            <div className="dh-detail-row"><span>Milk Rate</span><strong>₹{record.MilkRate ?? 0}</strong></div>
            <div className="dh-detail-row"><span>Milk Amount</span><strong>₹{record.MilkAmount ?? 0}</strong></div>
            <div className="dh-detail-row"><span>Veena Pusa</span><strong>{record.VeenaPusaDelivered ? 'Yes' : 'No'}</strong></div>
            <div className="dh-detail-row"><span>Veena Pusa Quantity</span><strong>{record.VeenaPusaQuantity ?? 0} KG</strong></div>
            <div className="dh-detail-row"><span>Veena Pusa Amount</span><strong>₹{record.VeenaPusaAmount ?? 0}</strong></div>
            <div className="dh-detail-row dh-total-row"><span>Total Amount</span><strong>₹{record.TotalAmount ?? 0}</strong></div>
            {record.Notes && <div className="dh-notes"><span>Notes:</span> {record.Notes}</div>}
            <button type="button" className="dh-edit-button" onClick={() => startEdit(record)}>✎ Edit Delivery</button>
          </>
        )}
      </div>
    )
  }

  if (!customer) return <p>Customer details not found.</p>

  return (
    <div className="delivery-history">
      {editingRecord && (
        <div className="dh-edit-overlay">
          <form className="dh-edit-form" onSubmit={saveCorrection}>
            <h3>Edit Delivery — {editingRecord.Session}</h3>
            <label>Delivery Status</label>
            <select name="DeliveryStatus" value={editForm.DeliveryStatus} onChange={handleEditChange}>
              <option value="Delivered">Delivered</option>
              <option value="Undelivered">Undelivered</option>
            </select>
            {editForm.DeliveryStatus === 'Delivered' && (
              <>
                <label>Milk Quantity (L)</label>
                <input type="number" name="MilkQuantity" min="0" step="0.25" value={editForm.MilkQuantity} onChange={handleEditChange} />
                <label className="dh-edit-checkbox">
                  <input type="checkbox" name="VeenaPusaDelivered" checked={editForm.VeenaPusaDelivered} onChange={handleEditChange} />
                  Veena Pusa Delivered
                </label>
                {editForm.VeenaPusaDelivered && (
                  <>
                    <label>Veena Pusa Quantity (KG)</label>
                    <input type="number" name="VeenaPusaQuantity" min="0.5" step="0.5" value={editForm.VeenaPusaQuantity} onChange={handleEditChange} />
                  </>
                )}
              </>
            )}
            <label>Correction Notes</label>
            <textarea name="Notes" value={editForm.Notes} onChange={handleEditChange} placeholder="Reason for correction..." rows="3" />
            <div className="dh-edit-actions">
              <button type="submit" disabled={savingCorrection}>{savingCorrection ? 'Saving...' : 'Save Correction'}</button>
              <button type="button" onClick={() => { setEditingRecord(null); setCorrectionMessage('') }} disabled={savingCorrection}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <h3>Delivery History</h3>
      <div className="dh-customer-info">
        <strong>{customer.CustomerName}</strong>
        <span>Customer Code: {customer.CustomerCode}</span>
      </div>

      {correctionMessage && <div className={correctionMessage.includes('successfully') ? 'dh-success' : 'dh-error'}>{correctionMessage}</div>}
      {error && <div className="dh-error">{error}</div>}

      <div className="dh-calendar-container">
        <div className="dh-calendar-header">
          <button type="button" onClick={previousMonth}>❮</button>
          <h3>{monthName} {year}</h3>
          <button type="button" onClick={nextMonth}>❯</button>
        </div>

        <div className="dh-calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div className="dh-weekday" key={day}>{day}</div>)}
          {loading ? <div className="dh-loading">Loading calendar...</div> : calendarDays.map((item, idx) =>
            !item ? <div className="dh-empty-day" key={'empty-' + idx} /> : (
              <button type="button" key={item.dateString} className={'dh-calendar-day dh-' + String(item.color).toLowerCase() + (selectedDate === item.dateString ? ' dh-selected' : '')} onClick={() => setSelectedDate(item.dateString)}>
                {item.day}
              </button>
            )
          )}
        </div>

        <div className="dh-legend">
          <span><i className="dh-green-box" /> Default Quantity</span>
          <span><i className="dh-red-box" /> Undelivered / Missing</span>
          <span><i className="dh-yellow-box" /> Quantity Changed</span>
          <span><i className="dh-grey-box" /> Future Date</span>
        </div>
      </div>

      <div className="dh-selected-details">
        <h3>Delivery Details — {formatDate(selectedDate)}</h3>
        {historyLoading ? <p>Loading delivery details...</p> : historyData?.error ? <p className="dh-error">{historyData.error}</p> : (
          <div className="dh-session-grid">
            {renderSession('Morning Delivery', morningRecord)}
            {renderSession('Evening Delivery', eveningRecord)}
          </div>
        )}
      </div>
    </div>
  )
}
