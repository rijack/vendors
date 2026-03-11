import Anthropic from '@anthropic-ai/sdk'
import type { Vendor } from '@/types'

export function getAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })
}

export function buildVendorListSystemPrompt(vendors: Vendor[]): string {
  const vendorSummary = vendors.map((v) => ({
    id: v.id,
    company_name: v.company_name,
    description: v.description,
    categories: v.categories ?? [],
    website_url: v.website_url,
  }))

  return `You are a helpful assistant for a vendor management application.
You have access to the user's vendor list and can help them search, filter, and find information about their vendors.

Current vendor database (${vendors.length} vendors):
${JSON.stringify(vendorSummary, null, 2)}

You can:
- Help filter vendors by category, name, or description
- Answer questions about specific vendors
- Suggest which vendors match certain criteria
- Help gather additional information about vendors from your knowledge

When asked to save information to a vendor profile, respond with a special JSON block at the end of your message:
\`\`\`save-to-vendor
{"vendor_id": "...", "field": "description", "value": "..."}
\`\`\`

Be concise and helpful. If you don't know specific details about a vendor, say so.`
}

export function buildVendorDetailSystemPrompt(vendor: Vendor): string {
  return `You are a helpful assistant for a vendor management application.
You are currently viewing the detail page for the following vendor:

${JSON.stringify(vendor, null, 2)}

You can:
- Answer questions about this vendor
- Help find additional information about the vendor from your knowledge
- Suggest improvements to the vendor's profile
- Help draft communications or notes about the vendor

When asked to save information to this vendor's profile, respond with a special JSON block at the end of your message:
\`\`\`save-to-vendor
{"field": "description", "value": "..."}
\`\`\`

Be concise, accurate, and helpful. If you don't know specific details, say so.`
}

export async function summarizeVendorUrl(url: string, pageText: string): Promise<{
  company_name: string
  description: string
  categories: string[]
  website_url: string
}> {
  const client = getAnthropicClient()

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Based on this website content from ${url}, extract vendor information and return ONLY a JSON object with these exact fields:
{
  "company_name": "Company Name",
  "description": "A 2-3 sentence description of what this company does",
  "categories": ["Category1", "Category2"],
  "website_url": "${url}"
}

Website content:
${pageText}

Return only the JSON object, no other text.`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found')
    return JSON.parse(jsonMatch[0])
  } catch {
    return {
      company_name: '',
      description: '',
      categories: [],
      website_url: url,
    }
  }
}
