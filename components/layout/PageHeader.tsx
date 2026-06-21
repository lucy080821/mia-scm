import { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  children?: ReactNode
}

export default function PageHeader({ title, subtitle, actions, children }: PageHeaderProps) {
  const slot = actions ?? children
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-5">
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-bold text-[#1e2a3a] leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {slot && <div className="flex items-center gap-2 shrink-0 flex-wrap">{slot}</div>}
    </div>
  )
}
