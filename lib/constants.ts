import type { InteractionStatus } from '@/types'

export const STATUS_LABELS: Record<InteractionStatus, string> = {
  pending: 'Pending',
  intro_made: 'Intro Made',
  second_call_booked: '2nd Call Booked',
  final_accepted: 'Final – Accepted',
  final_rejected: 'Final – Rejected',
  details: 'Details',
}

export const STATUS_COLORS: Record<InteractionStatus, string> = {
  pending: 'bg-slate-100 text-slate-700',
  intro_made: 'bg-blue-100 text-blue-700',
  second_call_booked: 'bg-purple-100 text-purple-700',
  final_accepted: 'bg-green-100 text-green-700',
  final_rejected: 'bg-red-100 text-red-700',
  details: 'bg-amber-100 text-amber-700',
}

export const INTERACTION_STATUSES: InteractionStatus[] = [
  'pending',
  'intro_made',
  'second_call_booked',
  'final_accepted',
  'final_rejected',
  'details',
]

export const CONTACT_CATEGORIES = [
  'Technology',
  'Finance',
  'Legal',
  'Marketing',
  'Operations',
  'HR',
  'Sales',
  'Executive',
  'Consultant',
  'Other',
]
