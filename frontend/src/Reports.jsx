import { useEffect, useState } from 'react'
import DeliveryHistory from './DeliveryHistory'
import './CustomerMaster.css'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://onrender.com')

export default function Reports() {
  const today = new Date()
  const [selectedMonth, setSelectedMonth] = useState(today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0'))
  const [customers, setCustomers] = useState([])
  const [balances, setBalances] = useState({})
  const [monthlySummaries, setMonthlySummaries] = useState([])
  const [balanceFilter, setBalanceFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [calendarCustomer, setCalendarCustomer] = useState(null)

  const [year, month] = selectedMonth.split('-').map(Number)

  async function loadReportsData() {
    setLoading(true); setError('')
    try {
      const custRes = await fetch(API_URL + '/customers')
      if (!custRes.ok) throw new Error('Customers load failed')
      const custData = await custRes.json()
      const customerList = Array.isArray(custData) ? custData : []
      setCustomers(customerList)

      const balanceEntries = await Promise.all(customerList.map(async c => {
        try {
          const res = await fetch(API_URL + '/customers/' + c.CustomerID + '/card-balance')
          return [c.CustomerID, res.ok ? await res.json() : null]
        } catch { return [c.CustomerID, null] }
      }))
      setBalances(Object.fromEntries(balanceEntries))

      const previewResults = await Promise.all(customerList.map(async c => {
        try {
          const res = await fetch(API_URL + '/billing/preview/' + c.CustomerID + '/' + year + '/' + month)
          if (!res.ok) return null
          const p = await res.json()
          return {
            CustomerID: c.CustomerID, CustomerCode: c.CustomerCode, CustomerName: c.CustomerName,
            ReferenceName: c.ReferenceName, IsActive: c.IsActive,
            MilkTotalQuantity: Number(p.MilkTotalQuantity || 0), MilkTotal: Number(p.MilkTotal || 0),
            VeenaPusaTotalQuantity: Number(p.VeenaPusaTotalQuantity || 0), VeenaPusaTotal: Number(p.VeenaPusaTotal || 0),
            MonthTotal: Number(p.MilkTotal || 0) + Number(p.VeenaPusaTotal || 0)
          }
        } catch { return null }
      }))
      setMonthlySummaries(previewResults.filter(Boolean))
    } catch (err) { setError(err.message || 'Reports load failed') } finally { setLoading(false) }
  }

  useEffect(() => { loadReportsData() }, [selectedMonth])

  const fmtINR = amt => Number(amt || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtAcc = amt => { const v = Number(amt || 0); return v > 0 ? fmtINR(v) + ' Due' : v < 0 ? fmtINR(Math.abs(v)) + ' Adv' : '₹0.00' }

  const totalOutstanding = Object.values(balances).reduce((s, x) => s + Number(x?.TotalDue || 0), 0)
  const totalAdvance = Object.values(balances).reduce((s, x) => s + Number(x?.TotalAdvance || 0), 0)
  const totalMilkLitres = monthlySummaries.reduce((s, x) => s + x.MilkTotalQuantity, 0)
  const totalMilkRevenue = monthlySummaries.reduce((s, x) => s + x.MilkTotal, 0)
  const totalVeenaKg = monthlySummaries.reduce((s, x) => s + x.VeenaPusaTotalQuantity, 0)
  const totalVeenaRevenue = monthlySummaries.reduce((s, x) => s + x.VeenaPusaTotal, 0)

  const q = search.toLowerCase().trim()
  const matchSearch = c => !q || [c.CustomerName, c.CustomerCode, c.ReferenceName, c.MobileNumber].some(v => (v || '').toLowerCase().includes(q))

  const filteredBalanceCustomers = customers.filter(c => {
    if (!matchSearch(c)) return false
    const st = String(balances[c.CustomerID]?.PaymentStatus || '').toUpperCase()
    if (balanceFilter === 'DUE') return st === 'DUE'
    if (balanceFilter === 'ADVANCE') return st === 'ADVANCE'
    if (balanceFilter === 'NO DUE') return st === 'NO DUE'
    return true
  })

  const filteredSummaries = monthlySummaries.filter(matchSearch)
  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  function sendDueReminder(customer, dueAmt) {
    const clean = String(customer.MobileNumber || '').replace(/\D/g, '')
    if (clean.length < 10) return alert('ఈ కస్టమర్‌కు మొబైల్ నంబర్ లేదు.')
    const text = 'నమస్తే *' + (customer.CustomerName || '') + '* గారు 🙏\nమీ పాల ఖాతాలో *' + fmtINR(dueAmt) + '* బకాయి (Pending Due) ఉంది. దయచేసి వీలైనంత త్వరగా చెల్లించగలరు. ధన్యవాదాలు! 🥛'
    window.location.href = 'whatsapp://send?phone=91' + clean.slice(-10) + '&text=' + encodeURIComponent(text)
  }

  function downloadBalancesCSV() {
    const rows = [['Code', 'Customer Name', 'Reference', 'Mobile', 'Opening Bal', 'Milk Bal', 'Veena Pusa Bal', 'Status', 'Net Amount']]
    filteredBalanceCustomers.forEach(c => {
      const b = balances[c.CustomerID] || {}; const a = b.AccountBalances || {}
      rows.push([c.CustomerCode, c.CustomerName, c.ReferenceName || '', c.MobileNumber || '', a.OpeningBalance || 0, a.Milk || 0, a.VeenaPusa || 0, b.PaymentStatus || '', b.StatusAmount || 0])
    })
    const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n')
    const link = document.createElement('a'); link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    link.download = 'Customer_Balances_' + selectedMonth + '.csv'; link.click()
  }

  function printDueOnlyReport() {
    const dueList = customers
      .map(c => ({ ...c, bal: balances[c.CustomerID] }))
      .filter(c => String(c.bal?.PaymentStatus || '').toUpperCase() === 'DUE' && Number(c.bal?.StatusAmount || 0) > 0)

    const grandDue = dueList.reduce((s, c) => s + Number(c.bal?.StatusAmount || 0), 0)
    const rowsHtml = dueList.map((c, idx) => {
      const a = c.bal?.AccountBalances || {}
      return '<tr><td>' + (idx + 1) + '</td><td>' + c.CustomerCode + '</td><td><strong>' + (c.CustomerName || '') + '</strong></td><td>' + (c.ReferenceName || '-') + '</td><td>' + (c.MobileNumber || '-') + '</td><td style="text-align:right">₹' + Number(a.OpeningBalance || 0).toFixed(2) + '</td><td style="text-align:right">₹' + Number(a.Milk || 0).toFixed(2) + '</td><td style="text-align:right">₹' + Number(a.VeenaPusa || 0).toFixed(2) + '</td><td style="text-align:right;font-weight:700;color:#b91c1c">₹' + Number(c.bal?.StatusAmount || 0).toFixed(2) + '</td></tr>'
    }).join('')

    const w = window.open('', '_blank')
    if (!w) return alert('Please allow pop-ups to print the report.')
    w.document.write('<html><head><title>Pending Dues Report - ' + monthLabel + '</title><style>body{font-family:Segoe UI,Arial,sans-serif;padding:18px;color:#0f172a}.hdr{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f4c2e;padding-bottom:10px;margin-bottom:14px}.hdr h2{margin:0;color:#0f4c2e;font-size:20px}.hdr p{margin:3px 0 0;font-size:12px;color:#475569}.badge{background:#fef3c7;border:1px solid #f59e0b;padding:8px 14px;border-radius:8px;text-align:right}.badge strong{font-size:18px;color:#b45309;display:block}table{width:100%;border-collapse:collapse;font-size:11.5px}th{background:#0f4c2e;color:#fff;padding:7px 8px;text-align:left;white-space:nowrap}td{padding:6px 8px;border-bottom:1px solid #e2e8f0;white-space:nowrap}tr:nth-child(even){background:#f8fafc}.tot td{background:#fef3c7;font-weight:800;font-size:13px;border-top:2px solid #0f4c2e;padding:9px 8px}@media print{@page{size:A4 portrait;margin:10mm}}</style></head><body><div class="hdr"><div><h2>🥛 Milk Manager — Pending Customer Dues Report</h2><p>Month: ' + monthLabel + ' | Printed: ' + new Date().toLocaleDateString('en-IN') + ' | Pending Customers: ' + dueList.length + '</p></div><div class="badge"><span style="font-size:11px">Total Pending Due</span><strong>' + fmtINR(grandDue) + '</strong></div></div><table><thead><tr><th>#</th><th>Code</th><th>Customer Name</th><th>Reference</th><th>Mobile</th><th style="text-align:right">Opening</th><th style="text-align:right">Milk</th><th style="text-align:right">Veena Pusa</th><th style="text-align:right">Total Due</th></tr></thead><tbody>' + rowsHtml + '<tr class="tot"><td colspan="8">Grand Total (' + dueList.length + ' Pending Customers)</td><td style="text-align:right;color:#b91c1c">' + fmtINR(grandDue) + '</td></tr></tbody></table></body></html>')
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300)
  }
  const cardBox = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '20px', marginBottom: '24px', textAlign: 'left' }

  return (
    <div className="customer-master" style={{ textAlign: 'left' }}>
      <div className="customer-master-header">
        <div>
          <h2>Business Reports & Summaries</h2>
          <p>Outstanding Balances & Monthly Delivery Overview</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px' }} />
          <button type="button" className="cancel-btn" onClick={downloadBalancesCSV}>📥 Export CSV</button>
          <button type="button" className="cancel-btn" onClick={printDueOnlyReport}>🖨️ Print Due Report (PDF)</button>
          <button type="button" className="add-customer-btn" onClick={loadReportsData} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
        </div>
      </div>

      {error && <div className="customer-error">{error}</div>}

      <div className="customer-summary-grid">
        <div className="customer-summary-card" onClick={() => setBalanceFilter('DUE')}>
          <span>Total Outstanding Due</span>
          <h3 style={{ color: '#b42318' }}>{fmtINR(totalOutstanding)}</h3>
        </div>
        <div className="customer-summary-card" onClick={() => setBalanceFilter('ADVANCE')}>
          <span>Total Customer Advance</span>
          <h3 style={{ color: '#1d4ed8' }}>{fmtINR(totalAdvance)}</h3>
        </div>
        <div className="customer-summary-card">
          <span>{monthLabel} Milk</span>
          <h3>{totalMilkLitres.toFixed(2)} L</h3>
          <span style={{ marginTop: '4px', color: '#15803d' }}>{fmtINR(totalMilkRevenue)}</span>
        </div>
        <div className="customer-summary-card">
          <span>{monthLabel} Veena Pusa</span>
          <h3>{totalVeenaKg.toFixed(2)} KG</h3>
          <span style={{ marginTop: '4px', color: '#15803d' }}>{fmtINR(totalVeenaRevenue)}</span>
        </div>
      </div>

      <div className="customer-toolbar">
        <input type="text" placeholder="Search customer name, code, reference, or mobile..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={balanceFilter} onChange={e => setBalanceFilter(e.target.value)}>
          <option value="All">All Customers ({customers.length})</option>
          <option value="DUE">Only Due</option>
          <option value="ADVANCE">Only Advance</option>
          <option value="NO DUE">No Due</option>
        </select>
      </div>

      <div style={cardBox}>
        <div style={{ marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>Customer Balance Summary (Ledger) — {filteredBalanceCustomers.length}</h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Account-wise Opening Balance, Milk & Veena Pusa Dues / Advances</p>
        </div>

        <div className="bill-table-wrapper">
          <table className="bill-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Customer Name</th>
                <th>Reference</th>
                <th>Opening Bal</th>
                <th>Milk Bal</th>
                <th>Veena Pusa Bal</th>
                <th>Net Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredBalanceCustomers.map(c => {
                const bal = balances[c.CustomerID]
                const acc = bal?.AccountBalances || {}
                const st = String(bal?.PaymentStatus || 'UNAVAILABLE').toUpperCase()
                const amt = Number(bal?.StatusAmount || 0)
                const cls = st === 'DUE' ? 'due' : st === 'ADVANCE' ? 'advance' : st === 'NO DUE' ? 'no-due' : 'unavailable'
                const txt = st === 'DUE' ? fmtINR(amt) + ' DUE' : st === 'ADVANCE' ? fmtINR(amt) + ' ADVANCE' : st === 'NO DUE' ? 'NO DUE' : 'Unavailable'
                return (
                  <tr key={c.CustomerID}>
                    <td>{c.CustomerCode}</td>
                    <td><strong>{c.CustomerName || 'Unnamed'}</strong></td>
                    <td>{c.ReferenceName || '-'}</td>
                    <td>{fmtAcc(acc.OpeningBalance)}</td>
                    <td>{fmtAcc(acc.Milk)}</td>
                    <td>{fmtAcc(acc.VeenaPusa)}</td>
                    <td><span className={'card-payment-status ' + cls}>{txt}</span></td>
                    <td>
                      {st === 'DUE' && c.MobileNumber ? (
                        <button type="button" onClick={() => sendDueReminder(c, amt)} style={{ padding: '5px 10px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: '6px', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}>
                          💬 Remind
                        </button>
                      ) : '-'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={cardBox}>
        <div style={{ marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>{monthLabel} — Customer Delivery Summary</h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Tap any customer name below to view their live monthly delivery calendar</p>
        </div>

        <div className="bill-table-wrapper">
          <table className="bill-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Customer Name</th>
                <th>Milk Qty (L)</th>
                <th>Milk Amount</th>
                <th>Veena Pusa (KG)</th>
                <th>Veena Pusa Amount</th>
                <th>Month Total</th>
              </tr>
            </thead>
            <tbody>
              {filteredSummaries.map(item => (
                <tr key={item.CustomerID}>
                  <td>{item.CustomerCode}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => setCalendarCustomer(item)}
                      style={{ background: 'none', border: 'none', padding: 0, color: '#0f766e', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: '14px', textAlign: 'left' }}
                    >
                      {item.CustomerName || 'Unnamed'}
                    </button>
                  </td>
                  <td>{item.MilkTotalQuantity.toFixed(2)} L</td>
                  <td>{fmtINR(item.MilkTotal)}</td>
                  <td>{item.VeenaPusaTotalQuantity.toFixed(2)} KG</td>
                  <td>{fmtINR(item.VeenaPusaTotal)}</td>
                  <td><strong>{fmtINR(item.MonthTotal)}</strong></td>
                </tr>
              ))}
              <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                <td colSpan="2">Total ({filteredSummaries.length} Customers)</td>
                <td>{filteredSummaries.reduce((s, x) => s + x.MilkTotalQuantity, 0).toFixed(2)} L</td>
                <td>{fmtINR(filteredSummaries.reduce((s, x) => s + x.MilkTotal, 0))}</td>
                <td>{filteredSummaries.reduce((s, x) => s + x.VeenaPusaTotalQuantity, 0).toFixed(2)} KG</td>
                <td>{fmtINR(filteredSummaries.reduce((s, x) => s + x.VeenaPusaTotal, 0))}</td>
                <td style={{ color: '#0f4c2e' }}>{fmtINR(filteredSummaries.reduce((s, x) => s + x.MonthTotal, 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {calendarCustomer && (
        <div className="customer-modal-overlay" onClick={() => setCalendarCustomer(null)}>
          <div className="customer-modal" style={{ maxWidth: '760px' }} onClick={e => e.stopPropagation()}>
            <div className="customer-modal-header">
              <h2>📅 {calendarCustomer.CustomerName} — {monthLabel} Calendar</h2>
              <button type="button" onClick={() => setCalendarCustomer(null)}>✕</button>
            </div>
            <DeliveryHistory customer={calendarCustomer} initialYear={year} initialMonth={month} />
          </div>
        </div>
      )}
    </div>
  )
}
