'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Bell, Check, User, Database, Cloud, RefreshCw, Unlink } from 'lucide-react'

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')

  // iCloud state
  const [icloudSavedAppleId, setIcloudSavedAppleId] = useState<string | null>(null)
  const [icloudLastSynced, setIcloudLastSynced] = useState<string | null>(null)
  const [icloudAppleId, setIcloudAppleId] = useState('')
  const [icloudPassword, setIcloudPassword] = useState('')
  const [icloudSave, setIcloudSave] = useState(true)
  const [icloudSyncing, setIcloudSyncing] = useState(false)
  const [icloudResult, setIcloudResult] = useState<{ total: number; created: number; updated: number; skipped: number } | null>(null)
  const [icloudError, setIcloudError] = useState('')
  const [showIcloudForm, setShowIcloudForm] = useState(false)

  const supabase = createClient()

  const isAppleUser = user?.app_metadata?.provider === 'apple'

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      setUser(u)
      // Pre-fill Apple ID from their sign-in email for Apple users
      if (u?.app_metadata?.provider === 'apple' && u.email) {
        setIcloudAppleId(u.email)
      }
    })
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
    }
    fetch('/api/carddav/sync')
      .then((r) => r.json())
      .then((d) => {
        setIcloudSavedAppleId(d.apple_id ?? null)
        setIcloudLastSynced(d.last_synced_at ?? null)
      })
      .catch(() => {})
  }, [])

  async function requestNotifications() {
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    if (permission === 'granted') {
      new Notification('Vendor Tracker', {
        body: 'Notifications are enabled! You will now receive reminders.',
      })
    }
  }

  async function handleIcloudSync() {
    setIcloudSyncing(true)
    setIcloudError('')
    setIcloudResult(null)
    try {
      const body: Record<string, unknown> = { save: icloudSave }
      if (!icloudSavedAppleId || showIcloudForm) {
        body.apple_id = icloudAppleId
        body.app_password = icloudPassword
      }
      const res = await fetch('/api/carddav/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setIcloudError(data.error ?? 'Sync failed')
      } else {
        setIcloudResult(data)
        setIcloudLastSynced(new Date().toISOString())
        if (icloudSave && icloudAppleId) {
          setIcloudSavedAppleId(icloudAppleId)
          setShowIcloudForm(false)
          setIcloudPassword('')
        }
      }
    } catch {
      setIcloudError('Network error — please try again')
    }
    setIcloudSyncing(false)
  }

  async function handleIcloudDisconnect() {
    await fetch('/api/carddav/sync', { method: 'DELETE' })
    setIcloudSavedAppleId(null)
    setIcloudLastSynced(null)
    setIcloudResult(null)
    setIcloudPassword('')
    setShowIcloudForm(false)
    // Re-fill Apple ID for Apple users so reconnecting is easy
    if (isAppleUser && user?.email) setIcloudAppleId(user.email)
    else setIcloudAppleId('')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const providerLabel = isAppleUser ? 'Apple' : user?.app_metadata?.provider === 'google' ? 'Google' : 'Email'

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Settings" />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        <div className="space-y-4">

          {/* iCloud callout for Apple users who haven't connected yet */}
          {isAppleUser && !icloudSavedAppleId && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
              <Cloud className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900">Connect your iCloud Contacts</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  You're signed in with Apple. Add an app-specific password below to sync your iCloud contacts automatically.
                </p>
              </div>
            </div>
          )}

          {/* Account */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Account</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">Email</label>
                <p className="text-sm font-medium text-gray-900 mt-0.5">{user?.email}</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Signed in with</label>
                <p className="text-sm text-gray-700 mt-0.5">{providerLabel}</p>
              </div>
              <Button variant="danger" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
          </div>

          {/* iCloud Contacts */}
          <div className={`bg-white rounded-xl border p-5 ${isAppleUser && !icloudSavedAppleId ? 'border-blue-300' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-4">
              <Cloud className={`w-4 h-4 ${isAppleUser && !icloudSavedAppleId ? 'text-blue-500' : 'text-gray-400'}`} />
              <h2 className="text-sm font-semibold text-gray-900">iCloud Contacts</h2>
            </div>

            {icloudSavedAppleId && !showIcloudForm ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">Connected as</label>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{icloudSavedAppleId}</p>
                </div>
                {icloudLastSynced && (
                  <div>
                    <label className="text-xs text-gray-500">Last synced</label>
                    <p className="text-sm text-gray-700 mt-0.5">{new Date(icloudLastSynced).toLocaleString()}</p>
                  </div>
                )}
                {icloudResult && (
                  <div className="bg-green-50 rounded-lg p-3 text-xs text-green-700">
                    Synced {icloudResult.total} contacts — {icloudResult.created} added, {icloudResult.updated} updated
                    {icloudResult.skipped > 0 && `, ${icloudResult.skipped} skipped`}
                  </div>
                )}
                {icloudError && <p className="text-xs text-red-600">{icloudError}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" onClick={handleIcloudSync} loading={icloudSyncing}>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Sync now
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowIcloudForm(true)}>
                    Update password
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleIcloudDisconnect}>
                    <Unlink className="w-3.5 h-3.5" />
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {isAppleUser ? (
                  <p className="text-sm text-gray-500">
                    Your Apple ID is pre-filled. Generate an app-specific password to authorize access to your contacts.
                  </p>
                ) : (
                  <p className="text-sm text-gray-500">
                    Sync your iCloud contacts directly — no file export needed.
                  </p>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Apple ID</label>
                  <input
                    type="email"
                    value={icloudAppleId}
                    onChange={(e) => setIcloudAppleId(e.target.value)}
                    placeholder="you@icloud.com"
                    readOnly={isAppleUser && !showIcloudForm}
                    className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isAppleUser && !showIcloudForm ? 'bg-gray-50 text-gray-500' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">App-specific password</label>
                  <input
                    type="password"
                    value={icloudPassword}
                    onChange={(e) => setIcloudPassword(e.target.value)}
                    placeholder="xxxx-xxxx-xxxx-xxxx"
                    autoFocus={isAppleUser}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Generate at{' '}
                    <span className="font-medium text-gray-500">appleid.apple.com</span>
                    {' '}→ Sign-In and Security → App-Specific Passwords
                  </p>
                </div>

                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={icloudSave}
                    onChange={(e) => setIcloudSave(e.target.checked)}
                    className="rounded"
                  />
                  Remember credentials
                </label>

                {icloudError && <p className="text-xs text-red-600">{icloudError}</p>}

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={handleIcloudSync}
                    loading={icloudSyncing}
                    disabled={!icloudAppleId || !icloudPassword}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {icloudSavedAppleId ? 'Save & sync' : 'Connect & sync'}
                  </Button>
                  {showIcloudForm && (
                    <Button variant="outline" size="sm" onClick={() => { setShowIcloudForm(false); setIcloudPassword('') }}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Enable browser notifications to receive reminders for your interactions.
              </p>
              {notificationPermission === 'granted' ? (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <Check className="w-4 h-4" />
                  Notifications are enabled
                </div>
              ) : notificationPermission === 'denied' ? (
                <div className="text-sm text-red-600">
                  Notifications are blocked. Please enable them in your browser settings.
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={requestNotifications}>
                  <Bell className="w-3.5 h-3.5" />
                  Enable notifications
                </Button>
              )}
            </div>
          </div>

          {/* Database */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Database</h2>
            </div>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500">Provider</label>
                <p className="text-sm text-gray-700 mt-0.5">Supabase (PostgreSQL)</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Supabase URL</label>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">
                  {process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'Not configured'}
                </p>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Data is stored securely in Supabase and synced across all your devices.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
