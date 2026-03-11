import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchContactsFromBook } from '@/lib/carddav'

export const maxDuration = 30

// POST — preview contacts in a single address book
// Body: { book_url: string }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const bookUrl: string = body.book_url ?? ''

  if (!bookUrl) {
    return NextResponse.json({ error: 'book_url is required' }, { status: 400 })
  }

  // Load saved credentials
  const { data: settings } = await supabase
    .from('user_settings')
    .select('icloud_apple_id, icloud_app_password')
    .eq('user_id', user.id)
    .maybeSingle()

  const appleId = settings?.icloud_apple_id ?? ''
  const appPassword = settings?.icloud_app_password ?? ''

  if (!appleId || !appPassword) {
    return NextResponse.json({ error: 'No saved iCloud credentials found' }, { status: 400 })
  }

  let allContacts
  try {
    allContacts = await fetchContactsFromBook(appleId, appPassword, bookUrl)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch contacts'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const contacts = allContacts.map((c) => ({
    uid: c.uid,
    name: c.name,
    email: c.email,
    company: c.company,
  }))

  return NextResponse.json({ contacts })
}
