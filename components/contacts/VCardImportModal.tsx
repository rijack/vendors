'use client'

import { useState, useRef } from 'react'
import { Upload, Users, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface ParsedContact {
  name: string
  company?: string
  role?: string
  phone?: string
  email?: string
  location?: string
}

interface ImportResult {
  success: number
  skipped: number
  errors: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  onImport: (contacts: ParsedContact[]) => Promise<ImportResult>
}

function parseVCards(text: string): ParsedContact[] {
  const cards = text.split(/BEGIN:VCARD/i).slice(1)
  const contacts: ParsedContact[] = []

  for (const card of cards) {
    const lines: string[] = []

    // Unfold multi-line values (lines starting with space/tab are continuations)
    for (const raw of card.split(/\r?\n/)) {
      if ((raw.startsWith(' ') || raw.startsWith('\t')) && lines.length > 0) {
        lines[lines.length - 1] += raw.trimStart()
      } else {
        lines.push(raw)
      }
    }

    const get = (prefix: string) => {
      const line = lines.find((l) =>
        l.toUpperCase().startsWith(prefix.toUpperCase() + ':') ||
        l.toUpperCase().startsWith(prefix.toUpperCase() + ';')
      )
      if (!line) return ''
      return line.substring(line.indexOf(':') + 1).trim()
    }

    // Name: prefer FN (formatted name), fall back to N
    let name = get('FN')
    if (!name) {
      const n = get('N')
      if (n) {
        const [last, first, middle] = n.split(';')
        name = [first, middle, last].filter(Boolean).join(' ').trim()
      }
    }
    if (!name) continue

    // Email: first EMAIL line
    const emailLine = lines.find((l) => l.toUpperCase().startsWith('EMAIL'))
    const email = emailLine ? emailLine.substring(emailLine.indexOf(':') + 1).trim() : undefined

    // Phone: first TEL line
    const telLine = lines.find((l) => l.toUpperCase().startsWith('TEL'))
    const phone = telLine ? telLine.substring(telLine.indexOf(':') + 1).trim() : undefined

    // Company: ORG (can have semicolons for dept)
    const orgRaw = get('ORG')
    const company = orgRaw ? orgRaw.split(';')[0].trim() : undefined

    // Role/Title: TITLE or ROLE
    const role = get('TITLE') || get('ROLE') || undefined

    // Location: ADR — format is ;;street;city;state;zip;country
    const adrLine = lines.find((l) => l.toUpperCase().startsWith('ADR'))
    let location: string | undefined
    if (adrLine) {
      const adrVal = adrLine.substring(adrLine.indexOf(':') + 1)
      const parts = adrVal.split(';')
      const city = parts[3]?.trim()
      const state = parts[4]?.trim()
      const country = parts[6]?.trim()
      location = [city, state, country].filter(Boolean).join(', ') || undefined
    }

    contacts.push({
      name,
      company: company || undefined,
      role: role || undefined,
      phone: phone || undefined,
      email: email || undefined,
      location: location || undefined,
    })
  }

  return contacts
}

export function VCardImportModal({ open, onClose, onImport }: Props) {
  const [parsed, setParsed] = useState<ParsedContact[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    setFileName(file.name)
    setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const contacts = parseVCards(text)
      setParsed(contacts)
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!parsed) return
    setImporting(true)
    const res = await onImport(parsed)
    setResult(res)
    setImporting(false)
  }

  function handleClose() {
    setParsed(null)
    setFileName('')
    setResult(null)
    onClose()
  }

  const hasPreview = parsed && parsed.length > 0 && !result

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Import from iCloud Contacts"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>
            {result ? 'Close' : 'Cancel'}
          </Button>
          {hasPreview && (
            <Button onClick={handleImport} loading={importing}>
              Import {parsed.length} contact{parsed.length !== 1 ? 's' : ''}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Instructions */}
        {!result && (
          <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700 space-y-1">
            <p className="font-medium">How to export from macOS Contacts:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-blue-600">
              <li>Open the <strong>Contacts</strong> app on your Mac</li>
              <li>Select all contacts: <strong>Edit → Select All</strong></li>
              <li>Export: <strong>File → Export → Export vCard…</strong></li>
              <li>Save the .vcf file, then upload it below</li>
            </ol>
          </div>
        )}

        {/* File picker */}
        {!result && (
          <div>
            <input
              ref={inputRef}
              type="file"
              accept=".vcf,text/vcard"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors group"
            >
              <Upload className="w-8 h-8 text-gray-300 group-hover:text-blue-400 mx-auto mb-2 transition-colors" />
              <p className="text-sm font-medium text-gray-600">
                {fileName ? fileName : 'Click to select a .vcf file'}
              </p>
              {!fileName && (
                <p className="text-xs text-gray-400 mt-1">Supports vCard 2.1, 3.0, and 4.0</p>
              )}
            </button>
          </div>
        )}

        {/* Preview */}
        {parsed && parsed.length > 0 && !result && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">
              Found {parsed.length} contact{parsed.length !== 1 ? 's' : ''}:
            </p>
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
              {parsed.slice(0, 50).map((c, i) => (
                <div key={i} className="px-3 py-2 flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 text-xs font-semibold flex items-center justify-center shrink-0">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {[c.company, c.email, c.phone].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              ))}
              {parsed.length > 50 && (
                <div className="px-3 py-2 text-xs text-gray-400 text-center">
                  + {parsed.length - 50} more
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty parse result */}
        {parsed && parsed.length === 0 && !result && (
          <div className="flex items-center gap-2 text-amber-600 text-sm bg-amber-50 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0" />
            No contacts found in this file. Make sure it&apos;s a valid .vcf vCard file.
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="space-y-2">
            {result.success > 0 && (
              <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3 text-sm">
                <CheckCircle className="w-4 h-4 shrink-0" />
                Successfully imported {result.success} contact{result.success !== 1 ? 's' : ''}
              </div>
            )}
            {result.skipped > 0 && (
              <div className="flex items-center gap-2 text-amber-700 bg-amber-50 rounded-lg p-3 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Skipped {result.skipped} duplicate{result.skipped !== 1 ? 's' : ''} (already exist)
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="flex items-start gap-2 text-red-700 bg-red-50 rounded-lg p-3 text-sm">
                <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p>{result.errors.length} contact{result.errors.length !== 1 ? 's' : ''} failed to import</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
