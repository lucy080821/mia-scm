// Công thức quản lý tồn kho: Safety Stock, ROP, EOQ, ABC phân loại

const ORDERING_COST = 200_000     // VND mỗi lần đặt hàng
const HOLDING_COST_PCT = 0.20     // Chi phí lưu kho = 20% giá nhập / năm

/** Tồn kho an toàn = 50% buffer × nhu cầu trong thời gian chờ hàng */
export function calcSafetyStock(avgDailySales: number, leadTimeDays = 7): number {
  if (avgDailySales <= 0) return 0
  return Math.ceil(avgDailySales * leadTimeDays * 0.5)
}

/** Điểm đặt hàng lại (ROP) = nhu cầu trong lead time + safety stock */
export function calcROP(avgDailySales: number, leadTimeDays = 7): number {
  if (avgDailySales <= 0) return 0
  return Math.ceil(avgDailySales * leadTimeDays + calcSafetyStock(avgDailySales, leadTimeDays))
}

/** EOQ — số lượng đặt hàng tối ưu tối thiểu hoá tổng chi phí đặt hàng + lưu kho */
export function calcEOQ(avgDailySales: number, purchasePrice: number): number {
  if (avgDailySales <= 0 || purchasePrice <= 0) return 0
  const D = avgDailySales * 365
  const H = purchasePrice * HOLDING_COST_PCT
  return Math.ceil(Math.sqrt((2 * D * ORDERING_COST) / H))
}

export type AbcClass = 'A' | 'B' | 'C'

/**
 * ABC phân loại theo doanh thu tích lũy:
 *   A → 0–70% doanh thu (ít SKU, đóng góp lớn nhất)
 *   B → 70–90%
 *   C → 90–100% (nhiều SKU, đóng góp nhỏ)
 */
export function classifyABC(
  products: { id: string; revenue: number }[]
): Record<string, AbcClass> {
  const sorted = [...products].sort((a, b) => b.revenue - a.revenue)
  const total = sorted.reduce((s, p) => s + p.revenue, 0)
  if (total === 0) return {}
  let cumulative = 0
  const result: Record<string, AbcClass> = {}
  for (const p of sorted) {
    cumulative += p.revenue
    const pct = (cumulative / total) * 100
    result[p.id] = pct <= 70 ? 'A' : pct <= 90 ? 'B' : 'C'
  }
  return result
}
