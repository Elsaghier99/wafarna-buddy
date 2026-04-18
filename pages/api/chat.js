import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { messages, country, lang, userId } = req.body

  if (!messages || !country) return res.status(400).json({ error: 'Missing required fields' })

  // Check usage limit
  if (userId) {
    const today = new Date().toISOString().split('T')[0]
    const { data: usage } = await supabase
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
    await supabase.from('user_usage').upsert(
      { user_id: userId, date: today, message_count: count + 1 },
      { onConflict: 'user_id,date' }
    )
  }

  // Get user search history for personalization
  let searchHistory = 'none yet'
  let clickHistory = 'none yet'
  if (userId) {
    const { data: searches } = await supabase
      .from('user_searches')
      .select('query')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(8)

    const { data: clicks } = await supabase
      .from('user_clicks')
      .select('category')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20)

    if (searches?.length) searchHistory = searches.map(s => s.query).join(', ')
    if (clicks?.length) {
      const cats = [...new Set(clicks.map(c => c.category))].slice(0, 3)
      clickHistory = cats.join(', ')
    }
  }

  // Save search to user_searches
  const lastUserMsg = messages[messages.length - 1]?.content
  if (userId && lastUserMsg) {
    await supabase.from('user_searches').insert({
      user_id: userId,
      query: lastUserMsg,
      country: country.code,
    })
  }

  const systemPrompt = `You are Wafarna Buddy (وفرنا بادي), an expert AI deal hunter for the Wafarna platform.
The user is shopping in ${lang === 'ar' ? country.name_ar : country.name} (${country.code}), currency: ${country.currency}.

User's past searches: ${searchHistory}
User's top clicked categories: ${clickHistory}
Use this to personalize — prioritize categories and stores they engage with most.

Search the web for REAL current discount codes, hot prices, and offers available in ${country.code}.
Find the best 2-3 deals. Be specific and accurate.

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

    // Enrich offers with Supabase store data
    const enrichedOffers = await Promise.all(
      (parsed.offers || []).map(async (offer) => {
        const { data: store } = await supabase
          .from('stores')
          .select('id, name, name_ar, logo_url, url, cash_back_pct, cash_back_limit')
          .or(`name.ilike.%${offer.store_name}%,name_ar.ilike.%${offer.store_name}%`)
          .limit(1)
          .single()

        if (store) {
          return {
            ...offer,
            url: store.url || offer.url,
            logo_url: store.logo_url || null,
            store_name_ar: store.name_ar || offer.store_name,
            cashback_pct: store.cash_back_pct || offer.cashback_pct || 0,
            cashback_limit: store.cash_back_limit || null,
            verified: true,
          }
        }
        return { ...offer, verified: false, cashback_pct: offer.cashback_pct || 0 }
      })
    )

    return res.status(200).json({
      message: parsed.message,
      offers: enrichedOffers,
      tip: parsed.tip,
      rawText,
    })
  } catch (err) {
    console.error('Chat API error:', err)
    return res.status(500).json({ error: err.message })
  }
}
