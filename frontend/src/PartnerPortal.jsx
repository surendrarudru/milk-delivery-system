import { useEffect, useState } from 'react'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://' + 'milk-delivery-api-bn26' + '.onrender.com')

const getTodayISO = () => new Date().toLocaleDateString('en-CA')
const getYesterdayISO = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toLocaleDateString('en-CA')
}

export default function PartnerPortal() {
  const [selectedDate, setSelectedDate] = useState(getTodayISO())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('todayPayments')
  const [search, setSearch] = useState('')
  const [listening, setListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [spokenQuestion, setSpokenQuestion] = useState('')
  const [voiceReply, setVoiceReply] = useState('నమస్తే! తేదీ ఎంచుకుని ఆకుపచ్చ బటన్ నొక్కితే ఉదయం పాలు, సాయంత్రం పాలు, పేమెంట్లు, అప్‌డేట్స్ మరియు బకాయిల వివరాలు వినిపిస్తాయి.')

  async function loadPartnerData(targetDate = selectedDate) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/partner/dashboard?today_str=${targetDate}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'రిపోర్ట్ లోడ్ కాలేదు')
      }
      setData(await res.json())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPartnerData(selectedDate)
  }, [selectedDate])

  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
    }
  }, [])

  function stopVoice() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    if (window._mmAudioPlayer) {
      window._mmAudioPlayer.pause()
      window._mmAudioPlayer = null
    }
    window._mmAudioStop = true
    setIsSpeaking(false)
  }

  function speakWithBrowserFallback(text) {
    if (!('speechSynthesis' in window)) {
      setIsSpeaking(false)
      return
    }
    const voices = window.speechSynthesis.getVoices()
    const teVoices = voices.filter(v => v.lang.toLowerCase().includes('te'))
    const femaleTeVoice =
      teVoices.find(v => /shruti|google|female|woman|girl|lekha|kalpana/i.test(v.name) && !/mohan|male|man/i.test(v.name)) ||
      teVoices[0]

    const utter = new SpeechSynthesisUtterance(text)
    if (femaleTeVoice) utter.voice = femaleTeVoice
    utter.lang = 'te-IN'
    utter.pitch = 1.4
    utter.rate = 0.96
    utter.onstart = () => setIsSpeaking(true)
    utter.onend = () => setIsSpeaking(false)
    utter.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utter)
  }

  function speakTelugu(text) {
    setVoiceReply(text)
    stopVoice()
    window._mmAudioStop = false

    const chunks = text
      .split(/(?<=[.?!।])\s+/)
      .flatMap(s => (s.length > 165 ? s.match(/.{1,165}(\s|$)/g) || [s] : [s]))
      .map(s => s.trim())
      .filter(Boolean)

    if (!chunks.length) return

    let idx = 0
    setIsSpeaking(true)

    const playNext = () => {
      if (window._mmAudioStop || idx >= chunks.length) {
        setIsSpeaking(false)
        return
      }
      const url = `${API_URL}/tts/telugu?q=${encodeURIComponent(chunks[idx])}`
      const audio = new Audio(url)
      audio.playbackRate = 1.06
      window._mmAudioPlayer = audio
      idx += 1
      audio.onended = playNext
      audio.onerror = () => speakWithBrowserFallback(chunks.slice(idx - 1).join(' '))
      audio.play().catch(() => speakWithBrowserFallback(chunks.slice(idx - 1).join(' ')))
    }

    playNext()
  }
  function describeLogInTelugu(row) {
    const who = row.ActorRole === 'Admin' ? 'అడ్మిన్' : 'సుధీర్'
    const sm = row.ResolvedSummary || row.Summary || ''
    if (row.ModuleName === 'Payments') {
      return `${who} పేమెంట్ నమోదు చేశారు: ${sm.replace('Recorded', '').replace('for', '•')}`
    }
    if (row.ModuleName === 'Daily Delivery') {
      return `${who} డెలివరీ వివరాలు సేవ్ చేశారు`
    }
    if (row.ModuleName === 'Delivery Correction') {
      return `${who} డెలివరీ సవరణ చేశారు`
    }
    if (row.ModuleName === 'Monthly Bills') {
      return `${who} నెలవారీ బిల్లు అప్‌డేట్ చేశారు`
    }
    return `${who} అప్‌డేట్ చేశారు`
  }

  function readCompleteDateBriefing() {
    if (!data) return
    const dateLabel = selectedDate === getTodayISO()
      ? 'ఈరోజు'
      : selectedDate === getYesterdayISO()
        ? 'నిన్న'
        : `${data.DateFormatted || selectedDate} తేదీన`

    const mLiters = Number(data.MorningMilkLiters || 0).toFixed(2)
    const eLiters = Number(data.EveningMilkLiters || 0).toFixed(2)
    const payCount = data.TodayPaymentCount || 0
    const payAmt = Math.round(Number(data.TodayCollectedAmount || 0))
    const todayPays = data.TodayPayments || []
    const dateLogs = data.DateAuditLogs || []
    const dueList = data.DueCustomers || []
    const dueAmt = Math.round(Number(data.TotalDueAmount || 0))

    // 1. Morning & Evening delivered milk litres
    const milkPart = `${dateLabel} ఉదయం ${mLiters} లీటర్ల పాలు, సాయంత్రం ${eLiters} లీటర్ల పాలు డెలివరీ అయ్యాయి.`

    // 2. Payments received on that date
    const payPart = payCount === 0
      ? `${dateLabel} ఎలాంటి పేమెంట్లు రాలేదు.`
      : `${dateLabel} ${payCount} మంది నుండి మొత్తం ${payAmt} రూపాయల పేమెంట్ వచ్చింది. ఇచ్చినవారు: ${todayPays.map(p => `${p.CustomerName} ${Math.round(p.TotalPaid)} రూపాయలు`).join(', ')}.`

    // 3. Updates on that date
    const updatePart = dateLogs.length === 0
      ? `${dateLabel} ఇతర అప్‌డేట్స్ ఏవీ లేవు.`
      : `${dateLabel} మొత్తం ${dateLogs.length} అప్‌డేట్స్ జరిగాయి. ముఖ్యమైనవి: ${dateLogs.slice(0, 4).map(describeLogInTelugu).join('. ')}.`

    // 4. All customers with due amount
    const duePart = dueList.length === 0
      ? 'ప్రస్తుతం ఏ కస్టమర్‌కు బకాయి లేదు.'
      : `మొత్తం ${dueList.length} మంది కస్టమర్లకు కలిపి ${dueAmt} రూపాయల బకాయి ఉంది. బకాయి ఇవ్వవలసిన వారు: ${dueList.map((c, i) => `${i + 1}. ${c.CustomerName} ${Math.round(c.TotalDue)} రూపాయలు`).join(', ')}.`

    speakTelugu(`నమస్తే! ${milkPart} ${payPart} ${updatePart} ${duePart}`)
  }

  function readAllDueNames() {
    const dueList = data?.DueCustomers || []
    setActiveTab('dues')
    if (dueList.length === 0) {
      return speakTelugu('ప్రస్తుతం ఏ కస్టమర్‌కు బకాయి లేదు.')
    }
    const spokenList = dueList
      .map((c, idx) => `${idx + 1}. ${c.CustomerName} — ${Math.round(c.TotalDue)} రూపాయలు`)
      .join('. ')
    speakTelugu(`బకాయి ఉన్న ${dueList.length} మంది పేర్లు: ${spokenList}.`)
  }
  function answerTeluguQuery(rawQuery) {
    if (!data) return
    const q = String(rawQuery || '').toLowerCase().trim()
    setSpokenQuestion(rawQuery)

    const mLiters = Number(data.MorningMilkLiters || 0).toFixed(2)
    const eLiters = Number(data.EveningMilkLiters || 0).toFixed(2)
    const dueCount = data.DueCustomerCount || 0
    const dueAmt = Math.round(Number(data.TotalDueAmount || 0))
    const payCount = data.TodayPaymentCount || 0
    const payAmt = Math.round(Number(data.TodayCollectedAmount || 0))
    const dueList = data.DueCustomers || []
    const todayPays = data.TodayPayments || []
    const dateLogs = data.DateAuditLogs || []

    const matchedCust = dueList.find(c => q.includes((c.CustomerName || '').toLowerCase()))
    if (matchedCust) {
      setActiveTab('dues')
      setSearch(matchedCust.CustomerName)
      return speakTelugu(
        `${matchedCust.CustomerName} గారి ఖాతాలో మొత్తం ${Math.round(matchedCust.TotalDue)} రూపాయల బకాయి ఉంది.`
      )
    }

    if (q.includes('పాలు') || q.includes('లీటర్') || q.includes('ఉదయం') || q.includes('సాయంత్రం') || q.includes('milk')) {
      return speakTelugu(
        `ఎంచుకున్న తేదీన ఉదయం ${mLiters} లీటర్లు, సాయంత్రం ${eLiters} లీటర్ల పాలు డెలివరీ అయ్యాయి.`
      )
    }

    if (q.includes('పేర్లు') || q.includes('చదువు') || q.includes('లిస్ట్') || q.includes('names')) {
      return readAllDueNames()
    }

    if (q.includes('సుధీర్') || q.includes('మార్చారు') || q.includes('అప్‌డేట్') || q.includes('sudheer') || q.includes('update')) {
      setActiveTab('audit')
      if (!dateLogs.length) {
        return speakTelugu('ఈ తేదీన సుధీర్ లేదా అడ్మిన్ చేసిన మార్పులు ఏవీ లేవు.')
      }
      return speakTelugu(
        `ఈ తేదీన ${dateLogs.length} అప్‌డేట్స్ జరిగాయి: ${dateLogs.slice(0, 3).map(describeLogInTelugu).join('. ')}.`
      )
    }

    if (q.includes('పేమెంట్') || q.includes('ఎవరు') || q.includes('ఈరోజు') || q.includes('ఇచ్చారు') || q.includes('payment')) {
      setActiveTab('todayPayments')
      if (payCount === 0) {
        return speakTelugu('ఈ తేదీన ఎలాంటి పేమెంట్ నమోదు కాలేదు.')
      }
      const names = todayPays.map(p => `${p.CustomerName} ${Math.round(p.TotalPaid)} రూపాయలు`).join(', ')
      return speakTelugu(
        `ఈ తేదీన ${payCount} మంది నుండి ${payAmt} రూపాయలు వచ్చాయి. పేర్లు: ${names}.`
      )
    }

    return readCompleteDateBriefing()
  }

  function startTeluguMic() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRec) {
      return speakTelugu('మీ బ్రౌజర్‌లో మైక్ సపోర్ట్ లేదు. కింద ఉన్న పెద్ద ఆకుపచ్చ బటన్ నొక్కండి.')
    }
    const rec = new SpeechRec()
    rec.lang = 'te-IN'
    rec.interimResults = true
    rec.maxAlternatives = 1
    setListening(true)
    setLiveTranscript('')
    let finalText = ''

    rec.onresult = e => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const piece = e.results[i][0]?.transcript || ''
        if (e.results[i].isFinal) {
          finalText += piece
        } else {
          interim += piece
        }
      }
      setLiveTranscript(finalText || interim)
    }

    rec.onerror = () => {
      setListening(false)
      speakTelugu('మాట స్పష్టంగా వినిపించలేదు. మళ్ళీ మైక్ బటన్ నొక్కి అడగండి.')
    }

    rec.onend = () => {
      setListening(false)
      const spoken = (finalText || liveTranscript).trim()
      if (spoken) {
        answerTeluguQuery(spoken)
      }
    }

    rec.start()
  }

  const dueList = (data?.DueCustomers || []).filter(c =>
    !search.trim() || [c.CustomerName, c.CustomerCode].some(v => (v || '').toLowerCase().includes(search.toLowerCase().trim()))
  )
  const todayPays = data?.TodayPayments || []
  const dateAuditLogs = data?.DateAuditLogs || []

  function formatAuditSummaryTelugu(summary) {
    if (!summary) return '-'
    return summary
      .replace('Recorded', 'నమోదు చేసిన మొత్తం:')
      .replace('(Cash)', '(నగదు / Cash)')
      .replace('(UPI)', '(యూపీఐ / UPI)')
      .replace('(Bank Transfer)', '(బ్యాంక్ ట్రాన్స్‌ఫర్)')
      .replace('for Customer ID #', '• కస్టమర్ ID #')
      .replace('for ', '• కస్టమర్: ')
      .replace('Saved Morning deliveries for', 'ఉదయం డెలివరీ వివరాలు సేవ్ చేశారు •')
      .replace('Saved Evening deliveries for', 'సాయంత్రం డెలివరీ వివరాలు సేవ్ చేశారు •')
      .replace('Completed & locked Morning session for', 'ఉదయం డెలివరీ పూర్తి చేశారు •')
      .replace('Completed & locked Evening session for', 'సాయంత్రం డెలివరీ పూర్తి చేశారు •')
      .replace('Corrected delivery record #', 'డెలివరీ మార్పు • రికార్డ్ #')
      .replace('Generated all bills for', 'అన్ని నెలవారీ బిల్లులు తయారయ్యాయి:')
      .replace('Finalized all bills for', 'అన్ని బిల్లులు ఫైనలైజ్ అయ్యాయి:')
  }

  const isToday = selectedDate === getTodayISO()
  const isYesterday = selectedDate === getYesterdayISO()

  return (
    <div style={{ display: 'grid', gap: '18px', fontSize: '16px' }}>
      {/* తేదీ ఎంపిక & వన్-ట్యాప్ ఆడియో బ్రీఫింగ్ కార్డ్ */}
      <div style={{ background: 'linear-gradient(135deg, #063729 0%, #0f766e 100%)', color: '#fff', padding: '22px', borderRadius: '20px', boxShadow: '0 8px 24px rgba(6,55,41,0.22)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '5px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 700 }}>
              🔒 కో-ఓనర్ (Read-Only) • తెలుగు వాయిస్ రిపోర్ట్
            </span>
            <h2 style={{ margin: '10px 0 4px', fontSize: '23px', fontWeight: 800 }}>🎙️ తేదీ వారీ పాల సరఫరా, పేమెంట్లు & బకాయిలు</h2>
          </div>
          <button
            type="button"
            onClick={() => loadPartnerData(selectedDate)}
            disabled={loading}
            style={{ padding: '10px 16px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '12px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
          >
            {loading ? 'లోడ్ అవుతోంది...' : '↻ రిఫ్రెష్'}
          </button>
        </div>

        {/* సులభమైన తేదీ ఎంపిక బటన్లు: ఈరోజు / నిన్న / క్యాలెండర్ */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '14px', background: 'rgba(0,0,0,0.18)', padding: '10px 12px', borderRadius: '14px' }}>
          <span style={{ fontWeight: 800, fontSize: '14px', color: '#ccfbf1' }}>📅 తేదీ:</span>
          <button
            type="button"
            onClick={() => setSelectedDate(getTodayISO())}
            style={{ padding: '9px 16px', borderRadius: '10px', border: 'none', fontWeight: 800, fontSize: '14px', cursor: 'pointer', background: isToday ? '#facc15' : 'rgba(255,255,255,0.2)', color: isToday ? '#0f172a' : '#fff' }}
          >
            ఈరోజు (Today)
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(getYesterdayISO())}
            style={{ padding: '9px 16px', borderRadius: '10px', border: 'none', fontWeight: 800, fontSize: '14px', cursor: 'pointer', background: isYesterday ? '#facc15' : 'rgba(255,255,255,0.2)', color: isYesterday ? '#0f172a' : '#fff' }}
          >
            నిన్న (Yesterday)
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={e => e.target.value && setSelectedDate(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '10px', border: 'none', fontWeight: 800, fontSize: '14px', color: '#0f172a' }}
          />
        </div>

        {/* వన్-ట్యాప్ పూర్తి వివరాలు వినండి + మైక్ + ఆపండి బటన్లు */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '14px' }}>
          <button
            type="button"
            onClick={readCompleteDateBriefing}
            disabled={loading || !data}
            style={{ padding: '16px 18px', background: '#22c55e', color: '#052e16', border: 'none', borderRadius: '14px', fontWeight: 900, fontSize: '17px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
          >
            🔊 పూర్తి వివరాలు వినండి (పాలు • పేమెంట్లు • అప్‌డేట్స్ • బకాయిలు)
          </button>

          <button
            type="button"
            onClick={startTeluguMic}
            style={{ padding: '16px 18px', background: listening ? '#dc2626' : '#facc15', color: listening ? '#fff' : '#0f172a', border: 'none', borderRadius: '14px', fontWeight: 900, fontSize: '17px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
          >
            {listening ? '🔴 వింటున్నాను... మాట్లాడండి' : '🎤 మైక్ నొక్కి తెలుగులో అడగండి'}
          </button>

          {isSpeaking && (
            <button
              type="button"
              onClick={stopVoice}
              style={{ padding: '16px 18px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: 900, fontSize: '16px', cursor: 'pointer' }}
            >
              ⏹ వాయిస్ ఆపండి (Stop)
            </button>
          )}
        </div>

        {/* లైవ్ ట్రాన్స్‌క్రిప్షన్ బాక్స్ */}
        {(listening || liveTranscript || spokenQuestion) && (
          <div style={{ marginTop: '14px', background: '#ffffff', color: '#0f172a', borderRadius: '12px', padding: '14px 16px' }}>
            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f766e', marginBottom: '4px' }}>
              {listening ? '🎙️ మీరు మాట్లాడుతున్నది (Live Transcription):' : '🗣️ మీరు అడిగిన ప్రశ్న:'}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800 }}>
              {listening ? (liveTranscript || 'మాట్లాడండి...') : (spokenQuestion || liveTranscript)}
            </div>
          </div>
        )}

                {/* వాయిస్ సమాధానం బాక్స్ */}
        <div style={{ marginTop: '14px', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '14px', padding: '16px' }}>
          <div style={{ fontSize: '17.5px', fontWeight: 700, lineHeight: 1.6 }}>
            🔊 {voiceReply}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '14px 18px', background: '#fee2e2', color: '#b91c1c', borderRadius: '12px', fontWeight: 800 }}>
          ⚠️ {error}
        </div>
      )}

      {/* 5 పెద్ద KPI కార్డులు: ఉదయం పాలు, సాయంత్రం పాలు, పేమెంట్లు, అప్‌డేట్స్, బకాయిలు */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '12px' }}>
        <div onClick={() => speakTelugu(`${data?.DateFormatted || selectedDate} ఉదయం ${Number(data?.MorningMilkLiters || 0).toFixed(2)} లీటర్ల పాలు డెలివరీ అయ్యాయి.`)} style={{ background: '#fff', padding: '18px', borderRadius: '16px', border: '1px solid #cbd5e1', cursor: 'pointer' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#475569' }}>🌅 ఉదయం పోసిన పాలు</span>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#0f4c2e', marginTop: '6px' }}>
            {Number(data?.MorningMilkLiters || 0).toFixed(2)} L
          </div>
          <span style={{ fontSize: '13px', color: '#0f766e', fontWeight: 700 }}>{data?.MorningDeliveredCount || 0} మందికి • 🔊 వినండి</span>
        </div>

        <div onClick={() => speakTelugu(`${data?.DateFormatted || selectedDate} సాయంత్రం ${Number(data?.EveningMilkLiters || 0).toFixed(2)} లీటర్ల పాలు డెలివరీ అయ్యాయి.`)} style={{ background: '#fff', padding: '18px', borderRadius: '16px', border: '1px solid #cbd5e1', cursor: 'pointer' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#475569' }}>🌆 సాయంత్రం పోసిన పాలు</span>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#1d4ed8', marginTop: '6px' }}>
            {Number(data?.EveningMilkLiters || 0).toFixed(2)} L
          </div>
          <span style={{ fontSize: '13px', color: '#1e40af', fontWeight: 700 }}>{data?.EveningDeliveredCount || 0} మందికి • 🔊 వినండి</span>
        </div>

        <div onClick={() => setActiveTab('todayPayments')} style={{ background: '#fff', padding: '18px', borderRadius: '16px', border: activeTab === 'todayPayments' ? '3px solid #15803d' : '1px solid #cbd5e1', cursor: 'pointer' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#475569' }}>💳 ఆ రోజు పేమెంట్లు</span>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#15803d', marginTop: '6px' }}>
            ₹{Number(data?.TodayCollectedAmount || 0).toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '13px', color: '#166534', fontWeight: 700 }}>{data?.TodayPaymentCount || 0} మంది ఇచ్చారు</span>
        </div>

        <div onClick={() => setActiveTab('audit')} style={{ background: '#fff', padding: '18px', borderRadius: '16px', border: activeTab === 'audit' ? '3px solid #0f766e' : '1px solid #cbd5e1', cursor: 'pointer' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#475569' }}>👤 ఆ రోజు అప్‌డేట్స్</span>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#0f766e', marginTop: '6px' }}>{dateAuditLogs.length}</div>
          <span style={{ fontSize: '13px', color: '#475569', fontWeight: 700 }}>సుధీర్ / అడ్మిన్ మార్పులు</span>
        </div>

        <div onClick={() => setActiveTab('dues')} style={{ background: '#fff', padding: '18px', borderRadius: '16px', border: activeTab === 'dues' ? '3px solid #b45309' : '1px solid #cbd5e1', cursor: 'pointer' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#475569' }}>📌 మొత్తం బకాయిలు</span>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#b45309', marginTop: '6px' }}>
            ₹{Number(data?.TotalDueAmount || 0).toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '13px', color: '#92400e', fontWeight: 700 }}>{data?.DueCustomerCount || 0} మంది కస్టమర్లు</span>
        </div>
      </div>

      {/* 3 పెద్ద ట్యాబ్ బటన్లు */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('todayPayments')}
          style={{ padding: '15px 16px', borderRadius: '14px', border: 'none', fontWeight: 800, fontSize: '16px', cursor: 'pointer', background: activeTab === 'todayPayments' ? '#15803d' : '#e2e8f0', color: activeTab === 'todayPayments' ? '#fff' : '#1e293b' }}
        >
          💳 1. పేమెంట్లు ({todayPays.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('dues')}
          style={{ padding: '15px 16px', borderRadius: '14px', border: 'none', fontWeight: 800, fontSize: '16px', cursor: 'pointer', background: activeTab === 'dues' ? '#b45309' : '#e2e8f0', color: activeTab === 'dues' ? '#fff' : '#1e293b' }}
        >
          📌 2. బకాయిల లిస్ట్ ({data?.DueCustomerCount || 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          style={{ padding: '15px 16px', borderRadius: '14px', border: 'none', fontWeight: 800, fontSize: '16px', cursor: 'pointer', background: activeTab === 'audit' ? '#0f766e' : '#e2e8f0', color: activeTab === 'audit' ? '#fff' : '#1e293b' }}
        >
          👤 3. ఆ రోజు అప్‌డేట్స్ ({dateAuditLogs.length})
        </button>
      </div>

      {/* ట్యాబ్ 1: ఎంచుకున్న తేదీ పేమెంట్లు */}
      {activeTab === 'todayPayments' && (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #cbd5e1', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>💳 {data?.DateFormatted || selectedDate} — వచ్చిన పేమెంట్లు</h3>
            <button
              type="button"
              onClick={() => answerTeluguQuery('పేమెంట్లు ఎవరు ఇచ్చారు')}
              style={{ padding: '10px 16px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: '10px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
            >
              🔊 పేమెంట్లు వినండి
            </button>
          </div>

          {todayPays.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '17px', fontWeight: 600 }}>
              ఈ తేదీన పేమెంట్లు నమోదు కాలేదు.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {todayPays.map((p, idx) => (
                <div key={p.PaymentID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '16px', borderRadius: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div>
                    <div style={{ fontSize: '19px', fontWeight: 800, color: '#0f172a' }}>
                      {idx + 1}. {p.CustomerName} <span style={{ fontSize: '14px', color: '#475569' }}>({p.CustomerCode})</span>
                    </div>
                    <div style={{ fontSize: '15px', color: '#166534', fontWeight: 700, marginTop: '4px' }}>
                      విధానం: {p.PaymentMode === 'Cash' ? 'నగదు (Cash)' : p.PaymentMode} {p.Notes ? `• గమనిక: ${p.Notes}` : ''}
                    </div>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 900, color: '#15803d' }}>
                    ₹{Number(p.TotalPaid || 0).toLocaleString('en-IN')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

        {/* ట్యాబ్ 2: బకాయి ఉన్న కస్టమర్లు */}
      {activeTab === 'dues' && (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #cbd5e1', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>📌 బకాయి ఉన్న కస్టమర్లు ({dueList.length})</h3>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={readAllDueNames}
                style={{ padding: '10px 16px', background: '#fef3c7', color: '#b45309', border: '1px solid #fcd34d', borderRadius: '10px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
              >
                🔊 అందరి పేర్లు వరుసగా వినండి
              </button>
              <input
                type="text"
                placeholder="🔍 పేరు వెతకండి..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', minWidth: '180px' }}
              />
            </div>
          </div>

          {dueList.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '17px', fontWeight: 600 }}>
              బకాయి ఉన్న కస్టమర్లు లేరు.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {dueList.map((c, idx) => (
                <div
                  key={c.CustomerID}
                  onClick={() => speakTelugu(`${c.CustomerName} గారి బకాయి ${Math.round(c.TotalDue)} రూపాయలు.`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '16px', borderRadius: '14px', background: '#fffbeb', border: '1px solid #fde68a', cursor: 'pointer' }}
                >
                  <div>
                    <div style={{ fontSize: '19px', fontWeight: 800, color: '#0f172a' }}>
                      {idx + 1}. {c.CustomerName} <span style={{ fontSize: '14px', color: '#64748b' }}>({c.CustomerCode})</span>
                    </div>
                    <div style={{ fontSize: '14.5px', color: '#475569', fontWeight: 600, marginTop: '4px' }}>
                      పాత బకాయి: ₹{Math.round(c.OpeningDue)} • పాలు: ₹{Math.round(c.MilkDue)} • వెన్నపూస: ₹{Math.round(c.VeenaPusaDue)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '23px', fontWeight: 900, color: '#b91c1c' }}>
                      ₹{Number(c.TotalDue || 0).toLocaleString('en-IN')}
                    </div>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f766e' }}>🔊 నొక్కితే వినిపిస్తుంది</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ట్యాబ్ 3: ఆ రోజు సుధీర్ / అడ్మిన్ చేసిన అప్‌డేట్స్ */}
      {activeTab === 'audit' && (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #cbd5e1', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>👤 {data?.DateFormatted || selectedDate} — సుధీర్ & అడ్మిన్ అప్‌డేట్స్</h3>
            <button
              type="button"
              onClick={() => answerTeluguQuery('సుధీర్ అప్‌డేట్స్')}
              style={{ padding: '10px 16px', background: '#ccfbf1', color: '#0f766e', border: '1px solid #5eead4', borderRadius: '10px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
            >
              🔊 అప్‌డేట్స్ వినండి
            </button>
          </div>
          {dateAuditLogs.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '17px', fontWeight: 600 }}>
              ఈ తేదీన సుధీర్ లేదా అడ్మిన్ చేసిన అప్‌డేట్స్ ఏవీ లేవు.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {dateAuditLogs.map(row => {
                const isAdmin = row.ActorRole === 'Admin'
                const actorTe = isAdmin ? '🛡️ అడ్మిన్ (Admin)' : '👤 సుధీర్ (Sudheer)'
                return (
                  <div key={row.LogID} style={{ padding: '16px', borderRadius: '14px', background: '#f8fafc', border: '1px solid #cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ padding: '5px 12px', borderRadius: '999px', fontSize: '14px', fontWeight: 800, background: isAdmin ? '#dcfce7' : '#e0f2fe', color: isAdmin ? '#15803d' : '#0369a1' }}>
                        {actorTe}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#475569' }}>🕒 {row.CreatedAt}</span>
                    </div>
                    <div style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                      {formatAuditSummaryTelugu(row.ResolvedSummary || row.Summary)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
