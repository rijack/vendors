'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { INTERACTION_STATUSES, STATUS_LABELS } from '@/lib/constants'
import type { Interaction, Vendor, Contact, InteractionStatus } from '@/types'

const schema = z.object({
  vendor_id: z.string().min(1, 'Vendor is required'),
  contact_id: z.string().optional(),
  status: z.string(),
  notes: z.string().optional(),
  reminder_at: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface InteractionFormProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: FormValues) => Promise<void>
  initial?: Interaction
  vendors: Vendor[]
  contacts: Contact[]
  preselectedVendorId?: string
  loading?: boolean
}

export function InteractionForm({
  open,
  onClose,
  onSubmit,
  initial,
  vendors,
  contacts,
  preselectedVendorId,
  loading,
}: InteractionFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      vendor_id: initial?.vendor_id ?? preselectedVendorId ?? '',
      contact_id: initial?.contact_id ?? '',
      status: initial?.status ?? 'pending',
      notes: initial?.notes ?? '',
      reminder_at: initial?.reminder_at
        ? new Date(initial.reminder_at).toISOString().slice(0, 16)
        : '',
    },
  })

  const currentStatus = watch('status') as InteractionStatus

  async function onFormSubmit(data: FormValues) {
    await onSubmit(data)
    reset()
  }

  function handleClose() {
    onClose()
    reset()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={initial ? 'Edit Interaction' : 'New Interaction'}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit(onFormSubmit)} loading={loading}>
            {initial ? 'Save changes' : 'Create interaction'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        {/* Vendor */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Vendor *</label>
          <select
            {...register('vendor_id')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select vendor...</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.company_name}</option>
            ))}
          </select>
          {errors.vendor_id && <p className="text-xs text-red-600">{errors.vendor_id.message}</p>}
        </div>

        {/* Contact */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Contact (optional)</label>
          <select
            {...register('contact_id')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">No contact</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.company ? ` (${c.company})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Status */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Status</label>
          <div className="grid grid-cols-2 gap-2">
            {INTERACTION_STATUSES.map((s) => (
              <label
                key={s}
                className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  currentStatus === s
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  value={s}
                  {...register('status')}
                  className="sr-only"
                />
                <StatusBadge status={s} />
              </label>
            ))}
          </div>
        </div>

        {/* Notes */}
        <Textarea
          label="Notes"
          placeholder="Add notes about this interaction..."
          rows={3}
          {...register('notes')}
        />

        {/* Reminder */}
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Reminder</label>
          <input
            type="datetime-local"
            {...register('reminder_at')}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500">Set a reminder to follow up on this interaction</p>
        </div>
      </form>
    </Modal>
  )
}
