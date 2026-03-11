import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchiCloudContacts } from '@/lib/carddav'

export const maxDuration = 60 // seconds (Vercel hobby: 60s max)

// GET — return saved iCloud settings
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Select core columns first; newer columns may not exist if migrations haven't run
  const { data } = await supabase
    .from('user_settings')
    .select('icloud_apple_id, icloud_last_synced_at, icloud_selected_books, icloud_selected_contacts')
    .eq('user_id', user.id)
    .maybeSingle()
    .then((r) => r.error
      // Fall back without newer columns if they don't exist yet
      ? supabase.from('user_settings').select('icloud_apple_id, icloud_last_synced_at').eq('user_id', user.id).maybeSingle()
      : r,
    )

  return NextResponse.json({
    apple_id: (data as any)?.icloud_apple_id ?? null,
    last_synced_at: (data as any)?.icloud_last_synced_at ?? null,
    selected_books: (data as any)?.icloud_selected_books ?? [],
    selected_contacts: (data as any)?.icloud_selected_contacts ?? [],
  })
}

// POST — sync iCloud contacts
// Body: { apple_id?, app_password?, save?: boolean, selected_books?: string[], selected_contacts?: string[] }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  let appleId: string = body.apple_id ?? ''
  let appPassword: string = body.app_password ?? ''
  const save: boolean = body.save ?? false
  const selectedBooks: string[] | undefined = body.selected_books
  const selectedContacts: string[] | undefined = body.selected_contacts

  // Load saved settings
  const { data: settings } = await supabase
    .from('user_settings')
    .select('icloud_apple_id, icloud_app_password, icloud_selected_books, icloud_selected_contacts')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!appleId || !appPassword) {
    appleId = (settings as any)?.icloud_apple_id ?? ''
    appPassword = (settings as any)?.icloud_app_password ?? ''
  }

  if (!appleId || !appPassword) {
    return NextResponse.json({ error: 'No iCloud credentials provided or saved' }, { status: 400 })
  }

  // Determine which books to sync: use body value if provided, else use saved
  const booksToSync: string[] =
    selectedBooks !== undefined
      ? selectedBooks
      : (((settings as any)?.icloud_selected_books as string[] | null) ?? [])

  // Determine which contact UIDs to filter: use body value if provided, else use saved
  const uidsToFilter: string[] =
    selectedContacts !== undefined
      ? selectedContacts
      : (((settings as any)?.icloud_selected_contacts as string[] | null) ?? [])

  // Fetch from iCloud
  let icloudContacts
  try {
    icloudContacts = await fetchiCloudContacts(
      appleId,
      appPassword,
      booksToSync.length > 0 ? booksToSync : undefined,
      uidsToFilter.length > 0 ? uidsToFilter : undefined,
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  // Persist credentials and/or selections
  const upsertData: Record<string, unknown> = { user_id: user.id }
  if (save) {
    upsertData.icloud_apple_id = appleId
    upsertData.icloud_app_password = appPassword
  }
  if (selectedBooks !== undefined) {
    upsertData.icloud_selected_books = selectedBooks
  }
  if (selectedContacts !== undefined) {
    upsertData.icloud_selected_contacts = selectedContacts
  }
  if (Object.keys(upsertData).length > 1) {
    await supabase.from('user_settings').upsert(upsertData, { onConflict: 'user_id' })
  }

  // Upsert contacts
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, macos_contact_id')
    .not('macos_contact_id', 'is', null)
  const byUid = new Map((existing ?? []).map((c) => [c.macos_contact_id, c.id]))

  let created = 0, updated = 0, skipped = 0
  for (const c of icloudContacts) {
    const existingId = byUid.get(c.uid)
    const row = {
      name: c.name,
      company: c.company,
      role: c.role,
      phone: c.phone,
      email: c.email,
      location: c.location,
      macos_contact_id: c.uid,
    }
    if (existingId) {
      const { error } = await supabase.from('contacts').update(row).eq('id', existingId)
      if (error) skipped++; else updated++
    } else {
      const { error } = await supabase.from('contacts').insert({ ...row, user_id: user.id })
      if (error) skipped++; else created++
    }
  }

  await supabase.from('user_settings').upsert(
    { user_id: user.id, icloud_last_synced_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )

  return NextResponse.json({ total: icloudContacts.length, created, updated, skipped })
}

// DELETE — remove saved iCloud credentials and selection
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase
    .from('user_settings')
    .update({
      icloud_apple_id: null,
      icloud_app_password: null,
      icloud_selected_books: [],
      icloud_selected_contacts: [],
    })
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
