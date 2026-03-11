import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Auth
  getSession: () => ipcRenderer.invoke('get-session'),
  login: (email: string) => ipcRenderer.invoke('login', email),
  verifyOtp: (email: string, token: string) => ipcRenderer.invoke('verify-otp', email, token),
  logout: () => ipcRenderer.invoke('logout'),

  // Contacts
  getMacContacts: () => ipcRenderer.invoke('get-mac-contacts'),
  getLinkedIds: () => ipcRenderer.invoke('get-linked-ids'),
  importContact: (macosId: string) => ipcRenderer.invoke('import-contact', macosId),
  unlinkContact: (macosId: string) => ipcRenderer.invoke('unlink-contact', macosId),
  syncNow: () => ipcRenderer.invoke('sync-now'),

  // Events from main
  onSyncStatus: (cb: (msg: string) => void) =>
    ipcRenderer.on('sync-status', (_e, msg) => cb(msg)),
  offSyncStatus: () =>
    ipcRenderer.removeAllListeners('sync-status'),
})
