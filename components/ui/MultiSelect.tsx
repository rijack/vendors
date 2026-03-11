'use client'

import { useState, useRef, useEffect } from 'react'
import { X, ChevronDown, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MultiSelectProps {
  label?: string
  value: string[]
  onChange: (values: string[]) => void
  options: string[]
  placeholder?: string
  allowNew?: boolean
}

export function MultiSelect({ label, value, onChange, options, placeholder = 'Select...', allowNew = true }: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filtered = options.filter(
    (opt) =>
      !value.includes(opt) &&
      opt.toLowerCase().includes(input.toLowerCase())
  )

  function toggle(opt: string) {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt))
    } else {
      onChange([...value, opt])
      setInput('')
    }
  }

  function addNew() {
    const trimmed = input.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
      setInput('')
    }
  }

  return (
    <div className="space-y-1" ref={containerRef}>
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      <div
        className="min-h-[38px] border border-gray-200 rounded-lg px-2 py-1.5 flex flex-wrap gap-1 cursor-text focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent"
        onClick={() => setOpen(true)}
      >
        {value.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
            {v}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); toggle(v) }}
              className="hover:text-blue-900"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[80px] text-sm outline-none bg-transparent placeholder-gray-400"
          placeholder={value.length === 0 ? placeholder : ''}
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addNew() }
            if (e.key === 'Backspace' && !input && value.length > 0) {
              onChange(value.slice(0, -1))
            }
          }}
        />
      </div>

      {open && (filtered.length > 0 || (allowNew && input.trim())) && (
        <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto min-w-[200px]">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
              onMouseDown={(e) => { e.preventDefault(); toggle(opt) }}
            >
              {opt}
            </button>
          ))}
          {allowNew && input.trim() && !options.includes(input.trim()) && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-blue-600 flex items-center gap-1.5"
              onMouseDown={(e) => { e.preventDefault(); addNew() }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add &ldquo;{input.trim()}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  )
}
