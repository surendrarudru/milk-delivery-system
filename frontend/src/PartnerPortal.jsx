import { useEffect, useState } from 'react'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://' + 'milk-delivery-api-bn26' + '.onrender.com')
const getBestName = item => (item?.DisplayName || item?.ReferenceName || item?.CustomerName || '').trim()

function BujjayiCalf({ speaking }) {
  return (
    <div style={{ position: 'relative', width: '116px', height: '116px', flexShrink: 0, borderRadius: '50%', background: '#fff', padding: '4px', border: speaking ? '5px solid #facc15' : '4px solid rgba(255,255,255,0.85)', boxShadow: '0 8px 22px rgba(0,0,0,0.28)' }}>
      <svg viewBox="0 0 140 140" width="100%" height="100%">
        <circle cx="70" cy="70" r="66" fill="#f0fdf4" />
        <path d="M46 34 C38 22, 42 12, 50 14 C53 20, 54 27, 54 33 Z" fill="#f59e0b" />
        <path d="M94 34 C102 22, 98 12, 90 14 C87 20, 86 27, 86 33 Z" fill="#f59e0b" />
        <path d="M62 28 L66 16 L70 25 L75 15 L78 28 Z" fill="#e2e8f0" />
        <ellipse cx="26" cy="52" rx="18" ry="11" transform="rotate(-18 26 52)" fill="#1e293b" />
        <ellipse cx="27" cy="53" rx="12" ry="6.5" transform="rotate(-18 27 53)" fill="#fda4af" />
        <ellipse cx="114" cy="52" rx="18" ry="11" transform="rotate(18 114 52)" fill="#1e293b" />
        <ellipse cx="113" cy="53" rx="12" ry="6.5" transform="rotate(18 113 53)" fill="#fda4af" />
        <path d="M46 96 C44 122, 96 122, 94 96 Z" fill="#fff" stroke="#cbd5e1" strokeWidth="1.5" />
        <circle cx="57" cy="112" r="5" fill="#1e293b" />
        <circle cx="83" cy="114" r="4.5" fill="#1e293b" />
        <rect x="49" y="92" width="42" height="7" rx="3.5" fill="#1e293b" />
        <path d="M62 100 L78 100 L82 113 L58 113 Z" fill="#facc15" stroke="#d97706" strokeWidth="1.2" />
        <circle cx="70" cy="115" r="3.2" fill="#d97706" />
        <rect x="38" y="28" width="64" height="66" rx="30" fill="#fff" stroke="#e2e8f0" strokeWidth="1.5" />
        <ellipse cx="53" cy="52" rx="13" ry="15" fill="#1e293b" />
        <circle cx="54" cy="52" r="6.5" fill="#fff" />
        <circle cx="55" cy="52" r="4" fill="#0f172a" />
        <circle cx="56.5" cy="50.5" r="1.5" fill="#fff" />
        <circle cx="86" cy="52" r="6.5" fill="#0f172a" />
        <circle cx="87.5" cy="50.5" r="2" fill="#fff" />
        <rect x="41" y="64" width="58" height="30" rx="15" fill="#fecdd3" />
        <ellipse cx="57" cy="74" rx="3.5" ry="4.5" fill="#9f1239" />
        <ellipse cx="83" cy="74" rx="3.5" ry="4.5" fill="#9f1239" />
        {speaking ? <ellipse cx="70" cy="85" rx="7" ry="5" fill="#be123c" /> : <path d="M56 83 Q70 92 84 83" stroke="#be123c" strokeWidth="2.8" fill="none" strokeLinecap="round" />}
      </svg>
      
    </div>
  )
}

export default function PartnerPortal() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [search, setSearch] = useState('')

  async function loadTodayReport() {
    setLoading(true); setError('')
    try {
      const todayStr = new Date().toLocaleDateString('en-CA')
      const res = await fetch(`${API_URL}/partner/dashboard?today_str=${todayStr}`)
      if (!res.ok) throw new Error('రిపోర్ట్ లోడ్ కాలేదు')
      setData(await res.json())
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  useEffect(() => {
    loadTodayReport()
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
    }
  }, [])

  function stopVoice() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (window._mmAudioPlayer) { window._mmAudioPlayer.pause(); window._mmAudioPlayer = null }
    window._mmAudioStop = true
    setIsSpeaking(false)
  }

  function speakBrowserGirl(text) {
    if (!('speechSynthesis' in window)) { setIsSpeaking(false); return }
    const voices = window.speechSynthesis.getVoices()
    const teVoices = voices.filter(v => v.lang.toLowerCase().includes('te'))
    const femaleTe = teVoices.find(v => /shruti|google|female|woman|girl|lekha|kalpana/i.test(v.name)) || teVoices[0]
    const utter = new SpeechSynthesisUtterance(text)
    if (femaleTe) utter.voice = femaleTe
    utter.lang = 'te-IN'; utter.pitch = 1.65; utter.rate = 1.02
    utter.onstart = () => setIsSpeaking(true)
    utter.onend = () => setIsSpeaking(false)
    utter.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utter)
  }

  function speakAsBujjayi(fullText) {
    stopVoice()
    window._mmAudioStop = false
    const chunks = fullText.split(/(?<=[.?!।])\s+/).flatMap(s => (s.length > 165 ? s.match(/.{1,165}(\s|$)/g) || [s] : [s])).map(s => s.trim()).filter(Boolean)
    if (!chunks.length) return
    let idx = 0; setIsSpeaking(true)
    const playNext = () => {
      if (window._mmAudioStop || idx >= chunks.length) { setIsSpeaking(false); return }
      const audio = new Audio(`${API_URL}/tts/telugu?q=${encodeURIComponent(chunks[idx])}`)
      audio.playbackRate = 1.16
      window._mmAudioPlayer = audio
      idx += 1
      audio.onended = playNext
      audio.onerror = () => speakBrowserGirl(chunks.slice(idx - 1).join(' '))
      audio.play().catch(() => speakBrowserGirl(chunks.slice(idx - 1).join(' ')))
    }
    playNext()
  }
  function playOneTapTodayBriefing() {
    if (!data) return
    const mLiters = Number(data.MorningMilkLiters || 0).toFixed(2)
    const eLiters = Number(data.EveningMilkLiters || 0).toFixed(2)
    const todayPays = data.TodayPayments || []
    const payAmt = Math.round(Number(data.TodayCollectedAmount || 0))
    const dueList = data.DueCustomers || []
    const dueAmt = Math.round(Number(data.TotalDueAmount || 0))

    const milkSentence = `ఈరోజు ఉదయం ${mLiters} లీటర్ల పాలు, సాయంత్రం ${eLiters} లీటర్ల పాలు డెలివరీ అయ్యాయి.`
    const paySentence = todayPays.length === 0
      ? 'ఈరోజు ఇప్పటివరకు ఎలాంటి పేమెంట్లు రాలేదు.'
      : `ఈరోజు ${todayPays.length} మంది నుండి మొత్తం ${payAmt} రూపాయల పేమెంట్ వచ్చింది. వివరాలు: ${todayPays.map(p => `${getBestName(p)} ${Math.round(p.TotalPaid)} రూపాయలు ఇచ్చారు, దీనిని ${p.UpdatedBy === 'Admin' ? 'అడ్మిన్' : 'సుధీర్'} అప్‌డేట్ చేశారు`).join('. ')}.`
    const dueSentence = dueList.length === 0
      ? 'ప్రస్తుతం ఏ కస్టమర్‌కు పెండింగ్ బకాయి లేదు.'
      : `ఇంకా బకాయి ఇవ్వవలసిన కస్టమర్లు ${dueList.length} మంది ఉన్నారు, మొత్తం బకాయి ${dueAmt} రూపాయలు. వారి పేర్లు: ${dueList.map((c, i) => `${i + 1}. ${getBestName(c)} ${Math.round(c.TotalDue)} రూపాయలు`).join(', ')}.`

    speakAsBujjayi(`${milkSentence} ${paySentence} ${dueSentence}`)
  }

  const todayPays = data?.TodayPayments || []
  const dueList = (data?.DueCustomers || []).filter(c => {
    const q = search.toLowerCase().trim()
    return !q || [c.ReferenceName, c.CustomerName, c.CustomerCode].some(v => (v || '').toLowerCase().includes(q))
  })

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div style={{ background: 'linear-gradient(135deg, #064e3b 0%, #0f766e 100%)', color: '#fff', padding: '22px', borderRadius: '22px', boxShadow: '0 8px 24px rgba(6,78,59,0.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div onClick={playOneTapTodayBriefing} style={{ display: 'flex', alignItems: 'center', gap: '18px', flex: 1, minWidth: '260px', cursor: 'pointer' }}>
            <img src="/bujjayi.png" alt="BujjiAyyi" style={{ width: "112px", height: "112px", objectFit: "contain", borderRadius: "50%", background: "#fff", padding: "6px", border: isSpeaking ? "5px solid #facc15" : "4px solid rgba(255,255,255,0.85)", boxShadow: "0 8px 22px rgba(0,0,0,0.28)" }} />
            <div>
              <span style={{ background: 'rgba(255,255,255,0.22)', padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 800 }}>
                📅 {data?.DateFormatted || ''}
              </span>
              <h2 style={{ margin: '8px 0 4px', fontSize: '23px', fontWeight: 900, color: '#fff' }}>BujjiAyyi</h2>
              
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {isSpeaking && <button type="button" onClick={stopVoice} style={{ padding: '14px 18px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: 900, fontSize: '15px', cursor: 'pointer' }}>⏹ ఆపండి</button>}
            <button type="button" onClick={() => loadTodayReport(1)} disabled={loading} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.4)', borderRadius: '14px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>{loading ? 'లోడ్...' : '↻ రిఫ్రెష్'}</button>
          </div>
        </div>
      </div>

      {error && <div style={{ padding: '14px 18px', background: '#fee2e2', color: '#b91c1c', borderRadius: '12px', fontWeight: 800 }}>⚠️ {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div style={{ background: '#fff', padding: '18px', borderRadius: '16px', border: '1px solid #cbd5e1' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#475569' }}>🌅 ఈరోజు ఉదయం పాలు</span>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#0f4c2e', marginTop: '6px' }}>{Number(data?.MorningMilkLiters || 0).toFixed(2)} L</div>
          <span style={{ fontSize: '13px', color: '#0f766e', fontWeight: 700 }}>{data?.MorningDeliveredCount || 0} మంది కస్టమర్లకు</span>
        </div>
        <div style={{ background: '#fff', padding: '18px', borderRadius: '16px', border: '1px solid #cbd5e1' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#475569' }}>🌆 ఈరోజు సాయంత్రం పాలు</span>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#1d4ed8', marginTop: '6px' }}>{Number(data?.EveningMilkLiters || 0).toFixed(2)} L</div>
          <span style={{ fontSize: '13px', color: '#1e40af', fontWeight: 700 }}>{data?.EveningDeliveredCount || 0} మంది కస్టమర్లకు</span>
        </div>
        <div style={{ background: '#fff', padding: '18px', borderRadius: '16px', border: '1px solid #cbd5e1' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#475569' }}>💳 ఈరోజు వచ్చిన పేమెంట్లు</span>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#15803d', marginTop: '6px' }}>₹{Number(data?.TodayCollectedAmount || 0).toLocaleString('en-IN')}</div>
          <span style={{ fontSize: '13px', color: '#166534', fontWeight: 700 }}>{todayPays.length} మంది ఇచ్చారు</span>
        </div>
        <div style={{ background: '#fff', padding: '18px', borderRadius: '16px', border: '1px solid #cbd5e1' }}>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#475569' }}>📌 మొత్తం బకాయి (Only Due)</span>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#b45309', marginTop: '6px' }}>₹{Number(data?.TotalDueAmount || 0).toLocaleString('en-IN')}</div>
          <span style={{ fontSize: '13px', color: '#92400e', fontWeight: 700 }}>{data?.DueCustomerCount || 0} మంది ఇవ్వవలసి ఉంది</span>
        </div>
      </div>
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #cbd5e1', padding: '18px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '19px', color: '#0f172a' }}>💳 ఈరోజు పేమెంట్లు & అప్‌డేట్ చేసినవారు ({todayPays.length})</h3>
        {todayPays.length === 0 ? <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '16px', fontWeight: 600 }}>ఈరోజు ఇంకా పేమెంట్లు నమోదు కాలేదు.</div> : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {todayPays.map((p, idx) => {
              const isAdmin = p.UpdatedBy === 'Admin'
              return (
                <div key={p.PaymentID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '14px 16px', borderRadius: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{idx + 1}. {getBestName(p)} <span style={{ fontSize: '13.5px', color: '#475569' }}>({p.CustomerCode})</span></div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '5px' }}>
                      <span style={{ fontSize: '13.5px', color: '#166534', fontWeight: 700 }}>విధానం: {p.PaymentMode === 'Cash' ? 'నగదు (Cash)' : p.PaymentMode}</span>
                      <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 800, background: isAdmin ? '#dcfce7' : '#e0f2fe', color: isAdmin ? '#15803d' : '#0369a1' }}>{isAdmin ? '🛡️ అప్‌డేట్: Admin' : '👤 అప్‌డేట్: సుధీర్ (Sudheer)'}</span>
                      {p.UpdatedAt && <span style={{ fontSize: '12.5px', color: '#475569', fontWeight: 600 }}>🕒 {p.UpdatedAt}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: '23px', fontWeight: 900, color: '#15803d' }}>₹{Number(p.TotalPaid || 0).toLocaleString('en-IN')}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #cbd5e1', padding: '18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '19px', color: '#0f172a' }}>📌 బకాయి రిపోర్ట్ — Only Due Customers ({dueList.length})</h3>
          <input type="text" placeholder="🔍 పేరు వెతకండి..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '9px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', minWidth: '190px' }} />
        </div>
        {dueList.length === 0 ? <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '16px', fontWeight: 600 }}>బకాయి ఉన్న కస్టమర్లు లేరు.</div> : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {dueList.map((c, idx) => (
              <div key={c.CustomerID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '14px 16px', borderRadius: '14px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>{idx + 1}. {getBestName(c)} <span style={{ fontSize: '13.5px', color: '#64748b' }}>({c.CustomerCode})</span></div>
                  <div style={{ fontSize: '14px', color: '#475569', fontWeight: 600, marginTop: '4px' }}>పాత బకాయి: ₹{Math.round(c.OpeningDue).toLocaleString('en-IN')} • పాలు: ₹{Math.round(c.MilkDue).toLocaleString('en-IN')} • వెన్నపూస: ₹{Math.round(c.VeenaPusaDue).toLocaleString('en-IN')}</div>
                </div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#b91c1c' }}>₹{Number(c.TotalDue || 0).toLocaleString('en-IN')}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
