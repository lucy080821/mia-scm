// Inventory alert utility functions + shared product data
// Used by: kho-hang/san-pham, kho-hang/tong-quan-kho, NotificationPanel

export interface ProductAlertData {
  id: string
  sku: string
  name: string
  unit: string
  supplier: string
  stock: number
  min_stock: number
  avg_daily_sales: number      // trung bình số lượng xuất mỗi ngày (30 ngày gần nhất)
  expiry_days: number | null   // tổng thời hạn sử dụng (ngày) tính từ ngày sản xuất
  manufacture_date: string | null  // ngày sản xuất của lô hiện tại (YYYY-MM-DD)
  lot_number?: string
}

export type AlertLevel = 'critical' | 'warning' | 'ok'

// ─── Pure utility functions ───────────────────────────────────────────────────

/** Days until stockout based on avg daily sales. Returns null if no sales data. */
export function calcDaysOfStock(stock: number, avgDailySales: number): number | null {
  if (avgDailySales <= 0 || stock < 0) return null
  return Math.floor(stock / avgDailySales)
}

/**
 * Phần trăm hạn sử dụng CÒN LẠI (0–100).
 * 100% = vừa sản xuất, 0% = hết hạn.
 * Formula: 100 − (today − manufactureDate) / expiryDays × 100
 * Returns null if manufacture_date or expiry_days is missing.
 */
export function calcDateElapsedPct(
  manufactureDate: string | null,
  expiryDays: number | null,
  today = new Date(),
): number | null {
  if (!manufactureDate || !expiryDays) return null
  const elapsedMs = today.getTime() - new Date(manufactureDate).getTime()
  if (elapsedMs < 0) return 100
  const remaining = 100 - (elapsedMs / (expiryDays * 86_400_000)) * 100
  return Math.max(0, Math.round(remaining))
}

/**
 * Combined alert level:
 *   critical → stock = 0  OR  days ≤ 3
 *   warning  → stock < min_stock  OR  days ≤ 7  OR  dateElapsedPct ≥ 75
 *   ok       → everything else
 */
export function getAlertLevel(p: {
  stock: number
  min_stock: number
  daysOfStock: number | null
  dateElapsedPct: number | null
}): AlertLevel {
  if (p.stock === 0) return 'critical'
  if (p.daysOfStock !== null && p.daysOfStock <= 3) return 'critical'
  if (p.stock < p.min_stock) return 'warning'
  if (p.daysOfStock !== null && p.daysOfStock <= 7) return 'warning'
  if (p.dateElapsedPct !== null && p.dateElapsedPct <= 25) return 'warning'
  return 'ok'
}

// ─── Shared product data (populated from DB via hooks) ───────────────────────

export const ALERT_PRODUCTS: ProductAlertData[] = []

// ─── Notification generation ──────────────────────────────────────────────────

export interface InventoryNotif {
  id: string
  type: 'inventory'
  title: string
  message: string
  time: string   // ISO
  read: boolean
  href?: string
}

export function generateInventoryNotifs(products: ProductAlertData[] = ALERT_PRODUCTS): InventoryNotif[] {
  const now = new Date()
  const notifs: InventoryNotif[] = []
  let offset = 0

  for (const p of products) {
    const days  = calcDaysOfStock(p.stock, p.avg_daily_sales)
    const pct   = calcDateElapsedPct(p.manufacture_date, p.expiry_days, now)
    const level = getAlertLevel({ stock: p.stock, min_stock: p.min_stock, daysOfStock: days, dateElapsedPct: pct })

    if (level === 'critical') {
      if (p.stock === 0) {
        notifs.push({
          id: `inv-oos-${p.id}`, type: 'inventory', read: false,
          title: 'Hết hàng',
          message: `${p.name} — không còn tồn kho, cần nhập ngay từ ${p.supplier}`,
          time: new Date(now.getTime() - offset++ * 420_000).toISOString(),
          href: '/kho-hang/san-pham',
        })
      } else if (days !== null) {
        notifs.push({
          id: `inv-crit-${p.id}`, type: 'inventory', read: false,
          title: `Hết trong ${days} ngày`,
          message: `${p.name} — còn ${p.stock} ${p.unit}, tốc độ xuất ${p.avg_daily_sales} ${p.unit}/ngày`,
          time: new Date(now.getTime() - offset++ * 420_000).toISOString(),
          href: '/kho-hang/san-pham',
        })
      }
    } else if (level === 'warning') {
      if (p.stock < p.min_stock) {
        notifs.push({
          id: `inv-low-${p.id}`, type: 'inventory', read: false,
          title: 'Tồn kho thấp',
          message: `${p.name} — còn ${p.stock} ${p.unit}, thấp hơn mức tối thiểu (${p.min_stock})`,
          time: new Date(now.getTime() - offset++ * 420_000).toISOString(),
          href: '/kho-hang/san-pham',
        })
      } else if (days !== null && days <= 7) {
        notifs.push({
          id: `inv-warn-${p.id}`, type: 'inventory', read: false,
          title: 'Cảnh báo tồn kho',
          message: `${p.name} — còn khoảng ${days} ngày, xuất ${p.avg_daily_sales} ${p.unit}/ngày`,
          time: new Date(now.getTime() - offset++ * 420_000).toISOString(),
          href: '/kho-hang/san-pham',
        })
      }
    }

    if (pct !== null && pct <= 25 && p.manufacture_date) {
      const remainDays = Math.max(0, Math.round((pct / 100) * p.expiry_days!))
      notifs.push({
        id: `inv-exp-${p.id}`, type: 'inventory', read: false,
        title: 'Lô hàng sắp hết hạn',
        message: `${p.name}${p.lot_number ? ` — Lô ${p.lot_number}` : ''} — còn ${pct}% hạn sử dụng${remainDays > 0 ? ` (${remainDays} ngày)` : ' — đã hết hạn'}`,
        time: new Date(now.getTime() - offset++ * 420_000).toISOString(),
        href: '/kho-hang/kiem-ke',
      })
    }
  }

  return notifs
}

// ─── Debt / overdue notifications ─────────────────────────────────────────────

export interface DebtNotif {
  id: string; type: 'order'; title: string; message: string
  time: string; read: boolean; href?: string
}

export function generateDebtNotifs(): DebtNotif[] {
  return []
}
