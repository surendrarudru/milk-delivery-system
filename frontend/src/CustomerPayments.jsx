import { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000`

export function parseLedgerBalances(d) {
  const s = d?.Summary || d?.Balances || d || {}
  const rows = Array.isArray(d) ? d : (d?.Entries || d?.LedgerEntries || d?.Transactions || d?.Ledger || [])
  if (Array.isArray(rows) && rows.length > 0) {
    const latest = {}
    rows.forEach(r => {
      const acc = String(r.Account || r.Category || 'Opening').toLowerCase()
      latest[acc] = Number(r.AccountBalance ?? r.RunningBalance ?? r.Balance ?? 0)
    })
    const opening = latest['opening balance'] ?? latest['opening'] ?? 0
    const milk = latest['milk account'] ?? latest['milk'] ?? 0
    const butter = latest['veena pusa account'] ?? latest['veena pusa'] ?? latest['veenapusa'] ?? 0
    return { opening, milk, butter, total: opening + milk + butter }
  }
  const opening = Number(s.OpeningBalance ?? s.OpeningDue ?? 0)
  const milk = Number(s.MilkBalance ?? s.MilkDue ?? 0)
  const butter = Number(s.VeenaPusaBalance ?? s.VeenaPusaDue ?? 0)
  const total = Number(s.TotalOutstanding ?? s.TotalBalance ?? s.ClosingBalance ?? s.NetBalance ?? opening + milk + butter)
  return { opening, milk, butter, total }
}

export default function CustomerPayments({ customer = null, onPaymentSaved = null }) {
  const [customers, setCustomers] = useState([])
  const [dueRows, setDueRows] = useState([])
  const [custId, setCustId] = useState(customer?.CustomerID ? String(customer.CustomerID) : '')
  const [bal, setBal] = useState({ opening: 0, milk: 0, butter: 0, total: 0 })
  const [form, setForm] = useState({ date: new Date().toLocaleDateString('en-CA'), mode: 'Cash', opening: 0, milk: 0, butter: 0, notes: '' })
  const [msg, setMsg] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadAll() {
    try {
      const list = (await (await fetch(`${API_URL}/customers`)).json()).filter(c => c.IsActive)
      setCustomers(list)
      if (!customer) {
        const rows = await Promise.all(list.map(async c => {
          try {
            const r = await fetch(`${API_URL}/customers/${c.CustomerID}/ledger`)
            return { ...c, ...(r.ok ? parseLedgerBalances(await r.json()) : { opening: Number(c.OpeningBalance || 0), milk: 0, butter: 0, total: Number(c.OpeningBalance || 0) }) }
          } catch { return { ...c, opening: Number(c.OpeningBalance || 0), milk: 0, butter: 0, total: Number(c.OpeningBalance || 0) } }
        }))
        setDueRows(rows.filter(x => x.total > 0).sort((a, b) => b.total - a.total))
      }
    } catch {}
  }

  async function pickCust(id) {
    setCustId(String(id)); setMsg('')
    if (!id) return setBal({ opening: 0, milk: 0, butter: 0, total: 0 })
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
    if (!custId) return setMsg('Please select a customer first.')
    if (allocated <= 0) return setMsg('Enter an amount greater than 0.')
    setSaving(true)
    try {
      const res = await fetch(`${API_URL}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ CustomerID: Number(custId), PaymentDate: form.date, PaymentMode: form.mode, OpeningPaid: Number(form.opening || 0), MilkPaid: Number(form.milk || 0), VeenaPusaPaid: Number(form.butter || 0), TotalPaid: allocated, Notes: form.notes })
      })
      if (!res.ok) throw new Error('Payment save failed')
      setMsg(`Saved ₹${allocated} payment for ${selectedCust?.CustomerName || 'Customer'}.`)
      setForm(f => ({ ...f, opening: 0, milk: 0, butter: 0, notes: '' }))
      await pickCust(custId); await loadAll()
      if (onPaymentSaved) onPaymentSaved()
    } catch (err) { setMsg(err.message) } finally { setSaving(false) }
  }

  const inp = { width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={{ background: '#fff', padding: '22px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
        <h2 style={{ marginTop: 0 }}>Record New Payment</h2>
        {msg && <div style={{ padding: '10px', background: '#dcfce7', color: '#15803d', borderRadius: '8px', marginBottom: '12px', fontWeight: 600 }}>{msg}</div>}
        <form onSubmit={savePayment} style={{ display: 'grid', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            {customer ? (
              <div><label style={{ fontWeight: 700 }}>Customer</label><div style={{ ...inp, background: '#f1f5f9', fontWeight: 700 }}>{customer.CustomerName} ({customer.CustomerCode})</div></div>
            ) : (
              <div><label style={{ fontWeight: 700 }}>Select Customer *</label><select value={custId} onChange={e => pickCust(e.target.value)} style={inp}><option value="">-- Choose Customer --</option>{customers.map(c => <option key={c.CustomerID} value={c.CustomerID}>{c.CustomerName} ({c.CustomerCode})</option>)}</select></div>
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
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input type="text" placeholder="Optional notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} style={{ ...inp, flex: 1, minWidth: '180px' }} />
            <strong>Total: ₹{allocated.toFixed(2)}</strong>
            <button type="submit" disabled={saving} style={{ padding: '10px 20px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save Payment'}</button>
          </div>
        </form>
      </div>
      {!customer && (
        <div style={{ background: '#fff', padding: '22px', borderRadius: '14px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>Pending Customer Balances ({dueRows.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead><tr style={{ borderBottom: '2px solid #e2e8f0' }}><th style={{ padding: '8px' }}>Customer</th><th style={{ padding: '8px' }}>Opening</th><th style={{ padding: '8px' }}>Milk</th><th style={{ padding: '8px' }}>Veena Pusa</th><th style={{ padding: '8px' }}>Total Due</th><th style={{ padding: '8px' }}>Action</th></tr></thead>
            <tbody>{dueRows.map(r => <tr key={r.CustomerID} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: '8px' }}><strong>{r.CustomerName}</strong> ({r.CustomerCode})</td><td style={{ padding: '8px' }}>₹{r.opening}</td><td style={{ padding: '8px' }}>₹{r.milk}</td><td style={{ padding: '8px' }}>₹{r.butter}</td><td style={{ padding: '8px', color: '#b45309', fontWeight: 700 }}>₹{r.total}</td><td style={{ padding: '8px' }}><button type="button" onClick={() => pickCust(r.CustomerID)} style={{ padding: '5px 12px', background: '#0f4c2e', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Select</button></td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
