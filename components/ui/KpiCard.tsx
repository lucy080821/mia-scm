import { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  icon?: ReactNode
  label: string
  value: string | number
  sub?: string
  subColor?: 'green' | 'red' | 'orange' | 'gray'
  iconBg?: string
  className?: string
}

const subColors = {
  green:  'text-green-600',
  red:    'text-red-500',
  orange: 'text-orange-500',
  gray:   'text-gray-500',
}

export default function KpiCard({ icon, label, value, sub, subColor = 'gray', iconBg = 'bg-sky-100', className }: KpiCardProps) {
  return (
    <div className={cn('bg-white rounded-xl p-3 sm:p-4 border border-[#e5e7eb] flex items-center gap-3 sm:gap-4 hover:shadow-sm transition-shadow', className)}>
      {icon && (
        <div className={cn('w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0', iconBg)}>
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-base sm:text-xl font-bold text-[#1e2a3a] leading-tight truncate">{value}</p>
        {sub && <p className={cn('text-xs mt-0.5 truncate', subColors[subColor])}>{sub}</p>}
      </div>
    </div>
  )
}
