import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

const EMPTY_RESPONSE = {
  kpis: { revenue: 0, yearRevenue: 0, newOrders: 0, delivering: 0, customers: 0, lowStock: 0 },
  recentOrders: [], recentDeliveries: [], topCustomers: [], lowStockItems: [],
  pendingReceipts: [], pendingIssues: [], vehicles: [], myDeliveries: [],
  revenueMonthly: [], inventoryStatus: [], topProducts: [], deliveryWeekly: [],
}

export async function GET() {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json(EMPTY_RESPONSE)

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const yearStart  = `${now.getFullYear()}-01-01`
  const today      = now.toISOString().slice(0, 10)

  // Start of 6 months ago for revenue chart
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const sixStart = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`

  // Start of 7 days ago for weekly delivery chart
  const sevenDaysAgo = new Date(now)
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
  const sevenStart = sevenDaysAgo.toISOString().slice(0, 10)

  const [
    { data: ordersThisMonth },
    { data: allOrders, count: orderCount },
    { data: delivering },
    { data: customers, count: customerCount },
    { data: inventory },
    { data: inventoryAll },
    { data: recentOrders },
    { data: recentDeliveries },
    { data: pendingReceipts },
    { data: pendingIssues },
    { data: vehicles },
    { data: drivers },
    { data: revenueOrders },
    { data: salesItems },
    { data: weekDeliveries },
  ] = await Promise.all([
    // Revenue this month (completed orders)
    supabaseAdmin.from('sales_orders').select('final_amount').eq('tenant_id', tenantId).gte('order_date', monthStart).eq('status', 'completed'),
    // New orders this month
    supabaseAdmin.from('sales_orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).gte('order_date', monthStart),
    // Currently delivering
    supabaseAdmin.from('deliveries').select('id', { count: 'exact', head: false }).eq('tenant_id', tenantId).in('status', ['picking', 'delivering']),
    // Total active customers
    supabaseAdmin.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),
    // Low stock items (for lowStock KPI)
    supabaseAdmin.from('inventory').select('quantity, min_stock:products(min_stock, sku, name, unit)').eq('tenant_id', tenantId),
    // All inventory for donut chart
    supabaseAdmin.from('inventory').select('quantity, product:products(min_stock)').eq('tenant_id', tenantId).limit(2000),
    // Recent orders (last 6)
    supabaseAdmin.from('sales_orders')
      .select('id, code, order_date, status, final_amount, customer:customers(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }).limit(6),
    // Recent deliveries (last 6)
    supabaseAdmin.from('deliveries')
      .select('id, code, status, planned_date, route, driver:drivers(name), sales_order:sales_orders(code)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }).limit(6),
    // Pending stock receipts
    supabaseAdmin.from('stock_receipts')
      .select('id, code, receipt_date, status, supplier:suppliers(name)')
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'qc_check'])
      .order('created_at', { ascending: false }).limit(8),
    // Pending stock issues
    supabaseAdmin.from('stock_issues')
      .select('id, code, issue_date, status, warehouse:warehouses(name), sales_order:sales_orders(code)')
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }).limit(8),
    // Vehicles status
    supabaseAdmin.from('vehicles').select('id, plate, type, status, driver:drivers(name)').eq('tenant_id', tenantId).limit(10),
    // Drivers delivering today
    supabaseAdmin.from('deliveries')
      .select('id, code, status, route, driver:drivers(name, phone), sales_order:sales_orders(code, customer:customers(name, address))')
      .eq('tenant_id', tenantId)
      .eq('planned_date', today).order('created_at', { ascending: false }),
    // Revenue last 6 months for chart
    supabaseAdmin.from('sales_orders').select('order_date, final_amount').eq('tenant_id', tenantId).eq('status', 'completed').gte('order_date', sixStart),
    // Sales order items for top products bar chart (all orders)
    supabaseAdmin.from('sales_order_items')
      .select('subtotal, product:products(name, sku)')
      .eq('tenant_id', tenantId)
      .limit(2000),
    // Deliveries last 7 days (for weekly performance chart)
    supabaseAdmin.from('deliveries')
      .select('planned_date, status')
      .eq('tenant_id', tenantId)
      .gte('planned_date', sevenStart)
      .limit(500),
  ])

  // Monthly revenue chart (last 6 months)
  const revenueMonthly: { month: string; revenue: number }[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const mStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const nextM  = new Date(d.getFullYear(), d.getMonth() + 1, 1)
    const mEnd   = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, '0')}-01`
    const rev = (revenueOrders ?? [])
      .filter((o: any) => o.order_date >= mStart && o.order_date < mEnd)
      .reduce((s: number, o: any) => s + (o.final_amount ?? 0), 0)
    revenueMonthly.push({ month: `T${d.getMonth() + 1}`, revenue: rev })
  }

  // Inventory status for donut chart
  const allInv = inventoryAll ?? []
  const invOutOfStock  = allInv.filter((inv: any) => inv.quantity === 0).length
  const invLow = allInv.filter((inv: any) => {
    const min = (inv.product as any)?.min_stock ?? 0
    return inv.quantity > 0 && min > 0 && inv.quantity <= min
  }).length
  const invOk = allInv.filter((inv: any) => {
    const min = (inv.product as any)?.min_stock ?? 0
    return inv.quantity > 0 && inv.quantity > min
  }).length
  const inventoryStatus = [
    { name: 'Đủ tồn', value: invOk, color: '#10b981' },
    { name: 'Sắp hết', value: invLow, color: '#f59e0b' },
    { name: 'Hết hàng', value: invOutOfStock, color: '#ef4444' },
  ].filter(s => s.value > 0)

  // Top products by revenue (all orders)
  const productTotals: Record<string, number> = {}
  ;(salesItems ?? []).forEach((item: any) => {
    const name = (item.product as any)?.name ?? (item.product as any)?.sku ?? 'Khác'
    productTotals[name] = (productTotals[name] ?? 0) + (item.subtotal ?? 0)
  })
  const topProducts = Object.entries(productTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, value]) => ({
      label: name.length > 18 ? name.slice(0, 16) + '…' : name,
      value: Math.round(value), // VND nguyên, để formatter xử lý
    }))

  // Weekly delivery performance (last 7 days)
  const deliveryWeekly: { label: string; value: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    const dayLabel = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()]
    const count = (weekDeliveries ?? []).filter((del: any) =>
      del.planned_date && String(del.planned_date).slice(0, 10) === dateStr
    ).length
    deliveryWeekly.push({ label: dayLabel, value: count })
  }

  // Revenue year-to-date
  const { data: yearOrders } = await supabaseAdmin
    .from('sales_orders').select('final_amount').eq('tenant_id', tenantId).gte('order_date', yearStart).eq('status', 'completed')

  const revenue     = (ordersThisMonth ?? []).reduce((s: number, o: any) => s + (o.final_amount ?? 0), 0)
  const yearRevenue = (yearOrders ?? []).reduce((s: number, o: any) => s + (o.final_amount ?? 0), 0)

  // Low stock: where inventory qty <= product min_stock
  const lowStock = (inventory ?? []).filter((inv: any) => {
    const minStock = inv.min_stock?.min_stock ?? 0
    return inv.quantity <= minStock
  }).map((inv: any) => ({
    sku: inv.min_stock?.sku ?? '',
    name: inv.min_stock?.name ?? '',
    current: inv.quantity,
    min: inv.min_stock?.min_stock ?? 0,
    unit: inv.min_stock?.unit ?? '',
  })).slice(0, 8)

  // Top customers by completed order revenue
  const { data: topCustomerData } = await supabaseAdmin
    .from('sales_orders')
    .select('final_amount, customer:customers(name)')
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .gte('order_date', monthStart)

  const customerTotals: Record<string, number> = {}
  ;(topCustomerData ?? []).forEach((o: any) => {
    const name = o.customer?.name ?? 'Không xác định'
    customerTotals[name] = (customerTotals[name] ?? 0) + (o.final_amount ?? 0)
  })
  const totalRev = Object.values(customerTotals).reduce((s, v) => s + v, 0) || 1
  const topCustomers = Object.entries(customerTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount, pct: Math.round(amount / totalRev * 100) }))

  return NextResponse.json({
    kpis: {
      revenue,
      yearRevenue,
      newOrders: orderCount ?? 0,
      delivering: (delivering ?? []).length,
      customers: customerCount ?? 0,
      lowStock: lowStock.length,
    },
    recentOrders: (recentOrders ?? []).map((o: any) => ({
      code: o.code,
      customer: o.customer?.name ?? '—',
      total: o.final_amount ?? 0,
      status: o.status,
      date: o.order_date,
    })),
    recentDeliveries: (recentDeliveries ?? []).map((d: any) => ({
      code: d.code,
      order: d.sales_order?.code ?? '—',
      driver: d.driver?.name ?? '—',
      route: d.route ?? '—',
      status: d.status,
      eta: d.planned_date ? String(d.planned_date).slice(0, 10) : '—',
    })),
    topCustomers,
    lowStockItems: lowStock,
    pendingReceipts: (pendingReceipts ?? []).map((r: any) => ({
      code: r.code,
      supplier: r.supplier?.name ?? '—',
      items: 0,
      expected: r.receipt_date,
      status: r.status,
    })),
    pendingIssues: (pendingIssues ?? []).map((r: any) => ({
      code: r.code,
      order: r.sales_order?.code ?? '—',
      items: 0,
      warehouse: r.warehouse?.name ?? '—',
      status: r.status,
    })),
    vehicles: (vehicles ?? []).map((v: any) => ({
      plate: v.plate,
      type: v.type ?? '—',
      driver: v.driver?.name ?? '—',
      status: v.status,
      route: '—',
    })),
    myDeliveries: (drivers ?? []).map((d: any) => ({
      code: d.code,
      customer: d.sales_order?.customer?.name ?? '—',
      address: d.sales_order?.customer?.address ?? '—',
      items: 0,
      status: d.status,
      eta: d.planned_date ? String(d.planned_date).slice(0, 10) : '—',
      phone: d.driver?.phone ?? '',
    })),
    revenueMonthly,
    inventoryStatus,
    topProducts,
    deliveryWeekly,
  })
}
