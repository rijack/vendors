import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchGroups } from '@/lib/carddav'

export const maxDuration = 30

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: settings } = await supabase
    .from('user_settings')
    .select('icloud_apple_id, icloud_app_password')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!settings?.icloud_apple_id || !settings?.icloud_app_password) {
    return NextResponse.json({ error: 'No iCloud credentials saved' }, { status: 400 })
  }

  try {
    const groups = await fetchGroups(settings.icloud_apple_id, settings.icloud_app_password)
    return NextResponse.json({ groups })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
