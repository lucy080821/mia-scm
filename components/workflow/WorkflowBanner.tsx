'use client'
import { Bell } from 'lucide-react'

interface Props {
  count: number
  label: string
  hint?: string
  variant?: 'warning' | 'info'
}

export default function WorkflowBanner({ count, label, hint, variant = 'warning' }: Props) {
  if (count === 0) return null

  const cls = variant === 'warning'
    ? { wrap: 'bg-amber-50 border-amber-200', text: 'text-amber-800', icon: 'text-amber-500' }
    : { wrap: 'bg-blue-50 border-blue-200',   text: 'text-blue-800',  icon: 'text-blue-500'  }

  return (
    <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border mb-4 ${cls.wrap}`}>
      <Bell size={14} className={`${cls.icon} shrink-0`} />
      <span className={`text-sm ${cls.text}`}>
        <strong className="font-semibold">{count}</strong> {label}
      </span>
      {hint && <span className={`text-xs ${cls.text} opacity-60 ml-auto`}>{hint}</span>}
    </div>
  )
}
