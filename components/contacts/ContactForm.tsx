'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { CONTACT_CATEGORIES } from '@/lib/constants'
import type { Contact } from '@/types'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  company: z.string().optional(),
  category: z.string().optional(),
  role: z.string().optional(),
  location: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

interface ContactFormProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: FormValues) => Promise<void>
  initial?: Contact
  loading?: boolean
}

export function ContactForm({ open, onClose, onSubmit, initial, loading }: ContactFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      company: initial?.company ?? '',
      category: initial?.category ?? '',
      role: initial?.role ?? '',
      location: initial?.location ?? '',
      phone: initial?.phone ?? '',
      email: initial?.email ?? '',
    },
  })

  async function onFormSubmit(data: FormValues) {
    await onSubmit(data)
    reset()
  }

  const categoryOptions = CONTACT_CATEGORIES.map((c) => ({ value: c, label: c }))

  return (
    <Modal
      open={open}
      onClose={() => { onClose(); reset() }}
      title={initial ? 'Edit Contact' : 'Add Contact'}
      footer={
        <>
          <Button variant="outline" onClick={() => { onClose(); reset() }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onFormSubmit)} loading={loading}>
            {initial ? 'Save changes' : 'Add contact'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        <Input
          label="Name *"
          placeholder="Full name"
          error={errors.name?.message}
          {...register('name')}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Company" placeholder="Acme Corp" {...register('company')} />
          <Select
            label="Category"
            options={categoryOptions}
            placeholder="Select category"
            {...register('category')}
          />
        </div>
        <Input label="Role / Title" placeholder="CEO, Director, etc." {...register('role')} />
        <Input label="Location" placeholder="City, State or Country" {...register('location')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Phone" type="tel" placeholder="+1 (555) 000-0000" {...register('phone')} />
          <Input
            label="Email"
            type="email"
            placeholder="name@example.com"
            error={errors.email?.message}
            {...register('email')}
          />
        </div>
      </form>
    </Modal>
  )
}
