'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Users, Filter, Upload } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ContactCard } from '@/components/contacts/ContactCard'
import { ContactForm } from '@/components/contacts/ContactForm'
import { VCardImportModal } from '@/components/contacts/VCardImportModal'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
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
  const [importOpen, setImportOpen] = useState(false)

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

  async function handleCreate(values: { name: string; company?: string; category?: string; role?: string; location?: string; phone?: string; email?: string }) {
    setSaving(true)
    await supabase.from('contacts').insert({
      name: values.name,
      company: values.company || null,
      category: values.category || null,
      role: values.role || null,
      location: values.location || null,
      phone: values.phone || null,
      email: values.email || null,
    })
    setSaving(false)
    setFormOpen(false)
    fetchContacts()
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
  }

  async function handleDelete() {
    if (!deleteContact) return
    setDeleting(true)
    await supabase.from('contacts').delete().eq('id', deleteContact.id)
    setDeleting(false)
    setDeleteContact(null)
    fetchContacts()
  }

  async function handleVCardImport(contacts: { name: string; company?: string; role?: string; phone?: string; email?: string; location?: string }[]) {
    // Fetch existing emails/phones to detect duplicates
    const { data: existing } = await supabase.from('contacts').select('email, phone')
    const existingEmails = new Set((existing ?? []).map((c) => c.email).filter(Boolean))
    const existingPhones = new Set((existing ?? []).map((c) => c.phone).filter(Boolean))

    let success = 0
    let skipped = 0
    const errors: string[] = []

    for (const contact of contacts) {
      // Skip duplicates by email or phone
      if (contact.email && existingEmails.has(contact.email)) { skipped++; continue }
      if (contact.phone && existingPhones.has(contact.phone)) { skipped++; continue }

      const { error } = await supabase.from('contacts').insert({
        name: contact.name,
        company: contact.company || null,
        role: contact.role || null,
        phone: contact.phone || null,
        email: contact.email || null,
        location: contact.location || null,
      })

      if (error) {
        errors.push(contact.name)
      } else {
        success++
        if (contact.email) existingEmails.add(contact.email)
        if (contact.phone) existingPhones.add(contact.phone)
      }
    }

    if (success > 0) fetchContacts()
    return { success, skipped, errors }
  }

  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...CONTACT_CATEGORIES.map((c) => ({ value: c, label: c })),
  ]

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Contacts"
        description={`${contacts.length} contact${contacts.length !== 1 ? 's' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4" />
              Import
            </Button>
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
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-32" />
                    <div className="h-3 bg-gray-200 rounded w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : contacts.length === 0 ? (
          <EmptyState
            icon={<Users className="w-6 h-6" />}
            title={search || categoryFilter ? 'No contacts found' : 'No contacts yet'}
            description={
              search || categoryFilter
                ? 'Try adjusting your filters'
                : 'Add your first contact to get started'
            }
            action={
              !search && !categoryFilter ? (
                <Button onClick={() => setFormOpen(true)}>
                  <Plus className="w-4 h-4" />
                  Add Contact
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onEdit={() => setEditContact(contact)}
                onDelete={() => setDeleteContact(contact)}
              />
            ))}
          </div>
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

      {/* vCard import */}
      <VCardImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImport={handleVCardImport}
      />

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
  )
}
