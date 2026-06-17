export interface StocktakeItemInput {
  product_id: string
  system_qty?: number
}

export interface StocktakeItemUpdate {
  id: string
  product_id: string
  counted_qty: number | null
}

/** Tạo phiếu kiểm kê mới (status: 'open'). */
export async function createStocktake(input: {
  warehouse_id: string
  stocktake_date: string
  note?: string
  items: StocktakeItemInput[]
}): Promise<{ id: string; code: string }> {
  const res = await fetch('/api/stocktakes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Lỗi tạo phiếu kiểm kê')
  return json
}

/** Lưu số đếm thực tế cho các mặt hàng (có thể gọi nhiều lần khi đang đếm). */
export async function recordCounts(
  stocktakeId: string,
  items: StocktakeItemUpdate[],
): Promise<void> {
  const res = await fetch(`/api/stocktakes/${stocktakeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Lỗi lưu số đếm')
}

/** Duyệt kiểm kê: điều chỉnh tồn kho theo số đếm thực, chuyển status → 'approved'. */
export async function approveStocktake(
  stocktakeId: string,
  items: StocktakeItemUpdate[],
): Promise<void> {
  const res = await fetch(`/api/stocktakes/${stocktakeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'approved', items }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Lỗi duyệt kiểm kê')
}

/** Đóng phiếu kiểm kê mà không điều chỉnh tồn kho. */
export async function closeStocktake(stocktakeId: string): Promise<void> {
  const res = await fetch(`/api/stocktakes/${stocktakeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'closed' }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error ?? 'Lỗi đóng phiếu kiểm kê')
}
