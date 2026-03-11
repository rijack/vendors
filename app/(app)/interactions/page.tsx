'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, GitMerge, Bell, BellOff, Pencil, Trash2, Filter } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { InteractionForm } from '@/components/interactions/InteractionForm'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import { STATUS_LABELS, INTERACTION_STATUSES } from '@/lib/constants'
import { formatDate, formatDateTime } from '@/lib/utils'
import type { Interaction, Vendor, Contact, InteractionStatus } from '@/types'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

export default function InteractionsPage() {
  const searchParams = useSearchParams()
  const preselectedVendorId = searchParams.get('vendor') ?? ''

  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [statusFilter, setStatusFilter] = useState<InteractionStatus | ''>('')
  const [vendorFilter, setVendorFilter] = useState(preselectedVendorId)
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(!!preselectedVendorId)
  const [editInteraction, setEditInteraction] = useState<Interaction | null>(null)
  const [deleteInteraction, setDeleteInteraction] = useState<Interaction | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const supabase = createClient()

  const fetchData = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('interactions')
      .select(`
        *,
        vendors(id, company_name),
        contacts(id, name, company)
      `)
      .order('created_at', { ascending: false })

    if (statusFilter) query = query.eq('status', statusFilter)
    if (vendorFilter) query = query.eq('vendor_id', vendorFilter)

    const [{ data: interactionsData }, { data: vendorsData }, { data: contactsData }] =
      await Promise.all([
        query,
        supabase.from('vendors').select('id, company_name').order('company_name'),
        supabase.from('contacts').select('id, name, company').order('name'),
      ])

    setInteractions(
      (interactionsData ?? []).map((i: any) => ({
        ...i,
        vendor: i.vendors,
        contact: i.contacts,
      }))
    )
    setVendors((vendorsData ?? []) as Vendor[])
    setContacts((contactsData ?? []) as Contact[])
    setLoading(false)
  }, [statusFilter, vendorFilter])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Browser notifications for due reminders
  useEffect(() => {
    async function checkReminders() {
      if (Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      if (Notification.permission !== 'granted') return

      const now = new Date().toISOString()
      const { data } = await supabase
        .from('interactions')
        .select('*, vendors(company_name), contacts(name)')
        .lte('reminder_at', now)
        .is('reminded_at', null)

      if (!data) return

      for (const interaction of data) {
        const vendorName = (interaction as any).vendors?.company_name ?? 'Unknown Vendor'
        const contactName = (interaction as any).contacts?.name
        const body = contactName
          ? `${STATUS_LABELS[interaction.status as InteractionStatus]} with ${contactName}`
          : STATUS_LABELS[interaction.status as InteractionStatus]

        new Notification(`Reminder: ${vendorName}`, { body })

        await supabase
          .from('interactions')
          .update({ reminded_at: now })
          .eq('id', interaction.id)
      }
    }

    checkReminders()
    const interval = setInterval(checkReminders, 60_000)
    return () => clearInterval(interval)
  }, [])

  async function handleCreate(values: {
    vendor_id: string
    contact_id?: string
    status: string
    notes?: string
    reminder_at?: string
  }) {
    setSaving(true)
    await supabase.from('interactions').insert({
      vendor_id: values.vendor_id,
      contact_id: values.contact_id || null,
      status: values.status,
      notes: values.notes || null,
      reminder_at: values.reminder_at || null,
    })
    setSaving(false)
    setFormOpen(false)
    fetchData()
  }

  async function handleUpdate(values: {
    vendor_id: string
    contact_id?: string
    status: string
    notes?: string
    reminder_at?: string
  }) {
    if (!editInteraction) return
    setSaving(true)
    await supabase
      .from('interactions')
      .update({
        vendor_id: values.vendor_id,
        contact_id: values.contact_id || null,
        status: values.status,
        notes: values.notes || null,
        reminder_at: values.reminder_at || null,
        reminded_at: null, // reset reminded_at if reminder changes
      })
      .eq('id', editInteraction.id)
    setSaving(false)
    setEditInteraction(null)
    fetchData()
  }

  async function handleDelete() {
    if (!deleteInteraction) return
    setDeleting(true)
    await supabase.from('interactions').delete().eq('id', deleteInteraction.id)
    setDeleting(false)
    setDeleteInteraction(null)
    fetchData()
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Interactions"
        description={`${interactions.length} interaction${interactions.length !== 1 ? 's' : ''}`}
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="w-4 h-4" />
            New Interaction
          </Button>
        }
      />

      {/* Filters */}
      <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3 shrink-0 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400" />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as InteractionStatus | '')}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          {INTERACTION_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Vendors</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.company_name}</option>
          ))}
        </select>
        {(statusFilter || vendorFilter) && (
          <button
            onClick={() => { setStatusFilter(''); setVendorFilter('') }}
            className="text-xs text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse h-16" />
            ))}
          </div>
        ) : interactions.length === 0 ? (
          <EmptyState
            icon={<GitMerge className="w-6 h-6" />}
            title={statusFilter || vendorFilter ? 'No interactions found' : 'No interactions yet'}
            description={
              statusFilter || vendorFilter
                ? 'Try adjusting your filters'
                : 'Track the status of your vendor relationships'
            }
            action={
              !statusFilter && !vendorFilter ? (
                <Button onClick={() => setFormOpen(true)}>
                  <Plus className="w-4 h-4" />
                  New Interaction
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {interactions.map((interaction) => (
              <div
                key={interaction.id}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <StatusBadge status={interaction.status} />
                      {interaction.vendor && (
                        <Link
                          href={`/vendors/${interaction.vendor_id}`}
                          className="text-sm font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                        >
                          {interaction.vendor.company_name}
                        </Link>
                      )}
                      {interaction.contact && (
                        <span className="text-sm text-gray-500">
                          with {interaction.contact.name}
                        </span>
                      )}
                    </div>
                    {interaction.notes && (
                      <p className="text-sm text-gray-500 truncate">{interaction.notes}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-gray-400">{formatDate(interaction.created_at)}</span>
                      {interaction.reminder_at && (
                        <span className={`flex items-center gap-1 text-xs ${
                          interaction.reminded_at ? 'text-gray-400' : 'text-amber-600'
                        }`}>
                          {interaction.reminded_at ? (
                            <BellOff className="w-3 h-3" />
                          ) : (
                            <Bell className="w-3 h-3" />
                          )}
                          Reminder: {formatDateTime(interaction.reminder_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => setEditInteraction(interaction)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteInteraction(interaction)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create form */}
      <InteractionForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreate}
        vendors={vendors}
        contacts={contacts}
        preselectedVendorId={preselectedVendorId}
        loading={saving}
      />

      {/* Edit form */}
      {editInteraction && (
        <InteractionForm
          open={!!editInteraction}
          onClose={() => setEditInteraction(null)}
          onSubmit={handleUpdate}
          initial={editInteraction}
          vendors={vendors}
          contacts={contacts}
          loading={saving}
        />
      )}

      {/* Delete confirm */}
      <Modal
        open={!!deleteInteraction}
        onClose={() => setDeleteInteraction(null)}
        title="Delete interaction"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteInteraction(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to delete this interaction? This action cannot be undone.
        </p>
      </Modal>
    </div>
  )
}
