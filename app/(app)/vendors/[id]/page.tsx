'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Globe, Pencil, Trash2, PanelRightClose, PanelRightOpen, Plus, Users, GitMerge } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { VendorForm } from '@/components/vendors/VendorForm'
import { AssetPanel } from '@/components/vendors/AssetPanel'
import { ClaudeChat } from '@/components/claude/ClaudeChat'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import type { Vendor, VendorAsset, Contact, Interaction } from '@/types'

const BADGE_COLORS = ['blue', 'green', 'purple', 'amber', 'slate'] as const

export default function VendorDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [vendor, setVendor] = useState<Vendor | null>(null)
  const [assets, setAssets] = useState<VendorAsset[]>([])
  const [linkedContacts, setLinkedContacts] = useState<Contact[]>([])
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [allContacts, setAllContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [chatOpen, setChatOpen] = useState(true)
  const [linkContactOpen, setLinkContactOpen] = useState(false)
  const [selectedContactId, setSelectedContactId] = useState('')

  const supabase = createClient()

  const fetchVendor = useCallback(async () => {
    const { data } = await supabase
      .from('vendors')
      .select(`*, vendor_categories(category)`)
      .eq('id', id)
      .single()

    if (data) {
      setVendor({
        ...data,
        categories: data.vendor_categories?.map((c: any) => c.category) ?? [],
      })
    }
    setLoading(false)
  }, [id])

  const fetchAssets = useCallback(async () => {
    const { data } = await supabase
      .from('vendor_assets')
      .select('*')
      .eq('vendor_id', id)
      .order('created_at', { ascending: false })
    setAssets(data ?? [])
  }, [id])

  const fetchLinkedContacts = useCallback(async () => {
    const { data } = await supabase
      .from('vendor_contacts')
      .select('*, contacts(*)')
      .eq('vendor_id', id)
    setLinkedContacts(data?.map((vc: any) => vc.contacts).filter(Boolean) ?? [])
  }, [id])

  const fetchInteractions = useCallback(async () => {
    const { data } = await supabase
      .from('interactions')
      .select('*, contacts(name)')
      .eq('vendor_id', id)
      .order('created_at', { ascending: false })
    setInteractions(data ?? [])
  }, [id])

  const fetchAllContacts = useCallback(async () => {
    const { data } = await supabase.from('contacts').select('id, name, company').order('name')
    setAllContacts((data ?? []) as Contact[])
  }, [])

  useEffect(() => {
    fetchVendor()
    fetchAssets()
    fetchLinkedContacts()
    fetchInteractions()
    fetchAllContacts()
  }, [fetchVendor, fetchAssets, fetchLinkedContacts, fetchInteractions, fetchAllContacts])

  async function handleUpdate(values: { company_name: string; description?: string; website_url?: string; categories: string[] }) {
    if (!vendor) return
    setSaving(true)
    await supabase.from('vendors').update({
      company_name: values.company_name,
      description: values.description || null,
      website_url: values.website_url || null,
    }).eq('id', id)

    await supabase.from('vendor_categories').delete().eq('vendor_id', id)
    if (values.categories.length > 0) {
      await supabase.from('vendor_categories').insert(
        values.categories.map((cat) => ({ vendor_id: id, category: cat }))
      )
    }
    setSaving(false)
    setEditOpen(false)
    fetchVendor()
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('vendors').delete().eq('id', id)
    router.push('/vendors')
  }

  async function handleLinkContact() {
    if (!selectedContactId) return
    await supabase.from('vendor_contacts').upsert({
      vendor_id: id,
      contact_id: selectedContactId,
    })
    setLinkContactOpen(false)
    setSelectedContactId('')
    fetchLinkedContacts()
  }

  async function handleUnlinkContact(contactId: string) {
    await supabase.from('vendor_contacts')
      .delete()
      .eq('vendor_id', id)
      .eq('contact_id', contactId)
    fetchLinkedContacts()
  }

  if (loading) {
    return (
      <div className="flex-1 p-6 space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-4 bg-gray-200 rounded w-96" />
      </div>
    )
  }

  if (!vendor) {
    return (
      <div className="flex-1 p-6">
        <p className="text-gray-500">Vendor not found</p>
      </div>
    )
  }

  const unlinkableContacts = allContacts.filter(
    (c) => !linkedContacts.some((lc) => lc.id === c.id)
  )

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/vendors" className="text-gray-400 hover:text-gray-600 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">{vendor.company_name}</h1>
              {vendor.website_url && (
                <a
                  href={vendor.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-0.5"
                >
                  <Globe className="w-3 h-3" />
                  {vendor.website_url.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setDeleteOpen(true)} className="text-red-500 hover:bg-red-50">
              <Trash2 className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setChatOpen(!chatOpen)}
            >
              {chatOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Categories */}
          {vendor.categories && vendor.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {vendor.categories.map((cat, i) => (
                <Badge key={cat} variant={BADGE_COLORS[i % BADGE_COLORS.length]}>{cat}</Badge>
              ))}
            </div>
          )}

          {/* Description */}
          {vendor.description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1.5">Description</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{vendor.description}</p>
            </div>
          )}

          {/* Assets */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <AssetPanel vendorId={id} assets={assets} onRefresh={fetchAssets} />
          </div>

          {/* Linked Contacts */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-gray-400" />
                Contacts ({linkedContacts.length})
              </h3>
              <Button variant="outline" size="sm" onClick={() => setLinkContactOpen(true)}>
                <Plus className="w-3.5 h-3.5" />
                Link Contact
              </Button>
            </div>
            {linkedContacts.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No contacts linked yet</p>
            ) : (
              <div className="space-y-2">
                {linkedContacts.map((contact) => (
                  <div key={contact.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg group">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700">
                        {contact.name[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{contact.name}</p>
                        {contact.company && <p className="text-xs text-gray-400">{contact.company}</p>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleUnlinkContact(contact.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Interactions */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <GitMerge className="w-4 h-4 text-gray-400" />
                Interactions ({interactions.length})
              </h3>
              <Link href={`/interactions?vendor=${id}`}>
                <Button variant="outline" size="sm">
                  <Plus className="w-3.5 h-3.5" />
                  New Interaction
                </Button>
              </Link>
            </div>
            {interactions.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No interactions yet</p>
            ) : (
              <div className="space-y-2">
                {interactions.map((interaction) => (
                  <div key={interaction.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <StatusBadge status={interaction.status} />
                        {(interaction as any).contacts?.name && (
                          <span className="text-xs text-gray-500">with {(interaction as any).contacts.name}</span>
                        )}
                      </div>
                      {interaction.notes && (
                        <p className="text-xs text-gray-500 truncate max-w-xs">{interaction.notes}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(interaction.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Claude chat panel */}
      {chatOpen && (
        <div className="w-80 border-l border-gray-200 flex flex-col bg-white shrink-0">
          <ClaudeChat context={`vendor:${id}`} title={vendor.company_name} />
        </div>
      )}

      {/* Edit modal */}
      <VendorForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSubmit={handleUpdate}
        initial={vendor}
        loading={saving}
      />

      {/* Delete confirm */}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete vendor"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to delete <strong>{vendor.company_name}</strong>? All assets, contacts, and interactions will be deleted.
        </p>
      </Modal>

      {/* Link contact modal */}
      <Modal
        open={linkContactOpen}
        onClose={() => setLinkContactOpen(false)}
        title="Link Contact"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setLinkContactOpen(false)}>Cancel</Button>
            <Button onClick={handleLinkContact} disabled={!selectedContactId}>Link</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Select a contact to link to this vendor.</p>
          <select
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedContactId}
            onChange={(e) => setSelectedContactId(e.target.value)}
          >
            <option value="">Select a contact...</option>
            {unlinkableContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.company ? ` (${c.company})` : ''}
              </option>
            ))}
          </select>
        </div>
      </Modal>
    </div>
  )
}
