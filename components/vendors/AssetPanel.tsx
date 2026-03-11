'use client'

import { useState } from 'react'
import { Link2, FileText, Plus, Trash2, ExternalLink, Upload } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { createClient } from '@/lib/supabase/client'
import type { VendorAsset } from '@/types'
import { formatDate } from '@/lib/utils'

interface AssetPanelProps {
  vendorId: string
  assets: VendorAsset[]
  onRefresh: () => void
}

export function AssetPanel({ vendorId, assets, onRefresh }: AssetPanelProps) {
  const [addLinkOpen, setAddLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLabel, setLinkLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const supabase = createClient()

  async function handleAddLink() {
    if (!linkUrl) return
    setSaving(true)
    await supabase.from('vendor_assets').insert({
      vendor_id: vendorId,
      asset_type: 'link',
      url: linkUrl,
      label: linkLabel || null,
    })
    setSaving(false)
    setAddLinkOpen(false)
    setLinkUrl('')
    setLinkLabel('')
    onRefresh()
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    const filePath = `${vendorId}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage
      .from('vendor-assets')
      .upload(filePath, file)

    if (!error) {
      await supabase.from('vendor_assets').insert({
        vendor_id: vendorId,
        asset_type: 'file',
        storage_path: filePath,
        file_name: file.name,
        mime_type: file.type,
        label: file.name,
      })
      onRefresh()
    }
    setUploading(false)
    e.target.value = ''
  }

  async function handleDelete(assetId: string, storagePath: string | null) {
    if (storagePath) {
      await supabase.storage.from('vendor-assets').remove([storagePath])
    }
    await supabase.from('vendor_assets').delete().eq('id', assetId)
    onRefresh()
  }

  async function getSignedUrl(storagePath: string) {
    const { data } = await supabase.storage
      .from('vendor-assets')
      .createSignedUrl(storagePath, 3600)
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank')
    }
  }

  const links = assets.filter((a) => a.asset_type === 'link')
  const files = assets.filter((a) => a.asset_type === 'file')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Assets</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddLinkOpen(true)}>
            <Link2 className="w-3.5 h-3.5" />
            Add Link
          </Button>
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors">
            {uploading ? (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <Upload className="w-3.5 h-3.5" />
            )}
            Upload File
            <input
              type="file"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {assets.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No assets yet. Add links or upload files.</p>
      ) : (
        <div className="space-y-2">
          {/* Links */}
          {links.map((asset) => (
            <div key={asset.id} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg group">
              <Link2 className="w-4 h-4 text-blue-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{asset.label || asset.url}</p>
                {asset.label && <p className="text-xs text-gray-400 truncate">{asset.url}</p>}
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={asset.url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => handleDelete(asset.id, null)}
                  className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Files */}
          {files.map((asset) => (
            <div key={asset.id} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg group">
              <FileText className="w-4 h-4 text-green-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{asset.file_name}</p>
                <p className="text-xs text-gray-400">{formatDate(asset.created_at)}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => asset.storage_path && getSignedUrl(asset.storage_path)}
                  className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(asset.id, asset.storage_path)}
                  className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add link modal */}
      <Modal
        open={addLinkOpen}
        onClose={() => { setAddLinkOpen(false); setLinkUrl(''); setLinkLabel('') }}
        title="Add Link"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAddLinkOpen(false)}>Cancel</Button>
            <Button onClick={handleAddLink} loading={saving} disabled={!linkUrl}>Add Link</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="URL *"
            type="url"
            placeholder="https://example.com"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
          <Input
            label="Label (optional)"
            placeholder="e.g. Pricing Page"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  )
}
