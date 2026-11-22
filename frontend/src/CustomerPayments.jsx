import { paymentSchema, validateWithSchema } from './validation/schemas'
import { useEffect, useState } from 'react'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://' + 'milk-delivery-api-bn26' + '.onrender.com')

export function parseLedgerBalances(d) {
  if (d?.AccountBalances) {
    const ab = d.AccountBalances
    const opening = Number(ab.OpeningBalance ?? 0)
    const milk = Number(ab.Milk ?? 0)
    const butter = Number(ab.VeenaPusa ?? 0)
    return { opening, milk, butter, total: opening + milk + butter }
  }
  const rows = Array.isArray(d) ? d : (d?.Transactions || d?.Entries || d?.LedgerEntries || [])
  if (Array.isArray(rows) && rows.length > 0) {
    const latest = {}
    rows.forEach(r => {
      const acc = String(r.AccountType || r.Account || r.Category || 'Opening').toLowerCase()
      latest[acc] = Number(r.Balance ?? r.AccountBalance ?? r.RunningBalance ?? 0)
    })
    const opening = latest['openingbalance'] ?? latest['opening balance'] ?? latest['opening'] ?? 0
    const milk = latest['milk'] ?? latest['milk account'] ?? 0
    const butter = latest['veenapusa'] ?? latest['veena pusa'] ?? latest['veena pusa account'] ?? 0
    return { opening, milk, butter, total: opening + milk + butter }
  }
  return { opening: 0, milk: 0, butter: 0, total: 0 }
}

export default function CustomerPayments({ customer = null, onPaymentSaved = null }) {
  const todayStr = new Date().toLocaleDateString('en-CA')
  const [customers, setCustomers] = useState([])
  const [custId, setCustId] = useState(customer?.CustomerID ? String(customer.CustomerID) : '')
  const [bal, setBal] = useState({ opening: 0, milk: 0, butter: 0, total: 0 })
  const [form, setForm] = useState({ date: todayStr, mode: 'Cash', opening: 0, milk: 0, butter: 0, notes: '' })
  const [addonForm, setAddonForm] = useState({ date: todayStr, qtyKg: 0.5, amount: 500, notes: '' })
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingAddon, setSavingAddon] = useState(false)
  const [paymentError, setPaymentError] = useState('')

  async function loadAll() {
    try {
      const res = await fetch(`${API_URL}/customers-summary`)
      if (res.ok) setCustomers((await res.json()).filter(c => c.IsActive))
    } catch {}
  }

  async function pickCust(id) {
    setCustId(String(id)); setMsg(''); setPaymentError('')
    if (!id) return setBal({ opening: 0, milk: 0, butter: 0, total: 0 })
    const cObj = customer || customers.find(c => String(c.CustomerID) === String(id))
    const rate = Number(cObj?.VennaPusaRate || 1000)
    setAddonForm(a => ({ ...a, amount: Math.round(Number(a.qtyKg || 0) * rate) }))
    try {
      const r = await fetch(`${API_URL}/customers/${id}/ledger`)
      if (r.ok) setBal(parseLedgerBalances(await r.json()))
    } catch {}
  }

  useEffect(() => { loadAll() }, [])
  useEffect(() => { if (customer?.CustomerID) pickCust(customer.CustomerID) }, [customer?.CustomerID])

  const allocated = Number(form.opening || 0) + Number(form.milk || 0) + Number(form.butter || 0)
  const selectedCust = customer || customers.find(c => String(c.CustomerID) === String(custId))

  async function savePayment(e) {
    e.preventDefault()
    const check = validateWithSchema(paymentSchema, {
      CustomerID: Number(custId || 0),
      PaymentDate: form.date,
      OpeningBalanceAmount: Number(form.opening || 0),
      MilkAmount: Number(form.milk || 0),
      VeenaPusaAmount: Number(form.butter || 0),
    })
    if (!check.success) { setPaymentError(check.firstError); return }
    setPaymentError(''); setSaving(true)
    try {
      const res = await fetch(`${API_URL}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CustomerID: Number(custId), PaymentDate: form.date, PaymentMode: form.mode, OpeningBalanceAmount: Number(form.opening || 0), MilkAmount: Number(form.milk || 0), VeenaPusaAmount: Number(form.butter || 0), TotalAmount: allocated, Notes: form.notes })
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(typeof err.detail === 'string' ? err.detail : 'Payment save failed') }
      setMsg(`Saved ₹${allocated} payment for ${selectedCust?.CustomerName || 'Customer'}.`)
      setForm(f => ({ ...f, opening: 0, milk: 0, butter: 0, notes: '' }))
      await pickCust(custId)
      if (onPaymentSaved) onPaymentSaved()
    } catch (err) { setMsg(err.message) } finally { setSaving(false) }
  }

  async function saveVeenaPusaAddon(e) {
    e.preventDefault()
    if (!custId) return setMsg('Please select a customer first.')
    if (Number(addonForm.amount || 0) <= 0) return setMsg('Enter a Veena Pusa bill amount greater than ₹0.')
    setSavingAddon(true); setMsg('')
    try {
      const res = await fetch(`${API_URL}/addons/veenapusa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CustomerID: Number(custId), EntryDate: addonForm.date, QuantityKg: Number(addonForm.qtyKg || 0), Amount: Number(addonForm.amount || 0), Notes: addonForm.notes })
      })
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Add-on save failed') }
      setMsg(`Added ₹${addonForm.amount} Veena Pusa bill to ${selectedCust?.CustomerName || 'Customer'}!`)
      setAddonForm(a => ({ ...a, notes: '' }))
      await pickCust(custId)
      if (onPaymentSaved) onPaymentSaved()
    } catch (err) { setMsg(err.message) } finally { setSavingAddon(false) }
  }
  const inp = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }
  const vpRate = Number(selectedCust?.VennaPusaRate || 1000)

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div style={{ background: '#fff', padding: '20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
        <h2 style={{ marginTop: 0 }}>Record New Payment</h2>
        {msg && <div style={{ padding: '10px', background: '#dcfce7', color: '#15803d', borderRadius: '8px', marginBottom: '12px', fontWeight: 600 }}>{msg}</div>}
        <form onSubmit={savePayment} style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {customer ? (
              <div><label style={{ fontWeight: 700 }}>Customer</label><div style={{ ...inp, background: '#f1f5f9', fontWeight: 700 }}>{customer.CustomerName} ({customer.CustomerCode})</div></div>
            ) : (
              <div><label style={{ fontWeight: 700 }}>Select Customer *</label><select value={custId} onChange={e => pickCust(e.target.value)} style={inp}><option value="">-- Choose Customer --</option>{customers.map(c => <option key={c.CustomerID} value={c.CustomerID}>{c.CustomerName} {c.ReferenceName ? `(${c.ReferenceName})` : ''} — {c.CustomerCode}</option>)}</select></div>
            )}
            <div><label style={{ fontWeight: 700 }}>Payment Date</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={inp} /></div>
            <div><label style={{ fontWeight: 700 }}>Payment Mode</label><select value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })} style={inp}><option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Bank Transfer">Bank Transfer</option></select></div>
          </div>
          {custId && <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', padding: '10px 14px', background: '#fef3c7', borderRadius: '8px' }}><span><strong>Opening Due:</strong> ₹{bal.opening}</span><span><strong>Milk Due:</strong> ₹{bal.milk}</span><span><strong>Veena Pusa Due:</strong> ₹{bal.butter}</span><strong style={{ color: '#b45309' }}>Total: ₹{bal.total}</strong></div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            <div><label>Opening Paid (₹)</label><input type="number" min="0" step="0.01" value={form.opening} onChange={e => setForm({ ...form, opening: e.target.value })} style={inp} /></div>
            <div><label>Milk Paid (₹)</label><input type="number" min="0" step="0.01" value={form.milk} onChange={e => setForm({ ...form, milk: e.target.value })} style={inp} /></div>
            <div><label>Veena Pusa Paid (₹)</label><input type="number" min="0" step="0.01" value={form.butter} onChange={e => setForm({ ...form, butter: e.target.value })} style={inp} /></div>
          </div>
          {paymentError && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '9px 12px', borderRadius: '8px', fontWeight: 700 }}>⚠️ {paymentError}</div>}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="text" placeholder="Optional notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inp, flex: 1, minWidth: '180px' }} />
            <strong>Total: ₹{allocated.toFixed(2)}</strong>
            <button type="submit" disabled={saving} style={{ padding: '10px 20px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save Payment'}</button>
          </div>
        </form>
      </div>

      <div style={{ background: '#fffbeb', padding: '20px', borderRadius: '14px', border: '1px solid #fde68a' }}>
        <h3 style={{ marginTop: 0, color: '#92400e' }}>🧈 Add-on Veena Pusa Bill (Customer Debit)</h3>
        <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#78350f' }}>Select a customer above and add their Veena Pusa purchase directly to their account balance.</p>
        <form onSubmit={saveVeenaPusaAddon} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', alignItems: 'end' }}>
          <div><label style={{ fontWeight: 700 }}>Bill Date</label><input type="date" value={addonForm.date} onChange={e => setAddonForm({ ...addonForm, date: e.target.value })} style={{ ...inp, background: '#fff' }} /></div>
          <div>
            <label style={{ fontWeight: 700 }}>Quantity (KG)</label>
            <input type="number" min="0" step="0.25" value={addonForm.qtyKg} onChange={e => { const q = Number(e.target.value || 0); setAddonForm({ ...addonForm, qtyKg: q, amount: Math.round(q * vpRate) }) }} style={{ ...inp, background: '#fff' }} />
          </div>
          <div><label style={{ fontWeight: 700 }}>Bill Amount (₹)</label><input type="number" min="1" step="0.01" value={addonForm.amount} onChange={e => setAddonForm({ ...addonForm, amount: e.target.value })} style={{ ...inp, background: '#fff' }} /></div>
          <div><label style={{ fontWeight: 700 }}>Notes</label><input type="text" placeholder="e.g. 0.5 KG order" value={addonForm.notes} onChange={e => setAddonForm({ ...addonForm, notes: e.target.value })} style={{ ...inp, background: '#fff' }} /></div>
          <button type="submit" disabled={savingAddon || !custId} style={{ padding: '10px 18px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer', height: '40px' }}>{savingAddon ? 'Adding...' : '+ Add Veena Pusa Bill'}</button>
        </form>
      </div>
    </div>
  )
}
