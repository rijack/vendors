import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchiCloudContacts } from '@/lib/carddav'

// GET — return saved iCloud settings
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('user_settings')
    .select('icloud_apple_id, icloud_last_synced_at, icloud_selected_books')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    apple_id: data?.icloud_apple_id ?? null,
    last_synced_at: data?.icloud_last_synced_at ?? null,
    selected_books: (data?.icloud_selected_books as string[] | null) ?? [],
  })
}

// POST — sync iCloud contacts
// Body: { apple_id?, app_password?, save?: boolean, selected_books?: string[] }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  let appleId: string = body.apple_id ?? ''
  let appPassword: string = body.app_password ?? ''
  const save: boolean = body.save ?? false
  const selectedBooks: string[] | undefined = body.selected_books // undefined = don't change

  // Load saved settings
  const { data: settings } = await supabase
    .from('user_settings')
    .select('icloud_apple_id, icloud_app_password, icloud_selected_books')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!appleId || !appPassword) {
    appleId = settings?.icloud_apple_id ?? ''
    appPassword = settings?.icloud_app_password ?? ''
  }

  if (!appleId || !appPassword) {
    return NextResponse.json({ error: 'No iCloud credentials provided or saved' }, { status: 400 })
  }

  // Determine which books to sync: use body value if provided, else use saved
  const booksToSync: string[] =
    selectedBooks !== undefined
      ? selectedBooks
      : ((settings?.icloud_selected_books as string[] | null) ?? [])

  // Fetch from iCloud
  let icloudContacts
  try {
    icloudContacts = await fetchiCloudContacts(
      appleId,
      appPassword,
      booksToSync.length > 0 ? booksToSync : undefined,
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  // Persist credentials and/or book selection
  const upsertData: Record<string, unknown> = { user_id: user.id }
  if (save) {
    upsertData.icloud_apple_id = appleId
    upsertData.icloud_app_password = appPassword
  }
  if (selectedBooks !== undefined) {
    upsertData.icloud_selected_books = selectedBooks
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
    .update({ icloud_apple_id: null, icloud_app_password: null, icloud_selected_books: [] })
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
