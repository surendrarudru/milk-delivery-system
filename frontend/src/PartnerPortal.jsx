import { useEffect, useState } from 'react'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://' + 'milk-delivery-api-bn26' + '.onrender.com')
const getBestName = item => (item?.DisplayName || item?.ReferenceName || item?.CustomerName || '').trim()

function BujjayiAvatar({ speaking }) {
  return (
    <div style={{ position: 'relative', width: '92px', height: '92px', flexShrink: 0 }}>
      <svg viewBox="0 0 120 120" width="92" height="92" style={{ borderRadius: '50%', background: '#fef3c7', border: speaking ? '4px solid #facc15' : '3px solid rgba(255,255,255,0.6)', boxShadow: '0 6px 18px rgba(0,0,0,0.22)' }}>
        <circle cx="24" cy="48" r="14" fill="#1e1b18" />
        <circle cx="96" cy="48" r="14" fill="#1e1b18" />
        <circle cx="33" cy="42" r="5" fill="#ec4899" />
        <circle cx="87" cy="42" r="5" fill="#ec4899" />
        <circle cx="60" cy="54" r="34" fill="#1e1b18" />
        <path d="M28 114 C32 90, 88 90, 92 114 Z" fill="#ec4899" />
        <path d="M44 94 L60 106 L76 94 Z" fill="#facc15" />
        <circle cx="60" cy="62" r="26" fill="#fcd5b5" />
        <path d="M35 56 C42 36, 78 36, 85 56 C74 46, 46 46, 35 56 Z" fill="#1e1b18" />
        <circle cx="60" cy="52" r="2.6" fill="#dc2626" />
        <circle cx="50" cy="61" r="3.4" fill="#1e1b18" />
        <circle cx="70" cy="61" r="3.4" fill="#1e1b18" />
        <circle cx="51" cy="60" r="1.1" fill="#ffffff" />
        <circle cx="71" cy="60" r="1.1" fill="#ffffff" />
        <circle cx="43" cy="68" r="4" fill="#f472b6" opacity="0.45" />
        <circle cx="77" cy="68" r="4" fill="#f472b6" opacity="0.45" />
        {speaking ? (
          <ellipse cx="60" cy="74" rx="5.5" ry="4.5" fill="#be123c" />
        ) : (
          <path d="M52 72 Q60 80 68 72" stroke="#be123c" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        )}
      </svg>
      <span style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', background: '#facc15', color: '#0f172a', fontSize: '11px', fontWeight: 900, padding: '2px 9px', borderRadius: '999px', whiteSpace: 'nowrap', boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }}>
        బుజ్జాయి
      </span>
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

  useEffect(() => {
    loadTodayReport()
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices()
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices()
    }
  }, [])

  function stopVoice() {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (window._mmAudioPlayer) {
      window._mmAudioPlayer.pause()
      window._mmAudioPlayer = null
    }
    window._mmAudioStop = true
    setIsSpeaking(false)
  }

  function speakBrowserGirl(text) {
    if (!('speechSynthesis' in window)) { setIsSpeaking(false); return }
    const voices = window.speechSynthesis.getVoices()
    const teVoices = voices.filter(v => v.lang.toLowerCase().includes('te'))
    const femaleTe = teVoices.find(v => /shruti|google|female|woman|girl|lekha|kalpana/i.test(v.name) && !/mohan|male|man/i.test(v.name)) || teVoices[0]
    const utter = new SpeechSynthesisUtterance(text)
    if (femaleTe) utter.voice = femaleTe
    utter.lang = 'te-IN'
    utter.pitch = 1.65
    utter.rate = 1.02
    utter.onstart = () => setIsSpeaking(true)
    utter.onend = () => setIsSpeaking(false)
    utter.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utter)
  }

  function speakAsBujjayi(fullText) {
    stopVoice()
    window._mmAudioStop = false
    const chunks = fullText
      .split(/(?<=[.?!।])\s+/)
      .flatMap(s => (s.length > 165 ? s.match(/.{1,165}(\s|$)/g) || [s] : [s]))
      .map(s => s.trim())
      .filter(Boolean)
    if (!chunks.length) return

    let idx = 0
    setIsSpeaking(true)
    const playNext = () => {
      if (window._mmAudioStop || idx >= chunks.length) { setIsSpeaking(false); return }
      const url = `${API_URL}/tts/telugu?q=${encodeURIComponent(chunks[idx])}`
      const audio = new Audio(url)
      audio.playbackRate = 1.15
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
    const todayPays = data?.TodayPayments || []
  const dueList = (data?.DueCustomers || []).filter(c => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return [c.ReferenceName, c.CustomerName, c.CustomerCode].some(v => (v || '').toLowerCase().includes(q))
  })

  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div style={{ background: 'linear-gradient(135deg, #064e3b 0%, #0f766e 100%)', color: '#fff', padding: '22px', borderRadius: '22px', boxShadow: '0 8px 24px rgba(6,78,59,0.22)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: '250px' }}>
            <BujjayiAvatar speaking={isSpeaking} />
            <div>
              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 800 }}>
                📅 ఈరోజు రిపోర్ట్ ({data?.DateFormatted || ''}) • Read-Only
              </span>
              <h2 style={{ margin: '8px 0 4px', fontSize: '22px', fontWeight: 900 }}>బుజ్జాయి వాయిస్ అసిస్టెంట్</h2>
              <p style={{ margin: 0, fontSize: '14px', color: '#ccfbf1', lineHeight: 1.4 }}>
                ఒక్క బటన్ నొక్కితే ఈరోజు ఉదయం & సాయంత్రం పాలు, పేమెంట్లు (ఎవరు అప్‌డేట్ చేశారు), మరియు బకాయి కస్టమర్ల వివరాలు వినిపిస్తాయి.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button type="button" onClick={playOneTapTodayBriefing} disabled={loading || !data} style={{ padding: '16px 22px', background: '#facc15', color: '#0f172a', border: 'none', borderRadius: '14px', fontWeight: 900, fontSize: '17px', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.22)' }}>
              {isSpeaking ? '🔊 బుజ్జాయి చెబుతోంది...' : '🔊 ఈరోజు వివరాలు వినండి'}
            </button>
            {isSpeaking && (
              <button type="button" onClick={stopVoice} style={{ padding: '16px 18px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '14px', fontWeight: 900, fontSize: '15px', cursor: 'pointer' }}>
                ⏹ ఆపండి
              </button>
            )}
            <button type="button" onClick={loadTodayReport} disabled={loading} style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.18)', color: '#fff', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '14px', fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}>
              {loading ? 'లోడ్...' : '↻ రిఫ్రెష్'}
            </button>
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
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#475569' }}>📌 మిగిలిన మొత్తం బకాయి</span>
          <div style={{ fontSize: '28px', fontWeight: 900, color: '#b45309', marginTop: '6px' }}>₹{Number(data?.TotalDueAmount || 0).toLocaleString('en-IN')}</div>
          <span style={{ fontSize: '13px', color: '#92400e', fontWeight: 700 }}>{data?.DueCustomerCount || 0} మంది ఇవ్వవలసి ఉంది</span>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid #cbd5e1', padding: '18px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '19px', color: '#0f172a' }}>💳 ఈరోజు పేమెంట్లు & అప్‌డేట్ చేసినవారు ({todayPays.length})</h3>
        {todayPays.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '16px', fontWeight: 600 }}>ఈరోజు ఇంకా పేమెంట్లు నమోదు కాలేదు.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {todayPays.map((p, idx) => {
              const isAdmin = p.UpdatedBy === 'Admin'
              return (
                <div key={p.PaymentID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '14px 16px', borderRadius: '14px', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                      {idx + 1}. {getBestName(p)} <span style={{ fontSize: '13.5px', color: '#475569' }}>({p.CustomerCode})</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '5px' }}>
                      <span style={{ fontSize: '13.5px', color: '#166534', fontWeight: 700 }}>విధానం: {p.PaymentMode === 'Cash' ? 'నగదు (Cash)' : p.PaymentMode}</span>
                      <span style={{ padding: '3px 10px', borderRadius: '999px', fontSize: '12.5px', fontWeight: 800, background: isAdmin ? '#dcfce7' : '#e0f2fe', color: isAdmin ? '#15803d' : '#0369a1' }}>
                        {isAdmin ? '🛡️ అప్‌డేట్: Admin' : '👤 అప్‌డేట్: సుధీర్ (Sudheer)'}
                      </span>
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
          <h3 style={{ margin: 0, fontSize: '19px', color: '#0f172a' }}>📌 బకాయి ఇవ్వవలసిన కస్టమర్లు ({dueList.length})</h3>
          <input type="text" placeholder="🔍 పేరు వెతకండి..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '9px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '15px', minWidth: '190px' }} />
        </div>
        {dueList.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '16px', fontWeight: 600 }}>బకాయి ఉన్న కస్టమర్లు లేరు.</div>
        ) : (
          <div style={{ display: 'grid', gap: '10px' }}>
            {dueList.map((c, idx) => (
              <div key={c.CustomerID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', padding: '14px 16px', borderRadius: '14px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
                    {idx + 1}. {getBestName(c)} <span style={{ fontSize: '13.5px', color: '#64748b' }}>({c.CustomerCode})</span>
                  </div>
                  <div style={{ fontSize: '14px', color: '#475569', fontWeight: 600, marginTop: '4px' }}>
                    పాత బకాయి: ₹{Math.round(c.OpeningDue)} • పాలు: ₹{Math.round(c.MilkDue)} • వెన్నపూస: ₹{Math.round(c.VeenaPusaDue)}
                  </div>
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
}