import { useEffect, useState } from 'react'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://' + 'milk-delivery-api-bn26' + '.onrender.com')

export default function PartnerPortal() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('dues')
  const [search, setSearch] = useState('')
  const [listening, setListening] = useState(false)
  const [spokenQuestion, setSpokenQuestion] = useState('')
  const [voiceReply, setVoiceReply] = useState('నమస్తే! ఈ నెల బకాయిలు, ఈరోజు పేమెంట్లు లేదా పేమెంట్ మార్పుల గురించి మైక్ నొక్కి తెలుగులో అడగండి.')

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
    utter.rate = 0.95
    const voices = window.speechSynthesis.getVoices()
    const teVoice = voices.find(v => v.lang.toLowerCase().includes('te'))
    if (teVoice) utter.voice = teVoice
    window.speechSynthesis.speak(utter)
  }

  function answerTeluguQuery(rawQuery) {
    if (!data) return
    const q = String(rawQuery || '').toLowerCase().trim()
    setSpokenQuestion(rawQuery)

    const dueCount = data.DueCustomerCount || 0
    const dueAmt = Math.round(Number(data.TotalDueAmount || 0))
    const payCount = data.TodayPaymentCount || 0
    const payAmt = Math.round(Number(data.TodayCollectedAmount || 0))
    const monthRev = Math.round(Number(data.MonthRevenue || 0))
    const monthLiters = Number(data.MonthMilkLiters || 0).toFixed(1)
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

    if (q.includes('ఆదాయం') || q.includes('అమ్మకాలు') || q.includes('లీటర్లు') || q.includes('revenue')) {
      return speakTelugu(
        `ఈ నెల ఇప్పటివరకు ${monthLiters} లీటర్ల పాలు సరఫరా అయ్యాయి. మొత్తం ఆదాయం ${monthRev} రూపాయలు.`
      )
    }

    if (q.includes('పేమెంట్') || q.includes('ఎవరు') || q.includes('ఈరోజు') || q.includes('ఇచ్చారు') || q.includes('payment') || q.includes('today')) {
      setActiveTab('todayPayments')
      if (payCount === 0) {
        return speakTelugu('ఈరోజు ఇప్పటివరకు ఎవరి వద్ద నుండి పేమెంట్ నమోదు కాలేదు.')
      }
      const names = todayPays.slice(0, 5).map(p => `${p.CustomerName} ${Math.round(p.TotalPaid)} రూపాయలు`).join(', ')
      return speakTelugu(
        `ఈరోజు మొత్తం ${payCount} మంది కస్టమర్ల నుండి ${payAmt} రూపాయలు వసూలయ్యాయి. వివరాలు: ${names}.`
      )
    }

    if (q.includes('మార్చారు') || q.includes('అప్‌డేట్') || q.includes('ఆడిట్') || q.includes('audit') || q.includes('change')) {
      setActiveTab('audit')
      if (!auditLogs.length) {
        return speakTelugu('ఇటీవల పేమెంట్ లేదా బిల్లు మార్పుల రికార్డులు లేవు.')
      }
      const latest = auditLogs[0]
      const whoTe = latest.ActorRole === 'Admin' ? 'అడ్మిన్' : 'యూజర్'
      return speakTelugu(
        `చివరి మార్పు ${whoTe} ద్వారా ${latest.CreatedAt} సమయంలో జరిగింది.`
      )
    }

    setActiveTab('dues')
    if (dueCount === 0) {
      return speakTelugu('ప్రస్తుతం ఏ కస్టమర్‌కు పెండింగ్ బకాయి లేదు. అన్ని ఖాతాలు క్లియర్‌గా ఉన్నాయి.')
    }
    const topNames = dueList.slice(0, 4).map(c => `${c.CustomerName} ${Math.round(c.TotalDue)} రూపాయలు`).join(', ')
    return speakTelugu(
      `ఈ నెల మొత్తం ${dueCount} మంది కస్టమర్లకు కలిపి ${dueAmt} రూపాయల బకాయి ఉంది. ఎక్కువ బకాయి ఉన్నవారు: ${topNames}.`
    )
  }

  function startTeluguMic() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRec) {
      return speakTelugu('మీ బ్రౌజర్‌లో మైక్ సపోర్ట్ లేదు. కింద ఉన్న తెలుగు ప్రశ్న బటన్లను నొక్కండి.')
    }
    const rec = new SpeechRec()
    rec.lang = 'te-IN'
    rec.interimResults = false
    rec.maxAlternatives = 1
    setListening(true)
    rec.onresult = e => {
      const firstResult = e.results && e.results[0] && e.results[0][0]
      const transcript = firstResult ? firstResult.transcript : ''
      setListening(false)
      if (transcript) answerTeluguQuery(transcript)
    }
    rec.onerror = () => {
      setListening(false)
      speakTelugu('మాట స్పష్టంగా వినిపించలేదు. దయచేసి మళ్ళీ మైక్ నొక్కి అడగండి.')
    }
    rec.onend = () => setListening(false)
    rec.start()
  }
  const dueList = (data?.DueCustomers || []).filter(c =>
    !search.trim() || [c.CustomerName, c.CustomerCode, c.MobileNumber].some(v => (v || '').toLowerCase().includes(search.toLowerCase().trim()))
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
    <div style={{ display: 'grid', gap: '18px' }}>
      <div style={{ background: 'linear-gradient(135deg, #063729 0%, #0f766e 100%)', color: '#fff', padding: '22px', borderRadius: '18px', boxShadow: '0 6px 20px rgba(6,55,41,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span style={{ background: 'rgba(255,255,255,0.18)', padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>
              🔒 కో-ఓనర్ (Read-Only) రిపోర్ట్స్ & వాయిస్ అసిస్టెంట్
            </span>
            <h2 style={{ margin: '8px 0 4px', fontSize: '21px' }}>🎙️ తెలుగు వాయిస్ అసిస్టెంట్</h2>
            <p style={{ margin: 0, fontSize: '13px', color: '#ccfbf1' }}>
              మైక్ నొక్కి తెలుగులో అడగండి లేదా కింద ఉన్న ప్రశ్న బటన్లను నొక్కండి
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={startTeluguMic}
              style={{ padding: '12px 20px', background: listening ? '#dc2626' : '#facc15', color: listening ? '#fff' : '#0f172a', border: 'none', borderRadius: '12px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
            >
              {listening ? '🔴 వింటున్నాను... మాట్లాడండి' : '🎤 తెలుగులో అడగండి'}
            </button>
            <button
              type="button"
              onClick={loadPartnerData}
              disabled={loading}
              style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '12px', fontWeight: 700, fontSize: '13px', cursor: 'pointer' }}
            >
              {loading ? 'లోడ్ అవుతోంది...' : '↻ రిఫ్రెష్'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: '14px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '12px', padding: '14px' }}>
          {spokenQuestion && (
            <div style={{ fontSize: '12px', color: '#fde68a', marginBottom: '4px', fontWeight: 700 }}>
              మీరు అడిగిన ప్రశ్న: &ldquo;{spokenQuestion}&rdquo;
            </div>
          )}
          <div style={{ fontSize: '15px', fontWeight: 700, lineHeight: 1.5 }}>
            🔊 {voiceReply}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
          <button type="button" onClick={() => answerTeluguQuery('ఈ నెల బకాయి ఎంత మందికి ఉంది?')} style={{ padding: '8px 13px', background: '#fff', color: '#0f4c2e', border: 'none', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
            💬 ఈ నెల బకాయి ఎంత మందికి ఉంది?
          </button>
          <button type="button" onClick={() => answerTeluguQuery('ఈరోజు ఎవరు పేమెంట్ ఇచ్చారు?')} style={{ padding: '8px 13px', background: '#fff', color: '#0f4c2e', border: 'none', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
            💬 ఈరోజు ఎవరు పేమెంట్ ఇచ్చారు?
          </button>
          <button type="button" onClick={() => answerTeluguQuery('ఈ నెల మొత్తం ఆదాయం ఎంత?')} style={{ padding: '8px 13px', background: '#fff', color: '#0f4c2e', border: 'none', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
            💬 ఈ నెల మొత్తం ఆదాయం ఎంత?
          </button>
          <button type="button" onClick={() => answerTeluguQuery('పేమెంట్లు ఎవరు మార్చారు?')} style={{ padding: '8px 13px', background: '#fff', color: '#0f4c2e', border: 'none', borderRadius: '999px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
            💬 పేమెంట్లు ఎవరు మార్చారు?
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#b91c1c', borderRadius: '10px', fontWeight: 700 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '12px' }}>
        <div onClick={() => setActiveTab('dues')} style={{ background: '#fff', padding: '16px', borderRadius: '14px', border: activeTab === 'dues' ? '2px solid #b45309' : '1px solid #e2e8f0', cursor: 'pointer' }}>
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#64748b' }}>మొత్తం రావలసిన బకాయి</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#b45309', marginTop: '4px' }}>
            ₹{Number(data?.TotalDueAmount || 0).toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 600 }}>{data?.DueCustomerCount || 0} మంది కస్టమర్లు</span>
        </div>

        <div onClick={() => setActiveTab('todayPayments')} style={{ background: '#fff', padding: '16px', borderRadius: '14px', border: activeTab === 'todayPayments' ? '2px solid #15803d' : '1px solid #e2e8f0', cursor: 'pointer' }}>
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#64748b' }}>ఈరోజు వసూలైన మొత్తం</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#15803d', marginTop: '4px' }}>
            ₹{Number(data?.TodayCollectedAmount || 0).toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '12px', color: '#166534', fontWeight: 600 }}>{data?.TodayPaymentCount || 0} పేమెంట్లు ({data?.Date || ''})</span>
        </div>

        <div style={{ background: '#fff', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#64748b' }}>ఈ నెల మొత్తం ఆదాయం</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f4c2e', marginTop: '4px' }}>
            ₹{Number(data?.MonthRevenue || 0).toLocaleString('en-IN')}
          </div>
          <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>{Number(data?.MonthMilkLiters || 0).toFixed(1)} లీటర్లు</span>
        </div>

        <div onClick={() => setActiveTab('audit')} style={{ background: '#fff', padding: '16px', borderRadius: '14px', border: activeTab === 'audit' ? '2px solid #0f766e' : '1px solid #e2e8f0', cursor: 'pointer' }}>
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#64748b' }}>పేమెంట్ & బిల్లు మార్పులు</span>
          <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f766e', marginTop: '4px' }}>{auditLogs.length}</div>
          <span style={{ fontSize: '12px', color: '#475569', fontWeight: 600 }}>ఎవరు • ఎప్పుడు మార్చారు</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setActiveTab('dues')} style={{ padding: '10px 16px', borderRadius: '10px', border: 'none', fontWeight: 700, cursor: 'pointer', background: activeTab === 'dues' ? '#0f4c2e' : '#e2e8f0', color: activeTab === 'dues' ? '#fff' : '#334155' }}>
          📌 బకాయి ఉన్న కస్టమర్లు ({data?.DueCustomerCount || 0})
        </button>
        <button type="button" onClick={() => setActiveTab('todayPayments')} style={{ padding: '10px 16px', borderRadius: '10px', border: 'none', fontWeight: 700, cursor: 'pointer', background: activeTab === 'todayPayments' ? '#0f4c2e' : '#e2e8f0', color: activeTab === 'todayPayments' ? '#fff' : '#334155' }}>
          💳 ఈరోజు పేమెంట్లు ({todayPays.length})
        </button>
        <button type="button" onClick={() => setActiveTab('audit')} style={{ padding: '10px 16px', borderRadius: '10px', border: 'none', fontWeight: 700, cursor: 'pointer', background: activeTab === 'audit' ? '#0f4c2e' : '#e2e8f0', color: activeTab === 'audit' ? '#fff' : '#334155' }}>
          🛡️ పేమెంట్ మార్పుల చరిత్ర ({auditLogs.length})
        </button>
      </div>

      {activeTab === 'dues' && (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px', overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            <h3 style={{ margin: 0 }}>📌 బకాయి ఉన్న కస్టమర్ల వివరాలు</h3>
            <input type="text" placeholder="🔍 కస్టమర్ పేరు లేదా కోడ్ వెతకండి..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '9px 14px', borderRadius: '9px', border: '1px solid #cbd5e1', minWidth: '220px' }} />
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ background: '#0f4c2e', color: '#fff' }}>
                <th style={{ padding: '11px 14px' }}>కస్టమర్ పేరు</th>
                <th style={{ padding: '11px 14px' }}>పాత బకాయి</th>
                <th style={{ padding: '11px 14px' }}>పాల బకాయి</th>
                <th style={{ padding: '11px 14px' }}>వెన్నపూస బకాయి</th>
                <th style={{ padding: '11px 14px' }}>మొత్తం బకాయి</th>
              </tr>
            </thead>
            <tbody>
              {dueList.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>బకాయి ఉన్న కస్టమర్లు లేరు.</td></tr>
              ) : dueList.map(c => (
                <tr key={c.CustomerID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '11px 14px' }}><strong>{c.CustomerName}</strong> <span style={{ fontSize: '12px', color: '#64748b' }}>({c.CustomerCode})</span></td>
                  <td style={{ padding: '11px 14px' }}>₹{c.OpeningDue.toFixed(2)}</td>
                  <td style={{ padding: '11px 14px' }}>₹{c.MilkDue.toFixed(2)}</td>
                  <td style={{ padding: '11px 14px' }}>₹{c.VeenaPusaDue.toFixed(2)}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 800, color: '#b91c1c' }}>₹{c.TotalDue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'todayPayments' && (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px', overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>💳 ఈరోజు ({data?.Date}) వసూలైన పేమెంట్లు</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ background: '#0f4c2e', color: '#fff' }}>
                <th style={{ padding: '11px 14px' }}>కస్టమర్</th>
                <th style={{ padding: '11px 14px' }}>చెల్లింపు విధానం</th>
                <th style={{ padding: '11px 14px' }}>చెల్లించిన మొత్తం</th>
                <th style={{ padding: '11px 14px' }}>గమనిక</th>
              </tr>
            </thead>
            <tbody>
              {todayPays.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>ఈరోజు ఇంకా పేమెంట్లు నమోదు కాలేదు.</td></tr>
              ) : todayPays.map(p => (
                <tr key={p.PaymentID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '11px 14px' }}><strong>{p.CustomerName}</strong> ({p.CustomerCode})</td>
                  <td style={{ padding: '11px 14px' }}>{p.PaymentMode === 'Cash' ? 'నగదు (Cash)' : p.PaymentMode}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 800, color: '#15803d' }}>₹{p.TotalPaid.toFixed(2)}</td>
                  <td style={{ padding: '11px 14px', color: '#475569' }}>{p.Notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'audit' && (
        <div style={{ background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '16px', overflowX: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>🛡️ పేమెంట్లు & బిల్లులు ఎవరు, ఎప్పుడు మార్చారు</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ background: '#0f4c2e', color: '#fff' }}>
                <th style={{ padding: '11px 14px' }}>సమయం (IST)</th>
                <th style={{ padding: '11px 14px' }}>ఎవరు మార్చారు</th>
                <th style={{ padding: '11px 14px' }}>విభాగం</th>
                <th style={{ padding: '11px 14px' }}>వివరాలు</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>ఇంకా పేమెంట్ మార్పుల రికార్డులు లేవు.</td></tr>
              ) : auditLogs.map(row => (
                <tr key={row.LogID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '11px 14px', whiteSpace: 'nowrap', fontWeight: 600 }}>{row.CreatedAt}</td>
                  <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                    <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 800, background: row.ActorRole === 'Admin' ? '#dcfce7' : '#e0f2fe', color: row.ActorRole === 'Admin' ? '#15803d' : '#0369a1' }}>
                      {row.ActorRole === 'Admin' ? '🛡️ అడ్మిన్ (Admin)' : '👤 యూజర్ (User)'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 14px', fontWeight: 700 }}>{row.ModuleName === 'Payments' ? '💳 పేమెంట్లు' : '🧾 నెలవారీ బిల్లులు'}</td>
                  <td style={{ padding: '11px 14px', fontWeight: 600 }}>{formatAuditSummaryTelugu(row.ResolvedSummary || row.Summary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
