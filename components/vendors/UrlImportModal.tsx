'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Globe, Loader2 } from 'lucide-react'

interface UrlImportResult {
  company_name: string
  description: string
  categories: string[]
  website_url: string
}

interface UrlImportModalProps {
  open: boolean
  onClose: () => void
  onImport: (data: UrlImportResult) => void
}

export function UrlImportModal({ open, onClose, onImport }: UrlImportModalProps) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleImport() {
    if (!url) return
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/claude/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error ?? 'Import failed')
      }

      const data = await response.json()
      onImport(data)
      setUrl('')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => { onClose(); setUrl(''); setError('') }}
      title="Import Vendor from URL"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => { onClose(); setUrl('') }}>Cancel</Button>
          <Button onClick={handleImport} loading={loading} disabled={!url}>
            <Globe className="w-4 h-4" />
            Import
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Paste a vendor&apos;s website URL and Claude will extract their company details automatically.
        </p>
        <Input
          label="Website URL"
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleImport()}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing website with Claude...
          </div>
        )}
      </div>
    </Modal>
  )
}
