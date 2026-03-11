'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Users, Filter, RefreshCw, ChevronUp, ChevronDown, ChevronsUpDown, Trash2, Mail, Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ContactForm } from '@/components/contacts/ContactForm'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { Toast, type ToastMessage } from '@/components/ui/Toast'
import { CONTACT_CATEGORIES } from '@/lib/constants'
import type { Contact } from '@/types'

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editContact, setEditContact] = useState<Contact | null>(null)
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [sortKey, setSortKey] = useState<'name' | 'company' | 'role' | 'email' | 'phone'>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // iCloud sync state
  const [icloudConnected, setIcloudConnected] = useState(false)
  const [icloudSyncing, setIcloudSyncing] = useState(false)
  const icloudChecked = useRef(false)

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const toastId = useRef(0)
  function addToast(type: ToastMessage['type'], message: string) {
    const id = ++toastId.current
    setToasts((prev) => [...prev, { id, type, message }])
  }
  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  const supabase = createClient()

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('contacts')
      .select('*')
      .order('name')

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,company.ilike.%${search}%,email.ilike.%${search}%,role.ilike.%${search}%`
      )
    }
    if (categoryFilter) {
      query = query.eq('category', categoryFilter)
    }

    const { data } = await query
    setContacts(data ?? [])
    setLoading(false)
  }, [search, categoryFilter])

  useEffect(() => {
    fetchContacts()
  }, [fetchContacts])

  // Sync on mount
  useEffect(() => {
    if (icloudChecked.current) return
    icloudChecked.current = true

    fetch('/api/carddav/sync')
      .then((r) => r.json())
      .then((d) => {
        if (!d.apple_id) return
        setIcloudConnected(true)
        setIcloudSyncing(true)
        fetch('/api/carddav/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
          .then((r) => r.json())
          .then(() => fetchContacts())
          .catch(() => {})
          .finally(() => setIcloudSyncing(false))
      })
      .catch(() => {})
  }, [fetchContacts])

  // Manually pull latest contacts from iCloud
  async function syncFromiCloud() {
    if (!icloudConnected) return
    setIcloudSyncing(true)
    try {
      const res = await fetch('/api/carddav/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const result = await res.json()
      if (!res.ok) {
        addToast('error', `iCloud sync failed: ${result.error ?? 'Unknown error'}`)
      } else {
        fetchContacts()
        addToast('success', `Synced — ${result.updated} updated, ${result.created} added`)
      }
    } catch {
      addToast('error', 'iCloud sync failed: network error')
    } finally {
      setIcloudSyncing(false)
    }
  }

  // Push a contact to iCloud after create/update
  function pushToiCloud(contactId: string) {
    if (!icloudConnected) return
    fetch('/api/carddav/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact_id: contactId }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) addToast('error', `iCloud sync failed: ${d.error}`)
        else if (!d.skipped) addToast('success', 'Synced to iCloud')
      })
      .catch(() => addToast('error', 'iCloud sync failed: network error'))
  }

  // Delete a contact from iCloud
  function deleteFromiCloud(macosContactId: string | null) {
    if (!icloudConnected || !macosContactId) return
    fetch('/api/carddav/push', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ macos_contact_id: macosContactId }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.error) addToast('error', `iCloud delete failed: ${d.error}`) })
      .catch(() => addToast('error', 'iCloud delete failed: network error'))
  }

  async function handleCreate(values: { name: string; company?: string; category?: string; role?: string; location?: string; phone?: string; email?: string }) {
    setSaving(true)
    const { data: inserted } = await supabase.from('contacts').insert({
      name: values.name,
      company: values.company || null,
      category: values.category || null,
      role: values.role || null,
      location: values.location || null,
      phone: values.phone || null,
      email: values.email || null,
    }).select().single()
    setSaving(false)
    setFormOpen(false)
    fetchContacts()
    if (inserted?.id) pushToiCloud(inserted.id)
  }

  async function handleUpdate(values: { name: string; company?: string; category?: string; role?: string; location?: string; phone?: string; email?: string }) {
    if (!editContact) return
    setSaving(true)
    await supabase
      .from('contacts')
      .update({
        name: values.name,
        company: values.company || null,
        category: values.category || null,
        role: values.role || null,
        location: values.location || null,
        phone: values.phone || null,
        email: values.email || null,
      })
      .eq('id', editContact.id)
    setSaving(false)
    setEditContact(null)
    fetchContacts()
    pushToiCloud(editContact.id)
  }

  async function handleDelete() {
    if (!deleteContact) return
    setDeleting(true)
    const macosId = deleteContact.macos_contact_id
    await supabase.from('contacts').delete().eq('id', deleteContact.id)
    setDeleting(false)
    setDeleteContact(null)
    fetchContacts()
    deleteFromiCloud(macosId)
  }


  function handleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const sortedContacts = [...contacts].sort((a, b) => {
    const av = (a[sortKey] ?? '').toLowerCase()
    const bv = (b[sortKey] ?? '').toLowerCase()
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
  })

  function SortIcon({ col }: { col: typeof sortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="w-3.5 h-3.5 text-gray-300" />
    return sortDir === 'asc'
      ? <ChevronUp className="w-3.5 h-3.5 text-blue-500" />
      : <ChevronDown className="w-3.5 h-3.5 text-blue-500" />
  }

  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...CONTACT_CATEGORIES.map((c) => ({ value: c, label: c })),
  ]

  return (
    <>
    <div className="flex flex-col h-full">
      <PageHeader
        title="Contacts"
        description={
          icloudSyncing
            ? 'Syncing with iCloud...'
            : `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`
        }
        actions={
          <div className="flex items-center gap-2">
            {icloudConnected && (
              <Button variant="outline" onClick={syncFromiCloud} loading={icloudSyncing}>
                <RefreshCw className="w-4 h-4" />
                Sync
              </Button>
            )}
<Button onClick={() => setFormOpen(true)}>
              <Plus className="w-4 h-4" />
              Add Contact
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3 shrink-0">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search contacts..."
          className="flex-1 max-w-xs"
        />
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="divide-y divide-gray-100">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-3 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-36" />
                <div className="h-4 bg-gray-200 rounded w-28" />
                <div className="h-4 bg-gray-200 rounded w-24" />
                <div className="h-4 bg-gray-200 rounded w-40" />
              </div>
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Users className="w-6 h-6" />}
              title={search || categoryFilter ? 'No contacts found' : 'No contacts yet'}
              description={search || categoryFilter ? 'Try adjusting your filters' : 'Add your first contact to get started'}
              action={!search && !categoryFilter ? (
                <Button onClick={() => setFormOpen(true)}><Plus className="w-4 h-4" />Add Contact</Button>
              ) : undefined}
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
              <tr>
                {([
                  { key: 'name', label: 'Name' },
                  { key: 'company', label: 'Company' },
                  { key: 'role', label: 'Role' },
                  { key: 'email', label: 'Email' },
                  { key: 'phone', label: 'Phone' },
                ] as { key: typeof sortKey; label: string }[]).map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700"
                  >
                    <div className="flex items-center gap-1">
                      {label}
                      <SortIcon col={key} />
                    </div>
                  </th>
                ))}
                <th className="px-4 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {sortedContacts.map((contact) => (
                <tr
                  key={contact.id}
                  onClick={() => setEditContact(contact)}
                  className="group hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{contact.name}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{contact.company ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{contact.role ?? <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {contact.email
                      ? <a href={`mailto:${contact.email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 hover:text-blue-600"><Mail className="w-3.5 h-3.5 shrink-0" />{contact.email}</a>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {contact.phone
                      ? <a href={`tel:${contact.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 hover:text-blue-600"><Phone className="w-3.5 h-3.5 shrink-0" />{contact.phone}</a>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); setDeleteContact(contact) }} className="p-1.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create form */}
      <ContactForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreate}
        loading={saving}
      />

      {/* Edit form */}
      {editContact && (
        <ContactForm
          open={!!editContact}
          onClose={() => setEditContact(null)}
          onSubmit={handleUpdate}
          initial={editContact}
          loading={saving}
        />
      )}


      {/* Delete confirm */}
      <Modal
        open={!!deleteContact}
        onClose={() => setDeleteContact(null)}
        title="Delete contact"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteContact(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to delete <strong>{deleteContact?.name}</strong>? This action cannot be undone.
        </p>
      </Modal>
    </div>
    <Toast toasts={toasts} onDismiss={dismissToast} />
    </>
  )
}
