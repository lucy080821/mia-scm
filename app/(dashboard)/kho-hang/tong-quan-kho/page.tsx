'use client'
import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { Package, TrendingDown, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Warehouse, Calendar, X, Trash2, Download } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import AiSuggestionBox from '@/components/ui/AiSuggestionBox'
import Badge from '@/components/ui/Badge'
import { formatVND, formatDate } from '@/lib/utils'
import { calcSafetyStock, calcROP, calcEOQ, classifyABC } from '@/lib/inventory-formulas'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'
import { useAuth } from '@/hooks/useAuth'

const MONTH_LABEL = `T${new Date().getMonth() + 1}`

interface AlertItem {
  sku: string
  name: string
  unit: string
  stock: number
  min_stock: number
  warehouse: string
  warehouse_id: string
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
  warehouse_id: string
  warehouse_name: string
}

function exportXlsx(rows: object[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, filename)
}

export default function WarehouseOverviewPage() {
  const { id: tenantId } = useTenant()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<KpiState>({
    totalSKUs: 0, totalValue: 0, receiptCount: 0, issueCount: 0,
    warningCount: 0, criticalCount: 0, outOfStock: 0, avgDOS: null, belowROPCount: 0,
  })
  const [alertItems, setAlertItems]         = useState<AlertItem[]>([])
  const [movements, setMovements]           = useState<Movement[]>([])
  const [topProducts, setTopProducts]       = useState<TopProduct[]>([])
  const [warehouseStats, setWarehouseStats] = useState<WarehouseStat[]>([])
  const [abcDist, setAbcDist]               = useState<AbcDist | null>(null)
  const [expiryProducts, setExpiryProducts] = useState<ExpiryProduct[]>([])
  const [totalProductCount, setTotalProductCount] = useState(0)
  const [suggestedOrders, setSuggestedOrders] = useState<SuggestedOrder[]>([])
  const [multiWarehouse, setMultiWarehouse] = useState(false)
  // Per-warehouse AI content: key = warehouse_id
  const [aiContents, setAiContents] = useState<Record<string, string>>({})
  const [creatingPO, setCreatingPO] = useState(false)
  const [reviewItems, setReviewItems] = useState<{ sku: string; name: string; unit: string; quantity: number; unit_price: number; warehouse_name?: string }[]>([])
  const [showReview, setShowReview] = useState(false)
  // Warehouse assignments for current user (warehouse staff only)
  const [assignedWarehouseIds, setAssignedWarehouseIds] = useState<string[] | null>(null)

  useEffect(() => {
    if (!tenantId) return
    loadData()
    loadAbcData()
    loadExpiryData()
    if (user?.role === 'warehouse') loadMyAssignments()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, user?.id])

  async function loadMyAssignments() {
    try {
      const res = await fetch('/api/warehouse-assignments')
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setAssignedWarehouseIds(data.map((a: { warehouse_id: string }) => a.warehouse_id))
        }
      }
    } catch { /* no assignment table yet — show all */ }
  }

  async function loadAbcData() {
    const [{ data: items }, { count }] = await Promise.all([
      supabase.from('sales_order_items').select('product_id, subtotal, sales_orders!inner(tenant_id)').eq('sales_orders.tenant_id', tenantId).limit(10000),
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

    setExpiryProducts(list.sort((a, b) => a.remainingPct - b.remainingPct))
  }

  async function loadData() {
    setLoading(true)
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const ago90 = new Date(now.getTime() - 90 * 86_400_000).toISOString().slice(0, 10)

    const [
      { data: prodRaw },
      { data: invRaw  },
      { data: whRaw   },
      { data: recentOrders },
    ] = await Promise.all([
      supabase.from('products').select('id, sku, name, unit, purchase_price, min_stock, supplier_id').eq('tenant_id', tenantId).eq('status', 'active'),
      supabase.from('inventory').select('product_id, warehouse_id, quantity').eq('tenant_id', tenantId),
      supabase.from('warehouses').select('id, name').eq('tenant_id', tenantId).eq('status', 'active'),
      supabase.from('sales_orders').select('id').eq('tenant_id', tenantId)
        .gte('created_at', new Date(now.getTime() - 90 * 86_400_000).toISOString())
        .in('status', ['confirmed', 'picking', 'picked', 'pending_ship', 'delivering', 'completed']),
    ])

    // Avg daily sales map
    const avgSalesMap: Record<string, number> = {}
    if (recentOrders && recentOrders.length > 0) {
      const orderIds = (recentOrders as { id: string }[]).map(o => o.id)
      const { data: itemsRaw } = await supabase
        .from('sales_order_items').select('product_id, quantity')
        .in('order_id', orderIds).limit(5000)
      for (const item of (itemsRaw ?? []) as { product_id: string; quantity: number }[]) {
        avgSalesMap[item.product_id] = (avgSalesMap[item.product_id] ?? 0) + item.quantity
      }
      for (const pid of Object.keys(avgSalesMap)) avgSalesMap[pid] = avgSalesMap[pid] / 90
    }

    type ProdRow = { id: string; sku: string; name: string; unit: string; purchase_price: number; min_stock: number; supplier_id: string | null }
    type InvRow  = { product_id: string; warehouse_id: string; quantity: number }
    type WhRow   = { id: string; name: string }

    const prods = (prodRaw ?? []) as ProdRow[]
    const invs  = (invRaw  ?? []) as InvRow[]
    let   whs   = (whRaw   ?? []) as WhRow[]

    // Filter warehouses for warehouse staff with assignments
    if (user?.role === 'warehouse' && assignedWarehouseIds && assignedWarehouseIds.length > 0) {
      whs = whs.filter(w => assignedWarehouseIds.includes(w.id))
    }
    const allowedWhIds = new Set(whs.map(w => w.id))

    const prodMap = Object.fromEntries(prods.map(p => [p.id, p]))
    const whMap   = Object.fromEntries(whs.map(w => [w.id, w]))

    // ── Stock maps ────────────────────────────────────────────────────────────
    const filteredInvs = invs.filter(inv => !allowedWhIds.size || allowedWhIds.has(inv.warehouse_id))

    // Total stock per product (across allowed warehouses)
    const stockByProduct: Record<string, number> = {}
    for (const inv of filteredInvs) {
      stockByProduct[inv.product_id] = (stockByProduct[inv.product_id] ?? 0) + inv.quantity
    }

    // Per-warehouse stock: warehouse_id → product_id → qty
    const stockByWarehouse: Record<string, Record<string, number>> = {}
    for (const inv of filteredInvs) {
      if (!stockByWarehouse[inv.warehouse_id]) stockByWarehouse[inv.warehouse_id] = {}
      stockByWarehouse[inv.warehouse_id][inv.product_id] =
        (stockByWarehouse[inv.warehouse_id][inv.product_id] ?? 0) + inv.quantity
    }

    const hasAnyStock = filteredInvs.some(r => r.quantity > 0)

    // ── KPI ────────────────────────────────────────────────────────────────────
    const skuSet    = new Set(filteredInvs.filter(r => r.quantity > 0).map(r => r.product_id))
    const totalSKUs = skuSet.size
    const totalValue = filteredInvs.reduce((sum, r) => {
      const p = prodMap[r.product_id]
      return sum + r.quantity * (p?.purchase_price ?? 0)
    }, 0)
    const dosValues = prods
      .filter(p => (avgSalesMap[p.id] ?? 0) > 0)
      .map(p => Math.floor((stockByProduct[p.id] ?? 0) / avgSalesMap[p.id]))
    const avgDOS = dosValues.length > 0
      ? Math.round(dosValues.reduce((s, d) => s + d, 0) / dosValues.length)
      : null

    // ── Per-warehouse alerts ──────────────────────────────────────────────────
    const alerts: AlertItem[] = []
    for (const p of prods) {
      const totalStock   = stockByProduct[p.id] ?? 0
      const avg          = avgSalesMap[p.id] ?? 0
      const rop          = calcROP(avg)
      const safety_stock = calcSafetyStock(avg)
      const eoq          = calcEOQ(avg, p.purchase_price)
      const belowMin     = totalStock < (p.min_stock ?? 0)
      const belowROP     = rop > 0 && totalStock <= rop

      if (belowMin || belowROP) {
        const isCritical = totalStock === 0 || (safety_stock > 0 && totalStock <= safety_stock)
        const productInv = filteredInvs.filter(inv => inv.product_id === p.id && inv.quantity > 0)

        if (productInv.length > 0) {
          for (const inv of productInv) {
            const wh = whMap[inv.warehouse_id]
            if (!wh) continue
            alerts.push({
              sku: p.sku, name: p.name, unit: p.unit, stock: inv.quantity,
              min_stock: p.min_stock, warehouse: wh.name, warehouse_id: wh.id,
              level: isCritical ? 'critical' : 'warning',
              rop, safety_stock, eoq, avg_daily_sales: avg,
            })
          }
        } else {
          alerts.push({
            sku: p.sku, name: p.name, unit: p.unit, stock: 0,
            min_stock: p.min_stock, warehouse: 'Chưa nhập kho', warehouse_id: '',
            level: 'critical',
            rop, safety_stock, eoq, avg_daily_sales: avg,
          })
        }
      }
    }
    alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1))
    setAlertItems(alerts)

    const criticalCount = alerts.filter(a => a.level === 'critical').length
    const warningCount  = alerts.filter(a => a.level === 'warning').length
    const outOfStock    = alerts.filter(a => a.stock === 0).length
    const belowROPCount = alerts.filter(a => a.rop > 0 && a.stock > 0 && a.stock <= a.rop).length

    // ── Top products ──────────────────────────────────────────────────────────
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

    // ── Warehouse stats ────────────────────────────────────────────────────────
    const whStats: Record<string, WarehouseStat> = {}
    for (const w of whs) {
      whStats[w.id] = { id: w.id, name: w.name, skuCount: 0, totalQty: 0, totalValue: 0 }
    }
    for (const inv of filteredInvs) {
      if (!whStats[inv.warehouse_id] || inv.quantity <= 0) continue
      const p = prodMap[inv.product_id]
      if (!p) continue
      whStats[inv.warehouse_id].skuCount++
      whStats[inv.warehouse_id].totalQty   += inv.quantity
      whStats[inv.warehouse_id].totalValue += inv.quantity * p.purchase_price
    }
    const statsArr = Object.values(whStats)
    setWarehouseStats(statsArr)

    setKpis(k => ({ ...k, totalSKUs, totalValue, criticalCount, warningCount, outOfStock, avgDOS, belowROPCount }))

    // ── Per-warehouse suggested orders ────────────────────────────────────────
    const allSuggested: SuggestedOrder[] = []
    for (const wh of whs) {
      const whStock = stockByWarehouse[wh.id] ?? {}
      for (const p of prods) {
        const stock = whStock[p.id] ?? 0
        const avg   = avgSalesMap[p.id] ?? 0
        const rop   = calcROP(avg)
        const eoq   = calcEOQ(avg, p.purchase_price)
        const dos   = avg > 0 ? Math.floor(stock / avg) : null
        const deficit   = Math.max(0, (p.min_stock ?? 0) - stock)
        const orderQty  = eoq > 0 ? Math.ceil(eoq) : deficit
        const needsOrder = stock === 0 || (rop > 0 && stock <= rop) || (dos !== null && dos <= 30) || stock < (p.min_stock ?? 0)
        if (needsOrder && orderQty > 0) {
          allSuggested.push({
            sku: p.sku, name: p.name, unit: p.unit,
            stock, rop, eoq: orderQty, dos,
            product_id: p.id, purchase_price: p.purchase_price,
            warehouse_id: wh.id, warehouse_name: wh.name,
          })
        }
      }
    }
    allSuggested.sort((a, b) => (a.stock === 0 ? -1 : b.stock === 0 ? 1 : (a.dos ?? 9999) - (b.dos ?? 9999)))
    setSuggestedOrders(allSuggested.slice(0, 60))

    const isMulti = whs.length > 1
    setMultiWarehouse(isMulti)

    // ── AI calls — per warehouse if multiple ──────────────────────────────────
    if (isMulti) {
      for (const wh of whs) {
        const whAlerts = alerts.filter(a => a.warehouse_id === wh.id)
        fetchAiSuggestion(whAlerts, wh.id, wh.name)
      }
    } else if (whs.length === 1) {
      fetchAiSuggestion(alerts, whs[0].id, whs[0].name)
    }

    // ── Receipt / issue counts ─────────────────────────────────────────────────
    const [{ count: receiptCount }, { count: issueCount }] = await Promise.all([
      supabase.from('stock_receipts').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('receipt_date', monthStart),
      supabase.from('stock_issues').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('issue_date', monthStart),
    ])
    setKpis(k => ({ ...k, receiptCount: receiptCount ?? 0, issueCount: issueCount ?? 0 }))

    // ── Recent movements ──────────────────────────────────────────────────────
    const [{ data: receipts }, { data: issues }] = await Promise.all([
      supabase.from('stock_receipts').select('code, receipt_date, status, total_amount, warehouse:warehouses(name)').eq('tenant_id', tenantId).order('receipt_date', { ascending: false }).limit(5),
      supabase.from('stock_issues').select('code, issue_date, status, warehouse:warehouses(name)').eq('tenant_id', tenantId).order('issue_date', { ascending: false }).limit(5),
    ])

    const movList: Movement[] = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(receipts ?? []).map((r: any) => ({ code: r.code, type: 'in' as const, warehouse: r.warehouse?.name ?? '—', date: r.receipt_date, status: r.status, total_amount: r.total_amount })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(issues ?? []).map((i: any) => ({ code: i.code, type: 'out' as const, warehouse: i.warehouse?.name ?? '—', date: i.issue_date, status: i.status })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
    setMovements(movList)

    setLoading(false)
  }

  function handleOpenReview(warehouseId?: string) {
    const source = warehouseId
      ? suggestedOrders.filter(s => s.warehouse_id === warehouseId)
      : suggestedOrders
    if (!source.length) return
    setReviewItems(source.map(s => ({
      sku: s.sku, name: s.name, unit: s.unit,
      quantity: Math.max(Math.round(s.eoq), 1),
      unit_price: s.purchase_price ?? 0,
      warehouse_name: s.warehouse_name,
    })))
    setShowReview(true)
  }

  async function handleCreatePO(items: { sku: string; quantity: number }[]) {
    if (creatingPO || !items.length) return
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
      const whId = reviewItems[0]?.warehouse_name ?? 'all'
      setAiContents(prev => ({ ...prev, [whId]: `❌ ${e instanceof Error ? e.message : 'Lỗi tạo đơn. Thử lại sau.'}` }))
    }
  }

  async function fetchAiSuggestion(alerts: AlertItem[], warehouseId: string, warehouseName: string) {
    if (alerts.length === 0) {
      setAiContents(prev => ({ ...prev, [warehouseId]: `✓ Tồn kho ${warehouseName} đang ổn định, không có cảnh báo.` }))
      return
    }
    setAiContents(prev => ({ ...prev, [warehouseId]: '🤖 Đang phân tích dữ liệu tồn kho...' }))
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
      setAiContents(prev => ({ ...prev, [warehouseId]: lines || 'Phân tích hoàn tất.' }))
    } catch {
      setAiContents(prev => ({ ...prev, [warehouseId]: `Phát hiện <strong>${alerts.length} sản phẩm</strong> cần nhập hàng tại ${warehouseName}. Kiểm tra danh sách cảnh báo bên dưới.` }))
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
  <><div>
    <PageHeader title="Tổng quan kho" subtitle={multiWarehouse ? `Quản lý ${warehouseStats.length} kho hàng` : 'Quản lý tồn kho toàn hệ thống'} />

    {/* KPI */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      <KpiCard icon={<Package size={18} className="text-blue-600" />} label="Tổng SKU" iconBg="bg-blue-100"
        value={loading ? '...' : (kpis.totalSKUs > 0 ? kpis.totalSKUs : totalProductCount).toLocaleString('vi-VN')}
        sub={kpis.totalSKUs > 0 ? 'Đang có hàng' : 'Tổng sản phẩm'} />
      <KpiCard icon={<Warehouse size={18} className="text-teal-600" />} label="Giá trị kho" iconBg="bg-teal-100"
        value={loading ? '...' : formatVND(kpis.totalValue)} sub={`Tháng ${MONTH_LABEL}`} />
      <KpiCard icon={<Calendar size={18} className="text-sky-600" />} label="TB DOS (ngày tồn)" iconBg="bg-sky-100"
        value={loading ? '...' : kpis.avgDOS !== null ? `${kpis.avgDOS} ngày` : '—'} sub="Tốc độ tiêu thụ TB"
        subColor={kpis.avgDOS !== null && kpis.avgDOS <= 14 ? 'orange' : 'green'} />
      <KpiCard icon={<TrendingDown size={18} className="text-red-500" />} label="Dưới ROP" iconBg="bg-red-100" subColor="red"
        value={loading ? '...' : kpis.belowROPCount} sub="Cần đặt hàng ngay" />
      <KpiCard icon={<ArrowDownToLine size={18} className="text-green-600" />} label={`Nhập kho ${MONTH_LABEL}`} iconBg="bg-green-100"
        value={loading ? '...' : kpis.receiptCount.toLocaleString('vi-VN')} sub="Phiếu nhập" />
      <KpiCard icon={<ArrowUpFromLine size={18} className="text-orange-600" />} label={`Xuất kho ${MONTH_LABEL}`} iconBg="bg-orange-100"
        value={loading ? '...' : kpis.issueCount.toLocaleString('vi-VN')} sub="Phiếu xuất" />
      <KpiCard icon={<AlertTriangle size={18} className="text-yellow-600" />} label="Cần chú ý" iconBg="bg-yellow-100" subColor="orange"
        value={loading ? '...' : kpis.warningCount} sub="Sắp hết / dưới ROP" />
      <KpiCard icon={<TrendingDown size={18} className="text-red-500" />} label="Nguy hiểm" iconBg="bg-red-100" subColor="red"
        value={loading ? '...' : kpis.criticalCount} sub={`${kpis.outOfStock} hết hàng`} />
    </div>

    {/* ABC */}
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

    {/* ── MULTI-WAREHOUSE: per-warehouse AI + suggested orders ── */}
    {multiWarehouse ? (
      <div className="space-y-4 mb-5">
        {warehouseStats.map(wh => {
          const whSuggested = suggestedOrders.filter(s => s.warehouse_id === wh.id)
          const whAlerts    = alertItems.filter(a => a.warehouse_id === wh.id)
          const aiText      = aiContents[wh.id] ?? '🤖 Đang phân tích...'
          return (
            <div key={wh.id} className="border border-[#e5e7eb] rounded-xl overflow-hidden bg-white">
              {/* Warehouse header */}
              <div className="px-4 py-3 bg-gray-50 border-b border-[#e5e7eb] flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Warehouse size={15} className="text-[var(--mia-primary)]" />
                  <h2 className="text-sm font-bold text-[#1e2a3a]">{wh.name}</h2>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs text-gray-500">{wh.skuCount} SKU</span>
                  <span className="text-xs text-gray-400">·</span>
                  <span className="text-xs font-semibold text-[var(--mia-primary)]">{formatVND(wh.totalValue)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {whSuggested.length > 0 && (
                    <button onClick={() => exportXlsx(whSuggested.map(p => ({ 'SKU': p.sku, 'Tên SP': p.name, 'ĐVT': p.unit, 'Tồn kho': p.stock, 'ROP': p.rop, 'DOS còn lại': p.dos ?? '—', 'Đề xuất đặt (EOQ)': p.eoq, 'Đơn giá': p.purchase_price })), `de-xuat-${wh.name}.xlsx`)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 bg-white">
                      <Download size={11} /> Excel
                    </button>
                  )}
                  {whAlerts.length > 0 && (
                    <span className="text-[10px] bg-red-100 text-red-600 font-semibold px-2 py-0.5 rounded-full">
                      {whAlerts.filter(a => a.level === 'critical').length > 0
                        ? `${whAlerts.filter(a => a.level === 'critical').length} nguy hiểm`
                        : `${whAlerts.length} cảnh báo`}
                    </span>
                  )}
                  {whSuggested.length > 0 && (
                    <span className="text-[10px] bg-sky-100 text-sky-600 font-semibold px-2 py-0.5 rounded-full">
                      {whSuggested.length} cần đặt
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4">
                <AiSuggestionBox
                  title={`AI phân tích — ${wh.name}`}
                  content={aiText}
                  actionLabel={`Xem & tạo đơn (${whSuggested.length} SP)`}
                  actionDisabled={creatingPO || whSuggested.length === 0}
                  onAction={() => handleOpenReview(wh.id)}
                />
              </div>

              {whSuggested.length > 0 && (
                <div className="border-t border-[#e5e7eb]">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 border-b border-[#e5e7eb]">
                          {['SKU', 'Sản phẩm', 'Tồn kho', 'ROP', 'DOS còn lại', 'Đề xuất đặt', 'Ưu tiên'].map(h => (
                            <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {whSuggested.slice(0, 10).map(p => {
                          const urgent = p.stock === 0 || (p.dos !== null && p.dos <= 7)
                          const warn   = !urgent && (p.dos !== null && p.dos <= 14)
                          return (
                            <tr key={p.sku + wh.id} className="border-b border-[#e5e7eb] last:border-0 hover:bg-gray-50">
                              <td className="px-4 py-2.5 text-xs font-mono text-[var(--mia-primary)]">{p.sku}</td>
                              <td className="px-4 py-2.5 text-xs font-medium text-[#1e2a3a] max-w-[180px] truncate">{p.name}</td>
                              <td className="px-4 py-2.5 text-xs font-semibold text-red-600">
                                {p.stock === 0 ? 'Hết hàng' : `${p.stock.toLocaleString('vi-VN')} ${p.unit}`}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-orange-500">{p.rop.toLocaleString('vi-VN')} {p.unit}</td>
                              <td className="px-4 py-2.5 text-xs">
                                {p.dos !== null
                                  ? <span className={urgent ? 'text-red-600 font-bold' : warn ? 'text-orange-500 font-semibold' : 'text-gray-600'}>{p.dos} ngày</span>
                                  : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-sky-200">
                                  {p.eoq.toLocaleString('vi-VN')} {p.unit}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${urgent ? 'bg-red-100 text-red-600' : warn ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-700'}`}>
                                  {urgent ? 'Khẩn cấp' : warn ? 'Sớm' : 'Kế hoạch'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {whSuggested.length > 10 && (
                      <p className="text-[10px] text-gray-400 text-center py-2">+{whSuggested.length - 10} sản phẩm khác trong đơn</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    ) : (
      /* ── SINGLE WAREHOUSE: original layout ── */
      <>
        {warehouseStats[0] && (
          <div className="mb-5">
            <AiSuggestionBox
              title={`AI Phân tích tồn kho — ${warehouseStats[0].name} (ROP · EOQ · ABC)`}
              content={aiContents[warehouseStats[0].id] ?? '🤖 Đang phân tích dữ liệu tồn kho...'}
              actionLabel="Xem & chỉnh sửa đơn"
              actionDisabled={creatingPO || suggestedOrders.length === 0}
              onAction={() => handleOpenReview()}
            />
          </div>
        )}

        {suggestedOrders.length > 0 && (
          <div className="bg-white rounded-xl border border-[#e5e7eb] mb-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
              <div className="flex items-center gap-2">
                <span className="text-base">📋</span>
                <h2 className="text-sm font-semibold text-[#1e2a3a]">Đề xuất đặt hàng ngay</h2>
                <span className="text-[10px] bg-sky-100 text-sky-600 font-semibold px-2 py-0.5 rounded-full">{suggestedOrders.length} sản phẩm</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => exportXlsx(suggestedOrders.map(p => ({ 'SKU': p.sku, 'Tên SP': p.name, 'ĐVT': p.unit, 'Kho': p.warehouse_name, 'Tồn kho': p.stock, 'ROP': p.rop, 'DOS còn lại': p.dos ?? '—', 'Đề xuất đặt (EOQ)': p.eoq, 'Đơn giá': p.purchase_price })), 'de-xuat-dat-hang.xlsx')}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border border-[#e5e7eb] rounded-lg hover:bg-gray-50">
                  <Download size={11} /> Excel
                </button>
                <a href="/mua-hang/don-mua-hang" className="text-xs text-[var(--mia-primary)] hover:underline">Tạo đơn mua hàng →</a>
              </div>
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
                        <td className="px-4 py-3 text-xs text-orange-500 font-medium">{p.rop.toLocaleString('vi-VN')} {p.unit}</td>
                        <td className="px-4 py-3 text-xs">
                          {p.dos !== null
                            ? <span className={urgent ? 'text-red-600 font-bold' : warn ? 'text-orange-500 font-semibold' : 'text-gray-600'}>{p.dos} ngày</span>
                            : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 bg-sky-50 text-sky-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-sky-200">
                            {p.eoq.toLocaleString('vi-VN')} {p.unit}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${urgent ? 'bg-red-100 text-red-600' : warn ? 'bg-orange-100 text-orange-600' : 'bg-yellow-100 text-yellow-700'}`}>
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
      </>
    )}

    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {/* Left panel */}
      <div className="xl:col-span-2 space-y-4">

        {/* Warehouse stats */}
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#1e2a3a]">Tồn kho theo kho</h2>
            {warehouseStats.length > 0 && (
              <button onClick={() => exportXlsx(warehouseStats.map(w => ({ 'Kho': w.name, 'Số SKU': w.skuCount, 'Tổng số lượng': w.totalQty, 'Giá trị (VND)': w.totalValue })), 'ton-kho-theo-kho.xlsx')}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border border-[#e5e7eb] rounded-lg hover:bg-gray-50">
                <Download size={11} /> Excel
              </button>
            )}
          </div>
          {loading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
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
            <div className="flex items-center gap-2">
              {movements.length > 0 && (
                <button onClick={() => exportXlsx(movements.map(m => ({ 'Phiếu': m.code, 'Loại': m.type === 'in' ? 'Nhập' : 'Xuất', 'Kho': m.warehouse, 'Giá trị (VND)': m.total_amount ?? 0, 'Ngày': m.date, 'Trạng thái': m.status })), 'giao-dich-kho.xlsx')}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border border-[#e5e7eb] rounded-lg hover:bg-gray-50">
                  <Download size={11} /> Excel
                </button>
              )}
              <a href="/kho-hang/nhap-kho" className="text-xs text-[var(--mia-primary)] hover:underline">Xem tất cả →</a>
            </div>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">{[1, 2, 3, 4].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
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
                      <td className="px-4 py-3 text-xs text-gray-700">{m.total_amount ? formatVND(m.total_amount) : '—'}</td>
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
            <div className="flex items-center gap-2">
              {alertItems.length > 0 && (
                <button onClick={() => exportXlsx(alertItems.map(p => ({ 'SKU': p.sku, 'Tên SP': p.name, 'Kho': p.warehouse, 'Tồn kho': p.stock, 'ĐVT': p.unit, 'Min Stock': p.min_stock, 'ROP': p.rop, 'EOQ': p.eoq, 'Mức cảnh báo': p.level === 'critical' ? 'Nguy hiểm' : 'Cảnh báo' })), 'canh-bao-ton-kho.xlsx')}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border border-[#e5e7eb] rounded-lg hover:bg-gray-50">
                  <Download size={11} /> Excel
                </button>
              )}
              <span className="text-[10px] font-semibold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                {alertItems.length} sản phẩm
              </span>
            </div>
          </div>
          {loading ? (
            <div className="p-4 space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />)}</div>
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
                    <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${p.level === 'critical' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>
                      {p.level === 'critical' ? 'Nguy hiểm' : 'Cảnh báo'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className={`text-xs font-bold ${p.stock === 0 ? 'text-red-500' : 'text-red-600'}`}>
                      {p.stock === 0 ? 'Hết hàng' : `${p.stock.toLocaleString('vi-VN')} ${p.unit}`}
                    </span>
                    <div className="text-right">
                      {p.rop > 0 && (
                        <div className="text-[10px] text-gray-400">ROP <span className="font-semibold text-orange-500">{p.rop.toLocaleString('vi-VN')}</span></div>
                      )}
                      {p.eoq > 0 && (
                        <div className="text-[10px] text-sky-500 font-medium">EOQ {p.eoq.toLocaleString('vi-VN')} {p.unit}</div>
                      )}
                    </div>
                  </div>
                  {p.stock > 0 && p.rop > 0 && (
                    <div className="mt-1.5 bg-gray-100 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${p.level === 'critical' ? 'bg-red-400' : 'bg-yellow-400'}`}
                        style={{ width: `${Math.min((p.stock / p.rop) * 100, 100)}%` }} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top products */}
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#1e2a3a]">Top sản phẩm tồn kho</h2>
            {topProducts.length > 0 && (
              <button onClick={() => exportXlsx(topProducts.map((p, i) => ({ 'STT': i + 1, 'Tên SP': p.name, 'Số lượng': p.qty, 'Giá trị (VND)': p.value })), 'top-san-pham-ton-kho.xlsx')}
                className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border border-[#e5e7eb] rounded-lg hover:bg-gray-50">
                <Download size={11} /> Excel
              </button>
            )}
          </div>
          {loading ? (
            <div className="space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : topProducts.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">Chưa có dữ liệu</p>
          ) : (
            <div className="space-y-2">
              {topProducts.map((p, i) => (
                <div key={p.sku} className="flex items-center justify-between py-2 border-b border-[#e5e7eb] last:border-0">
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 bg-gray-100 rounded flex items-center justify-center text-[10px] font-bold text-gray-500">{i + 1}</span>
                    <div>
                      <p className="text-xs font-medium text-[#1e2a3a]">{p.name}</p>
                      <p className="text-[10px] text-gray-400">{p.qty > 0 ? `${p.qty.toLocaleString('vi-VN')} đơn vị` : 'Chưa nhập kho'}</p>
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

        {/* Near-expiry */}
        <div className="bg-white rounded-xl border border-[#e5e7eb]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-orange-500" />
              <h2 className="text-sm font-semibold text-[#1e2a3a]">Hạn sử dụng lô hàng</h2>
            </div>
            <div className="flex items-center gap-2">
              {expiryProducts.length > 0 && (
                <button onClick={() => exportXlsx(expiryProducts.map(p => ({ 'SKU': p.sku, 'Tên SP': p.name, 'ĐVT': p.unit, 'HSD tổng (ngày)': p.expiryDays, 'Còn lại (ngày)': p.remainingDays, 'Còn lại (%)': p.remainingPct })), 'han-su-dung-lo-hang.xlsx')}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 border border-[#e5e7eb] rounded-lg hover:bg-gray-50">
                  <Download size={11} /> Excel
                </button>
              )}
              {expiryProducts.length > 0 && (
                <span className="text-[10px] font-semibold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                  {expiryProducts.filter(p => p.remainingPct <= 25).length} sắp hết
                </span>
              )}
            </div>
          </div>
          {expiryProducts.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-xs text-gray-400">Chưa có dữ liệu hạn sử dụng</p>
              <p className="text-[10px] text-gray-300 mt-1">Thêm ngày sản xuất trong mục Sản phẩm</p>
            </div>
          ) : (
            <div className="divide-y divide-[#e5e7eb] max-h-[340px] overflow-y-auto">
              {expiryProducts.slice(0, 10).map(p => {
                const barColor = p.remainingPct <= 10 ? 'bg-red-500' : p.remainingPct <= 25 ? 'bg-orange-400' : p.remainingPct <= 50 ? 'bg-yellow-400' : 'bg-green-400'
                const textColor = p.remainingPct <= 10 ? 'text-red-600' : p.remainingPct <= 25 ? 'text-orange-600' : p.remainingPct <= 50 ? 'text-yellow-600' : 'text-green-600'
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
                      <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${p.remainingPct}%` }} />
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

  {/* Review & edit modal */}
  {showReview && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Xem lại đơn đặt hàng gợi ý</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {reviewItems[0]?.warehouse_name ? `Kho: ${reviewItems[0].warehouse_name} · ` : ''}
              Chỉnh sửa số lượng trước khi tạo đơn bản nháp
            </p>
          </div>
          <button onClick={() => setShowReview(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-2 px-2 mb-1">
              <span className="col-span-1 text-xs text-gray-400">SKU</span>
              <span className="col-span-4 text-xs text-gray-400">Tên sản phẩm</span>
              <span className="col-span-2 text-xs text-gray-400 text-center">ĐVT</span>
              <span className="col-span-2 text-xs text-gray-400 text-center">Số lượng</span>
              <span className="col-span-2 text-xs text-gray-400 text-right">Đơn giá</span>
              <span className="col-span-1"></span>
            </div>
            {reviewItems.map((it, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-lg px-2 py-2">
                <span className="col-span-1 text-[10px] text-gray-400 truncate">{it.sku}</span>
                <span className="col-span-4 text-xs font-medium text-[#1e2a3a] truncate">{it.name}</span>
                <span className="col-span-2 text-xs text-gray-500 text-center">{it.unit}</span>
                <input
                  type="number" min={1} value={it.quantity}
                  onChange={e => setReviewItems(prev => prev.map((r, idx) => idx === i ? { ...r, quantity: Math.max(1, +e.target.value) } : r))}
                  className="col-span-2 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg bg-white text-center outline-none focus:border-[var(--mia-primary)]"
                />
                <span className="col-span-2 text-xs text-gray-400 text-right">
                  {it.unit_price > 0 ? formatVND(it.unit_price) : '—'}
                </span>
                <button onClick={() => setReviewItems(prev => prev.filter((_, idx) => idx !== i))}
                  className="col-span-1 flex justify-center text-gray-300 hover:text-red-400 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {reviewItems.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Không còn sản phẩm nào</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-[#e5e7eb] bg-gray-50 rounded-b-2xl">
          <div>
            <span className="text-xs text-gray-400">Tổng cộng</span>
            <p className="text-base font-bold text-[var(--mia-primary)]">
              {formatVND(reviewItems.reduce((s, it) => s + it.quantity * it.unit_price, 0))}
            </p>
            <p className="text-xs text-gray-400">{reviewItems.length} sản phẩm</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowReview(false)}
              className="px-4 py-2 text-sm border border-[#e5e7eb] text-gray-600 rounded-lg hover:bg-gray-100 transition-colors font-medium">
              Huỷ
            </button>
            <button
              disabled={creatingPO || reviewItems.length === 0}
              onClick={async () => {
                setShowReview(false)
                await handleCreatePO(reviewItems.map(it => ({ sku: it.sku, quantity: it.quantity })))
              }}
              className="px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-95">
              {creatingPO ? 'Đang tạo...' : 'Tạo đơn bản nháp'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )}
  </>
  )
}
