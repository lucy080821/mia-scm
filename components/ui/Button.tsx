'use client'
import { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  loading?: boolean
}

export default function Button({
  variant = 'primary',
  size = 'md',
  children,
  loading,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-offset-1'

  const variants = {
    primary:   'bg-[#0ea5e9] text-white hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 focus:ring-[#0ea5e9]',
    secondary: 'bg-[#1e2a3a] text-white hover:bg-[#1a3a5c] hover:scale-[1.02] active:scale-95 focus:ring-[#1e2a3a]',
    danger:    'bg-red-500 text-white hover:bg-red-600 hover:scale-[1.02] active:scale-95 focus:ring-red-500',
    ghost:     'text-gray-600 hover:bg-gray-100 hover:text-[#1e2a3a] active:scale-95 focus:ring-gray-300',
    outline:   'border border-[#e5e7eb] text-[#1e2a3a] hover:bg-gray-50 hover:border-[#0ea5e9] hover:text-[#0ea5e9] active:scale-95 focus:ring-[#0ea5e9]',
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-xs gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-5 py-2.5 text-sm gap-2',
  }

  return (
    <button
      className={cn(base, variants[variant], sizes[size], (disabled || loading) && 'opacity-60 cursor-not-allowed pointer-events-none', className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  )
}
