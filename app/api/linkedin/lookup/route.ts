import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAnthropicClient } from '@/lib/claude'
import { parse } from 'node-html-parser'

// Scrape a search engine results page and return visible text
async function scrapeSearchResults(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
    signal: AbortSignal.timeout(12000),
  })

  if (!res.ok) throw new Error(`Search request failed: ${res.status}`)

  const html = await res.text()
  const root = parse(html)
  root.querySelectorAll('script,style,nav,header,footer,noscript,iframe').forEach((el) => el.remove())

  return root.text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000)
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, company } = await request.json()
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  // Build search queries — try Bing first (more scraper-friendly), then DuckDuckGo
  const query = encodeURIComponent(`site:linkedin.com/in "${name}"${company ? ` "${company}"` : ''}`)
  const searchUrls = [
    `https://www.bing.com/search?q=${query}`,
    `https://duckduckgo.com/html/?q=${query}`,
  ]

  let searchText = ''
  for (const url of searchUrls) {
    try {
      searchText = await scrapeSearchResults(url)
      if (searchText.length > 200) break
    } catch {
      // try next
    }
  }

  // Also try a general web search (not site-limited) to find role/company info
  const generalQuery = encodeURIComponent(`${name}${company ? ` ${company}` : ''} professional role title`)
  let generalText = ''
  try {
    generalText = await scrapeSearchResults(`https://www.bing.com/search?q=${generalQuery}`)
  } catch {
    // ignore
  }

  const combinedContext = [
    searchText ? `--- LinkedIn search results ---\n${searchText}` : '',
    generalText ? `--- General web search results ---\n${generalText}` : '',
  ].filter(Boolean).join('\n\n')

  const anthropic = getAnthropicClient()
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [
      {
        role: 'user',
        content: `Based on the search results below, find the LinkedIn profile and professional information for:
Name: ${name}
Company: ${company ?? 'unknown'}

Search results:
${combinedContext || '(no search results available — use your knowledge)'}

Return ONLY a JSON object with these fields (omit any field you're not confident about):
{
  "linkedin_url": "https://linkedin.com/in/...",
  "role": "current job title",
  "location": "city, state/country",
  "notes": "any other relevant professional details in 1-2 sentences"
}

Rules:
- Only include linkedin_url if you found an actual profile URL in the search results
- Only include role if you're confident it matches this specific person at this company
- If multiple people match, pick the most likely one
- Return valid JSON only, no other text`,
      },
    ],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

  // Extract JSON from Claude's response
  let result: Record<string, string> = {}
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) result = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'Could not parse response' }, { status: 500 })
  }

  return NextResponse.json(result)
}
