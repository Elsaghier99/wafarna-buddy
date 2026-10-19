import { useState, useRef, useEffect } from 'react'
import Head from 'next/head'
import { supabase } from '../lib/supabase'

const COUNTRIES = [
  { code: 'EG', name: 'Egypt', name_ar: 'مصر', flag: '🇪🇬', currency: 'EGP' },
  { code: 'AE', name: 'UAE', name_ar: 'الإمارات', flag: '🇦🇪', currency: 'AED' },
  { code: 'SA', name: 'Saudi Arabia', name_ar: 'السعودية', flag: '🇸🇦', currency: 'SAR' },
  { code: 'KW', name: 'Kuwait', name_ar: 'الكويت', flag: '🇰🇼', currency: 'KWD' },
  { code: 'QA', name: 'Qatar', name_ar: 'قطر', flag: '🇶🇦', currency: 'QAR' },
  { code: 'JO', name: 'Jordan', name_ar: 'الأردن', flag: '🇯🇴', currency: 'JOD' },
]

const STRINGS = {
  en: {
    title: 'Welcome to Wafarna Buddy',
    sub: 'Your AI deal hunter — choose your country to start',
    ph: 'What are you looking for deals on?',
    suggs: ['Nike discount codes', 'Best laptop deals', 'iPhone offers', 'SHEIN coupons', 'Amazon promo codes', 'Hotel deals'],
    shop: 'Shop Now', alert: 'Alert me', alerted: 'Alerted! 🔔',
    copy: 'Copy', copied: 'Copied! ✓',
    verified: 'Verified by Wafarna', online: 'Found online', cashback: 'Cashback',
    limitTitle: 'Daily limit reached (10 searches)',
    limitSub: 'Come back tomorrow for free, or upgrade for unlimited searches.',
    upgrade: 'Upgrade to Wafarna Pro ⚡',
    status: 'AI Deal Hunter', langBtn: 'عربي',
    hint: 'Press Enter to search · Results may vary · Always verify at checkout',
    greet: (c) => `Hi! I'm Wafarna Buddy, your AI deal hunter for ${c.name}. What are you shopping for today? 🛍️`,
    tip: '💡 Tip',
  },
  ar: {
    title: 'أهلاً في وفرنا بادي',
    sub: 'صياد العروض الذكي — اختار بلدك وابدأ',
    ph: 'دورلك على إيه النهارده؟',
    suggs: ['كودات خصم نايكي', 'أفضل عروض اللاب توب', 'عروض الآيفون', 'كوبونات شي إن', 'كودات أمازون', 'عروض الفنادق'],
    shop: 'اشتري دلوقتي', alert: 'نبهني', alerted: 'تم التنبيه 🔔',
    copy: 'انسخ', copied: 'تم النسخ ✓',
    verified: 'موثق من وفرنا', online: 'من الإنترنت', cashback: 'كاش باك',
    limitTitle: 'وصلت للحد اليومي (10 بحث)',
    limitSub: 'ارجع غداً مجاناً، أو اشترك في وفرنا برو للبحث بلا حدود.',
    upgrade: 'اشترك في وفرنا برو ⚡',
    status: 'صياد العروض الذكي', langBtn: 'English',
    hint: 'اضغط Enter للبحث · تحقق دائماً عند الشراء',
    greet: (c) => `أهلاً! أنا وفرنا بادي، صياد العروض لـ${c.name_ar}. عايز تشتري إيه النهارده؟ 🛍️`,
    tip: '💡 نصيحة',
  },
}

function OfferCard({ offer, lang, strings, onAlert, onShop }) {
  const [copied, setCopied] = useState(false)
  const [alerted, setAlerted] = useState(false)
  const isAr = lang === 'ar'
  const hasCode = offer.code && offer.code !== '' && offer.code !== 'null'

  const copyCode = () => {
    navigator.clipboard.writeText(offer.code).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleAlert = () => {
    setAlerted(true)
    onAlert && onAlert(offer)
  }

  return (
    <div className="offer-card">
      <div className="offer-top">
        <div className="offer-store">
          <div className="store-logo">
            {offer.logo_url
              ? <img src={offer.logo_url} alt={offer.store_name} onError={e => { e.target.style.display = 'none' }} />
              : (offer.store_name?.[0] || 'W').toUpperCase()
            }
          </div>
          <div className="store-name">{isAr && offer.store_name_ar ? offer.store_name_ar : offer.store_name}</div>
        </div>
        <div className="badges">
          {offer.verified
            ? <span className="badge badge-green">✓ {strings.verified}</span>
            : <span className="badge badge-gray">🔍 {strings.online}</span>
          }
          {offer.cashback_pct > 0 && (
            <span className="badge badge-gold">+{offer.cashback_pct}% {strings.cashback}</span>
          )}
        </div>
      </div>

      <div className="offer-title">{offer.title}</div>
      <div className="offer-desc">{offer.description}</div>

      {hasCode && (
        <div className="code-box">
          <span className="code-text">{offer.code}</span>
          <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={copyCode}>
            {copied ? strings.copied : strings.copy}
          </button>
        </div>
      )}

      <div className="offer-actions">
        <button className="btn-shop" onClick={() => { window.open(offer.url, '_blank'); onShop && onShop(offer) }}>
          {strings.shop} →
        </button>
        <button className={`btn-alert ${alerted ? 'active' : ''}`} onClick={handleAlert} disabled={alerted}>
          {alerted ? strings.alerted : `${strings.alert} 🔔`}
        </button>
      </div>
    </div>
  )
}

export default function WafarnaBuddy() {
  const [lang, setLang] = useState('en')
  const [country, setCountry] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [msgCount, setMsgCount] = useState(0)
  const [limitReached, setLimitReached] = useState(false)
  const [user, setUser] = useState(null)
  const [memoryEnabled, setMemoryEnabled] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const MAX = 10
  const s = STRINGS[lang]
  const isAr = lang === 'ar'

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user)
        supabase.from('buddy_preferences').select('memory_enabled').eq('user_id', data.user.id).maybeSingle()
          .then(({ data: p }) => setMemoryEnabled(Boolean(p?.memory_enabled)))
      }
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const clearShoppingHistory = async () => {
    if (!user) return
    const tables = ['user_searches', 'user_clicks', 'user_watchlist', 'buddy_feedback']
    const results = await Promise.all(tables.map(table =>
      supabase.from(table).delete().eq('user_id', user.id)
    ))
    const pref = await supabase.from('buddy_preferences').delete().eq('user_id', user.id)
    if (results.every(r => !r.error) && !pref.error) {
      setMemoryEnabled(false)
      setMessages([])
    }
  }

  const toggleMemory = async () => {
    if (!user) return
    const next = !memoryEnabled
    const { error } = await supabase.from('buddy_preferences').upsert({
      user_id: user.id, memory_enabled: next, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })
    if (!error) setMemoryEnabled(next)
  }

  const rateResponse = async (query, rating) => {
    if (!user) return
    await supabase.from('buddy_feedback').insert({
      user_id: user.id, search_query: query.slice(0, 500), rating, country: country?.code
    })
  }

  const startChat = (c) => {
    setCountry(c)
    setMessages([{ role: 'bot', text: s.greet(c), offers: [], tip: null }])
  }

  const resetApp = () => {
    setCountry(null)
    setMessages([])
    setMsgCount(0)
    setLimitReached(false)
    setInput('')
  }

  const toggleLang = () => setLang(l => l === 'en' ? 'ar' : 'en')

  const addToWatchlist = async (offer) => {
    if (!user) return
    await supabase.from('user_watchlist').insert({
      user_id: user.id,
      query: offer.title,
      category: offer.category,
      country: country?.code,
    })
  }

  const logClick = async (offer) => {
    if (!user) return
    await supabase.from('user_clicks').insert({
      user_id: user.id,
      store_name: offer.store_name,
      store_url: offer.url,
      category: offer.category,
    })
  }

  const sendMessage = async (text) => {
    const query = text || input.trim()
    if (!query || loading || limitReached) return
    if (msgCount >= MAX) { setLimitReached(true); return }

    setInput('')
    setLoading(true)
    setMsgCount(c => c + 1)

    const userMsg = { role: 'user', text: query }
    setMessages(prev => [...prev, userMsg])

    const apiMessages = [...messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'bot')
      .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }))
      .filter(m => m.content)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(sessionData?.session?.access_token ? { Authorization: `Bearer ${sessionData.session.access_token}` } : {}) },
        body: JSON.stringify({
          messages: apiMessages,
          country,
          lang,
          userId: user?.id || null,
          memoryEnabled,
        }),
      })

      if (res.status === 429) {
        setLimitReached(true)
        setMessages(prev => [...prev, { role: 'bot', text: s.limitTitle, offers: [], tip: null }])
        setLoading(false)
        return
      }

      if (!res.ok) throw new Error('API error')

      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'bot',
        text: data.message || '',
        offers: data.offers || [],
        tip: data.tip || null,
        query,
      }])
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: isAr ? 'حصل خطأ، حاول تاني من فضلك.' : 'Something went wrong. Please try again.',
        offers: [], tip: null,
      }])
    }

    setLoading(false)
    if (msgCount + 1 >= MAX) setLimitReached(true)
    inputRef.current?.focus()
  }

  return (
    <>
      <Head>
        <title>Buddy — وفرنا بادي</title>
        <meta name="description" content="AI-powered deal hunter for Egypt, UAE, Saudi Arabia and more" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;700&display=swap" rel="stylesheet" />
      </Head>

      <div className={`app ${isAr ? 'rtl' : 'ltr'}`} style={{ fontFamily: isAr ? "'IBM Plex Sans Arabic', sans-serif" : "'Poppins', sans-serif" }}>
        {/* Header */}
        <div className="header">
          <div className="logo">
            <img src="/buddy-logo.png" alt="Buddy" className="logo-img" />
            <div>
              <div className="status-line">
                <span className="status-dot" />
                {s.status}
              </div>
            </div>
          </div>
          <div className="header-right">
            {country && (
              <button className="country-pill" style={{ display: 'block' }} onClick={resetApp}>
                {country.flag} {isAr ? country.name_ar : country.name}
              </button>
            )}
            {user && <button className="lang-btn" onClick={toggleMemory} aria-pressed={memoryEnabled}>
              {isAr ? (memoryEnabled ? 'الذاكرة مفعلة' : 'تفعيل الذاكرة') : (memoryEnabled ? 'Memory on' : 'Enable memory')}
            </button>}
            {user && <button className="lang-btn" onClick={clearShoppingHistory}>{isAr ? 'مسح السجل' : 'Clear history'}</button>}
            <button className="lang-btn" onClick={toggleLang}>{s.langBtn}</button>
          </div>
        </div>

        {/* Country Screen */}
        {!country && (
          <div className="country-screen">
          <img src="/buddy-logo.png" alt="Buddy" style={{ width: 80, height: 80, objectFit: 'contain', background: '#111827', borderRadius: 20, padding: 10 }} />
            <div>
              <h1>{s.title}</h1>
              <p style={{ marginTop: 6 }}>{s.sub}</p>
            </div>
            <div className="country-grid">
              {COUNTRIES.map(c => (
                <button key={c.code} className="country-btn" onClick={() => startChat(c)}>
                  <span className="country-flag">{c.flag}</span>
                  <div>
                    <div className="country-btn-name">{isAr ? c.name_ar : c.name}</div>
                    <div className="country-btn-curr">{c.currency}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Chat Screen */}
        {country && (
          <div className="chat-screen" style={{ display: 'flex' }}>
            <div className="messages">
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === 'user' ? (
                    <div className="msg-user-wrap">
                      <div className="bubble-user">{msg.text}</div>
                    </div>
                  ) : (
                    <div className="msg-bot-wrap">
                      <div className="bot-avatar">%</div>
                      <div className="msg-bot-content">
                        {msg.text && <div className="bubble-bot">{msg.text}</div>}
                        {msg.offers?.map((offer, j) => (
                          <OfferCard
                            key={j}
                            offer={offer}
                            lang={lang}
                            strings={s}
                            onAlert={addToWatchlist}
                            onShop={logClick}
                          />
                        ))}
                        {user && msg.query && <div className="feedback-actions" style={{display:'flex',gap:8,marginTop:8}}>
                          <button onClick={() => rateResponse(msg.query, 'helpful')} aria-label="Helpful recommendation">👍</button>
                          <button onClick={() => rateResponse(msg.query, 'not_helpful')} aria-label="Not helpful recommendation">👎</button>
                        </div>}
                        {msg.tip && (
                          <div className="tip-box">
                            <span>{s.tip}:</span> {msg.tip}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="typing-wrap">
                  <div className="bot-avatar">%</div>
                  <div className="typing">
                    <div className="dot" /><div className="dot" /><div className="dot" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Suggestions */}
            {messages.length <= 1 && (
              <div className="suggestions">
                {s.suggs.map(sg => (
                  <button key={sg} className="sugg-btn" onClick={() => sendMessage(sg)}>{sg}</button>
                ))}
              </div>
            )}

            {/* Limit Banner */}
            {limitReached && (
              <div className={`limit-banner ${isAr ? 'rtl' : 'ltr'}`}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.limitTitle}</div>
                <div style={{ fontSize: 12 }}>{s.limitSub}</div>
                <button className="upgrade-btn" onClick={() => alert('Stripe coming soon!')}>{s.upgrade}</button>
              </div>
            )}

            {/* Input */}
            <div className="input-area">
              <div className="input-row">
                <input
                  ref={inputRef}
                  className="chat-input"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder={s.ph}
                  dir={isAr ? 'rtl' : 'ltr'}
                  disabled={limitReached}
                />
                <button
                  className="send-btn"
                  onClick={() => sendMessage()}
                  disabled={loading || !input.trim() || limitReached}
                >
                  ➔
                </button>
              </div>
              <div className="input-hint">{s.hint}</div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
