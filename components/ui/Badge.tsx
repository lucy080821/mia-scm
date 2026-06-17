'use client'
import { getStatusBadge } from '@/lib/utils'

interface BadgeProps {
  status: string
  label?: string
  className?: string
}

export default function Badge({ status, label, className = '' }: BadgeProps) {
  const badge = getStatusBadge(status)
  return (
    <span className={`inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium ${badge.className} ${className}`}>
      {label ?? badge.label}
    </span>
  )
}
