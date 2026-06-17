export type OrderStatus =
  | 'new'
  | 'confirmed'
  | 'picking'
  | 'picked'
  | 'pending_ship'
  | 'delivering'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type UserRole = 'admin' | 'sales' | 'warehouse' | 'logistics' | 'driver'

export interface Transition {
  to: OrderStatus
  role: UserRole
  action: string
  variant?: 'primary' | 'danger' | 'secondary'
}

export const TRANSITIONS: Record<OrderStatus, Transition[]> = {
  new: [
    { to: 'confirmed', role: 'admin', action: 'Duyệt đơn', variant: 'primary' },
    { to: 'cancelled', role: 'admin', action: 'Hủy đơn', variant: 'danger' },
  ],
  confirmed: [
    { to: 'picking', role: 'warehouse', action: 'Bắt đầu soạn hàng', variant: 'primary' },
    { to: 'cancelled', role: 'sales', action: 'Hủy đơn', variant: 'danger' },
  ],
  picking: [
    { to: 'picked', role: 'warehouse', action: 'Xác nhận xuất kho', variant: 'primary' },
  ],
  picked: [
    { to: 'pending_ship', role: 'logistics', action: 'Phân tuyến giao', variant: 'primary' },
  ],
  pending_ship: [
    { to: 'delivering', role: 'logistics', action: 'Điều xe giao hàng', variant: 'primary' },
  ],
  delivering: [
    { to: 'completed', role: 'driver', action: 'Xác nhận đã giao', variant: 'primary' },
    { to: 'failed', role: 'driver', action: 'Báo giao thất bại', variant: 'danger' },
  ],
  failed: [
    { to: 'delivering', role: 'logistics', action: 'Giao lại', variant: 'secondary' },
    { to: 'picked', role: 'logistics', action: 'Hoàn về kho', variant: 'secondary' },
  ],
  completed: [],
  cancelled: [],
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  new: 'Mới',
  confirmed: 'Đã xác nhận',
  picking: 'Đang soạn',
  picked: 'Đã xuất kho',
  pending_ship: 'Chờ giao',
  delivering: 'Đang giao',
  completed: 'Hoàn thành',
  failed: 'Giao lỗi',
  cancelled: 'Đã hủy',
}

export const STATUS_BADGE: Record<OrderStatus, string> = {
  new: 'bg-gray-100 text-gray-600',
  confirmed: 'bg-blue-100 text-blue-700',
  picking: 'bg-yellow-100 text-yellow-700',
  picked: 'bg-purple-100 text-purple-700',
  pending_ship: 'bg-orange-100 text-orange-700',
  delivering: 'bg-sky-100 text-sky-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-red-100 text-red-700',
}

export function getAvailableTransitions(status: OrderStatus, role: UserRole): Transition[] {
  return TRANSITIONS[status].filter(t => t.role === role || role === 'admin')
}

export function canTransition(from: OrderStatus, to: OrderStatus, role: UserRole): boolean {
  return TRANSITIONS[from]?.some(t => t.to === to && (t.role === role || role === 'admin')) ?? false
}
