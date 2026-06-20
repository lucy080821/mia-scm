'use client'
import { getAvailableTransitions, type OrderStatus, type UserRole } from '@/lib/workflow/orderStateMachine'

interface OrderActionsProps {
  orderId: string
  status: OrderStatus
  role?: UserRole
  onTransition: (orderId: string, to: OrderStatus, action: string) => void
  compact?: boolean
}

export default function OrderActions({
  orderId, status, role = 'admin', onTransition, compact = false,
}: OrderActionsProps) {
  const transitions = getAvailableTransitions(status, role)
  if (transitions.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {transitions.map(t => {
        const colors = {
          primary:   'bg-[var(--mia-primary)] text-white hover:opacity-90',
          danger:    'bg-red-500 text-white hover:bg-red-600',
          secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
        }
        const cls = colors[t.variant ?? 'primary']
        return (
          <button
            key={t.to}
            onClick={() => onTransition(orderId, t.to, t.action)}
            className={`px-2.5 py-1 rounded-lg whitespace-nowrap font-semibold transition-all hover:scale-[1.02] active:scale-95 ${compact ? 'text-[11px]' : 'text-xs'} ${cls}`}
          >
            {t.action}
          </button>
        )
      })}
    </div>
  )
}
