import { useEffect, useState } from 'react'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://' + 'milk-delivery-api-bn26' + '.onrender.com')

export default function PartnerPortal() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('todayPayments')
  const [search, setSearch] = useState('')
  const [listening, setListening] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [spokenQuestion, setSpokenQuestion] = useState('')
  const [voiceReply, setVoiceReply] = useState('నమస్తే! ఈరోజు పేమెంట్లు, బకాయిలు లేదా సుధీర్ అప్‌డేట్స్ వినడానికి కింద ఉన్న బటన్ నొక్కండి.')

  async function loadPartnerData() {
    setLoading(true)
    setError('')
    try {
      const todayStr = new Date().toLocaleDateString('en-CA')
      const res = await fetch(`${API_URL}/partner/dashboard?today_str=${todayStr}`)
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

  useEffect(() => { loadPartnerData() }, [])

  function speakTelugu(text) {
    setVoiceReply(text)
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'te-IN'
    utter.rate = 0.92
    const voices = window.speechSynthesis.getVoices()
    const teVoice = voices.find(v => v.lang.toLowerCase().includes('te'))
    if (teVoice) utter.voice = teVoice
    window.speechSynthesis.speak(utter)
  }

  function readFullSummary() {
    if (!data) return
    const payCount = data.TodayPaymentCount || 0
    const payAmt = Math.round(Number(data.TodayCollectedAmount || 0))
    const dueCount = data.DueCustomerCount || 0
    const dueAmt = Math.round(Number(data.TotalDueAmount || 0))
    const todayPays = data.TodayPayments || []

    const payPart = payCount === 0
      ? 'ఈరోజు ఇప్పటివరకు ఎవరి వద్ద నుండి పేమెంట్ రాలేదు.'
      : `ఈరోజు ${payCount} మంది నుండి మొత్తం ${payAmt} రూపాయల పేమెంట్ వచ్చింది. ఇచ్చినవారు: ${todayPays.map(p => `${p.CustomerName} ${Math.round(p.TotalPaid)} రూపాయలు`).join(', ')}.`

    const duePart = dueCount === 0
      ? 'ప్రస్తుతం ఎవరికీ పెండింగ్ బకాయి లేదు.'
      : `ఈ నెల మొత్తం ${dueCount} మంది కస్టమర్లకు కలిపి ${dueAmt} రూపాయల బకాయి ఉంది.`

    speakTelugu(`నమస్తే! ${payPart} ${duePart}`)
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

    const dueCount = data.DueCustomerCount || 0
    const dueAmt = Math.round(Number(data.TotalDueAmount || 0))
    const payCount = data.TodayPaymentCount || 0
    const payAmt = Math.round(Number(data.TodayCollectedAmount || 0))
    const dueList = data.DueCustomers || []
    const todayPays = data.TodayPayments || []
    const auditLogs = data.PaymentAuditLogs || []

    const matchedCust = dueList.find(c => q.includes((c.CustomerName || '').toLowerCase()))
    if (matchedCust) {
      setActiveTab('dues')
      setSearch(matchedCust.CustomerName)
      return speakTelugu(
        `${matchedCust.CustomerName} గారి ఖాతాలో మొత్తం ${Math.round(matchedCust.TotalDue)} రూపాయల బకాయి ఉంది.`
      )
    }

    if (q.includes('పేర్లు') || q.includes('చదువు') || q.includes('లిస్ట్') || q.includes('names')) {
      return readAllDueNames()
    }

    if (q.includes('సుధీర్') || q.includes('మార్చారు') || q.includes('అప్‌డేట్') || q.includes('sudheer') || q.includes('update')) {
      setActiveTab('audit')
      if (!auditLogs.length) {
        return speakTelugu('ఇటీవల సుధీర్ లేదా అడ్మిన్ చేసిన పేమెంట్ మార్పులు ఏవీ లేవు.')
      }
      const latest = auditLogs[0]
      const whoTe = latest.ActorRole === 'Admin' ? 'అడ్మిన్' : 'సుధీర్'
      return speakTelugu(
        `చివరి అప్‌డేట్ ${whoTe} ద్వారా ${latest.CreatedAt} సమయంలో జరిగింది.`
      )
    }

    if (q.includes('పేమెంట్') || q.includes('ఎవరు') || q.includes('ఈరోజు') || q.includes('ఇచ్చారు') || q.includes('payment') || q.includes('today')) {
      setActiveTab('todayPayments')
      if (payCount === 0) {
        return speakTelugu('ఈరోజు ఇప్పటివరకు ఎవరి వద్ద నుండి పేమెంట్ రాలేదు.')
      }
      const names = todayPays.map(p => `${p.CustomerName} ${Math.round(p.TotalPaid)} రూపాయలు`).join(', ')
      return speakTelugu(
        `ఈరోజు మొత్తం ${payCount} మంది నుండి ${payAmt} రూపాయలు వచ్చాయి. పేర్లు: ${names}.`
      )
    }

    setActiveTab('dues')
    if (dueCount === 0) {
      return speakTelugu('ప్రస్తుతం ఏ కస్టమర్‌కు పెండింగ్ బకాయి లేదు.')
    }
    const topNames = dueList.slice(0, 5).map(c => `${c.CustomerName} ${Math.round(c.TotalDue)} రూపాయలు`).join(', ')
    return speakTelugu(
      `ఈ నెల మొత్తం ${dueCount} మందికి కలిపి ${dueAmt} రూపాయల బకాయి ఉంది. ఎక్కువ బకాయి ఉన్నవారు: ${topNames}.`
    )
  }
  function startTeluguMic() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRec) {
      return speakTelugu('మీ బ్రౌజర్‌లో మైక్ సపోర్ట్ లేదు. కింద ఉన్న పెద్ద తెలుగు బటన్లను నొక్కండి.')
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
  const auditLogs = data?.PaymentAuditLogs || []

  function formatAuditSummaryTelugu(summary) {
    if (!summary) return '-'
    return summary
      .replace('Recorded', 'నమోదు చేసిన మొత్తం:')
      .replace('(Cash)', '(నగదు / Cash)')
      .replace('(UPI)', '(యూపీఐ / UPI)')
      .replace('(Bank Transfer)', '(బ్యాంక్ ట్రాన్స్‌ఫర్)')
      .replace('for Customer ID #', '• కస్టమర్ ID #')
      .replace('for ', '• కస్టమర్: ')
      .replace('Generated all bills for', 'అన్ని నెలవారీ బిల్లులు తయారయ్యాయి:')
      .replace('Finalized all bills for', 'అన్ని బిల్లులు ఫైనలైజ్ అయ్యాయి:')
      .replace('Generated bill for', 'బిల్లు తయారైంది •')
      .replace('Finalized Bill ID #', 'బిల్లు ఫైనలైజ్ అయింది • బిల్లు ID #')
  }

  return (
    <div style={{ display: 'grid', gap: '20px', fontSize: '16px' }}>
      {/* వన్-ట్యాప్ పూర్తి ఆడియో సారాంశం + లైవ్ తెలుగు ట్రాన్స్‌క్రిప్షన్ */}
      <div style={{ background: 'linear-gradient(135deg, #063729 0%, #0f766e 100%)', color: '#fff', padding: '24px', borderRadius: '20px', boxShadow: '0 8px 24px rgba(6,55,41,0.22)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span style={{ background: 'rgba(255,255,255,0.2)', padding: '5px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 700 }}>
              🔒 కో-ఓనర్ (Read-Only) • సులభమైన తెలుగు వాయిస్ పోర్టల్
            </span>
            <h2 style={{ margin: '10px 0 4px', fontSize: '24px', fontWeight: 800 }}>🎙️ తెలుగు వాయిస్ అసిస్టెంట్</h2>
          </div>
          <button
            type="button"
            onClick={loadPartnerData}
            disabled={loading}
            style={{ padding: '12px 18px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '12px', fontWeight: 800, fontSize: '15px', cursor: 'pointer' }}
          >
            {loading ? 'లోడ్ అవుతోంది...' : '↻ రిఫ్రెష్'}
          </button>
        </div>

        {/* 2 పెద్ద వాయిస్ బటన్లు */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginTop: '16px' }}>
          <button
            type="button"
            onClick={readFullSummary}
            style={{ padding: '16px 20px', background: '#22c55e', color: '#052e16', border: 'none', borderRadius: '14px', fontWeight: 900, fontSize: '17px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
          >
            🔊 ఈరోజు పూర్తి వివరాలు వినండి
          </button>

          <button
            type="button"
            onClick={startTeluguMic}
            style={{ padding: '16px 20px', background: listening ? '#dc2626' : '#facc15', color: listening ? '#fff' : '#0f172a', border: 'none', borderRadius: '14px', fontWeight: 900, fontSize: '17px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
          >
            {listening ? '🔴 వింటున్నాను... తెలుగులో మాట్లాడండి' : '🎤 మైక్ నొక్కి తెలుగులో అడగండి'}
          </button>
        </div>

        {/* లైవ్ ట్రాన్స్‌క్రిప్షన్ బాక్స్ (మాట్లాడే పదాలు వెంటనే కనిపిస్తాయి) */}
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
          <div style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1.6 }}>
            🔊 {voiceReply}
          </div>
        </div>

        {/* సులభమైన 1-ట్యాప్ తెలుగు ప్రశ్నలు */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '14px' }}>
          <button type="button" onClick={() => answerTeluguQuery('ఈరోజు ఎవరు పేమెంట్ ఇచ్చారు?')} style={{ padding: '11px 16px', background: '#fff', color: '#0f4c2e', border: 'none', borderRadius: '999px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer' }}>
            💳 ఈరోజు ఎవరు పేమెంట్ ఇచ్చారు?
          </button>
          <button type="button" onClick={readAllDueNames} style={{ padding: '11px 16px', background: '#fff', color: '#0f4c2e', border: 'none', borderRadius: '999px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer' }}>
            🔊 బకాయి ఉన్న వాళ్ళ పేర్లు చదువు
          </button>
          <button type="button" onClick={() => answerTeluguQuery('సుధీర్ ఏం అప్‌డేట్ చేశాడు?')} style={{ padding: '11px 16px', background: '#fff', color: '#0f4c2e', border: 'none', borderRadius: '999px', fontSize: '14.5px', fontWeight: 800, cursor: 'pointer' }}>
            👤 సుధీర్ ఏం అప్‌డేట్ చేశాడు?
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '14px 18px', background: '#fee2e2', color: '#b91c1c', borderRadius: '12px', fontWeight: 800, fontSize: '16px' }}>
          ⚠️ {error}
        </div>
      )}

      {/* పెద్ద అక్షరాల సారాంశం కార్డులు */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px' }}>
        <div onClick={() => setActiveTab('todayPayments')} style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: activeTab === 'todayPayments' ? '3px solid #15803d' : '1px solid #cbd5e1', cursor: 'pointer' }}>
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#475569' }}>💳 ఈరోజు వచ్చిన పేమెంట్లు</span>
          <div style={{ fontSize: '30px', fontWeight: 900, color: '#15803d', marginTop: '6px' }}>
            ₹{Number(data?.TodayCollectedAmount || 0).toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '14px', color: '#166534', fontWeight: 700 }}>{data?.TodayPaymentCount || 0} మంది ఇచ్చారు ({data?.Date || ''})</span>
        </div>

        <div onClick={() => setActiveTab('dues')} style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: activeTab === 'dues' ? '3px solid #b45309' : '1px solid #cbd5e1', cursor: 'pointer' }}>
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#475569' }}>📌 మొత్తం రావలసిన బకాయి</span>
          <div style={{ fontSize: '30px', fontWeight: 900, color: '#b45309', marginTop: '6px' }}>
            ₹{Number(data?.TotalDueAmount || 0).toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '14px', color: '#92400e', fontWeight: 700 }}>{data?.DueCustomerCount || 0} మంది కస్టమర్లు</span>
        </div>

        <div onClick={() => setActiveTab('audit')} style={{ background: '#fff', padding: '20px', borderRadius: '16px', border: activeTab === 'audit' ? '3px solid #0f766e' : '1px solid #cbd5e1', cursor: 'pointer' }}>
          <span style={{ fontSize: '15px', fontWeight: 800, color: '#475569' }}>👤 సుధీర్ / అడ్మిన్ అప్‌డేట్స్</span>
          <div style={{ fontSize: '30px', fontWeight: 900, color: '#0f766e', marginTop: '6px' }}>{auditLogs.length}</div>
          <span style={{ fontSize: '14px', color: '#475569', fontWeight: 700 }}>పేమెంట్ & బిల్లు మార్పులు</span>
        </div>
      </div>
      {/* 3 పెద్ద ట్యాబ్ బటన్లు */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '10px' }}>
        <button
          type="button"
          onClick={() => setActiveTab('todayPayments')}
          style={{ padding: '15px 16px', borderRadius: '14px', border: 'none', fontWeight: 800, fontSize: '16px', cursor: 'pointer', background: activeTab === 'todayPayments' ? '#15803d' : '#e2e8f0', color: activeTab === 'todayPayments' ? '#fff' : '#1e293b' }}
        >
          💳 1. ఈరోజు పేమెంట్లు ({todayPays.length})
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
          👤 3. సుధీర్ అప్‌డేట్స్ ({auditLogs.length})
        </button>
      </div>

      {/* ట్యాబ్ 1: ఈరోజు వచ్చిన పేమెంట్లు (పెద్ద కార్డుల రూపంలో) */}
      {activeTab === 'todayPayments' && (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #cbd5e1', padding: '18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
            <h3 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>💳 ఈరోజు ({data?.Date}) వచ్చిన పేమెంట్లు</h3>
            <button
              type="button"
              onClick={() => answerTeluguQuery('ఈరోజు ఎవరు పేమెంట్ ఇచ్చారు?')}
              style={{ padding: '10px 16px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: '10px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
            >
              🔊 పేర్లు వినండి
            </button>
          </div>

          {todayPays.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '17px', fontWeight: 600 }}>
              ఈరోజు ఇంకా పేమెంట్లు నమోదు కాలేదు.
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

      {/* ట్యాబ్ 2: బకాయి ఉన్న కస్టమర్లు (పెద్ద అక్షరాలు + వరుసగా పేర్లు వినే బటన్) */}
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

      {/* ట్యాబ్ 3: సుధీర్ / అడ్మిన్ చేసిన పేమెంట్ మార్పులు */}
      {activeTab === 'audit' && (
        <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #cbd5e1', padding: '18px' }}>
          <h3 style={{ marginTop: 0, fontSize: '20px', color: '#0f172a' }}>👤 సుధీర్ & అడ్మిన్ చేసిన పేమెంట్ అప్‌డేట్స్</h3>
          {auditLogs.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '17px', fontWeight: 600 }}>
              ఇంకా పేమెంట్ మార్పుల రికార్డులు లేవు.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '12px' }}>
              {auditLogs.map(row => {
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
