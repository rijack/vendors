'use client'

import { Mail, Phone, MapPin, Pencil, Trash2, Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { getInitials } from '@/lib/utils'
import type { Contact } from '@/types'

interface ContactCardProps {
  contact: Contact
  onEdit: () => void
  onDelete: () => void
}

const categoryColors: Record<string, 'blue' | 'green' | 'purple' | 'amber' | 'red' | 'slate'> = {
  Technology: 'blue',
  Finance: 'green',
  Legal: 'purple',
  Marketing: 'amber',
  Sales: 'blue',
  Executive: 'slate',
}

export function ContactCard({ contact, onEdit, onDelete }: ContactCardProps) {
  const initials = getInitials(contact.name)
  const colorClass = categoryColors[contact.category ?? ''] ?? 'slate'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-gray-300 transition-colors group">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
          <span className="text-sm font-semibold text-blue-700">{initials}</span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{contact.name}</h3>
            {contact.category && (
              <Badge variant={colorClass}>{contact.category}</Badge>
            )}
          </div>
          {(contact.company || contact.role) && (
            <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {[contact.role, contact.company].filter(Boolean).join(' at ')}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
              >
                <Mail className="w-3 h-3" />
                <span className="truncate max-w-[140px]">{contact.email}</span>
              </a>
            )}
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600"
              >
                <Phone className="w-3 h-3" />
                {contact.phone}
              </a>
            )}
            {contact.location && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <MapPin className="w-3 h-3" />
                {contact.location}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button variant="ghost" size="icon" onClick={onEdit} title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} title="Delete" className="text-red-500 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
