export interface DeliveryConfirmInput {
  stopId: string              // = delivery id của điểm dừng
  result: 'delivered' | 'failed'
  cod?: number
  paymentMethod?: 'cash' | 'transfer' | 'pending'
  failReason?: string
  arrivedAt: string           // ISO timestamp
  confirmedAt: string         // ISO timestamp
  driverNote?: string
  podPhotoUrl?: string
}

/** Gán xe + tài xế cho chuyến giao, chuyển delivery → 'assigned'. */
export async function assignDelivery(
  deliveryId: string,
  vehicleId: string,
  driverId: string,
): Promise<void> {
  const res = await fetch(`/api/deliveries/${deliveryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicle_id: vehicleId, driver_id: driverId, status: 'assigned' }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Lỗi gán tài xế')
}

/** Bắt đầu giao hàng: chuyển delivery → 'delivering'. */
export async function startDelivery(deliveryId: string): Promise<void> {
  const res = await fetch(`/api/deliveries/${deliveryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'delivering' }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Lỗi bắt đầu giao')
}

/** Upload ảnh chứng từ giao hàng (POD) lên Supabase Storage. */
export async function uploadPodPhoto(
  deliveryId: string,
  file: File,
): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('deliveryId', deliveryId)

  const res = await fetch('/api/upload-pod', { method: 'POST', body: form })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Lỗi upload ảnh')
  return json.url as string
}

/** Xác nhận kết quả giao hàng (dùng qua token cho tài xế).
 *  Giao thành công hoặc thất bại đều cùng endpoint. */
export async function confirmDeliveryStop(
  token: string,
  confirmation: DeliveryConfirmInput,
): Promise<void> {
  const res = await fetch('/api/delivery-confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...confirmation }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Lỗi xác nhận giao hàng')
}

/** Cập nhật trực tiếp trạng thái delivery (dành cho logistics, không qua token). */
export async function updateDeliveryStatus(
  deliveryId: string,
  status: 'pending' | 'assigned' | 'delivering' | 'delivered' | 'failed',
): Promise<void> {
  const res = await fetch(`/api/deliveries/${deliveryId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Lỗi cập nhật trạng thái giao hàng')
}

/** Lấy tuyến giao hàng + danh sách điểm dừng theo token của tài xế. */
export async function getDriverPlan(token: string) {
  const res = await fetch(`/api/driver-plan/${token}`)
  if (!res.ok) throw new Error('Không tải được kế hoạch giao hàng')
  return res.json()
}
