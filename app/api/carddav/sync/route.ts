import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchiCloudContacts } from '@/lib/carddav'

// GET — return saved iCloud settings (apple_id masked, last_synced_at)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await supabase
    .from('user_settings')
    .select('icloud_apple_id, icloud_last_synced_at')
    .eq('user_id', user.id)
    .maybeSingle()

  return NextResponse.json({
    apple_id: data?.icloud_apple_id ?? null,
    last_synced_at: data?.icloud_last_synced_at ?? null,
  })
}

// POST — sync iCloud contacts into Supabase
// Body: { apple_id?, app_password?, save?: boolean }
// If apple_id/app_password are omitted, uses previously saved credentials.
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  let appleId: string = body.apple_id ?? ''
  let appPassword: string = body.app_password ?? ''
  const save: boolean = body.save ?? false

  // Fall back to saved credentials if none provided
  if (!appleId || !appPassword) {
    const { data: settings } = await supabase
      .from('user_settings')
      .select('icloud_apple_id, icloud_app_password')
      .eq('user_id', user.id)
      .maybeSingle()
    appleId = settings?.icloud_apple_id ?? ''
    appPassword = settings?.icloud_app_password ?? ''
  }

  if (!appleId || !appPassword) {
    return NextResponse.json(
      { error: 'No iCloud credentials provided or saved' },
      { status: 400 },
    )
  }

  // Fetch from iCloud
  let icloudContacts
  try {
    icloudContacts = await fetchiCloudContacts(appleId, appPassword)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  // Save credentials if requested
  if (save) {
    await supabase.from('user_settings').upsert(
      { user_id: user.id, icloud_apple_id: appleId, icloud_app_password: appPassword },
      { onConflict: 'user_id' },
    )
  }

  // Load existing iCloud-linked contacts (matched by macos_contact_id = iCloud UID)
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, macos_contact_id')
    .not('macos_contact_id', 'is', null)
  const byUid = new Map((existing ?? []).map((c) => [c.macos_contact_id, c.id]))

  let created = 0
  let updated = 0
  let skipped = 0

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

  // Record last synced time
  await supabase.from('user_settings').upsert(
    { user_id: user.id, icloud_last_synced_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  )

  return NextResponse.json({ total: icloudContacts.length, created, updated, skipped })
}

// DELETE — remove saved iCloud credentials
export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await supabase
    .from('user_settings')
    .update({ icloud_apple_id: null, icloud_app_password: null })
    .eq('user_id', user.id)

  return NextResponse.json({ ok: true })
}
