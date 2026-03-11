import { STATUS_LABELS, STATUS_COLORS } from '@/lib/constants'
import type { InteractionStatus } from '@/types'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: InteractionStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        STATUS_COLORS[status],
        className
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}
