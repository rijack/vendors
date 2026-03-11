'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Button } from '@/components/ui/Button'
import { MultiSelect } from '@/components/ui/MultiSelect'
import { useState } from 'react'
import type { Vendor } from '@/types'

const schema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  description: z.string().optional(),
  website_url: z.string().url('Must be a valid URL').optional().or(z.literal('')),
})

type FormValues = z.infer<typeof schema>

interface VendorFormProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: FormValues & { categories: string[] }) => Promise<void>
  initial?: Vendor
  loading?: boolean
}

const COMMON_CATEGORIES = [
  'Technology', 'SaaS', 'Finance', 'Legal', 'Marketing', 'Operations',
  'HR', 'Design', 'Consulting', 'Manufacturing', 'Logistics', 'Healthcare',
]

export function VendorForm({ open, onClose, onSubmit, initial, loading }: VendorFormProps) {
  const [categories, setCategories] = useState<string[]>(initial?.categories ?? [])

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      company_name: initial?.company_name ?? '',
      description: initial?.description ?? '',
      website_url: initial?.website_url ?? '',
    },
  })

  async function onFormSubmit(data: FormValues) {
    await onSubmit({ ...data, categories })
    reset()
    setCategories([])
  }

  return (
    <Modal
      open={open}
      onClose={() => { onClose(); reset(); setCategories([]) }}
      title={initial ? 'Edit Vendor' : 'Add Vendor'}
      footer={
        <>
          <Button variant="outline" onClick={() => { onClose(); reset(); setCategories([]) }}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onFormSubmit)} loading={loading}>
            {initial ? 'Save changes' : 'Add vendor'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        <Input
          label="Company Name *"
          placeholder="Acme Corp"
          error={errors.company_name?.message}
          {...register('company_name')}
        />
        <Input
          label="Website URL"
          placeholder="https://example.com"
          error={errors.website_url?.message}
          {...register('website_url')}
        />
        <Textarea
          label="Description"
          placeholder="What does this vendor do?"
          rows={3}
          {...register('description')}
        />
        <div className="relative">
          <MultiSelect
            label="Categories"
            value={categories}
            onChange={setCategories}
            options={COMMON_CATEGORIES}
            placeholder="Add categories..."
          />
        </div>
      </form>
    </Modal>
  )
}
