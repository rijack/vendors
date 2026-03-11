'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Bell, Check, User, Database, Cloud, RefreshCw, Unlink, ChevronDown, ChevronUp, List } from 'lucide-react'

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

  // Book picker state
  const [showBookPicker, setShowBookPicker] = useState(false)
  const [books, setBooks] = useState<{ url: string; name: string }[]>([])
  const [booksLoading, setBooksLoading] = useState(false)
  const [booksError, setBooksError] = useState('')
  const [selectedBooks, setSelectedBooks] = useState<string[]>([]) // empty = all

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
        setSelectedBooks(d.selected_books ?? [])
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

  async function handleOpenBookPicker() {
    setShowBookPicker(true)
    if (books.length > 0) return
    setBooksLoading(true)
    setBooksError('')
    try {
      const res = await fetch('/api/carddav/books')
      const data = await res.json()
      if (!res.ok) setBooksError(data.error ?? 'Failed to load lists')
      else setBooks(data.books ?? [])
    } catch {
      setBooksError('Network error')
    }
    setBooksLoading(false)
  }

  function toggleBook(url: string) {
    setSelectedBooks((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    )
  }

  async function handleSaveBooks() {
    setIcloudSyncing(true)
    setIcloudError('')
    setIcloudResult(null)
    setShowBookPicker(false)
    try {
      const res = await fetch('/api/carddav/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ selected_books: selectedBooks }),
      })
      const data = await res.json()
      if (!res.ok) setIcloudError(data.error ?? 'Sync failed')
      else { setIcloudResult(data); setIcloudLastSynced(new Date().toISOString()) }
    } catch {
      setIcloudError('Network error')
    }
    setIcloudSyncing(false)
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
                <div className="flex items-start justify-between">
                  <div>
                    <label className="text-xs text-gray-500">Connected as</label>
                    <p className="text-sm font-medium text-gray-900 mt-0.5">{icloudSavedAppleId}</p>
                  </div>
                  {icloudLastSynced && (
                    <div className="text-right">
                      <label className="text-xs text-gray-500">Last synced</label>
                      <p className="text-xs text-gray-600 mt-0.5">{new Date(icloudLastSynced).toLocaleString()}</p>
                    </div>
                  )}
                </div>

                {/* Book picker */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={showBookPicker ? () => setShowBookPicker(false) : handleOpenBookPicker}
                    className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <List className="w-3.5 h-3.5 text-gray-400" />
                      {selectedBooks.length === 0
                        ? 'All lists'
                        : `${selectedBooks.length} list${selectedBooks.length !== 1 ? 's' : ''} selected`}
                    </span>
                    {showBookPicker ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                  </button>

                  {showBookPicker && (
                    <div className="border-t border-gray-200 bg-gray-50 p-3 space-y-2">
                      {booksLoading ? (
                        <p className="text-xs text-gray-400 py-1">Loading lists...</p>
                      ) : booksError ? (
                        <p className="text-xs text-red-600">{booksError}</p>
                      ) : (
                        <>
                          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                            <input
                              type="checkbox"
                              checked={selectedBooks.length === 0}
                              onChange={() => setSelectedBooks([])}
                              className="rounded"
                            />
                            <span className="font-medium">All lists</span>
                          </label>
                          <div className="border-t border-gray-200 pt-2 space-y-1.5">
                            {books.map((book) => (
                              <label key={book.url} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                                <input
                                  type="checkbox"
                                  checked={selectedBooks.includes(book.url)}
                                  onChange={() => toggleBook(book.url)}
                                  className="rounded"
                                />
                                {book.name}
                              </label>
                            ))}
                          </div>
                          <div className="flex gap-2 pt-1 border-t border-gray-200">
                            <Button size="sm" onClick={handleSaveBooks} loading={icloudSyncing}>
                              <RefreshCw className="w-3 h-3" />
                              Save & sync
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setShowBookPicker(false)}>
                              Cancel
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

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
