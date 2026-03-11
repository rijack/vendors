import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pushContactToiCloud, deleteContactFromiCloud } from '@/lib/carddav'

export const maxDuration = 30

// Resolve the saved book URL or discover it fresh if not saved yet
async function getBookUrl(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  appleId: string,
  appPassword: string,
): Promise<string | null> {
  const { data: settings } = await supabase
    .from('user_settings')
    .select('icloud_book_url')
    .eq('user_id', userId)
    .maybeSingle()

  if ((settings as any)?.icloud_book_url) return (settings as any).icloud_book_url

  // Not saved yet — discover it and save for next time
  const books = await fetchAddressBooks(appleId, appPassword)
  const url = books[0]?.url ?? null
  if (url) {
    await supabase
      .from('user_settings')
      .upsert({ user_id: userId, icloud_book_url: url }, { onConflict: 'user_id' })
  }
  return url
}

// POST — create or update a contact in iCloud
// Body: { contact_id: string }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { contact_id } = await req.json()
  if (!contact_id) return NextResponse.json({ error: 'contact_id required' }, { status: 400 })

  const { data: settings } = await supabase
    .from('user_settings')
    .select('icloud_apple_id, icloud_app_password, icloud_book_url')
    .eq('user_id', user.id)
    .maybeSingle()

  const appleId: string = (settings as any)?.icloud_apple_id ?? ''
  const appPassword: string = (settings as any)?.icloud_app_password ?? ''
  if (!appleId || !appPassword) {
    return NextResponse.json({ ok: true, skipped: true }) // not connected
  }

  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contact_id)
    .eq('user_id', user.id)
    .single()

  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 })

  const bookUrl = await getBookUrl(supabase, user.id, appleId, appPassword)
  if (!bookUrl) return NextResponse.json({ error: 'No address book found' }, { status: 400 })

  // Assign a UID if the contact doesn't have one yet
  let uid: string = contact.macos_contact_id ?? ''
  if (!uid) {
    uid = crypto.randomUUID()
    await supabase
      .from('contacts')
      .update({ macos_contact_id: uid })
      .eq('id', contact_id)
  }

  try {
    await pushContactToiCloud(appleId, appPassword, bookUrl, uid, contact)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Push failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, macos_contact_id: uid })
}

// DELETE — remove a contact from iCloud
// Body: { macos_contact_id: string }
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { macos_contact_id } = await req.json()
  if (!macos_contact_id) return NextResponse.json({ ok: true }) // nothing to do

  const { data: settings } = await supabase
    .from('user_settings')
    .select('icloud_apple_id, icloud_app_password, icloud_book_url')
    .eq('user_id', user.id)
    .maybeSingle()

  const appleId: string = (settings as any)?.icloud_apple_id ?? ''
  const appPassword: string = (settings as any)?.icloud_app_password ?? ''
  if (!appleId || !appPassword) return NextResponse.json({ ok: true }) // not connected

  const bookUrl = await getBookUrl(supabase, user.id, appleId, appPassword)
  if (!bookUrl) return NextResponse.json({ ok: true })

  try {
    await deleteContactFromiCloud(appleId, appPassword, bookUrl, macos_contact_id)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
