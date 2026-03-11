import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchAddressBooks } from '@/lib/carddav'

export const maxDuration = 30

// POST — validate iCloud credentials and optionally save them
// Body: { apple_id: string, app_password: string, save?: boolean }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const appleId: string = body.apple_id ?? ''
  const appPassword: string = body.app_password ?? ''
  const save: boolean = body.save ?? false

  if (!appleId || !appPassword) {
    return NextResponse.json({ error: 'Apple ID and app-specific password are required' }, { status: 400 })
  }

  let books
  try {
    books = await fetchAddressBooks(appleId, appPassword)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Connection failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  if (save) {
    await supabase.from('user_settings').upsert(
      {
        user_id: user.id,
        icloud_apple_id: appleId,
        icloud_app_password: appPassword,
        icloud_book_url: books[0]?.url ?? null,
      },
      { onConflict: 'user_id' },
    )
  }

  return NextResponse.json({ books })
}
