const TELUGU_MONTHS = ['', 'జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్']
const WEEK_DAYS = ['ఆది', 'సోమ', 'మంగళ', 'బుధ', 'గురు', 'శుక్ర', 'శని']

const esc = str => String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const fmtNum = (val, d = 2) => { const n = Number(val || 0); return Number.isInteger(n) && d === 0 ? String(n) : n.toFixed(d) }

export function buildTeluguBillHTML({ customer, year, month, days, bill }) {
  const monthName = `${TELUGU_MONTHS[month] || ''} ${year}`
  const lastDay = new Date(year, month, 0).getDate()
  const reportDate = `${String(lastDay).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`
  const firstWeekday = new Date(year, month - 1, 1).getDay()

  const dayMap = {}
  let totalMilkQty = 0, totalVpAmount = 0

  ;(days || []).forEach(d => {
    const dayNum = Number(String(d.Date).split('-'))
    const mQty = d.Morning?.DeliveryStatus === 'Delivered' ? Number(d.Morning.MilkQuantity || 0) : 0
    const eQty = d.Evening?.DeliveryStatus === 'Delivered' ? Number(d.Evening.MilkQuantity || 0) : 0
    const mVp = d.Morning?.DeliveryStatus === 'Delivered' ? Number(d.Morning.VeenaPusaAmount || 0) : 0
    const eVp = d.Evening?.DeliveryStatus === 'Delivered' ? Number(d.Evening.VeenaPusaAmount || 0) : 0
    const dayMilk = mQty + eQty
    totalMilkQty += dayMilk
    totalVpAmount += mVp + eVp
    dayMap[dayNum] = { dayMilk, hasRecord: Boolean(d.Morning?.DeliveryDetailID || d.Evening?.DeliveryDetailID), color: d.Color }
  })

  const milkRate = Number(customer.MilkRate || 0)
  const currentBillAmt = bill ? Number(bill.MilkTotal || 0) + Number(bill.VeenaPusaTotal || 0) : totalMilkQty * milkRate + totalVpAmount
  const prevDue = bill ? Math.max(0, Number(bill.PreviousOpeningBalance || 0)) + Math.max(0, Number(bill.PreviousMilkBalance || 0)) + Math.max(0, Number(bill.PreviousVeenaPusaBalance || 0)) : 0
  const grandTotal = bill ? Number(bill.TotalAmountDue || currentBillAmt) : currentBillAmt + prevDue

  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(`<div class="cal-box empty"></div>`)
  for (let d = 1; d <= lastDay; d++) {
    const info = dayMap[d]
    const isSun = (firstWeekday + d - 1) % 7 === 0
    let cls = 'cal-box neutral', st = `<span class="st-empty">-</span>`
    if (info && info.dayMilk > 0) {
      cls = 'cal-box delivered'
      st = `<span class="st-ok">${Number.isInteger(info.dayMilk) ? info.dayMilk : info.dayMilk.toFixed(1)} లీ</span>`
    } else if (info && (info.hasRecord || info.color === 'Red')) {
      cls = 'cal-box missed'
      st = `<span class="st-no">లేవు</span>`
    }
    cells.push(`<div class="${cls}"><span class="dt-num ${isSun ? 'sun' : ''}">${d}</span>${st}</div>`)
  }
  while (cells.length % 7 !== 0) cells.push(`<div class="cal-box empty"></div>`)

  const displayName = (customer.ReferenceName || '').trim() || customer.CustomerName
  return `
    <div id="telugu-bill-sheet" style="width:520px;background:#fff;font-family:'Noto Sans Telugu','Segoe UI',sans-serif;color:#0f172a;border-radius:16px;overflow:hidden;border:2px solid #0f4c2e;box-shadow:0 12px 30px rgba(0,0,0,0.18);">
      <style>
        #telugu-bill-sheet * { box-sizing: border-box; }
        .top-hero { position:relative; height:145px; background:linear-gradient(135deg,#064e3b 0%,#15803d 55%,#0f766e 100%); display:flex; flex-direction:column; justify-content:flex-end; padding:14px 18px; }
        .hero-bg { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:0.42; }
        .title-pill { position:relative; z-index:2; background:rgba(255,255,255,0.96); border:2px solid #0f4c2e; border-radius:10px; padding:8px 14px; text-align:center; font-size:16px; font-weight:900; color:#064e3b; }
        .meta-bar { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; padding:10px 16px; background:#f0fdf4; border-bottom:1.5px solid #bbf7d0; font-size:12.5px; font-weight:800; color:#14532d; }
        .cust-badge { background:#0f4c2e; color:#fff; padding:2px 8px; border-radius:6px; font-size:11px; margin-left:6px; }
        .cal-wrap { padding:12px 14px; background:#fff; }
        .week-hdr { display:grid; grid-template-columns:repeat(7,1fr); gap:5px; margin-bottom:6px; }
        .week-hdr div { background:#0f4c2e; color:#fff; text-align:center; padding:6px 2px; border-radius:7px; font-size:12.5px; font-weight:800; }
        .week-hdr div:first-child { background:#991b1b; }
        .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:5px; }
        .cal-box { min-height:52px; border-radius:9px; border:2px solid #cbd5e1; padding:4px 3px; display:flex; flex-direction:column; align-items:center; justify-content:space-between; background:#fff; }
        .cal-box.delivered { background:#f0fdf4; border-color:#4ade80; }
        .cal-box.missed { background:#fef2f2; border-color:#f87171; }
        .cal-box.neutral { background:#f8fafc; border-color:#cbd5e1; }
        .cal-box.empty { background:#f1f5f9; border:1.5px dashed #cbd5e1; }
        .dt-num { font-size:16.5px; font-weight:900; color:#0f172a; line-height:1.1; }
        .dt-num.sun { color:#b91c1c; }
        .st-ok { font-size:11.5px; font-weight:900; color:#15803d; background:#dcfce7; padding:1px 6px; border-radius:5px; }
        .st-no { font-size:11px; font-weight:900; color:#dc2626; background:#fee2e2; padding:1px 6px; border-radius:5px; }
        .st-empty { font-size:11px; font-weight:700; color:#94a3b8; }
        .sum-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:7px; padding:4px 14px 12px; }
        .sum-card { border:1.6px solid #cbd5e1; border-radius:10px; padding:8px 6px; text-align:center; background:#f8fafc; }
        .sum-card.highlight { background:#fffbeb; border-color:#f59e0b; }
        .sum-lbl { font-size:10.5px; font-weight:800; color:#475569; margin-bottom:3px; }
        .sum-val { font-size:14.5px; font-weight:900; color:#0f172a; }
        .sum-card.highlight .sum-val { color:#b45309; font-size:16px; }
        .footer-note { margin:0 14px 12px; padding:8px 12px; background:#f0fdf4; border:1.5px solid #86efac; border-radius:9px; font-size:11.5px; font-weight:800; color:#14532d; text-align:center; }
        .bottom-strip { height:34px; background:linear-gradient(90deg,#15803d 0%,#0f4c2e 100%); display:flex; align-items:center; justify-content:center; color:#ecfdf5; font-size:11.5px; font-weight:800; }
              .cal-grid { display: grid !important; grid-template-columns: repeat(7, 1fr) !important; gap: 4px !important; padding: 6px !important; background: #f8fafc !important; border: 1.5px solid #94a3b8 !important; border-radius: 8px !important; }
        .cal-grid > div, .cal-cell, .day-cell, .cal-box {
          border: 1.6px solid #94a3b8 !important;
          border-radius: 7px !important;
          background: #ffffff !important;
          padding: 4px 2px !important;
          min-height: 48px !important;
          box-shadow: 0 1px 2px rgba(15,23,42,0.06) !important;
        }
        .cal-grid > div span:first-child, .day-num, .dt-num {
          font-size: 15.5px !important;
          font-weight: 900 !important;
          color: #0f172a !important;
        }
      </style>
      <div class="top-hero">
        <img class="hero-bg" src="/farm-header.jpg" alt="" onerror="this.style.display='none'" />
        <div class="title-pill">🥛 ${esc(monthName)} — నెలవారీ పాల సరఫరా నివేదిక</div>
      </div>
      <div class="meta-bar">
        <div>కస్టమర్: <span style="font-size:14.5px;font-weight:900;color:#0f172a;">${esc(displayName)} గారు</span> <span class="cust-badge">${esc(customer.CustomerCode)}</span></div>
        <div>తేదీ: ${esc(reportDate)}</div>
      </div>
      <div class="cal-wrap">
        <div class="week-hdr">${WEEK_DAYS.map(w => `<div>${w}</div>`).join('')}</div>
        <div class="cal-grid">${cells.join('')}</div>
      </div>
      <div class="sum-grid">
        <div class="sum-card"><div class="sum-lbl">మొత్తం పాలు</div><div class="sum-val">${fmtNum(totalMilkQty, 1)} లీ</div></div>
        <div class="sum-card"><div class="sum-lbl">ఈ నెల బిల్లు</div><div class="sum-val">₹${fmtNum(currentBillAmt, 0)}</div></div>
        <div class="sum-card"><div class="sum-lbl">పాత బకాయి</div><div class="sum-val">₹${fmtNum(prevDue, 0)}</div></div>
        <div class="sum-card highlight"><div class="sum-lbl">మొత్తం బకాయి</div><div class="sum-val">₹${fmtNum(grandTotal, 0)}</div></div>
      </div>
      <div class="footer-note">గమనిక : ధన్యవాదాలు సకాలంలో చెల్లించగలరు. (లీటర్ ధర: ₹${fmtNum(milkRate, 0)})</div>
      <div class="bottom-strip">🐄 స్వచ్ఛమైన పాలు • నమ్మకమైన సేవ</div>
    </div>
  `
}