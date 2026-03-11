import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAnthropicClient,
  buildVendorListSystemPrompt,
  buildVendorDetailSystemPrompt,
} from '@/lib/claude'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { context, message, history } = await request.json()

  // Build system prompt based on context
  let systemPrompt = 'You are a helpful assistant for a vendor management application.'

  if (context === 'vendor_list') {
    const { data: vendors } = await supabase
      .from('vendors')
      .select('*, vendor_categories(category)')
      .eq('user_id', user.id)
      .order('company_name')

    const enriched = (vendors ?? []).map((v: any) => ({
      ...v,
      categories: v.vendor_categories?.map((c: any) => c.category) ?? [],
    }))
    systemPrompt = buildVendorListSystemPrompt(enriched)
  } else if (context.startsWith('vendor:')) {
    const vendorId = context.replace('vendor:', '')
    const { data: vendor } = await supabase
      .from('vendors')
      .select('*, vendor_categories(category), vendor_contacts(contact_id, contacts(*))')
      .eq('id', vendorId)
      .eq('user_id', user.id)
      .single()

    if (vendor) {
      const enriched = {
        ...vendor,
        categories: vendor.vendor_categories?.map((c: any) => c.category) ?? [],
        contacts: vendor.vendor_contacts?.map((vc: any) => vc.contacts).filter(Boolean) ?? [],
      }
      systemPrompt = buildVendorDetailSystemPrompt(enriched)
    }
  }

  // Save user message
  await supabase.from('claude_messages').insert({
    user_id: user.id,
    context,
    role: 'user',
    content: message,
  })

  // Stream response
  const client = getAnthropicClient()

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let assistantContent = ''

      try {
        const anthropicStream = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            ...history.map((msg: { role: string; content: string }) => ({
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
            })),
            { role: 'user', content: message },
          ],
        })

        for await (const event of anthropicStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            const chunk = event.delta.text
            assistantContent += chunk
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`))
          }
        }

        // Save assistant message
        await supabase.from('claude_messages').insert({
          user_id: user.id,
          context,
          role: 'assistant',
          content: assistantContent,
        })

        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMsg })}\n\n`))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { searchParams } = new URL(request.url)
  const context = searchParams.get('context')
  if (!context) return Response.json([])

  const { data } = await supabase
    .from('claude_messages')
    .select('*')
    .eq('user_id', user.id)
    .eq('context', context)
    .order('created_at')
    .limit(50)

  return Response.json(data ?? [])
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { context } = await request.json()
  await supabase
    .from('claude_messages')
    .delete()
    .eq('user_id', user.id)
    .eq('context', context)

  return Response.json({ ok: true })
}
