import { useEffect, useMemo, useState } from 'react'
import './CustomerMaster.css'

const isLocal = window.location.hostname === 'localhost' || window.location.hostname.startsWith('192.168.')
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? 'http://' + window.location.hostname + ':8000' : 'https://onrender.com')
const STORAGE_KEY = 'milk_manager_veenapusa_ads_sent'
const POSTER_STORAGE_KEY = 'milk_manager_template_posters_v2'

const VERIFIED_FESTIVALS = [
  { date: '2026-11-20', name: 'దేవుత్తని ఏకాదశి (Devuttani Ekadashi)', wish: 'పవిత్ర దేవుత్తని ఏకాదశి శుభాకాంక్షలు! శ్రీమహావిష్ణువు ఆశీస్సులతో మీ ఇంట సుఖశాంతులు వెల్లివిరియాలని కోరుకుంటున్నాము. 🙏✨' },
  { date: '2026-11-24', name: 'కార్తీక పౌర్ణమి (Karthika Pournami)', wish: 'పవిత్ర కార్తీక పౌర్ణమి శుభాకాంక్షలు! ఆ పరమేశ్వరుని కృపతో మీ కుటుంబం ఎల్లప్పుడూ ఆయురారోగ్యాలతో వర్ధిల్లాలని కోరుకుంటున్నాము. 🪔🙏' },
  { date: '2026-12-08', name: 'కార్తీక అమావాస్య (Karthika Amavasya)', wish: 'కార్తీక అమావాస్య శుభాకాంక్షలు! మీ కుటుంబంలో శాంతి, ఐశ్వర్యం కలగాలని కోరుకుంటున్నాము. 🪔✨' },
  { date: '2026-12-20', name: 'వైకుంఠ ఏకాదశి (Vaikuntha Ekadashi)', wish: 'పవిత్ర వైకుంఠ ఏకాదశి శుభాకాంక్షలు! శ్రీమన్నారాయణుని ఆశీస్సులు మీకు ఎల్లప్పుడూ ఉండాలని కోరుకుంటున్నాము. 🙏✨' },
  { date: '2026-12-25', name: 'క్రిస్మస్ (Christmas)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు క్రిస్మస్ శుభాకాంక్షలు! శాంతి, సంతోషాలతో పండుగ జరుపుకోవాలని కోరుకుంటున్నాము. 🎄✨' },
  { date: '2027-01-01', name: 'నూతన సంవత్సరం (New Year 2027)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు 2027 నూతన సంవత్సర శుభాకాంక్షలు! 🎉✨' },
  { date: '2027-01-14', name: 'భోగి (Bhogi)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు భోగి పండుగ శుభాకాంక్షలు! 🔥🌾' },
  { date: '2027-01-15', name: 'మకర సంక్రాంతి (Makar Sankranti)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు మకర సంక్రాంతి శుభాకాంక్షలు! 🪁🌾' },
  { date: '2027-01-16', name: 'కనుమ (Kanuma)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు కనుమ పండుగ శుభాకాంక్షలు! 🐄🌾' },
  { date: '2027-01-24', name: 'షబ్-ఎ-బరాత్ (Shab-e-Barat)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు షబ్-ఎ-బరాత్ శుభాకాంక్షలు! అల్లాహ్ కృపతో మీ ఇంట శాంతి, సంతోషాలు కలగాలని కోరుకుంటున్నాము. 🌙🤲' },
  { date: '2027-01-26', name: 'గణతంత్ర దినోత్సవం (Republic Day)', wish: 'గణతంత్ర దినోత్సవ శుభాకాంక్షలు! జై హింద్. 🇮🇳✨' },
  { date: '2027-02-08', name: 'రంజాన్ ప్రారంభం (Ramadan Mubarak)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు పవిత్ర రంజాన్ మాస శుభాకాంక్షలు! రంజాన్ ముబారక్. 🌙✨' },
  { date: '2027-02-11', name: 'వసంత పంచమి (Vasant Panchami)', wish: 'వసంత పంచమి శుభాకాంక్షలు! సరస్వతీ దేవి ఆశీస్సులతో మీ ఇంట జ్ఞానం, ఐశ్వర్యం కలగాలని కోరుకుంటున్నాము. 🙏🌼' },
  { date: '2027-03-06', name: 'మహా శివరాత్రి (Maha Shivaratri)', wish: 'మహా శివరాత్రి శుభాకాంక్షలు! ఆ పరమశివుని ఆశీస్సులతో మీ కుటుంబం సుఖసంతోషాలతో ఉండాలని కోరుకుంటున్నాము. 🔱🙏' },
  { date: '2027-03-10', name: 'ఈద్-ఉల్-ఫిత్ర్ / రంజాన్ (Eid-ul-Fitr)', wish: 'ఈద్ ముబారక్! అల్లాహ్ ఆశీస్సులతో మీ ఇంట ఆయురారోగ్యాలు, సుఖసంతోషాలు వెల్లివిరియాలని కోరుకుంటున్నాము. 🌙🤲' },
  { date: '2027-03-22', name: 'హోలీ (Holi)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు హోలీ పండుగ శుభాకాంక్షలు! 🎨✨' },
  { date: '2027-03-26', name: 'గుడ్ ఫ్రైడే (Good Friday)', wish: 'పవిత్ర గుడ్ ఫ్రైడే సందర్భంగా మీ కుటుంబంలో శాంతి, కరుణ వెల్లివిరియాలని కోరుకుంటున్నాము. ✝️🙏' },
  { date: '2027-03-28', name: 'ఈస్టర్ (Easter Sunday)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు హ్యాపీ ఈస్టర్ శుభాకాంక్షలు! శాంతి, ఆనందాలతో పండుగ జరుపుకోవాలని కోరుకుంటున్నాము. ✝️🌸' },
  { date: '2027-04-07', name: 'ఉగాది (Ugadi)', wish: 'శ్రీ ప్లవంగ నామ సంవత్సర ఉగాది శుభాకాంక్షలు! 🥭🌿' },
  { date: '2027-04-15', name: 'శ్రీరామ నవమి (Sri Rama Navami)', wish: 'శ్రీరామ నవమి శుభాకాంక్షలు! 🙏🏹' },
  { date: '2027-05-17', name: 'బక్రీద్ (Eid-ul-Adha)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు బక్రీద్ శుభాకాంక్షలు! ఈద్ ముబారక్. 🌙✨' },
  { date: '2027-06-06', name: 'మొహర్రం (Muharram)', wish: 'మొహర్రం శుభాకాంక్షలు! మీ కుటుంబంలో శాంతి, సంతోషాలు కలగాలని కోరుకుంటున్నాము. 🌙🤲' },
  { date: '2027-08-13', name: 'వరలక్ష్మీ వ్రతం (Varalakshmi Vratam)', wish: 'వరలక్ష్మీ వ్రత శుభాకాంక్షలు! 🙏🪷' },
  { date: '2027-08-15', name: 'స్వాతంత్ర్య దినోత్సవం & మిలాద్-ఉన్-నబీ', wish: 'స్వాతంత్ర్య దినోత్సవ మరియు మిలాద్-ఉన్-నబీ శుభాకాంక్షలు! 🇮🇳🌙' },
  { date: '2027-09-04', name: 'వినాయక చవితి (Vinayaka Chavithi)', wish: 'వినాయక చవితి శుభాకాంక్షలు! 🙏🐘' },
  { date: '2027-10-09', name: 'విజయదశమి / దసరా (Vijaya Dashami)', wish: 'విజయదశమి శుభాకాంక్షలు! 🙏🏹' },
  { date: '2027-10-29', name: 'దీపావళి (Deepavali)', wish: 'దీపావళి శుభాకాంక్షలు! 🪔✨' }
]

const FIXED_SOLAR = [
  { md: '01-01', name: 'నూతన సంవత్సరం (New Year)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు నూతన సంవత్సర శుభాకాంక్షలు! 🎉✨' },
  { md: '01-14', name: 'భోగి (Bhogi)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు భోగి పండుగ శుభాకాంక్షలు! 🔥🌾' },
  { md: '01-15', name: 'మకర సంక్రాంతి (Makar Sankranti)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు మకర సంక్రాంతి శుభాకాంక్షలు! 🪁🌾' },
  { md: '01-16', name: 'కనుమ (Kanuma)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు కనుమ పండుగ శుభాకాంక్షలు! 🐄🌾' },
  { md: '01-26', name: 'గణతంత్ర దినోత్సవం (Republic Day)', wish: 'గణతంత్ర దినోత్సవ శుభాకాంక్షలు! జై హింద్. 🇮🇳✨' },
  { md: '08-15', name: 'స్వాతంత్ర్య దినోత్సవం (Independence Day)', wish: 'స్వాతంత్ర్య దినోత్సవ శుభాకాంక్షలు! జై హింద్. 🇮🇳✨' },
  { md: '12-25', name: 'క్రిస్మస్ (Christmas)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు క్రిస్మస్ శుభాకాంక్షలు! 🎄✨' }
]

const getTodayStr = () => new Date().toLocaleDateString('en-CA')
const getDiffDays = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000)

export default function MarketingAds() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectedDate, setSelectedDate] = useState(getTodayStr())
  const [selectedFestivalDate, setSelectedFestivalDate] = useState('AUTO')
  const [templateMode, setTemplateMode] = useState('AUTO')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('ActiveWhatsApp')
  const [reminderDays, setReminderDays] = useState(5)
  const [liveFestivals, setLiveFestivals] = useState([])
  const [syncStatus, setSyncStatus] = useState('Syncing calendar...')
  const [postersByMode, setPostersByMode] = useState(() => {
    try { return JSON.parse(localStorage.getItem(POSTER_STORAGE_KEY) || '{}') } catch { return {} }
  })
  const [sentLog, setSentLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
  })
  const [autoRunning, setAutoRunning] = useState(false)
  const [autoSentCount, setAutoSentCount] = useState(0)
  const [autoTotalCount, setAutoTotalCount] = useState(0)
  const [secLeft, setSecLeft] = useState(10)

  useEffect(() => {
    setLoading(true)
    fetch(API_URL + '/customers').then(r => r.json()).then(d => setCustomers(Array.isArray(d) ? d : [])).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    let active = true
    async function syncAllCalendars() {
      const y = Number(selectedDate.slice(0, 4))
      const m = Number(selectedDate.slice(5, 7))
      const nm = m === 12 ? 1 : m + 1
      const ny = m === 12 ? y + 1 : y
      const items = []
      try {
        const res = await fetch('https://nager.at' + y + '/IN')
        if (res.ok) (await res.json()).forEach(i => items.push({ date: i.date, name: i.localName || i.name, wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు ' + (i.localName || i.name) + ' శుభాకాంక్షలు! 🙏✨' }))
      } catch {}
      for (const [hy, hm] of [[y, m], [ny, nm]]) {
        try {
          const hRes = await fetch('https://aladhan.com' + hm + '/' + hy)
          if (hRes.ok) {
            const hData = (await hRes.json()).data || []
            hData.forEach(d => {
              const mNum = Number(d?.hijri?.month?.number)
              const dNum = Number(d?.hijri?.day)
              const g = String(d?.gregorian?.date || '').split('-')
              if (g.length === 3) {
                const iso = g.at(2) + '-' + g.at(1) + '-' + g.at(0)
                if (mNum === 9 && dNum === 1) items.push({ date: iso, name: 'రంజాన్ ప్రారంభం (Ramadan Mubarak)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు పవిత్ర రంజాన్ శుభాకాంక్షలు! రంజాన్ ముబారక్. 🌙✨' })
                if (mNum === 10 && dNum === 1) items.push({ date: iso, name: 'ఈద్-ఉల్-ఫిత్ర్ / రంజాన్ (Eid-ul-Fitr)', wish: 'ఈద్ ముబారక్! అల్లాహ్ ఆశీస్సులతో మీ ఇంట సుఖసంతోషాలు వెల్లివిరియాలని కోరుకుంటున్నాము. 🌙🤲' })
                if (mNum === 12 && dNum === 10) items.push({ date: iso, name: 'బక్రీద్ (Eid-ul-Adha)', wish: 'మీకు మరియు మీ కుటుంబ సభ్యులకు బక్రీద్ శుభాకాంక్షలు! ఈద్ ముబారక్. 🌙✨' })
                if (mNum === 1 && dNum === 1) items.push({ date: iso, name: 'మొహర్రం (Muharram)', wish: 'మొహర్రం శుభాకాంక్షలు! మీ కుటుంబంలో శాంతి, సంతోషాలు కలగాలని కోరుకుంటున్నాము. 🌙🤲' })
                if (mNum === 3 && dNum === 12) items.push({ date: iso, name: 'మిలాద్-ఉన్-నబీ (Milad-un-Nabi)', wish: 'మిలాద్-ఉన్-నబీ శుభాకాంక్షలు! మీ కుటుంబంలో శాంతి, సంతోషాలు కలగాలని కోరుకుంటున్నాము. 🌙✨' })
              }
            })
          }
        } catch {}
      }
      if (active) { setLiveFestivals(items); setSyncStatus(items.length ? 'Live Calendar Synced' : 'Offline Calendar Active') }
    }
    syncAllCalendars()
    return () => { active = false }
  }, [selectedDate])
  const upcomingFestivals = useMemo(() => {
    const y = Number(selectedDate.slice(0, 4))
    const solar = [y, y + 1].flatMap(yr => FIXED_SOLAR.map(f => ({ date: yr + '-' + f.md, name: f.name, wish: f.wish })))
    const map = new Map()
    ;[...VERIFIED_FESTIVALS, ...solar, ...liveFestivals].forEach(f => {
      const diff = getDiffDays(selectedDate, f.date)
      if (diff >= 0 && diff <= 30 && !map.has(f.date)) map.set(f.date, f)
    })
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [selectedDate, liveFestivals])

  const activeFestival = useMemo(() => {
    if (!upcomingFestivals.length) return null
    if (selectedFestivalDate === 'AUTO') return upcomingFestivals.at(0)
    return upcomingFestivals.find(f => f.date === selectedFestivalDate) || upcomingFestivals.at(0)
  }, [upcomingFestivals, selectedFestivalDate])

  const resolvedMode = useMemo(() => {
    if (templateMode !== 'AUTO') return templateMode
    if (!activeFestival) return 'FRESH_BATCH'
    const diff = getDiffDays(selectedDate, activeFestival.date)
    if (diff === 0) return 'WISH_ONLY'
    if (diff > 0 && diff <= 6) return 'PRE_FESTIVAL_AD'
    return 'FRESH_BATCH'
  }, [templateMode, activeFestival, selectedDate])

  const activePoster = resolvedMode === 'WISH_ONLY' ? '' : (postersByMode[resolvedMode] || '')

  function handlePosterUpload(e) {
    const file = e.target.files?.item(0)
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const updated = { ...postersByMode, [resolvedMode]: String(reader.result || '') }
      setPostersByMode(updated)
      try { localStorage.setItem(POSTER_STORAGE_KEY, JSON.stringify(updated)) } catch {}
      setNotice('Poster saved for ' + resolvedMode + ' template!')
    }
    reader.readAsDataURL(file)
  }

  function removePoster() {
    const updated = { ...postersByMode, [resolvedMode]: '' }
    setPostersByMode(updated)
    try { localStorage.setItem(POSTER_STORAGE_KEY, JSON.stringify(updated)) } catch {}
  }

  function buildTeluguMessage(customer) {
    const name = customer.CustomerName || 'Customer'
    if (resolvedMode === 'WISH_ONLY' && activeFestival) {
      return 'నమస్తే *' + name + '* గారు! 🙏\n' + activeFestival.wish + '\n\n -మీ డైరీ ఫామ్ 🥛'
    }
    if (resolvedMode === 'OFFER_20') {
      return (
        'నమస్తే *' + name + '* గారు! 🙏\n' +
        '🏷️ *ప్రత్యేక 20% తగ్గింపు (20% OFF) ఆఫర్!*\n' +
        '🧈 స్వచ్ఛమైన, కల్తీ లేని వెన్నపూస పై ప్రత్యేక 20% ఆఫర్ అందుబాటులో ఉంది.\n\n' +
        'ఆర్డర్ కోసం ఇప్పుడే రిప్లై ఇవ్వండి లేదా మార్నింగ్/ఈవినింగ్ డెలివరీ బాయ్ కి చెప్పండి. 😊'
      )
    }
    if (resolvedMode === 'PRE_FESTIVAL_AD' && activeFestival) {
      return (
        'నమస్తే *' + name + '* గారు! 🙏\n' +
        'రాబోయే *' + activeFestival.name + '* సందర్భంగా మీకు ముందస్తు శుభాకాంక్షలు! 🎉\n' +
        '🧈 పండుగ సందర్భంగా స్వచ్ఛమైన వెన్నపూస ఫ్రెష్ స్టాక్ సిద్ధంగా ఉంది!\n\n' +
        'ఆర్డర్ కోసం ఇప్పుడే రిప్లై ఇవ్వండి లేదా డెలివరీ బాయ్ కి చెప్పండి. 😊'
      )
    }
    return (
      'నమస్తే *' + name + '* గారు! 🙏\n' +
      '🧈 *ఫ్రెష్ వెన్నపూస సిద్ధంగా ఉంది!*\n' +
      'ఈరోజు తయారు చేసిన స్వచ్ఛమైన, కల్తీ లేని వెన్నపూస అందుబాటులో ఉంది.\n\n' +
      'ఆర్డర్ కోసం ఇప్పుడే రిప్లై ఇవ్వండి లేదా మార్నింగ్/ఈవినింగ్ డెలివరీ బాయ్ కి చెప్పండి. 😊'
    )
  }

  const getDaysAgo = id => (sentLog[id] ? getDiffDays(sentLog[id], selectedDate) : null)
  const markSent = ids => {
    const next = { ...sentLog }
    ids.forEach(id => { next[id] = selectedDate })
    setSentLog(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
  }

  const filteredCustomers = customers.filter(c => {
    const q = search.toLowerCase().trim()
    const matchQ = !q || [c.CustomerName, c.CustomerCode, c.ReferenceName, c.MobileNumber].some(v => (v || '').toLowerCase().includes(q))
    const ago = getDaysAgo(c.CustomerID)
    const isDue = ago === null || ago >= Number(reminderDays || 5)
    if (filter === 'ActiveWhatsApp') return matchQ && c.IsActive && Boolean(c.MobileNumber)
    if (filter === 'DueReminder') return matchQ && c.IsActive && Boolean(c.MobileNumber) && isDue
    if (filter === 'Morning') return matchQ && c.IsActive && c.MorningDelivery
    if (filter === 'Evening') return matchQ && c.IsActive && c.EveningDelivery
    return matchQ
  })

  useEffect(() => {
    if (!autoRunning) return
    const t = setInterval(() => {
      setSecLeft(s => {
        if (s <= 1) {
          setAutoSentCount(c => {
            if (c + 1 >= autoTotalCount) { setAutoRunning(false); return autoTotalCount }
            return c + 1
          })
          return 15
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [autoRunning, autoTotalCount])

  async function startOneTapAutoSend() {
    const targets = filteredCustomers.filter(c => String(c.MobileNumber || '').replace(/\D/g, '').length >= 10)
    if (!targets.length) return alert('No customers with valid mobile numbers in this filter.')
    if (!window.confirm('Send ' + resolvedMode + ' message' + (activePoster ? ' + Poster Image' : '') + ' to all ' + targets.length + ' customers automatically (10-sec gap)?')) return

    const items = targets.map(c => ({ CustomerID: c.CustomerID, CustomerName: c.CustomerName, MobileNumber: c.MobileNumber, MessageText: buildTeluguMessage(c) }))
    markSent(targets.map(c => c.CustomerID))
    setAutoTotalCount(targets.length); setAutoSentCount(1); setSecLeft(15); setAutoRunning(true)
    setNotice('🚀 Auto-sending to ' + targets.length + ' customers via WhatsApp Desktop (10s gap)...')

    await fetch(API_URL + '/marketing/auto-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', items, posterImage: activePoster })
    }).catch(() => {})
  }

  async function stopAutoSend() {
    setAutoRunning(false)
    await fetch(API_URL + '/marketing/auto-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'stop' }) }).catch(() => {})
    setNotice('⏸ Auto-send stopped.')
  }

  function sendSingle(customer) {
    const clean = String(customer.MobileNumber || '').replace(/\D/g, '')
    if (clean.length < 10) return
    markSent([customer.CustomerID])
    window.location.href = 'whatsapp://send?phone=91' + clean.slice(-10) + '&text=' + encodeURIComponent(buildTeluguMessage(customer))
  }
  const sample = filteredCustomers.at(0) || { CustomerName: 'Madhu' }
  const modePills = [
    ['AUTO', '✨ Auto Smart'],
    ['WISH_ONLY', '🎉 Festival Wish Only'],
    ['PRE_FESTIVAL_AD', '📣 Advance Festival Ad'],
    ['FRESH_BATCH', '🧈 New Fresh Batch'],
    ['OFFER_20', '🏷️ 20% Off Offer']
  ]

  return (
    <div className="customer-master" style={{ textAlign: 'left' }}>
      <div className="customer-master-header">
        <div>
          <h2>Veenapusa Ads & Festival Wishes</h2>
          <p>Hindu, Christian & Muslim Calendar • Template Posters • One-Tap 10s Auto-Send (No Price)</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="admin-badge">{syncStatus}</span>
          {!autoRunning ? (
            <button type="button" className="add-customer-btn" style={{ background: '#15803d' }} onClick={startOneTapAutoSend}>
              🚀 One-Tap Auto-Send All ({filteredCustomers.length})
            </button>
          ) : (
            <button type="button" className="add-customer-btn" style={{ background: '#dc2626' }} onClick={stopAutoSend}>
              ⏹ Stop Auto-Send ({autoSentCount}/{autoTotalCount} • {secLeft}s)
            </button>
          )}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {modePills.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTemplateMode(id)} style={{ padding: '9px 14px', borderRadius: '9px', fontWeight: 700, fontSize: '13px', cursor: 'pointer', border: templateMode === id ? '2px solid #0f766e' : '1px solid #cbd5e1', background: templateMode === id ? '#0f766e' : '#f8fafc', color: templateMode === id ? '#fff' : '#334155' }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
          <div className="form-group">
            <label>Campaign Date</label>
            <input type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setSelectedFestivalDate('AUTO') }} />
          </div>
          <div className="form-group">
            <label>Upcoming Festivals (Next 30 Days)</label>
            <select value={selectedFestivalDate} onChange={e => setSelectedFestivalDate(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <option value="AUTO">{upcomingFestivals.length ? 'Auto: ' + upcomingFestivals.at(0).name + ' (' + upcomingFestivals.at(0).date + ')' : 'No Festivals in Next 30 Days'}</option>
              {upcomingFestivals.map(f => <option key={f.date} value={f.date}>{f.date} — {f.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Ad Reminder Interval (Days)</label>
            <input type="number" min="1" max="30" value={reminderDays} onChange={e => setReminderDays(Number(e.target.value || 5))} />
          </div>
          {resolvedMode !== 'WISH_ONLY' && (
            <div className="form-group">
              <label>Upload Poster for {resolvedMode} (PNG / JPG)</label>
              <input type="file" accept="image/*" onChange={handlePosterUpload} />
            </div>
          )}
        </div>

        <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: activePoster ? '170px 1fr' : '1fr', gap: '16px', background: '#f8fafc', padding: '14px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          {activePoster && (
            <div>
              <img src={activePoster} alt="Template Poster" style={{ width: '100%', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
              <button type="button" className="cancel-btn" style={{ width: '100%', marginTop: '6px', padding: '5px', fontSize: '12px' }} onClick={removePoster}>Remove Poster</button>
            </div>
          )}
          <div>
            <strong style={{ color: '#0f4c2e', fontSize: '13px' }}>Live Telugu Preview ({resolvedMode} • Sample: {sample.CustomerName}):</strong>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '13.5px', color: '#1e293b', margin: '8px 0 0', background: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              {buildTeluguMessage(sample)}
            </pre>
          </div>
        </div>
      </div>

      {notice && <div className="customer-success">{notice}</div>}

      <div className="customer-toolbar">
        <input type="text" placeholder="Search customer name, code, reference, mobile..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="ActiveWhatsApp">Active with Mobile ({customers.filter(c => c.IsActive && c.MobileNumber).length})</option>
          <option value="DueReminder">Due for Reminder ({reminderDays}+ days)</option>
          <option value="Morning">Morning Customers</option>
          <option value="Evening">Evening Customers</option>
          <option value="All">All Customers</option>
        </select>
      </div>

      {loading ? <p>Loading customers...</p> : (
        <div className="customer-grid">
          {filteredCustomers.map(c => {
            const ago = getDaysAgo(c.CustomerID)
            const st = ago === null ? 'Never Sent' : ago === 0 ? 'Sent Today' : 'Sent ' + ago + 'd ago'
            return (
              <div className="customer-card" key={c.CustomerID} style={{ cursor: 'default' }}>
                <div className="customer-card-header">
                  <h3>{c.CustomerName || 'Unnamed Customer'}</h3>
                  <span className={'card-payment-status ' + (ago === 0 ? 'no-due' : 'partial')}>{st}</span>
                </div>
                <p><strong>Code:</strong> {c.CustomerCode} | <strong>Ref:</strong> {c.ReferenceName || '-'}</p>
                <p><strong>Mobile:</strong> {c.MobileNumber || 'No Mobile'}</p>
                <div className="customer-card-actions">
                  <button type="button" disabled={!c.MobileNumber} style={{ width: '100%', background: c.MobileNumber ? '#168568' : '#cbd5e1', color: '#fff', border: 'none' }} onClick={() => sendSingle(c)}>
                    {resolvedMode === 'WISH_ONLY' ? '🎉 Send Festival Wish' : '💬 Send Template Msg'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
