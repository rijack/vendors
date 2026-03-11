'use client'

import Link from 'next/link'
import { Globe, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { Vendor } from '@/types'

const BADGE_COLORS = ['blue', 'green', 'purple', 'amber', 'slate'] as const

interface VendorCardProps {
  vendor: Vendor
}

export function VendorCard({ vendor }: VendorCardProps) {
  return (
    <Link href={`/vendors/${vendor.id}`}>
      <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all group cursor-pointer">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-600 transition-colors">
              {vendor.company_name}
            </h3>
            {vendor.website_url && (
              <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
                <Globe className="w-3 h-3" />
                <span className="truncate">{vendor.website_url.replace(/^https?:\/\//, '')}</span>
              </div>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-400 shrink-0 mt-0.5 transition-colors" />
        </div>

        {vendor.description && (
          <p className="text-xs text-gray-500 mt-2 line-clamp-2">{vendor.description}</p>
        )}

        {vendor.categories && vendor.categories.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {vendor.categories.map((cat, i) => (
              <Badge key={cat} variant={BADGE_COLORS[i % BADGE_COLORS.length]}>
                {cat}
              </Badge>
            ))}
          </div>
        )}

        {vendor.contacts && vendor.contacts.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-1">
              {vendor.contacts.slice(0, 3).map((contact) => (
                <div
                  key={contact.id}
                  className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-semibold text-blue-700"
                  title={contact.name}
                >
                  {contact.name[0].toUpperCase()}
                </div>
              ))}
              {vendor.contacts.length > 3 && (
                <span className="text-xs text-gray-400 ml-1">+{vendor.contacts.length - 3} more</span>
              )}
            </div>
          </div>
        )}
      </div>
    </Link>
  )
}
