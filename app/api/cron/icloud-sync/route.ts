import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { fetchiCloudContacts } from '@/lib/carddav'

export const maxDuration = 300 // 5 min — cron can take longer than normal routes

// Vercel calls this route on a schedule. It syncs iCloud contacts for all users
// who have iCloud credentials saved and whose last sync is older than 15 minutes.
// Requires SUPABASE_SERVICE_ROLE_KEY and CRON_SECRET env vars.
export async function GET(req: Request) {
  // Verify the request comes from Vercel Cron (or manual trigger with the secret)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 })
  }

  // Use service role to bypass RLS and access all users
  const admin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey,
    { auth: { persistSession: false } },
  )

  // Find users with iCloud connected whose last sync is stale (> 15 min ago)
  const staleAt = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { data: rows } = await admin
    .from('user_settings')
    .select('user_id, icloud_apple_id, icloud_app_password, icloud_selected_books, icloud_selected_contacts')
    .not('icloud_apple_id', 'is', null)
    .not('icloud_app_password', 'is', null)
    .or(`icloud_last_synced_at.is.null,icloud_last_synced_at.lt.${staleAt}`)

  if (!rows?.length) return NextResponse.json({ synced: 0 })

  let synced = 0, failed = 0
  for (const row of rows) {
    try {
      const savedBooks: string[] = (row.icloud_selected_books as string[] | null) ?? []
      const savedContacts: string[] = (row.icloud_selected_contacts as string[] | null) ?? []

      const { contacts: icloudContacts, primaryBookUrl } = await fetchiCloudContacts(
        row.icloud_apple_id,
        row.icloud_app_password,
        savedBooks.length > 0 ? savedBooks : undefined,
        savedContacts.length > 0 ? savedContacts : undefined,
      )

      // Save discovered book URL
      if (primaryBookUrl) {
        await admin
          .from('user_settings')
          .update({ icloud_book_url: primaryBookUrl })
          .eq('user_id', row.user_id)
      }

      // Load existing contacts for this user
      const { data: existing } = await admin
        .from('contacts')
        .select('id, macos_contact_id')
        .eq('user_id', row.user_id)
        .not('macos_contact_id', 'is', null)
      const byUid = new Map((existing ?? []).map((c) => [c.macos_contact_id, c.id]))

      for (const c of icloudContacts) {
        const existingId = byUid.get(c.uid)
        const contactRow = {
          name: c.name,
          company: c.company,
          role: c.role,
          phone: c.phone,
          email: c.email,
          location: c.location,
          macos_contact_id: c.uid,
        }
        if (existingId) {
          await admin.from('contacts').update(contactRow).eq('id', existingId)
        } else {
          await admin.from('contacts').insert({ ...contactRow, user_id: row.user_id })
        }
      }

      await admin
        .from('user_settings')
        .update({ icloud_last_synced_at: new Date().toISOString() })
        .eq('user_id', row.user_id)

      synced++
    } catch {
      failed++
    }
  }

  return NextResponse.json({ synced, failed, total: rows.length })
}
