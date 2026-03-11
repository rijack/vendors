import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import {
  checkContactsAccess,
  getAllMacContacts,
  importContact,
  unlinkContact,
  syncAll,
} from './sync.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://geeeeiixbaqfpiawxybd.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_dV-dJKdqFHexl7Inn3p7Kw_97MRmy44'
const SYNC_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// ── State ────────────────────────────────────────────────────────────────────

let tray: Tray | null = null
let win: BrowserWindow | null = null
let supabase: SupabaseClient | null = null
let session: Session | null = null
let syncTimer: NodeJS.Timeout | null = null
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let store: any

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  const { default: Store } = await import('electron-store')
  store = new Store()

  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })

  // Restore persisted session
  const savedSession = store.get('session') as Session | undefined
  if (savedSession) {
    const { data } = await supabase.auth.setSession({
      access_token: savedSession.access_token,
      refresh_token: savedSession.refresh_token,
    })
    session = data.session
    if (session) store.set('session', session)
  }

  supabase.auth.onAuthStateChange((_event, s) => {
    session = s
    if (s) store.set('session', s)
    else store.delete('session')
  })

  createTray()
  createWindow()
  checkContactsAccess()

  if (session) startSyncLoop()
})

// Keep the app alive in tray when all windows are closed
app.on('window-all-closed', () => { /* intentionally empty */ })

// ── Tray ─────────────────────────────────────────────────────────────────────

function createTray() {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('Vendor Tracker')
  updateTrayMenu()
  tray.on('double-click', showWindow)
}

function updateTrayMenu() {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: session ? 'Contacts Sync' : 'Sign In', click: showWindow },
    { type: 'separator' },
    { label: 'Sync Now', enabled: !!session, click: () => runSync() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.exit(0) },
  ])
  tray.setContextMenu(menu)
}

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  win = new BrowserWindow({
    width: 480,
    height: 640,
    show: false,
    resizable: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadFile(path.join(__dirname, '../src/index.html'))

  win.on('close', (e) => {
    e.preventDefault()
    win?.hide()
  })
}

function showWindow() {
  if (!win) createWindow()
  win?.show()
  win?.focus()
}

// ── Sync loop ────────────────────────────────────────────────────────────────

function startSyncLoop() {
  if (syncTimer) clearInterval(syncTimer)
  syncTimer = setInterval(runSync, SYNC_INTERVAL_MS)
  runSync()
}

async function runSync() {
  if (!supabase || !session) return
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  try {
    const { updated, pushed } = await syncAll(supabase)
    const msg = `Sync complete — ${updated} updated from Contacts, ${pushed} pushed to Contacts`
    win?.webContents.send('sync-status', msg)
    tray?.setToolTip(`Vendor Tracker — Last sync: ${new Date().toLocaleTimeString()}`)
  } catch (err) {
    console.error('Sync error:', err)
  }
}

// ── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-session', () => {
  return session ? { email: session.user?.email } : null
})

ipcMain.handle('login', async (_e, email: string) => {
  if (!supabase) return { error: 'Not initialized' }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  })
  if (error) return { error: error.message }
  return { ok: true }
})

ipcMain.handle('verify-otp', async (_e, email: string, token: string) => {
  if (!supabase) return { error: 'Not initialized' }
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error) return { error: error.message }
  session = data.session
  store?.set('session', session)
  startSyncLoop()
  updateTrayMenu()
  return { ok: true }
})

ipcMain.handle('logout', async () => {
  if (!supabase) return
  await supabase.auth.signOut()
  session = null
  store?.delete('session')
  if (syncTimer) clearInterval(syncTimer)
  updateTrayMenu()
})

ipcMain.handle('get-mac-contacts', async () => {
  const ok = checkContactsAccess()
  if (!ok) return { error: 'Contacts access denied. Go to System Settings → Privacy & Security → Contacts and enable Vendor Tracker.' }
  const contacts = getAllMacContacts()
  return contacts.map((c) => ({
    identifier: c.identifier,
    name: c.name || 'Unknown',
    company: c.company || '',
    email: c.email || '',
    phone: c.phone || '',
  }))
})

ipcMain.handle('get-linked-ids', async () => {
  if (!supabase || !session) return []
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  const { data } = await supabase
    .from('contacts')
    .select('macos_contact_id')
    .not('macos_contact_id', 'is', null)
  return (data ?? []).map((r: { macos_contact_id: string }) => r.macos_contact_id)
})

ipcMain.handle('import-contact', async (_e, macosId: string) => {
  if (!supabase || !session) return { error: 'Not signed in' }
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  try {
    await importContact(supabase, macosId)
    return { ok: true }
  } catch (err: any) {
    return { error: err.message }
  }
})

ipcMain.handle('unlink-contact', async (_e, macosId: string) => {
  if (!supabase || !session) return { error: 'Not signed in' }
  await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  })
  await unlinkContact(supabase, macosId)
  return { ok: true }
})

ipcMain.handle('sync-now', async () => {
  await runSync()
  return { ok: true }
})
