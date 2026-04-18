import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: watchlist } = await supabase
    .from('user_watchlist')
    .select('*, users:user_id(email)')
    .or(`last_alerted_at.is.null,last_alerted_at.lt.${yesterday}`)
    .limit(50)

  if (!watchlist?.length) return res.status(200).json({ message: 'No items to alert' })

  let alerted = 0
  for (const item of watchlist) {
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
          max_tokens: 600,
          system: `You are a deal finder. Search for current deals on the query in the given country. Return ONLY JSON: {"found": true/false, "deal": {"store": "name", "title": "deal", "code": "CODE or empty", "url": "https://...", "discount": "20% off"}}`,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: `Find best current deal for: "${item.query}" in ${item.country || 'EG'}` }],
        }),
      })

      const data = await anthropicRes.json()
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) continue
      const result = JSON.parse(match[0])

      if (result.found && result.deal && item.users?.email) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'Wafarna Buddy <buddy@getwafarna.com>',
            to: item.users.email,
            subject: `🔥 وفرنا: لقيناك عرض على ${item.query}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                <div style="background:#16a34a;padding:16px;border-radius:12px;text-align:center;margin-bottom:20px;">
                  <h1 style="color:white;margin:0;font-size:20px;">🛍️ Wafarna Buddy</h1>
                  <p style="color:#dcfce7;margin:4px 0 0;font-size:13px;">وفرنا بادي — صياد العروض</p>
                </div>
                <h2 style="color:#111827;">لقيناك عرض على "${item.query}"!</h2>
                <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin:16px 0;">
                  <div style="font-weight:bold;font-size:16px;margin-bottom:8px;">${result.deal.store}</div>
                  <div style="font-size:14px;color:#374151;margin-bottom:8px;">${result.deal.title}</div>
                  ${result.deal.code ? `<div style="background:#f0fdf4;border:1px dashed #16a34a;border-radius:8px;padding:10px;font-family:monospace;font-size:16px;font-weight:bold;color:#14532d;text-align:center;margin:12px 0;">${result.deal.code}</div>` : ''}
                  <a href="${result.deal.url}" style="display:block;background:#16a34a;color:white;text-align:center;padding:12px;border-radius:8px;text-decoration:none;font-weight:bold;">اشتري دلوقتي →</a>
                </div>
                <p style="color:#9ca3af;font-size:12px;text-align:center;">Wafarna Buddy — getwafarna.com</p>
              </div>
            `,
          }),
        })
        alerted++
      }

      await supabase
        .from('user_watchlist')
        .update({ last_alerted_at: new Date().toISOString() })
        .eq('id', item.id)

    } catch (e) {
      console.error('Alert error for item', item.id, e)
    }
  }

  return res.status(200).json({ message: `Alerted ${alerted} users` })
}
