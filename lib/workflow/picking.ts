export interface PickingItem {
  id?: string
  product_id: string
  quantity: number          // số lượng cần soạn
  picked?: number           // số lượng đã soạn
  lot_number?: string
  selectedLot?: string      // lô được chọn khi soạn (FEFO)
  product?: { name: string; sku: string; unit: string }
}

export interface FefoLot {
  lot_number: string
  quantity: number
  expiry_date: string | null
}

/** Lấy danh sách lô theo FEFO (hết hạn gần nhất trước). */
export async function getFefoLots(
  product_id: string,
  warehouse_id: string,
): Promise<FefoLot[]> {
  const params = new URLSearchParams({ product_id, warehouse_id })
  const res = await fetch(`/api/inventory/lots?${params}`)
  if (!res.ok) return []
  return res.json()
}

/** Bắt đầu soạn hàng: chuyển phiếu xuất sang 'picking'. */
export async function startPicking(issueId: string): Promise<void> {
  const res = await fetch(`/api/stock-issues/${issueId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'picking' }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Lỗi bắt đầu soạn hàng')
}

/** Hoàn tất soạn hàng: lưu số lượng đã soạn, trừ tồn kho, tạo delivery, chuyển đơn → 'picked'. */
export async function completePicking(
  issueId: string,
  items: PickingItem[],
): Promise<void> {
  const res = await fetch(`/api/stock-issues/${issueId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'completed', items }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Lỗi hoàn tất soạn hàng')
}
