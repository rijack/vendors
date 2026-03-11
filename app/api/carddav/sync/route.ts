import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchiCloudContacts, fetchGroups } from '@/lib/carddav'

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
// Body: { apple_id?, app_password?, save?: boolean, selected_books?: string[], selected_contacts?: string[], selected_groups?: string[] }
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
  // selected_groups: group UIDs to save for UI restoration (stored in icloud_selected_books)
  const selectedGroups: string[] | undefined = body.selected_groups

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

  // Determine which books to sync: use body value if provided, else use saved.
  // icloud_selected_books may contain group UIDs (non-URLs) for UI restoration — ignore those.
  const rawBooks: string[] =
    selectedBooks !== undefined
      ? selectedBooks
      : (((settings as any)?.icloud_selected_books as string[] | null) ?? [])
  const booksToSync = rawBooks.filter((v) => v.startsWith('http'))

  // Group UIDs saved for "Specific lists" mode (non-URL entries in icloud_selected_books)
  const savedGroupUids = rawBooks.filter((v) => !v.startsWith('http'))

  // Determine which contact UIDs to filter: use body value if provided, else use saved.
  // If groups are saved, re-resolve their membership live so newly added contacts are picked up.
  let uidsToFilter: string[] =
    selectedContacts !== undefined
      ? selectedContacts
      : (((settings as any)?.icloud_selected_contacts as string[] | null) ?? [])

  if (selectedContacts === undefined && savedGroupUids.length > 0) {
    // Re-fetch group membership fresh from iCloud
    try {
      const liveGroups = await fetchGroups(appleId, appPassword)
      const memberUids = liveGroups
        .filter((g) => savedGroupUids.includes(g.uid))
        .flatMap((g) => g.memberUids)
      if (memberUids.length > 0) {
        uidsToFilter = [...new Set(memberUids)]
        // Persist updated membership so manual sync stays in sync too
        await supabase
          .from('user_settings')
          .upsert({ user_id: user.id, icloud_selected_contacts: uidsToFilter }, { onConflict: 'user_id' })
      }
    } catch {
      // Fall back to saved UIDs if group re-fetch fails
    }
  }

  // Fetch from iCloud
  let icloudContacts: Awaited<ReturnType<typeof fetchiCloudContacts>>['contacts'] = []
  let primaryBookUrl: string | null = null
  try {
    const result = await fetchiCloudContacts(
      appleId,
      appPassword,
      booksToSync.length > 0 ? booksToSync : undefined,
      uidsToFilter.length > 0 ? uidsToFilter : undefined,
    )
    icloudContacts = result.contacts
    primaryBookUrl = result.primaryBookUrl
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  // Persist credentials, selections, and discovered book URL
  const upsertData: Record<string, unknown> = { user_id: user.id }
  if (save) {
    upsertData.icloud_apple_id = appleId
    upsertData.icloud_app_password = appPassword
  }
  if (selectedGroups !== undefined) {
    upsertData.icloud_selected_books = selectedGroups
  } else if (selectedBooks !== undefined) {
    upsertData.icloud_selected_books = selectedBooks
  }
  if (selectedContacts !== undefined) {
    upsertData.icloud_selected_contacts = selectedContacts
  }
  // Always save the discovered book URL for outbound sync
  if (primaryBookUrl) {
    upsertData.icloud_book_url = primaryBookUrl
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
  const errors: string[] = []
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
      const { error } = await supabase.from('contacts').update(row).eq('id', existingId).eq('user_id', user.id)
      if (error) { skipped++; errors.push(`update ${c.name}: ${error.message}`) } else updated++
    } else {
      const { error } = await supabase.from('contacts').insert({ ...row, user_id: user.id })
      if (error) { skipped++; errors.push(`insert ${c.name}: ${error.message}`) } else created++
    }
  }

  await supabase.from('user_settings').upsert(
    { user_id: user.id, icloud_last_synced_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )

  return NextResponse.json({ total: icloudContacts.length, created, updated, skipped, errors })
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
      icloud_book_url: null,
    })
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
