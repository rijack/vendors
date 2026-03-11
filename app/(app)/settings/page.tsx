'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Bell, Check, User, Database, Cloud, RefreshCw, Unlink, CheckCircle2, ChevronDown, ChevronUp, List } from 'lucide-react'

type ICloudPhase = 'form' | 'picking' | 'connected'

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')

  // iCloud phase
  const [icloudPhase, setIcloudPhase] = useState<ICloudPhase>('form')

  // form state
  const [icloudAppleId, setIcloudAppleId] = useState('')
  const [icloudPassword, setIcloudPassword] = useState('')
  const [icloudSave, setIcloudSave] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  // picking state
  const [books, setBooks] = useState<{ url: string; name: string }[]>([])
  const [syncMode, setSyncMode] = useState<'all' | 'lists' | 'contacts'>('all')
  const [selectedBooks, setSelectedBooks] = useState<string[]>([])
  const [expandedBook, setExpandedBook] = useState<string | null>(null)
  const [bookContacts, setBookContacts] = useState<Record<string, { uid: string; name: string; email: string | null; company: string | null }[]>>({})
  const [contactsLoading, setContactsLoading] = useState(false)
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')

  // groups state (for "Specific lists" mode)
  const [groups, setGroups] = useState<{ uid: string; name: string; memberUids: string[] }[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)

  // connected state
  const [icloudSavedAppleId, setIcloudSavedAppleId] = useState<string | null>(null)
  const [icloudLastSynced, setIcloudLastSynced] = useState<string | null>(null)
  const [syncResult, setSyncResult] = useState<{ total: number; created: number; updated: number; skipped: number } | null>(null)

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
        if (d.apple_id) {
          setIcloudSavedAppleId(d.apple_id)
          setIcloudLastSynced(d.last_synced_at ?? null)
          // selected_books stores group UIDs (not book URLs) when in groups mode
          const savedBooks: string[] = d.selected_books ?? []
          const savedContacts: string[] = d.selected_contacts ?? []
          setSelectedContacts(savedContacts)
          // If saved "books" look like UUIDs (not URLs), restore as selected groups
          if (savedBooks.length > 0 && !savedBooks[0].startsWith('http')) {
            setSelectedGroups(savedBooks)
            if (savedContacts.length > 0) setSyncMode('lists')
          } else {
            setSelectedBooks(savedBooks)
          }
          if (d.last_synced_at) {
            setIcloudPhase('connected')
          } else {
            // Has credentials but never synced — go straight to picking
            setIcloudAppleId(d.apple_id)
            fetch('/api/carddav/books')
              .then((r) => r.json())
              .then((bd) => {
                if (bd.books) { setBooks(bd.books); setIcloudPhase('picking') }
                else setIcloudPhase('form')
              })
              .catch(() => setIcloudPhase('form'))
          }
        } else {
          setIcloudPhase('form')
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (syncMode !== 'lists' || groups.length > 0 || groupsLoading || icloudPhase !== 'picking') return
    setGroupsLoading(true)
    fetch('/api/carddav/groups')
      .then((r) => r.json())
      .then((d) => { if (d.groups) setGroups(d.groups) })
      .finally(() => setGroupsLoading(false))
  }, [syncMode, icloudPhase])

  async function requestNotifications() {
    const permission = await Notification.requestPermission()
    setNotificationPermission(permission)
    if (permission === 'granted') {
      new Notification('Vendor Tracker', {
        body: 'Notifications are enabled! You will now receive reminders.',
      })
    }
  }

  async function handleConnect() {
    setConnecting(true)
    setConnectError('')
    const res = await fetch('/api/carddav/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apple_id: icloudAppleId, app_password: icloudPassword, save: icloudSave }),
    })
    const data = await res.json()
    setConnecting(false)
    if (!res.ok) { setConnectError(data.error ?? 'Connection failed'); return }
    setBooks(data.books ?? [])
    setIcloudSavedAppleId(icloudAppleId)
    setIcloudPassword('')
    setIcloudPhase('picking')
  }

  async function handleLoadContacts(bookUrl: string) {
    if (expandedBook === bookUrl) { setExpandedBook(null); return }
    setExpandedBook(bookUrl)
    if (bookContacts[bookUrl]) return // already loaded
    setContactsLoading(true)
    const res = await fetch('/api/carddav/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ book_url: bookUrl }),
    })
    const data = await res.json()
    if (res.ok) setBookContacts((prev) => ({ ...prev, [bookUrl]: data.contacts ?? [] }))
    setContactsLoading(false)
  }

  async function handleSync() {
    setSyncing(true)
    setSyncError('')
    const body: Record<string, unknown> = {}
    if (syncMode === 'lists') {
      if (groups.length > 0) {
        // Resolve group member UIDs from loaded groups data
        const memberUids = groups
          .filter((g) => selectedGroups.includes(g.uid))
          .flatMap((g) => g.memberUids)
        const uniqueUids = [...new Set(memberUids)]
        if (uniqueUids.length === 0) {
          setSyncError('The selected list has no contacts to sync.')
          setSyncing(false)
          return
        }
        body.selected_contacts = uniqueUids
        body.selected_books = []
        body.selected_groups = selectedGroups // saved for UI restoration
      }
      // If groups aren't loaded (connected phase), server re-resolves membership
      // from saved settings — if it comes back empty, server will sync nothing
    } else if (syncMode === 'contacts') {
      body.selected_books = []
      body.selected_contacts = selectedContacts
    } else {
      // 'all' — send empty arrays to sync everything
      body.selected_books = []
      body.selected_contacts = []
    }

    const res = await fetch('/api/carddav/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setSyncing(false)
    if (!res.ok) { setSyncError(data.error ?? 'Sync failed'); return }
    setSyncResult(data)
    setIcloudLastSynced(new Date().toISOString())
    setIcloudPhase('connected')
  }

  async function handleDisconnect() {
    await fetch('/api/carddav/sync', { method: 'DELETE' })
    setIcloudSavedAppleId(null)
    setIcloudLastSynced(null)
    setSyncResult(null)
    setIcloudAppleId(isAppleUser && user?.email ? user.email : '')
    setIcloudPassword('')
    setBooks([])
    setSelectedBooks([])
    setSelectedContacts([])
    setGroups([])
    setSelectedGroups([])
    setExpandedBook(null)
    setBookContacts({})
    setIcloudPhase('form')
  }

  async function handleChangeSelection() {
    setSyncError('')
    if (books.length === 0) {
      const res = await fetch('/api/carddav/books')
      const data = await res.json()
      if (data.books) setBooks(data.books)
    }
    setIcloudPhase('picking')
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  function toggleBook(url: string) {
    setSelectedBooks((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    )
  }

  function toggleGroup(uid: string) {
    setSelectedGroups((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid],
    )
  }

  function toggleContact(uid: string) {
    setSelectedContacts((prev) =>
      prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid],
    )
  }

  const providerLabel = isAppleUser ? 'Apple' : user?.app_metadata?.provider === 'google' ? 'Google' : 'Email'

  // Summary text for picking / connected phase
  function selectionSummary() {
    if (syncMode === 'all') return 'All contacts'
    if (syncMode === 'lists') {
      if (selectedGroups.length === 0) return 'No groups selected'
      const names = groups
        .filter((g) => selectedGroups.includes(g.uid))
        .map((g) => g.name)
      return names.length > 0
        ? names.join(', ')
        : `${selectedGroups.length} group${selectedGroups.length !== 1 ? 's' : ''} selected`
    }
    if (selectedContacts.length === 0) return 'No contacts selected'
    return `${selectedContacts.length} contact${selectedContacts.length !== 1 ? 's' : ''} selected`
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Settings" />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        <div className="space-y-4">

          {/* iCloud callout for Apple users who haven't connected yet */}
          {isAppleUser && !icloudSavedAppleId && icloudPhase === 'form' && (
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
          <div className={`bg-white rounded-xl border p-5 ${isAppleUser && icloudPhase === 'form' ? 'border-blue-300' : 'border-gray-200'}`}>
            <div className="flex items-center gap-2 mb-4">
              <Cloud className={`w-4 h-4 ${isAppleUser && icloudPhase === 'form' ? 'text-blue-500' : 'text-gray-400'}`} />
              <h2 className="text-sm font-semibold text-gray-900">iCloud Contacts</h2>
            </div>

            {/* ── FORM PHASE ── */}
            {icloudPhase === 'form' && (
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
                    readOnly={isAppleUser}
                    className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isAppleUser ? 'bg-gray-50 text-gray-500' : ''}`}
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

                {connectError && <p className="text-xs text-red-600">{connectError}</p>}

                <div className="flex items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={handleConnect}
                    loading={connecting}
                    disabled={!icloudAppleId || !icloudPassword}
                  >
                    <Cloud className="w-3.5 h-3.5" />
                    Connect
                  </Button>
                </div>
              </div>
            )}

            {/* ── PICKING PHASE ── */}
            {icloudPhase === 'picking' && (
              <div className="space-y-4">
                {/* Connected header */}
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Connected as <span className="font-medium">{icloudSavedAppleId}</span></span>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-800 mb-2">Choose what to sync</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="syncMode"
                        checked={syncMode === 'all'}
                        onChange={() => setSyncMode('all')}
                      />
                      All contacts
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="syncMode"
                        checked={syncMode === 'lists'}
                        onChange={() => setSyncMode('lists')}
                      />
                      Specific lists
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="syncMode"
                        checked={syncMode === 'contacts'}
                        onChange={() => setSyncMode('contacts')}
                      />
                      Specific contacts
                    </label>
                  </div>
                </div>

                {/* Lists mode: iCloud groups (KIND:group vCards) */}
                {syncMode === 'lists' && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {groupsLoading ? (
                      <div className="px-3 py-4 text-xs text-gray-400 text-center">Loading groups...</div>
                    ) : groups.length === 0 ? (
                      <div className="px-3 py-4 text-xs text-gray-400 text-center">
                        No groups found in iCloud Contacts
                      </div>
                    ) : (
                      groups.map((group, i) => (
                        <div key={group.uid} className={i > 0 ? 'border-t border-gray-100' : ''}>
                          <label className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={selectedGroups.includes(group.uid)}
                              onChange={() => toggleGroup(group.uid)}
                              className="rounded shrink-0"
                            />
                            <span className="flex-1 text-sm text-gray-700">{group.name}</span>
                            <span className="text-xs text-gray-400 shrink-0">
                              {group.memberUids.length} {group.memberUids.length === 1 ? 'contact' : 'contacts'}
                            </span>
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Contacts mode: expandable books with contact checkboxes */}
                {syncMode === 'contacts' && books.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {books.map((book, i) => (
                      <div key={book.url} className={i > 0 ? 'border-t border-gray-100' : ''}>
                        <button
                          onClick={() => handleLoadContacts(book.url)}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <span>{book.name}</span>
                          {expandedBook === book.url
                            ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                            : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                          }
                        </button>
                        {expandedBook === book.url && (
                          <div className="border-t border-gray-100 bg-gray-50 px-3 py-2 space-y-1.5 max-h-64 overflow-y-auto">
                            {contactsLoading && !bookContacts[book.url] ? (
                              <p className="text-xs text-gray-400 py-1">Loading contacts...</p>
                            ) : (bookContacts[book.url] ?? []).length === 0 ? (
                              <p className="text-xs text-gray-400 py-1">No contacts found</p>
                            ) : (
                              (bookContacts[book.url] ?? []).map((c) => (
                                <label key={c.uid} className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer hover:text-gray-900">
                                  <input
                                    type="checkbox"
                                    checked={selectedContacts.includes(c.uid)}
                                    onChange={() => toggleContact(c.uid)}
                                    className="rounded mt-0.5 shrink-0"
                                  />
                                  <span>
                                    <span className="font-medium">{c.name}</span>
                                    {c.email && <span className="block text-xs text-gray-400">{c.email}</span>}
                                  </span>
                                </label>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Summary */}
                <p className="text-xs text-gray-500">
                  Will sync: <span className="font-medium text-gray-700">{selectionSummary()}</span>
                </p>

                {syncError && <p className="text-xs text-red-600">{syncError}</p>}

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleSync}
                    loading={syncing}
                    disabled={
                      (syncMode === 'lists' && selectedGroups.length === 0) ||
                      (syncMode === 'contacts' && selectedContacts.length === 0)
                    }
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Sync selected
                  </Button>
                  {icloudLastSynced && (
                    <Button variant="outline" size="sm" onClick={() => setIcloudPhase('connected')}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* ── CONNECTED PHASE ── */}
            {icloudPhase === 'connected' && (
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

                <div className="text-xs text-gray-500">
                  Syncing:{' '}
                  <span className="font-medium text-gray-700">
                    {selectedGroups.length > 0
                      ? (groups.length > 0
                          ? groups.filter((g) => selectedGroups.includes(g.uid)).map((g) => g.name).join(', ')
                          : `${selectedGroups.length} group${selectedGroups.length !== 1 ? 's' : ''}`)
                      : selectedContacts.length > 0
                        ? `${selectedContacts.length} specific contact${selectedContacts.length !== 1 ? 's' : ''}`
                        : 'All contacts'}
                  </span>
                </div>

                {syncResult && (
                  <div className="bg-green-50 rounded-lg p-3 text-xs text-green-700">
                    Synced {syncResult.total} contacts — {syncResult.created} added, {syncResult.updated} updated
                    {syncResult.skipped > 0 && `, ${syncResult.skipped} skipped`}
                  </div>
                )}

                {syncError && <p className="text-xs text-red-600">{syncError}</p>}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button size="sm" onClick={handleSync} loading={syncing}>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Sync now
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleChangeSelection}>
                    <List className="w-3.5 h-3.5" />
                    Change selection
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setConnectError(''); setIcloudPhase('form') }}>
                    Update password
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDisconnect}>
                    <Unlink className="w-3.5 h-3.5" />
                    Disconnect
                  </Button>
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
