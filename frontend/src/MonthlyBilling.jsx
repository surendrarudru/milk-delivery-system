import { useEffect, useState } from 'react'
import './MonthlyBilling.css'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://milk-delivery-api-bn26.onrender.com')
const TE_MONTHS = ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్']
const TE_DAYS = ['ఆది', 'సోమ', 'మంగళ', 'బుధ', 'గురు', 'శుక్ర', 'శని']

function drawRoundedRect(ctx, x, y, w, h, r, fill, stroke = null) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
  if (fill) { ctx.fillStyle = fill; ctx.fill() }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.3; ctx.stroke() }
}

function loadTemplateImg() {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = '/bill-template.png'
  })
}

export default function MonthlyBilling() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [customers, setCustomers] = useState([])
  const [billsMap, setBillsMap] = useState({})
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [msg, setMsg] = useState('')
  const [preview, setPreview] = useState(null)
  const [customNotes, setCustomNotes] = useState('')

  const teMonthLabel = TE_MONTHS[month - 1] + ' ' + year

  async function loadAllBills() {
    setLoading(true); setMsg('')
    try {
      const cRes = await fetch(API_URL + '/customers')
      const activeCusts = (await cRes.json()).filter(c => c.IsActive)
      setCustomers(activeCusts)
      const entries = await Promise.all(activeCusts.map(async c => {
        try {
          const r = await fetch(API_URL + '/customers/' + c.CustomerID + '/bills')
          if (!r.ok) return [c.CustomerID, null]
          const d = await r.json()
          return [c.CustomerID, (d.Bills || []).find(b => Number(b.BillYear) === year && Number(b.BillMonth) === month) || null]
        } catch { return [c.CustomerID, null] }
      }))
      setBillsMap(Object.fromEntries(entries))
    } catch (e) { setMsg('Load failed: ' + e.message) } finally { setLoading(false) }
  }

  useEffect(() => { loadAllBills() }, [month, year])

  async function generateBill(custId = null) {
    setWorking(true); setMsg('')
    try {
      const targets = custId ? [custId] : customers.filter(c => !billsMap[c.CustomerID]).map(c => c.CustomerID)
      for (const id of targets) {
        const res = await fetch(API_URL + '/billing/generate/' + id + '/' + year + '/' + month, { method: 'POST' })
        if (!res.ok && custId) throw new Error((await res.json()).detail || 'Generate failed')
      }
      await loadAllBills()
      setMsg(custId ? 'Bill generated successfully!' : 'Generated ' + targets.length + ' bills for ' + teMonthLabel + '!')
    } catch (e) { setMsg(e.message) } finally { setWorking(false) }
  }

  async function finalizeBill(billId = null) {
    if (!billId && !window.confirm(teMonthLabel + ' అన్ని బిల్లులను Finalize చేయాలా?')) return
    setWorking(true); setMsg('')
    try {
      const targets = billId ? [billId] : Object.values(billsMap).filter(b => b && b.BillStatus === 'Generated').map(b => b.BillID)
      for (const id of targets) {
        const res = await fetch(API_URL + '/billing/finalize/' + id, { method: 'PUT' })
        if (!res.ok && billId) throw new Error('Finalize failed (ensure all month sessions are completed)')
      }
      await loadAllBills()
      setMsg(billId ? 'Bill finalized!' : 'Finalized ' + targets.length + ' bills!')
    } catch (e) { setMsg(e.message) } finally { setWorking(false) }
  }
  async function buildBillCanvas(cust, bill, noteText = '') {
    const [bRes, cRes, tpl] = await Promise.all([
      fetch(API_URL + '/billing/bill/' + bill.BillID),
      fetch(API_URL + '/customers/' + cust.CustomerID + '/delivery-calendar/' + year + '/' + month),
      loadTemplateImg()
    ])
    const full = bRes.ok ? await bRes.json() : bill
    const cal = cRes.ok ? await cRes.json() : { Days: [] }
    const daysList = Array.isArray(cal.Days) ? cal.Days : []

    const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 1350
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fbf5e6'; ctx.fillRect(0, 0, 1000, 1350)
    if (tpl) ctx.drawImage(tpl, 0, 0, 1000, 1350)

    drawRoundedRect(ctx, 140, 305, 720, 60, 30, '#1b4d24')
    ctx.fillStyle = '#fff'; ctx.font = '700 29px "Noto Sans Telugu", sans-serif'; ctx.textAlign = 'center'
    ctx.fillText('📅  నెలవారీ పాల సరఫరా నివేదిక', 500, 345)

    const totalDays = new Date(year, month, 0).getDate()
    const pillsY = 379
    drawRoundedRect(ctx, 36, pillsY, 372, 46, 12, 'rgba(255,253,247,0.88)', '#9ca3af')
    ctx.fillStyle = '#1f2937'; ctx.font = '700 18px "Noto Sans Telugu", sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('కస్టమర్ : ' + cust.CustomerName + ' గారు', 50, pillsY + 29)
    drawRoundedRect(ctx, 420, pillsY, 242, 46, 12, 'rgba(255,253,247,0.88)', '#9ca3af')
    ctx.textAlign = 'center'; ctx.fillText('నెల : ' + teMonthLabel, 541, pillsY + 29)
    drawRoundedRect(ctx, 674, pillsY, 290, 46, 12, 'rgba(255,253,247,0.88)', '#9ca3af')
    ctx.fillText('తేదీ : ' + String(totalDays).padStart(2, '0') + '-' + teMonthLabel, 819, pillsY + 29)

    const gridTop = 437, colW = 928 / 7, firstDay = new Date(year, month - 1, 1).getDay()
    const numRows = Math.ceil((firstDay + totalDays) / 7), rowH = numRows === 6 ? 70 : 82
    drawRoundedRect(ctx, 36, gridTop, 928, 44 + numRows * rowH, 12, 'rgba(255,253,247,0.86)', '#9ca3af')
    TE_DAYS.forEach((d, i) => {
      ctx.fillStyle = i === 0 ? '#b91c1c' : '#144522'; ctx.fillRect(36 + i * colW, gridTop, colW, 44)
      ctx.fillStyle = '#fff'; ctx.font = '700 19px "Noto Sans Telugu", sans-serif'; ctx.fillText(d, 36 + i * colW + colW / 2, gridTop + 29)
    })

    for (let day = 1; day <= totalDays; day++) {
      const slot = firstDay + day - 1, col = slot % 7, row = Math.floor(slot / 7)
      const cx = 36 + col * colW, cy = gridTop + 44 + row * rowH
      const dateStr = year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
      const dayObj = daysList.find(d => d.Date === dateStr)
      const qty = (dayObj?.Morning?.DeliveryStatus === 'Delivered' ? Number(dayObj.Morning.MilkQuantity || 0) : 0) + (dayObj?.Evening?.DeliveryStatus === 'Delivered' ? Number(dayObj.Evening.MilkQuantity || 0) : 0)
      ctx.fillStyle = col === 0 ? '#b91c1c' : '#111827'; ctx.font = '700 20px sans-serif'; ctx.fillText(String(day), cx + colW / 2, cy + 27)
      if (qty > 0) {
        drawRoundedRect(ctx, cx + 13, cy + rowH - 36, colW - 26, 27, 14, 'rgba(220,252,231,0.95)')
        ctx.fillStyle = '#14532d'; ctx.font = '700 16px "Noto Sans Telugu", sans-serif'; ctx.fillText(Number(qty.toFixed(2)) + ' లీ', cx + colW / 2, cy + rowH - 17)
      } else if (dayObj?.Color === 'Red') {
        drawRoundedRect(ctx, cx + 13, cy + rowH - 36, colW - 26, 27, 14, 'rgba(254,226,226,0.95)')
        ctx.fillStyle = '#b91c1c'; ctx.font = '700 16px "Noto Sans Telugu", sans-serif'; ctx.fillText('లేవు', cx + colW / 2, cy + rowH - 17)
      }
    }

    const milkItem = (full.Items || []).find(i => i.ItemType === 'Milk')
    const milkRate = Number(milkItem?.Rate || cust.MilkRate || 100)
    const milkQty = Number(milkItem?.TotalQuantity || (milkRate > 0 ? Number(full.MilkTotal || 0) / milkRate : 0))
    const totalDue = Number(full.TotalAmountDue || 0)
    const cardsY = gridTop + 44 + numRows * rowH + 16, cardW = (928 - 32) / 3
    ;[['🥛 మొత్తం పాలు', Number(milkQty.toFixed(2)) + ' లీటర్లు', '#144522'], ['లీటరు ధర', '₹ ' + milkRate.toFixed(2), '#144522'], ['చెల్లించవలసిన మొత్తం', '₹ ' + totalDue.toFixed(2), '#b45309']].forEach(([lbl, val, col], idx) => {
      const x = 36 + idx * (cardW + 16)
      drawRoundedRect(ctx, x, cardsY, cardW, 88, 14, 'rgba(255,253,247,0.90)', '#6b7280')
      ctx.fillStyle = '#1f2937'; ctx.font = '700 17px "Noto Sans Telugu", sans-serif'; ctx.fillText(lbl, x + cardW / 2, cardsY + 30)
      ctx.fillStyle = col; ctx.font = '800 24px "Noto Sans Telugu", sans-serif'; ctx.fillText(val, x + cardW / 2, cardsY + 67)
    })

    const prevTotal = Math.max(0, Number(full.PreviousOpeningBalance || 0)) + Math.max(0, Number(full.PreviousMilkBalance || 0)) + Math.max(0, Number(full.PreviousVeenaPusaBalance || 0))
    const extras = []
    if (Number(full.VeenaPusaTotal || 0) > 0) extras.push('వెన్నపూస: ₹ ' + Number(full.VeenaPusaTotal).toFixed(2))
    if (prevTotal > 0) extras.push('పాత బకాయి: ₹ ' + prevTotal.toFixed(2))
    if (noteText.trim()) extras.push(noteText.trim())
    const notesY = cardsY + 102
    drawRoundedRect(ctx, 36, notesY, 928, 54, 12, 'rgba(255,253,247,0.90)', '#6b7280')
    ctx.fillStyle = '#1f2937'; ctx.font = '700 17px "Noto Sans Telugu", sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('గమనిక : ' + (extras.length ? extras.join(' | ') : 'ధన్యవాదాలు! సకాలంలో చెల్లించగలరు.'), 54, notesY + 34)

    return { canvas, dataUrl: canvas.toDataURL('image/png'), full, milkQty, milkRate, prevTotal, totalDue }
  }

  async function openPreview(cust, bill) {
    setWorking(true)
    try { setCustomNotes(''); setPreview({ cust, bill, ...(await buildBillCanvas(cust, bill, '')) }) } finally { setWorking(false) }
  }

  async function downloadAndShare(cust, bill, openWa = true, existing = null) {
    const p = existing || (await buildBillCanvas(cust, bill, customNotes))
    const link = document.createElement('a'); link.download = cust.CustomerName + '_' + teMonthLabel + '.png'; link.href = p.dataUrl; link.click()
    try {
      const blob = await new Promise(r => p.canvas.toBlob(r, 'image/png'))
      if (blob && navigator.clipboard?.write) await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    } catch {}
    if (!openWa) return setMsg('Bill PNG downloaded & copied!')

    const clean = String(cust.MobileNumber || '').replace(/\D/g, '')
    if (clean.length < 10) return setMsg('Invalid customer mobile number.')
    const vpLine = Number(p.full.VeenaPusaTotal || 0) > 0 ? '\n🧈 వెన్నపూస విలువ: ₹' + Number(p.full.VeenaPusaTotal).toFixed(2) : ''
    const text = 'నమస్తే *' + cust.CustomerName + '* గారు 🙏\nమీ *' + teMonthLabel + '* నెలవారీ పాల బిల్లు వివరాలు:\n\n🥛 మొత్తం పాలు: *' + Number(p.milkQty.toFixed(2)) + ' లీటర్లు*\n💰 లీటరు ధర: ₹' + p.milkRate.toFixed(2) + '\n🧾 ' + teMonthLabel + ' పాల విలువ: ₹' + Number(p.full.MilkTotal || 0).toFixed(2) + vpLine + '\n📌 పాత బకాయి: ₹' + p.prevTotal.toFixed(2) + '\n\n💵 *చెల్లించవలసిన మొత్తం: ₹' + p.totalDue.toFixed(2) + '*\nధన్యవాదాలు!'
    window.location.href = 'whatsapp://send?phone=91' + clean.slice(-10) + '&text=' + encodeURIComponent(text)
  }
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px', background: '#fff', padding: '16px 20px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
        <div>
          <h2 style={{ margin: 0 }}>Customer-wise Monthly Bills — {teMonthLabel}</h2>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>Preview Telugu bill card, add notes, download PNG, or share on WhatsApp</p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 600 }}>
            {TE_MONTHS.map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>

          <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 600 }}>
            {[2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <button type="button" onClick={() => generateBill(null)} disabled={working} style={{ padding: '10px 16px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
            ⚡ Generate All Bills
          </button>

          <button type="button" onClick={() => finalizeBill(null)} disabled={working} style={{ padding: '10px 16px', background: '#1e3a8a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
            🔒 Finalize All Bills
          </button>
        </div>
      </div>

      {msg && (
        <div style={{ padding: '12px 16px', background: '#dcfce7', color: '#15803d', borderRadius: '10px', marginBottom: '14px', fontWeight: 600 }}>
          {msg}
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '12px' }}>Customer</th>
              <th style={{ padding: '12px' }}>Milk Amt</th>
              <th style={{ padding: '12px' }}>Veena Pusa</th>
              <th style={{ padding: '12px' }}>Total Due</th>
              <th style={{ padding: '12px' }}>Status</th>
              <th style={{ padding: '12px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan="6" style={{ padding: '20px', textAlign: 'center' }}>Loading bills...</td>
              </tr>
            ) : (
              customers.map(c => {
                const b = billsMap[c.CustomerID]
                const isFinal = b?.BillStatus === 'Finalized'
                return (
                  <tr key={c.CustomerID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px' }}>
                      <strong>{c.CustomerName}</strong>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>{c.CustomerCode}</div>
                    </td>
                    <td style={{ padding: '12px' }}>₹{Number(b?.MilkTotal ?? 0).toFixed(2)}</td>
                    <td style={{ padding: '12px' }}>₹{Number(b?.VeenaPusaTotal ?? 0).toFixed(2)}</td>
                    <td style={{ padding: '12px', fontWeight: 700, color: '#0f4c2e' }}>₹{Number(b?.TotalAmountDue ?? 0).toFixed(2)}</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{ padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, background: isFinal ? '#dcfce7' : b ? '#fef3c7' : '#f1f5f9', color: isFinal ? '#15803d' : b ? '#b45309' : '#64748b' }}>
                        {b ? b.BillStatus : 'Not Generated'}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {!b && (
                          <button type="button" onClick={() => generateBill(c.CustomerID)} disabled={working} style={{ padding: '6px 10px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                            Generate
                          </button>
                        )}
                        {b && !isFinal && (
                          <button type="button" onClick={() => finalizeBill(b.BillID)} disabled={working} style={{ padding: '6px 10px', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                            Finalize
                          </button>
                        )}
                        {b && (
                          <>
                            <button type="button" onClick={() => openPreview(c, b)} style={{ padding: '6px 10px', background: '#475569', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                              🖼️ Telugu Bill Preview
                            </button>
                            <button type="button" onClick={() => downloadAndShare(c, b)} style={{ padding: '6px 10px', background: '#15803d', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                              💬 WhatsApp
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {preview && (
        <div className="customer-modal-overlay" onClick={() => setPreview(null)}>
          <div className="customer-modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="customer-modal-header">
              <h2>{preview.cust.CustomerName} — {teMonthLabel} బిల్లు ప్రివ్యూ</h2>
              <button type="button" onClick={() => setPreview(null)}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <input type="text" value={customNotes} onChange={e => setCustomNotes(e.target.value)} placeholder="గమనిక (Notes) తెలుగులో లేదా ఇంగ్లీష్‌లో రాయండి..." style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
              <button type="button" onClick={async () => setPreview({ ...preview, ...(await buildBillCanvas(preview.cust, preview.bill, customNotes)) })} style={{ padding: '8px 14px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
                Update Note
              </button>
            </div>
            <img src={preview.dataUrl} alt="Telugu Bill" style={{ width: '100%', borderRadius: '10px', border: '1px solid #cbd5e1', marginBottom: '12px' }} />
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => downloadAndShare(preview.cust, preview.bill, false, preview)} style={{ padding: '10px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
                📥 Download PNG & Copy
              </button>
              <button type="button" onClick={() => downloadAndShare(preview.cust, preview.bill, true, preview)} style={{ padding: '10px 16px', background: '#15803d', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>
                💬 Copy Image & Send WhatsApp
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
