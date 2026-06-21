'use client'
import { useState, useEffect } from 'react'
import { Package, TrendingDown, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Warehouse, Calendar } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import AiSuggestionBox from '@/components/ui/AiSuggestionBox'
import Badge from '@/components/ui/Badge'
import { formatVND, formatDate } from '@/lib/utils'
import { calcSafetyStock, calcROP, calcEOQ, classifyABC } from '@/lib/inventory-formulas'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'

const MONTH_LABEL = `T${new Date().getMonth() + 1}`

interface AlertItem {
  sku: string
  name: string
  unit: string
  stock: number
  min_stock: number
  warehouse: string
  level: 'critical' | 'warning'
  rop: number
  safety_stock: number
  eoq: number
  avg_daily_sales: number
}

interface Movement {
  code: string
  type: 'in' | 'out'
  warehouse: string
  date: string
  status: string
  total_amount?: number
}

interface TopProduct {
  sku: string
  name: string
  qty: number
  value: number
}

interface WarehouseStat {
  id: string
  name: string
  skuCount: number
  totalQty: number
  totalValue: number
}

interface KpiState {
  totalSKUs: number
  totalValue: number
  receiptCount: number
  issueCount: number
  warningCount: number
  criticalCount: number
  outOfStock: number
  avgDOS: number | null
  belowROPCount: number
}

interface AbcDist {
  A: number; B: number; C: number
}

interface ExpiryProduct {
  sku: string
  name: string
  unit: string
  remainingPct: number
  remainingDays: number
  expiryDays: number
}

interface SuggestedOrder {
  sku: string
  name: string
  unit: string
  stock: number
  rop: number
  eoq: number
  dos: number | null
  product_id: string
  purchase_price: number
}

export default function WarehouseOverviewPage() {
  const { id: tenantId } = useTenant()
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<KpiState>({
    totalSKUs: 0, totalValue: 0, receiptCount: 0, issueCount: 0,
    warningCount: 0, criticalCount: 0, outOfStock: 0, avgDOS: null, belowROPCount: 0,
  })
  const [alertItems, setAlertItems]       = useState<AlertItem[]>([])
  const [movements, setMovements]         = useState<Movement[]>([])
  const [topProducts, setTopProducts]     = useState<TopProduct[]>([])
  const [warehouseStats, setWarehouseStats] = useState<WarehouseStat[]>([])
  const [abcDist, setAbcDist]             = useState<AbcDist | null>(null)
  const [expiryProducts, setExpiryProducts] = useState<ExpiryProduct[]>([])
  const [totalProductCount, setTotalProductCount] = useState(0)
  const [suggestedOrders, setSuggestedOrders] = useState<SuggestedOrder[]>([])
  const [aiContent, setAiContent]         = useState('Đang phân tích dữ liệu tồn kho...')
  const [creatingPO, setCreatingPO]       = useState(false)

  useEffect(() => {
    if (!tenantId) return
    loadData()
    loadAbcData()
    loadExpiryData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  async function loadAbcData() {
    const [{ data: items }, { count }] = await Promise.all([
      supabase.from('sales_order_items').select('product_id, subtotal').eq('tenant_id', tenantId).limit(10000),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
    ])

    setTotalProductCount(count ?? 0)

    if (!items || items.length === 0) return

    const revenueMap: Record<string, number> = {}
    for (const item of items as { product_id: string; subtotal: number }[]) {
      revenueMap[item.product_id] = (revenueMap[item.product_id] ?? 0) + (item.subtotal ?? 0)
    }

    const abcMap = classifyABC(
      Object.entries(revenueMap).map(([id, revenue]) => ({ id, revenue }))
    )
    const counts: AbcDist = { A: 0, B: 0, C: 0 }
    for (const cls of Object.values(abcMap)) counts[cls]++
    setAbcDist(counts)
  }

  async function loadExpiryData() {
    const { data: prods } = await supabase
      .from('products')
      .select('sku, name, unit, expiry_days, manufacture_date')
      .eq('tenant_id', tenantId)
      .not('manufacture_date', 'is', null)
      .not('expiry_days', 'is', null)
      .eq('status', 'active')
      .limit(200)

    if (!prods) return

    const today = Date.now()
    const list: ExpiryProduct[] = []

    for (const p of prods as { sku: string; name: string; unit: string; expiry_days: number; manufacture_date: string }[]) {
      const elapsedMs = today - new Date(p.manufacture_date).getTime()
      const remainingPct = Math.max(0, Math.round(100 - (elapsedMs / (p.expiry_days * 86_400_000)) * 100))
      const remainingDays = Math.max(0, Math.round((remainingPct / 100) * p.expiry_days))
      list.push({ sku: p.sku, name: p.name, unit: p.unit, remainingPct, remainingDays, expiryDays: p.expiry_days })
    }

    // Hiển thị tất cả, sort theo % còn lại tăng dần (sắp hết trước)
    setExpiryProducts(list.sort((a, b) => a.remainingPct - b.remainingPct))
  }

  async function loadData() {
    setLoading(true)
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    // ── Inventory + Products + Warehouses (query riêng, merge thủ công) ─────────
    const ago90 = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10)
    const [
      { data: prodRaw },
      { data: invRaw  },
      { data: whRaw   },
      { data: recentOrders },
    ] = await Promise.all([
      supabase
        .from('products')
        .select('id, sku, name, unit, purchase_price, min_stock, supplier_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'active'),
      supabase
        .from('inventory')
        .select('product_id, warehouse_id, quantity')
        .eq('tenant_id', tenantId),
      supabase
        .from('warehouses')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('status', 'active'),
      supabase
        .from('sales_orders')
        .select('id')
        .eq('tenant_id', tenantId)
        .gte('order_date', ago90)
        .in('status', ['confirmed', 'picking', 'delivering', 'completed']),
    ])

    // Tính avg_daily_sales từ sales_order_items của 90 ngày gần nhất
    const avgSalesMap: Record<string, number> = {}
    if (recentOrders && recentOrders.length > 0) {
      const orderIds = (recentOrders as { id: string }[]).map(o => o.id)
      const { data: itemsRaw } = await supabase
        .from('sales_order_items')
        .select('product_id, quantity')
        .eq('tenant_id', tenantId)
        .in('order_id', orderIds)
        .limit(5000)
      for (const item of (itemsRaw ?? []) as { product_id: string; quantity: number }[]) {
        avgSalesMap[item.product_id] = (avgSalesMap[item.product_id] ?? 0) + item.quantity
      }
      for (const pid of Object.keys(avgSalesMap)) {
        avgSalesMap[pid] = avgSalesMap[pid] / 90
      }
    }

    type ProdRow = { id: string; sku: string; name: string; unit: string; purchase_price: number; min_stock: number; supplier_id: string | null }
    type InvRow  = { product_id: string; warehouse_id: string; quantity: number }
    type WhRow   = { id: string; name: string }

    const prods = (prodRaw ?? []) as ProdRow[]
    const invs  = (invRaw  ?? []) as InvRow[]
    const whs   = (whRaw   ?? []) as WhRow[]

    const prodMap = Object.fromEntries(prods.map(p => [p.id, p]))
    const whMap   = Object.fromEntries(whs.map(w => [w.id, w]))

    // Tổng tồn kho mỗi sản phẩm (gộp tất cả kho)
    const stockByProduct: Record<string, number> = {}
    for (const inv of invs) {
      stockByProduct[inv.product_id] = (stockByProduct[inv.product_id] ?? 0) + inv.quantity
    }

    const hasAnyStock = invs.some(r => r.quantity > 0)

    // ── KPI tổng ─────────────────────────────────────────────────────────────
    const skuSet    = new Set(invs.filter(r => r.quantity > 0).map(r => r.product_id))
    const totalSKUs = skuSet.size

    const totalValue = invs.reduce((sum, r) => {
      const p = prodMap[r.product_id]
      return sum + r.quantity * (p?.purchase_price ?? 0)
    }, 0)

    // DOS trung bình
    const dosValues = prods
      .filter(p => (avgSalesMap[p.id] ?? 0) > 0)
      .map(p => Math.floor((stockByProduct[p.id] ?? 0) / avgSalesMap[p.id]))
    const avgDOS = dosValues.length > 0
      ? Math.round(dosValues.reduce((s, d) => s + d, 0) / dosValues.length)
      : null

    // ── Alert items ──────────────────────────────────────────────────────────
    const alerts: AlertItem[] = []
    for (const p of prods) {
      const stock        = stockByProduct[p.id] ?? 0
      const avg          = avgSalesMap[p.id] ?? 0
      const rop          = calcROP(avg)
      const safety_stock = calcSafetyStock(avg)
      const eoq          = calcEOQ(avg, p.purchase_price)
      const belowMin     = stock <= (p.min_stock ?? 0)
      const belowROP     = rop > 0 && stock <= rop

      if (belowMin || belowROP) {
        const isCritical = stock === 0 || (safety_stock > 0 && stock <= safety_stock)
        alerts.push({
          sku: p.sku, name: p.name, unit: p.unit, stock,
          min_stock: p.min_stock, warehouse: '—',
          level: isCritical ? 'critical' : 'warning',
          rop, safety_stock, eoq, avg_daily_sales: avg,
        })
      }
    }
    alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1))
    setAlertItems(alerts)

    const criticalCount = alerts.filter(a => a.level === 'critical').length
    const warningCount  = alerts.filter(a => a.level === 'warning').length
    const outOfStock    = alerts.filter(a => a.stock === 0).length
    const belowROPCount = alerts.filter(a => a.rop > 0 && a.stock > 0 && a.stock <= a.rop).length

    // ── Top products by tồn kho × giá nhập ──────────────────────────────────
    const topProds: TopProduct[] = prods
      .map(p => ({
        sku: p.sku, name: p.name,
        qty: stockByProduct[p.id] ?? 0,
        value: (stockByProduct[p.id] ?? 0) * p.purchase_price,
      }))
      .filter(p => hasAnyStock ? p.qty > 0 : true)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
    setTopProducts(topProds)

    // ── Warehouse stats ──────────────────────────────────────────────────────
    const whStats: Record<string, WarehouseStat> = {}
    for (const w of whs) {
      whStats[w.id] = { id: w.id, name: w.name, skuCount: 0, totalQty: 0, totalValue: 0 }
    }
    for (const inv of invs) {
      if (!whStats[inv.warehouse_id] || inv.quantity <= 0) continue
      const p = prodMap[inv.product_id]
      if (!p) continue
      whStats[inv.warehouse_id].skuCount++
      whStats[inv.warehouse_id].totalQty   += inv.quantity
      whStats[inv.warehouse_id].totalValue += inv.quantity * p.purchase_price
    }
    setWarehouseStats(Object.values(whStats))

    setKpis(k => ({ ...k, totalSKUs, totalValue, criticalCount, warningCount, outOfStock, avgDOS, belowROPCount }))

    // ── Đề xuất đặt hàng: sản phẩm cần nhập (dưới ROP / hết hàng / DOS ≤ 30) ──
    const suggested: SuggestedOrder[] = prods
      .map(p => {
        const stock = stockByProduct[p.id] ?? 0
        const avg   = avgSalesMap[p.id] ?? 0
        const rop   = calcROP(avg)
        const eoq   = calcEOQ(avg, p.purchase_price)
        const dos   = avg > 0 ? Math.floor(stock / avg) : null
        // Nếu không có lịch sử bán, dùng min_stock làm số lượng đề xuất
        const orderQty = eoq > 0 ? eoq : (p.min_stock > 0 ? p.min_stock : 0)
        const needsOrder = stock === 0 || stock <= rop || (dos !== null && dos <= 30) || stock <= p.min_stock
        return { sku: p.sku, name: p.name, unit: p.unit, stock, rop, eoq: orderQty, dos, product_id: p.id, purchase_price: p.purchase_price, needsOrder }
      })
      .filter(p => p.needsOrder && p.eoq > 0)
      .sort((a, b) => (a.stock === 0 ? -1 : b.stock === 0 ? 1 : (a.dos ?? 9999) - (b.dos ?? 9999)))
      .slice(0, 20)
      .map(({ needsOrder: _, ...rest }) => rest)
    setSuggestedOrders(suggested)

    fetchAiSuggestion(alerts)

    // ── Phiếu nhập / xuất tháng hiện tại ─────────────────────────────────────
    const [{ count: receiptCount }, { count: issueCount }] = await Promise.all([
      supabase.from('stock_receipts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('receipt_date', monthStart),
      supabase.from('stock_issues').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('issue_date', monthStart),
    ])
    setKpis(k => ({ ...k, receiptCount: receiptCount ?? 0, issueCount: issueCount ?? 0 }))

    // ── Giao dịch gần đây ──────────────────────────────────────────────────────
    const [{ data: receipts }, { data: issues }] = await Promise.all([
      supabase.from('stock_receipts')
        .select('code, receipt_date, status, total_amount, warehouse:warehouses(name)')
        .eq('tenant_id', tenantId)
        .order('receipt_date', { ascending: false }).limit(5),
      supabase.from('stock_issues')
        .select('code, issue_date, status, warehouse:warehouses(name)')
        .eq('tenant_id', tenantId)
        .order('issue_date', { ascending: false }).limit(5),
    ])

    const movList: Movement[] = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(receipts ?? []).map((r: any) => ({
        code: r.code, type: 'in' as const,
        warehouse: r.warehouse?.name ?? '—', date: r.receipt_date,
        status: r.status, total_amount: r.total_amount,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(issues ?? []).map((i: any) => ({
        code: i.code, type: 'out' as const,
        warehouse: i.warehouse?.name ?? '—', date: i.issue_date, status: i.status,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
    setMovements(movList)

    setLoading(false)
  }

  async function handleCreatePO() {
    if (creatingPO) return
    const items = suggestedOrders.length > 0
      ? suggestedOrders.map(s => ({ sku: s.sku, quantity: Math.max(Math.round(s.eoq), 1) }))
      : alertItems.map(a => ({ sku: a.sku, quantity: Math.max(Math.round(a.eoq > 0 ? a.eoq : a.min_stock), 1) }))
    if (!items.length) return
    setCreatingPO(true)
    try {
      const res = await fetch('/api/purchase-orders/from-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lỗi tạo đơn')
      window.location.href = '/mua-hang/don-mua-hang'
    } catch (e: unknown) {
      setCreatingPO(false)
      setAiContent(`❌ ${e instanceof Error ? e.message : 'Lỗi tạo đơn đặt hàng. Thử lại sau.'}`)
    }
  }

  async function fetchAiSuggestion(alerts: AlertItem[]) {
    if (alerts.length === 0) {
      setAiContent('Tất cả sản phẩm đang có tồn kho ổn định. Không có cảnh báo nào cần xử lý.')
      return
    }
    setAiContent('🤖 Đang phân tích dữ liệu tồn kho...')
    try {
      const res = await fetch('/api/ai/inventory-suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertItems: alerts }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      const lines = [
        data.summary,
        data.action_items?.length
          ? '<br/><strong>Ưu tiên:</strong> ' + (data.action_items as string[]).map((a, i) => `${i + 1}. ${a}`).join(' · ')
          : '',
        data.suggestions?.filter((s: { urgency: string }) => s.urgency === 'critical').length
          ? `<br/>Cần đặt ngay: <strong>${data.suggestions.filter((s: { urgency: string }) => s.urgency === 'critical').map((s: { product_name: string }) => s.product_name).join(', ')}</strong>`
          : '',
      ].filter(Boolean).join('')
      setAiContent(lines || 'Phân tích hoàn tất.')
    } catch {
      setAiContent(`Phát hiện <strong>${alerts.length} sản phẩm</strong> cần nhập hàng. Kiểm tra danh sách cảnh báo bên dưới.`)
    }
  }

  return (
    <div>
      <PageHeader title="Tổng quan kho" subtitle="Quản lý tồn kho toàn hệ thống" />

      {/* KPI — 2 rows × 4 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KpiCard
          icon={<Package size={18} className="text-blue-600" />}
          label="Tổng SKU" iconBg="bg-blue-100"
          value={loading ? '...' : (kpis.totalSKUs > 0 ? kpis.totalSKUs : totalProductCount).toLocaleString('vi-VN')}
          sub={kpis.totalSKUs > 0 ? 'Đang có hàng' : 'Tổng sản phẩm'}
        />
        <KpiCard
          icon={<Warehouse size={18} className="text-teal-600" />}
          label="Giá trị kho" iconBg="bg-teal-100"
          value={loading ? '...' : formatVND(kpis.totalValue)}
          sub={`Tháng ${MONTH_LABEL}`}
        />
        <KpiCard
          icon={<Calendar size={18} className="text-sky-600" />}
          label="TB DOS (ngày tồn)" iconBg="bg-sky-100"
          value={loading ? '...' : kpis.avgDOS !== null ? `${kpis.avgDOS} ngày` : '—'}
          sub="Tốc độ tiêu thụ TB"
          subColor={kpis.avgDOS !== null && kpis.avgDOS <= 14 ? 'orange' : 'green'}
        />
        <KpiCard
          icon={<TrendingDown size={18} className="text-red-500" />}
          label="Dưới ROP" iconBg="bg-red-100" subColor="red"
          value={loading ? '...' : kpis.belowROPCount}
          sub="Cần đặt hàng ngay"
        />
        <KpiCard
          icon={<ArrowDownToLine size={18} className="text-green-600" />}
          label={`Nhập kho ${MONTH_LABEL}`} iconBg="bg-green-100"
          value={loading ? '...' : kpis.receiptCount.toLocaleString('vi-VN')}
          sub="Phiếu nhập"
        />
        <KpiCard
          icon={<ArrowUpFromLine size={18} className="text-orange-600" />}
          label={`Xuất kho ${MONTH_LABEL}`} iconBg="bg-orange-100"
          value={loading ? '...' : kpis.issueCount.toLocaleString('vi-VN')}
          sub="Phiếu xuất"
        />
        <KpiCard
          icon={<AlertTriangle size={18} className="text-yellow-600" />}
          label="Cần chú ý" iconBg="bg-yellow-100" subColor="orange"
          value={loading ? '...' : kpis.warningCount}
          sub="Sắp hết / dưới ROP"
        />
        <KpiCard
          icon={<TrendingDown size={18} className="text-red-500" />}
          label="Nguy hiểm" iconBg="bg-red-100" subColor="red"
          value={loading ? '...' : kpis.criticalCount}
          sub={`${kpis.outOfStock} hết hàng`}
        />
      </div>

      {/* ABC Distribution bar */}
      {abcDist && (
        <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3 mb-4 flex items-center gap-4 flex-wrap">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">ABC Phân loại</span>
          <div className="flex items-center gap-5 flex-1 flex-wrap">
            {[
              { cls: 'A', count: abcDist.A, color: 'bg-green-100 text-green-700 border border-green-200', desc: 'Top 70% DT — ưu tiên cao' },
              { cls: 'B', count: abcDist.B, color: 'bg-yellow-100 text-yellow-700 border border-yellow-200', desc: '70–90% DT' },
              { cls: 'C', count: abcDist.C, color: 'bg-gray-100 text-gray-500 border border-gray-200', desc: '90–100% DT' },
            ].map(({ cls, count, color, desc }) => (
              <div key={cls} className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${color}`}>{cls}</span>
                <span className="text-sm font-bold text-[#1e2a3a]">{count} SKU</span>
                <span className="text-xs text-gray-400">{desc}</span>
              </div>
            ))}
          </div>
          <a href="/kho-hang/san-pham" className="text-xs text-[var(--mia-primary)] hover:underline shrink-0">Xem chi tiết →</a>
        </div>
      )}

      {/* AI suggestion */}
      <div className="mb-5">
        <AiSuggestionBox
          title="AI Phân tích tồn kho (ROP · EOQ · ABC)"
          content={aiContent}
          actionLabel={creatingPO ? 'Đang tạo đơn...' : 'Tạo đơn đặt hàng'}
          actionDisabled={creatingPO || (suggestedOrders.length === 0 && alertItems.length === 0)}
          onAction={handleCreatePO}
        />
      </div>

      {/* Đề xuất đặt hàng */}
      {suggestedOrders.length > 0 && (
        <div className="bg-white rounded-xl border border-[#e5e7eb] mb-4">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
            <div className="flex items-center gap-2">
              <span className="text-base">📋</span>
              <h2 className="text-sm font-semibold text-[#1e2a3a]">Đề xuất đặt hàng ngay</h2>
              <span className="text-[10px] bg-sky-100 text-sky-600 font-semibold px-2 py-0.5 rounded-full">
                {suggestedOrders.length} sản phẩm
              </span>
            </div>
            <a href="/mua-hang/don-mua-hang" className="text-xs text-[var(--mia-primary)] hover:underline">
              Tạo đơn mua hàng →
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#e5e7eb] bg-gray-50">
                  {['SKU', 'Sản phẩm', 'Tồn kho', 'ROP', 'DOS còn lại', 'Đề xuất đặt (EOQ)', 'Ưu tiên'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suggestedOrders.map(p => {
                  const urgent = p.stock === 0 || (p.dos !== null && p.dos <= 7)
                  const warn   = !urgent && (p.dos !== null && p.dos <= 14)
                  return (
                    <tr key={p.sku} className="border-b border-[#e5e7eb] last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs font-mono text-[var(--mia-primary)]">{p.sku}</td>
                      <td className="px-4 py-3 text-xs font-medium text-[#1e2a3a] max-w-[200px] truncate">{p.name}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-red-600">
                        {p.stock === 0 ? 'Hết hàng' : `${p.stock.toLocaleString('vi-VN')} ${p.unit}`}
                      </td>
                      <td className="px-4 py-3 text-xs text-orange-500 font-medium">
                        {p.rop.toLocaleString('vi-VN')} {p.unit}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {p.dos !== null
                          ? <span className={urgent ? 'text-red-600 font-bold' : warn ? 'text-orange-500 font-semibold' : 'text-gray-600'}>
                              {p.dos} ngày
                            </span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-sky-200">
                          {p.eoq.toLocaleString('vi-VN')} {p.unit}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                          urgent ? 'bg-red-100 text-red-600' : warn ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {urgent ? 'Khẩn cấp' : warn ? 'Sớm' : 'Kế hoạch'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left panel */}
        <div className="xl:col-span-2 space-y-4">

          {/* Warehouse stats */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
            <h2 className="text-sm font-semibold text-[#1e2a3a] mb-4">Tồn kho theo kho</h2>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : warehouseStats.length === 0 ? (
              <p className="text-xs text-gray-400 py-6 text-center">Chưa có dữ liệu kho</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e5e7eb]">
                      {['Kho', 'Số SKU', 'Tổng SL', 'Giá trị'].map(h => (
                        <th key={h} className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {warehouseStats.map(w => (
                      <tr key={w.id} className="border-b border-[#e5e7eb] last:border-0 hover:bg-gray-50">
                        <td className="py-3 text-xs font-medium text-[#1e2a3a]">{w.name}</td>
                        <td className="py-3 text-xs text-gray-700">{w.skuCount.toLocaleString('vi-VN')}</td>
                        <td className="py-3 text-xs text-gray-700">{w.totalQty.toLocaleString('vi-VN')}</td>
                        <td className="py-3 text-xs font-semibold text-[var(--mia-primary)]">{formatVND(w.totalValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Recent movements */}
          <div className="bg-white rounded-xl border border-[#e5e7eb]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
              <h2 className="text-sm font-semibold text-[#1e2a3a]">Giao dịch kho gần đây</h2>
              <a href="/kho-hang/nhap-kho" className="text-xs text-[var(--mia-primary)] hover:underline">Xem tất cả →</a>
            </div>
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : movements.length === 0 ? (
              <p className="text-xs text-gray-400 py-8 text-center">Chưa có giao dịch nào</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#e5e7eb] bg-gray-50">
                      {['Phiếu', 'Loại', 'Kho', 'Giá trị', 'Ngày', 'TT'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(m => (
                      <tr key={m.code + m.type} className="border-b border-[#e5e7eb] last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 text-xs font-medium text-[var(--mia-primary)]">{m.code}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${m.type === 'in' ? 'text-green-600' : 'text-orange-600'}`}>
                            {m.type === 'in' ? <ArrowDownToLine size={11} /> : <ArrowUpFromLine size={11} />}
                            {m.type === 'in' ? 'Nhập' : 'Xuất'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{m.warehouse}</td>
                        <td className="px-4 py-3 text-xs text-gray-700">
                          {m.total_amount ? formatVND(m.total_amount) : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(m.date)}</td>
                        <td className="px-4 py-3"><Badge status={m.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Alert panel */}
          <div className="bg-white rounded-xl border border-[#e5e7eb]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="text-yellow-500" />
                <h2 className="text-sm font-semibold text-[#1e2a3a]">Cảnh báo tồn kho</h2>
              </div>
              <span className="text-[10px] font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                {alertItems.length} sản phẩm
              </span>
            </div>
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
            ) : alertItems.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-green-600 font-medium">✓ Tồn kho ổn định</p>
                <p className="text-[10px] text-gray-400 mt-1">Không có sản phẩm nào dưới ROP</p>
              </div>
            ) : (
              <div className="divide-y divide-[#e5e7eb] max-h-[480px] overflow-y-auto">
                {alertItems.map(p => (
                  <div key={p.sku + p.warehouse} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-[#1e2a3a]">{p.name}</p>
                        <p className="text-[10px] text-gray-400">{p.sku} · {p.warehouse}</p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        p.level === 'critical' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {p.level === 'critical' ? 'Nguy hiểm' : 'Cảnh báo'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className={`text-xs font-bold ${p.stock === 0 ? 'text-red-500' : 'text-red-600'}`}>
                        {p.stock === 0 ? 'Hết hàng' : `${p.stock.toLocaleString('vi-VN')} ${p.unit}`}
                      </span>
                      <div className="text-right space-y-0">
                        {p.rop > 0 && (
                          <div className="text-[10px] text-gray-400">
                            ROP <span className="font-semibold text-orange-500">{p.rop.toLocaleString('vi-VN')}</span>
                          </div>
                        )}
                        {p.eoq > 0 && (
                          <div className="text-[10px] text-sky-500 font-medium">
                            EOQ {p.eoq.toLocaleString('vi-VN')} {p.unit}
                          </div>
                        )}
                      </div>
                    </div>
                    {p.stock > 0 && p.rop > 0 && (
                      <div className="mt-1.5 bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${p.level === 'critical' ? 'bg-red-400' : 'bg-yellow-400'}`}
                          style={{ width: `${Math.min((p.stock / p.rop) * 100, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top products */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
            <h2 className="text-sm font-semibold text-[#1e2a3a] mb-3">Top sản phẩm tồn kho</h2>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : topProducts.length === 0 ? (
              <p className="text-xs text-gray-400 py-4 text-center">Chưa có dữ liệu</p>
            ) : (
              <div className="space-y-2">
                {topProducts.map((p, i) => (
                  <div key={p.sku} className="flex items-center justify-between py-2 border-b border-[#e5e7eb] last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="w-5 h-5 bg-gray-100 rounded flex items-center justify-center text-[10px] font-bold text-gray-500">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-xs font-medium text-[#1e2a3a]">{p.name}</p>
                        <p className="text-[10px] text-gray-400">
                          {p.qty > 0 ? `${p.qty.toLocaleString('vi-VN')} đơn vị` : 'Chưa nhập kho'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-[var(--mia-primary)]">{formatVND(p.value)}</p>
                      {p.qty === 0 && <p className="text-[9px] text-gray-400">giá nhập</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Near-expiry panel */}
          <div className="bg-white rounded-xl border border-[#e5e7eb]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-orange-500" />
                <h2 className="text-sm font-semibold text-[#1e2a3a]">Hạn sử dụng lô hàng</h2>
              </div>
              {expiryProducts.length > 0 && (
                <span className="text-[10px] font-semibold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                  {expiryProducts.filter(p => p.remainingPct <= 25).length} sắp hết
                </span>
              )}
            </div>
            {expiryProducts.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-xs text-gray-400">Chưa có dữ liệu hạn sử dụng</p>
                <p className="text-[10px] text-gray-300 mt-1">Thêm ngày sản xuất trong mục Sản phẩm</p>
              </div>
            ) : (
              <div className="divide-y divide-[#e5e7eb] max-h-[340px] overflow-y-auto">
                {expiryProducts.slice(0, 10).map(p => {
                  const barColor = p.remainingPct <= 10
                    ? 'bg-red-500'
                    : p.remainingPct <= 25
                    ? 'bg-orange-400'
                    : p.remainingPct <= 50
                    ? 'bg-yellow-400'
                    : 'bg-green-400'
                  const textColor = p.remainingPct <= 10
                    ? 'text-red-600'
                    : p.remainingPct <= 25
                    ? 'text-orange-600'
                    : p.remainingPct <= 50
                    ? 'text-yellow-600'
                    : 'text-green-600'
                  return (
                    <div key={p.sku} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[#1e2a3a] truncate">{p.name}</p>
                          <p className="text-[10px] text-gray-400">{p.sku} · HSD {p.expiryDays} ngày</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-xs font-bold ${textColor}`}>{p.remainingPct}%</p>
                          <p className="text-[10px] text-gray-400">{p.remainingDays} ngày</p>
                        </div>
                      </div>
                      <div className="bg-gray-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all ${barColor}`}
                          style={{ width: `${p.remainingPct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
                {expiryProducts.length > 10 && (
                  <div className="px-4 py-2 text-center">
                    <a href="/kho-hang/san-pham" className="text-[10px] text-[var(--mia-primary)] hover:underline">
                      Xem thêm {expiryProducts.length - 10} sản phẩm →
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
