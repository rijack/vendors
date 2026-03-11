'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Bell, Check, User, Database } from 'lucide-react'

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default')

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission)
    }
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

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Settings" />
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto w-full">
        <div className="space-y-4">

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
                <label className="text-xs text-gray-500">User ID</label>
                <p className="text-xs text-gray-400 mt-0.5 font-mono">{user?.id}</p>
              </div>
              <Button variant="danger" size="sm" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
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

          {/* macOS Companion */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              <h2 className="text-sm font-semibold text-gray-900">macOS Companion App</h2>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              The optional macOS Electron companion app provides bi-directional sync with your macOS Contacts app and native push notifications for reminders.
            </p>
            <div className="bg-amber-50 rounded-lg p-3 text-xs text-amber-700">
              Coming soon — the companion app is in development.
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
