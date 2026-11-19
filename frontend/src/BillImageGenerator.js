const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.'); const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://onrender.com');

const TELUGU_MONTHS = [
  'జనవరి',
  'ఫిబ్రవరి',
  'మార్చి',
  'ఏప్రిల్',
  'మే',
  'జూన్',
  'జూలై',
  'ఆగస్టు',
  'సెప్టెంబర్',
  'అక్టోబర్',
  'నవంబర్',
  'డిసెంబర్'
]

const TELUGU_WEEKDAYS = ['ఆది', 'సోమ', 'మంగళ', 'బుధ', 'గురు', 'శుక్ర', 'శని']

function drawRoundedRect(ctx, x, y, width, height, radius, fillColor, strokeColor = null, lineWidth = 1.5) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
  if (fillColor) {
    ctx.fillStyle = fillColor
    ctx.fill()
  }
  if (strokeColor) {
    ctx.strokeStyle = strokeColor
    ctx.lineWidth = lineWidth
    ctx.stroke()
  }
}

function loadTemplateImage() {
  const base = (import.meta && import.meta.env && import.meta.env.BASE_URL) || '/'
  const cleanBase = base.endsWith('/') ? base : `${base}/`
  const candidates = [`${cleanBase}bill-template.png`, '/bill-template.png', './bill-template.png']

  return new Promise(resolve => {
    let idx = 0
    function tryNext() {
      if (idx >= candidates.length) {
        resolve(null)
        return
      }
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => {
        idx += 1
        tryNext()
      }
      img.src = candidates[idx]
    }
    tryNext()
  })
}

function formatINR(value) {
  return `₹ ${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

export async function createTeluguMonthlyReportPreview({
  customerId,
  customerName,
  year,
  month,
  milkRate = 100,
  milkQuantity = 0,
  milkAmount = 0,
  veenaPusaQuantity = 0,
  veenaPusaAmount = 0,
  previousOpeningBalance = 0,
  previousMilkBalance = 0,
  previousVeenaPusaBalance = 0,
  totalAmountDue = 0,
  customNotes = ''
}) {
  const response = await fetch(
    `${API_URL}/customers/${customerId}/delivery-calendar/${year}/${month}`
  )

  if (!response.ok) {
    throw new Error('Daily delivery calendar data load failed')
  }

  const calendarData = await response.json()
  const daysList = Array.isArray(calendarData.Days) ? calendarData.Days : []

  const templateImg = await loadTemplateImage()

  const width = 1000
  const height = 1350
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  // Layer 1: Clean Full Background Image (No Crop, No Blur, No Erase)
  ctx.fillStyle = '#fbf5e6'
  ctx.fillRect(0, 0, width, height)

  if (templateImg) {
    ctx.drawImage(templateImg, 0, 0, width, height)
  }

  // Layer 2: Title Banner placed below cowshed & milk pots
  const bannerY = 305
  drawRoundedRect(ctx, 140, bannerY, 720, 60, 30, '#1b4d24')
  ctx.fillStyle = '#ffffff'
  ctx.font = '700 29px "Noto Sans Telugu", "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('📅  నెలవారీ పాల సరఫరా నివేదిక', width / 2, bannerY + 40)

  // Layer 3: Customer, Month & Auto Month-End Date Transparent Pills
  const pillsY = bannerY + 74
  const totalDays = new Date(year, month, 0).getDate()
  const monthTelugu = `${TELUGU_MONTHS[month - 1]} ${year}`
  const reportDateTelugu = `${String(totalDays).padStart(2, '0')}-${TELUGU_MONTHS[month - 1]}-${year}`

  drawRoundedRect(ctx, 36, pillsY, 372, 46, 12, 'rgba(255, 253, 247, 0.88)', '#9ca3af', 1.2)
  ctx.fillStyle = '#1f2937'
  ctx.font = '700 18px "Noto Sans Telugu", "Segoe UI", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`కస్టమర్ : ${customerName || '-'} గారు`, 50, pillsY + 29)

  drawRoundedRect(ctx, 420, pillsY, 242, 46, 12, 'rgba(255, 253, 247, 0.88)', '#9ca3af', 1.2)
  ctx.fillStyle = '#1f2937'
  ctx.font = '700 18px "Noto Sans Telugu", "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`నెల : ${monthTelugu}`, 541, pillsY + 29)

  drawRoundedRect(ctx, 674, pillsY, 290, 46, 12, 'rgba(255, 253, 247, 0.88)', '#9ca3af', 1.2)
  ctx.fillStyle = '#1f2937'
  ctx.font = '700 17px "Noto Sans Telugu", "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`తేదీ : ${reportDateTelugu}`, 819, pillsY + 29)

  // Layer 4: Semi-Transparent Calendar Grid
  const gridLeft = 36
  const gridTop = pillsY + 58
  const gridWidth = width - 72
  const colWidth = gridWidth / 7
  const headerH = 44

  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const numRows = Math.ceil((firstWeekday + totalDays) / 7)
  const rowH = numRows === 6 ? 70 : 82
  const gridBodyH = numRows * rowH

  drawRoundedRect(ctx, gridLeft, gridTop, gridWidth, headerH + gridBodyH, 12, 'rgba(255, 253, 247, 0.86)', '#9ca3af', 1.4)

  TELUGU_WEEKDAYS.forEach((dayName, idx) => {
    const hx = gridLeft + idx * colWidth
    ctx.fillStyle = idx === 0 ? '#b91c1c' : '#144522'
    if (idx === 0) {
      drawRoundedRect(ctx, hx, gridTop, colWidth, headerH, 10, '#b91c1c')
      ctx.fillRect(hx + colWidth - 12, gridTop, 12, headerH)
      ctx.fillRect(hx, gridTop + headerH - 12, colWidth, 12)
    } else if (idx === 6) {
      drawRoundedRect(ctx, hx, gridTop, colWidth, headerH, 10, '#144522')
      ctx.fillRect(hx, gridTop, 12, headerH)
      ctx.fillRect(hx, gridTop + headerH - 12, colWidth, 12)
    } else {
      ctx.fillRect(hx, gridTop, colWidth, headerH)
    }

    ctx.fillStyle = '#ffffff'
    ctx.font = '700 19px "Noto Sans Telugu", "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(dayName, hx + colWidth / 2, gridTop + 29)
  })

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.65)'
  ctx.lineWidth = 1.2
  for (let c = 1; c < 7; c++) {
    const lx = gridLeft + c * colWidth
    ctx.beginPath()
    ctx.moveTo(lx, gridTop)
    ctx.lineTo(lx, gridTop + headerH + gridBodyH)
    ctx.stroke()
  }
  for (let r = 1; r <= numRows; r++) {
    const ly = gridTop + headerH + r * rowH
    if (r < numRows) {
      ctx.beginPath()
      ctx.moveTo(gridLeft, ly)
      ctx.lineTo(gridLeft + gridWidth, ly)
      ctx.stroke()
    }
  }

  let calcMilkQty = 0
  for (let day = 1; day <= totalDays; day++) {
    const slot = firstWeekday + (day - 1)
    const row = Math.floor(slot / 7)
    const col = slot % 7

    const cx = gridLeft + col * colWidth
    const cy = gridTop + headerH + row * rowH

    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayObj = daysList.find(d => d.Date === dateStr)

    const mQty =
      dayObj?.Morning?.DeliveryStatus === 'Delivered'
        ? Number(dayObj.Morning.MilkQuantity || 0)
        : 0
    const eQty =
      dayObj?.Evening?.DeliveryStatus === 'Delivered'
        ? Number(dayObj.Evening.MilkQuantity || 0)
        : 0
    const totalDayQty = mQty + eQty

    ctx.fillStyle = col === 0 ? '#b91c1c' : '#111827'
    ctx.font = '700 20px "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(String(day), cx + colWidth / 2, cy + 27)

    const pillW = colWidth - 26
    const pillH = 27
    const pillX = cx + 13
    const pillY = cy + rowH - 36

    if (totalDayQty > 0) {
      calcMilkQty += totalDayQty
      drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 14, 'rgba(220, 252, 231, 0.95)')
      ctx.fillStyle = '#14532d'
      ctx.font = '700 16px "Noto Sans Telugu", "Segoe UI", sans-serif'
      ctx.fillText(`${Number(totalDayQty.toFixed(2))} లీ`, cx + colWidth / 2, pillY + 19)
    } else if (dayObj?.Color === 'Red' || (dayObj && dayObj.Color !== 'Grey')) {
      drawRoundedRect(ctx, pillX, pillY, pillW, pillH, 14, 'rgba(254, 226, 226, 0.95)')
      ctx.fillStyle = '#b91c1c'
      ctx.font = '700 16px "Noto Sans Telugu", "Segoe UI", sans-serif'
      ctx.fillText('లేవు', cx + colWidth / 2, pillY + 19)
    }
  }

  // Layer 5: Transparent Summary 3 Cards Section (Above bottom grazing cow)
  const finalQty = Number(milkQuantity) > 0 ? Number(milkQuantity) : calcMilkQty
  const finalMilkAmt =
    Number(milkAmount) > 0 ? Number(milkAmount) : finalQty * Number(milkRate || 100)
  const finalTotalDue =
    Number(totalAmountDue) > 0
      ? Number(totalAmountDue)
      : finalMilkAmt + Number(veenaPusaAmount || 0)

  const cardsY = gridTop + headerH + gridBodyH + 16
  const cardGap = 16
  const cardW = (gridWidth - cardGap * 2) / 3
  const cardH = 88

  drawRoundedRect(ctx, gridLeft, cardsY, cardW, cardH, 14, 'rgba(255, 253, 247, 0.90)', '#6b7280', 1.3)
  ctx.fillStyle = '#1f2937'
  ctx.font = '700 17px "Noto Sans Telugu", "Segoe UI", sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('🥛 మొత్తం పాలు', gridLeft + cardW / 2, cardsY + 30)
  ctx.fillStyle = '#144522'
  ctx.font = '800 24px "Noto Sans Telugu", "Segoe UI", sans-serif'
  ctx.fillText(`${finalQty} లీటర్లు`, gridLeft + cardW / 2, cardsY + 67)

  const c2X = gridLeft + cardW + cardGap
  drawRoundedRect(ctx, c2X, cardsY, cardW, cardH, 14, 'rgba(255, 253, 247, 0.90)', '#6b7280', 1.3)
  ctx.fillStyle = '#1f2937'
  ctx.font = '700 17px "Noto Sans Telugu", "Segoe UI", sans-serif'
  ctx.fillText('లీటరు ధర', c2X + cardW / 2, cardsY + 30)
  ctx.fillStyle = '#144522'
  ctx.font = '800 24px "Segoe UI", sans-serif'
  ctx.fillText(formatINR(milkRate), c2X + cardW / 2, cardsY + 67)

  const c3X = gridLeft + (cardW + cardGap) * 2
  drawRoundedRect(ctx, c3X, cardsY, cardW, cardH, 14, 'rgba(255, 253, 247, 0.90)', '#6b7280', 1.3)
  ctx.fillStyle = '#1f2937'
  ctx.font = '700 17px "Noto Sans Telugu", "Segoe UI", sans-serif'
  ctx.fillText('చెల్లించవలసిన మొత్తం', c3X + cardW / 2, cardsY + 30)
  ctx.fillStyle = '#b45309'
  ctx.font = '800 24px "Segoe UI", sans-serif'
  ctx.fillText(formatINR(finalTotalDue), c3X + cardW / 2, cardsY + 67)

  // Layer 6: Transparent Notes Pill
  const notesY = cardsY + cardH + 14
  drawRoundedRect(ctx, gridLeft, notesY, gridWidth, 54, 12, 'rgba(255, 253, 247, 0.90)', '#6b7280', 1.3)

  const autoExtras = []
  if (Number(veenaPusaQuantity) > 0) {
    autoExtras.push(`వెన్నపూస: ${veenaPusaQuantity} KG (${formatINR(veenaPusaAmount)})`)
  }
  const prevTotal =
    Math.max(0, Number(previousOpeningBalance || 0)) +
    Math.max(0, Number(previousMilkBalance || 0)) +
    Math.max(0, Number(previousVeenaPusaBalance || 0))
  if (prevTotal > 0) {
    autoExtras.push(`పాత బకాయి: ${formatINR(prevTotal)}`)
  }
  if (customNotes && customNotes.trim()) {
    autoExtras.push(customNotes.trim())
  }

  const finalNoteLine =
    autoExtras.length > 0 ? autoExtras.join(' | ') : 'ధన్యవాదాలు! సకాలంలో చెల్లించగలరు.'

  ctx.fillStyle = '#1f2937'
  ctx.font = '700 17px "Noto Sans Telugu", "Segoe UI", sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`గమనిక : ${finalNoteLine}`, gridLeft + 18, notesY + 34)

  return {
    canvas,
    dataUrl: canvas.toDataURL('image/png'),
    fileName: `${(customerName || 'Customer').replace(/[^a-zA-Z0-9_-]/g, '_')}_${year}_${String(month).padStart(2, '0')}_Telugu_Bill.png`
  }
}

export async function downloadAndCopyCanvasImage(canvas, fileName) {
  const dataUrl = canvas.toDataURL('image/png')
  const link = document.createElement('a')
  link.download = fileName
  link.href = dataUrl
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  try {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (blob && navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
    }
  } catch {
    // Clipboard fallback
  }
}
