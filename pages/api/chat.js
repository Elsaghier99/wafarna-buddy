import { classifyShoppingIntent, isSameMerchant, isSafeOutboundUrl } from '../../lib/shopping-intent'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, country, lang } = req.body
  // Never trust identity or memory preference supplied in the request body.
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  let userId = null
  let userSupabase = null
  let memoryEnabled = false
  if (token) {
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (!authError && authData?.user) {
      userId = authData.user.id
      userSupabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
      const { data: prefs } = await userSupabase.from('buddy_preferences')
        .select('memory_enabled').eq('user_id', userId).maybeSingle()
      memoryEnabled = prefs?.memory_enabled === true
    }
  }

  if (!Array.isArray(messages) || !messages.length || messages.length > 30 ||
      messages.some(m => !['user', 'assistant'].includes(m?.role) || typeof m.content !== 'string' || m.content.length > 3000) ||
      !country || !['EG','AE','SA','KW','QA','JO'].includes(country.code) || !['ar','en'].includes(lang)) {
    return res.status(400).json({ error: 'Invalid chat request' })
  }

  // Check usage limit
  if (userId) {
    const today = new Date().toISOString().split('T')[0]
    const { data: usage } = await userSupabase
      .from('user_usage')
      .select('message_count')
      .eq('user_id', userId)
      .eq('date', today)
      .single()

    const count = usage?.message_count || 0
    if (count >= 10) {
      return res.status(429).json({ error: 'LIMIT_REACHED' })
    }

    // Increment usage
    await userSupabase.from('user_usage').upsert(
      { user_id: userId, date: today, message_count: count + 1 },
      { onConflict: 'user_id,date' }
    )
  }

  // Get user search history for personalization
  let searchHistory = 'none yet'
  let clickHistory = 'none yet'
  let feedbackGuidance = 'No prior feedback available.'
  if (userId && memoryEnabled) {
    const { data: searches } = await userSupabase
      .from('user_searches')
      .select('query')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(8)

    const { data: clicks } = await userSupabase
      .from('user_clicks')
      .select('category')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    const { data: ratings } = await userSupabase
      .from('buddy_feedback')
      .select('search_query,rating')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(12)
    if (ratings?.length) {
      const disliked = ratings.filter(item => item.rating === 'not_helpful')
        .slice(0, 4).map(item => item.search_query.slice(0, 100))
      feedbackGuidance = disliked.length
        ? 'Earlier shopping responses were marked unhelpful for: ' + disliked.join(' | ') +
          '. Be clearer about missing verified data, suggest practical next steps, and avoid repeating generic answers.'
        : 'The customer rated earlier recommendations helpful; keep responses concise and actionable.'
    }
    if (searches?.length) searchHistory = searches.map(s => s.query).join(', ')
    if (clicks?.length) {
      const cats = [...new Set(clicks.map(c => c.category))].slice(0, 3)
      clickHistory = cats.join(', ')
    }
  }

  // Save search to user_searches
  const lastUserMsg = messages[messages.length - 1]?.content
  if (messages[messages.length - 1]?.role !== 'user') return res.status(400).json({ error: 'Last message must be user' })
  if (userId && memoryEnabled && lastUserMsg) {
    await userSupabase.from('user_searches').insert({
      user_id: userId,
      query: lastUserMsg,
      country: country.code,
    })
  }

  const intent = classifyShoppingIntent(lastUserMsg || '')

  // Query our own merchant directory BEFORE asking AI to recommend stores.
  // Restrict suggestions to stores actually present in our database.
  const { data: merchantRows, error: merchantError } = await supabase
    .from('stores').select('id,name,name_ar,logo_url,url,countries,is_global,is_active').limit(1000)
  const safeMerchants = (merchantRows || []).filter(s => isSafeOutboundUrl(s.url) && s.is_active !== false && (s.is_global === true || (Array.isArray(s.countries) && s.countries.includes(country.code))))
  const merchantNames = safeMerchants.map(s => s.name).filter(Boolean).slice(0, 250)
  if (merchantError) console.error('Buddy merchant lookup:', merchantError.message)

  const systemPrompt = `You are Wafarna Buddy (وفرنا بادي), an expert AI deal hunter for the Wafarna platform.
The user is shopping in ${lang === 'ar' ? country.name_ar : country.name} (${country.code}), currency: ${country.currency}.

User's past searches: ${searchHistory}
User's top clicked categories: ${clickHistory}
Feedback-based guidance: ${feedbackGuidance}
Use this to personalize — prioritize categories and stores they engage with most.

Shopping intent: ${intent}. You do NOT have direct merchant catalog, inventory, verified pricing, or store API access. TakeDeals is the only deal-discovery feed, and it is not integrated into this chat handler. Other network APIs provide coupons and affiliate links only. Never invent codes, prices, sale percentages, cashback, product availability, or store-specific claims. If live or verified offer data is unavailable, say so briefly and help the user choose relevant stores or a narrower search. Do not claim you searched any partner API. The backend will only show merchant cards for exact matches in our stores database, without AI-generated coupons. Suggest store names ONLY from this actual known directory: ${JSON.stringify(merchantNames)}. If there is no suitable store, return an empty offers list and explain honestly.

CRITICAL: Respond ONLY with raw JSON. No markdown. No backticks. No explanation. 
Start immediately with { and end with }

JSON structure:
{
  "message": "short friendly reply in ${lang === 'ar' ? 'Egyptian Arabic colloquial' : 'English'} (1-2 sentences, energetic and helpful)",
  "offers": [
    {
      "store_name": "Exact store name",
      "title": "Deal title — what the offer is",
      "code": "PROMOCODE or empty string if no code",
      "description": "Short deal description and any conditions (1-2 lines)",
      "url": "https://store-website.com",
      "category": "fashion/electronics/food/travel/beauty/home/other",
      "cashback_pct": 0
    }
  ],
  "tip": "One bonus saving tip or null"
}`

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: systemPrompt,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: messages.slice(-6),
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json()
      throw new Error(err.error?.message || 'Anthropic API error')
    }

    const data = await anthropicRes.json()
    const rawText = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    let parsed = { message: '', offers: [], tip: null }
    try {
      const match = rawText.match(/\{[\s\S]*\}/)
      if (match) parsed = JSON.parse(match[0])
      else parsed.message = rawText
    } catch (e) {
      parsed.message = rawText || (lang === 'ar' ? 'حاول تاني من فضلك' : 'Please try again.')
    }

    // Only display independently matched merchants from the Wafarna database.
    // The AI cannot verify coupon validity, price, or cashback.
    // Never copy an AI-suggested coupon or untracked merchant URL into a card.
    const enrichedOffers = (parsed.offers || [])
      .filter(offer => offer && typeof offer.store_name === 'string')
      .map(offer => {
        const store = safeMerchants.find(s =>
          isSameMerchant(s.name, offer.store_name) ||
          isSameMerchant(s.name_ar, offer.store_name)
        )
        if (!store || !isSafeOutboundUrl(store.url)) return null
        return {
          store_name: store.name,
          store_name_ar: store.name_ar,
          logo_url: store.logo_url,
          title: store.name,
          description: lang === 'ar'
            ? 'استكشف المتجر. تحقق من أي خصم وشروطه قبل الشراء.'
            : 'Explore this store. Verify any discounts and their terms before checkout.',
          code: '',
          url: store.url,
          cashback_pct: 0,
          verified: false,
          category: 'other',
          source: 'wafarna_store',
        }
      })
      .filter(Boolean)
      .filter((offer, index, all) => all.findIndex(other => other.url === offer.url) === index)
      .slice(0, 5)

    // Prefer published, non-expired Wafarna offers when available.
    // offer_code and offer_url come from Wafarna data, NEVER the AI response.
    const matchedIds = safeMerchants
      .filter(s => enrichedOffers.some(o => isSameMerchant(o.store_name, s.name)))
      .map(s => s.id)
    let displayedOffers = enrichedOffers
    if (matchedIds.length) {
      const { data: published, error: offersError } = await supabase.from('offers')
        .select('id,store_id,title,title_ar,description,description_ar,offer_code,offer_url,countries,is_global,show,end_time')
        .in('store_id', matchedIds).eq('show', true).limit(60)
      if (offersError) console.error('Buddy published offers:', offersError.message)
      const now = Date.now()
      const eligible = (published || []).filter(o =>
        (!o.end_time || Date.parse(o.end_time) >= now) &&
        (o.is_global === true || (Array.isArray(o.countries) && o.countries.includes(country.code)))
      ).filter(o => isSafeOutboundUrl(o.offer_url))
      const cards = eligible.map(o => {
        const store = safeMerchants.find(s => s.id === o.store_id)
        return store && {
          store_name: store.name, store_name_ar: store.name_ar, logo_url: store.logo_url,
          title: lang === 'ar' ? (o.title_ar || o.title) : o.title,
          description: lang === 'ar' ? (o.description_ar || o.description || '') : (o.description || ''),
          code: o.offer_code || '', url: o.offer_url, cashback_pct: 0,
          verified: false, category: 'other', source: 'wafarna_published_offer',
        }
      }).filter(Boolean)
      if (cards.length) displayedOffers = cards.slice(0, 5)
    }

    return res.status(200).json({
      message: parsed.message,
      offers: displayedOffers,
      tip: parsed.tip,
      intent,
    })
  } catch (err) {
    console.error('Chat API error:', err)
    return res.status(502).json({ error: 'Shopping assistant temporarily unavailable' })
  }
}
