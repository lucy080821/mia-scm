import type { OrderStatus } from './orderStateMachine'

export interface OrderItemInput {
  product_id: string
  quantity: number
  unit_price: number
}

export interface CreateOrderInput {
  customer_id: string
  order_date: string
  delivery_date?: string
  items: OrderItemInput[]
  note?: string
  assigned_to?: string
}

/** Tạo đơn hàng mới (status: 'new'). Chưa trừ tồn kho. */
export async function createOrder(input: CreateOrderInput): Promise<{ id: string; code: string }> {
  const res = await fetch('/api/sales-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Lỗi tạo đơn hàng')
  return json
}

/** Chuyển trạng thái đơn hàng (dùng cho mọi transition: xác nhận, hủy, v.v.) */
export async function transitionOrder(orderId: string, status: OrderStatus): Promise<void> {
  const res = await fetch(`/api/sales-orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? `Lỗi chuyển trạng thái đơn`)
}

/** Xác nhận đơn: new → confirmed.
 *  Việc tạo phiếu xuất kho được xử lý thủ công hoặc khi bắt đầu soạn hàng. */
export async function confirmOrder(orderId: string): Promise<void> {
  return transitionOrder(orderId, 'confirmed')
}

/** Hủy đơn (cho phép ở mọi trạng thái trước picked). */
export async function cancelOrder(orderId: string): Promise<void> {
  return transitionOrder(orderId, 'cancelled')
}
