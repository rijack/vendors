'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Building2, Filter, Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { VendorCard } from '@/components/vendors/VendorCard'
import { VendorForm } from '@/components/vendors/VendorForm'
import { UrlImportModal } from '@/components/vendors/UrlImportModal'
import { ClaudeChat } from '@/components/claude/ClaudeChat'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/SearchInput'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'
import type { Vendor } from '@/types'
import { MessageSquare, PanelRightClose, PanelRightOpen } from 'lucide-react'

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [urlImportOpen, setUrlImportOpen] = useState(false)
  const [editVendor, setEditVendor] = useState<Vendor | null>(null)
  const [deleteVendor, setDeleteVendor] = useState<Vendor | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [chatOpen, setChatOpen] = useState(true)

  const supabase = createClient()

  const fetchVendors = useCallback(async () => {
    setLoading(true)

    let query = supabase
      .from('vendors')
      .select(`*, vendor_categories(category), vendor_contacts(contact_id, contacts(*))`)
      .order('company_name')

    if (search) {
      query = query.or(`company_name.ilike.%${search}%,description.ilike.%${search}%`)
    }

    const { data } = await query
    const enriched = (data ?? []).map((v: any) => ({
      ...v,
      categories: v.vendor_categories?.map((c: any) => c.category) ?? [],
      contacts: v.vendor_contacts?.map((vc: any) => vc.contacts).filter(Boolean) ?? [],
    }))

    const filtered = categoryFilter
      ? enriched.filter((v) => v.categories.includes(categoryFilter))
      : enriched

    setVendors(filtered)

    // Collect all unique categories
    const cats = new Set<string>()
    enriched.forEach((v) => v.categories.forEach((c: string) => cats.add(c)))
    setAllCategories(Array.from(cats).sort())

    setLoading(false)
  }, [search, categoryFilter])

  useEffect(() => {
    fetchVendors()
  }, [fetchVendors])

  async function saveVendor(vendorId: string, data: { company_name: string; description?: string; website_url?: string; categories: string[] }) {
    // Upsert categories
    await supabase.from('vendor_categories').delete().eq('vendor_id', vendorId)
    if (data.categories.length > 0) {
      await supabase.from('vendor_categories').insert(
        data.categories.map((cat) => ({ vendor_id: vendorId, category: cat }))
      )
    }
  }

  async function handleCreate(values: { company_name: string; description?: string; website_url?: string; categories: string[] }) {
    setSaving(true)
    const { data } = await supabase
      .from('vendors')
      .insert({
        company_name: values.company_name,
        description: values.description || null,
        website_url: values.website_url || null,
      })
      .select()
      .single()

    if (data) {
      await saveVendor(data.id, values)
    }
    setSaving(false)
    setFormOpen(false)
    fetchVendors()
  }

  async function handleUpdate(values: { company_name: string; description?: string; website_url?: string; categories: string[] }) {
    if (!editVendor) return
    setSaving(true)
    await supabase
      .from('vendors')
      .update({
        company_name: values.company_name,
        description: values.description || null,
        website_url: values.website_url || null,
      })
      .eq('id', editVendor.id)
    await saveVendor(editVendor.id, values)
    setSaving(false)
    setEditVendor(null)
    fetchVendors()
  }

  async function handleDelete() {
    if (!deleteVendor) return
    setDeleting(true)
    await supabase.from('vendors').delete().eq('id', deleteVendor.id)
    setDeleting(false)
    setDeleteVendor(null)
    fetchVendors()
  }

  function handleUrlImport(data: { company_name: string; description: string; categories: string[]; website_url: string }) {
    // Pre-fill the vendor form with Claude's extracted data
    setEditVendor({
      id: '',
      user_id: '',
      created_at: '',
      updated_at: '',
      ...data,
      categories: data.categories,
    })
    setFormOpen(true)
  }

  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...allCategories.map((c) => ({ value: c, label: c })),
  ]

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader
          title="Vendors"
          description={`${vendors.length} vendor${vendors.length !== 1 ? 's' : ''}`}
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setUrlImportOpen(true)}>
                <Link2 className="w-4 h-4" />
                Import from URL
              </Button>
              <Button onClick={() => setFormOpen(true)}>
                <Plus className="w-4 h-4" />
                Add Vendor
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setChatOpen(!chatOpen)}
                title={chatOpen ? 'Hide Claude chat' : 'Show Claude chat'}
              >
                {chatOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              </Button>
            </div>
          }
        />

        {/* Filters */}
        <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3 shrink-0">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search vendors..."
            className="flex-1 max-w-xs"
          />
          {allCategories.length > 0 && (
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
          )}
        </div>

        {/* Vendor list */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse h-28" />
              ))}
            </div>
          ) : vendors.length === 0 ? (
            <EmptyState
              icon={<Building2 className="w-6 h-6" />}
              title={search || categoryFilter ? 'No vendors found' : 'No vendors yet'}
              description={
                search || categoryFilter
                  ? 'Try adjusting your filters'
                  : 'Add your first vendor or import from a URL'
              }
              action={
                !search && !categoryFilter ? (
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setUrlImportOpen(true)}>
                      <Link2 className="w-4 h-4" />
                      Import from URL
                    </Button>
                    <Button onClick={() => setFormOpen(true)}>
                      <Plus className="w-4 h-4" />
                      Add Vendor
                    </Button>
                  </div>
                ) : undefined
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {vendors.map((vendor) => (
                <VendorCard key={vendor.id} vendor={vendor} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Claude chat panel */}
      {chatOpen && (
        <div className="w-80 border-l border-gray-200 flex flex-col bg-white shrink-0">
          <ClaudeChat context="vendor_list" title="Ask about vendors" />
        </div>
      )}

      {/* Forms */}
      <VendorForm
        open={formOpen}
        onClose={() => { setFormOpen(false); setEditVendor(null) }}
        onSubmit={editVendor?.id ? handleUpdate : handleCreate}
        initial={editVendor?.id ? editVendor : undefined}
        loading={saving}
      />

      <UrlImportModal
        open={urlImportOpen}
        onClose={() => setUrlImportOpen(false)}
        onImport={handleUrlImport}
      />

      <Modal
        open={!!deleteVendor}
        onClose={() => setDeleteVendor(null)}
        title="Delete vendor"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleteVendor(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} loading={deleting}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to delete <strong>{deleteVendor?.company_name}</strong>? All associated data will be deleted.
        </p>
      </Modal>
    </div>
  )
}
