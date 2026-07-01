import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET(req: NextRequest) {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json([])

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  // ─── Top products by revenue ──────────────────────────────────────────────
  if (type === 'top_products') {
    const { data: orders } = await supabaseAdmin.from('sales_orders').select('id').eq('tenant_id', tenantId).eq('status', 'completed')
    const orderIds = (orders ?? []).map(o => o.id)
    if (!orderIds.length) return NextResponse.json([])

    const { data: items } = await supabaseAdmin
      .from('sales_order_items')
      .select('subtotal, product:products ( id, name )')
      .in('order_id', orderIds)

    const byProduct: Record<string, { name: string; revenue: number }> = {}
    for (const item of (items ?? [])) {
      const p = item.product as any
      if (!p?.id) continue
      if (!byProduct[p.id]) byProduct[p.id] = { name: p.name, revenue: 0 }
      byProduct[p.id].revenue += item.subtotal ?? 0
    }

    return NextResponse.json(
      Object.entries(byProduct)
        .map(([id, v]) => ({ product_id: id, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
    )
  }

  // ─── KPI per sales user ───────────────────────────────────────────────────
  if (type === 'kpi_users') {
    const [{ data: ordersData }, { data: usersData }] = await Promise.all([
      supabaseAdmin.from('sales_orders')
        .select('assigned_to, final_amount, status')
        .eq('tenant_id', tenantId)
        .not('assigned_to', 'is', null),
      supabaseAdmin.from('users').select('id, full_name, employee_code').eq('tenant_id', tenantId),
    ])

    const userMap = Object.fromEntries(
      (usersData ?? []).map(u => [u.id, { name: u.full_name ?? u.id, code: u.employee_code ?? '' }])
    )

    const byUser: Record<string, { name: string; code: string; revenue: number; orders: number }> = {}
    for (const o of (ordersData ?? [])) {
      if (!o.assigned_to || o.status === 'cancelled') continue
      const uid = o.assigned_to
      if (!byUser[uid]) byUser[uid] = { name: userMap[uid]?.name ?? uid, code: userMap[uid]?.code ?? '', revenue: 0, orders: 0 }
      byUser[uid].revenue += o.final_amount ?? 0
      byUser[uid].orders += 1
    }

    return NextResponse.json(
      Object.entries(byUser)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
    )
  }

  // ─── Drill-down: categories ───────────────────────────────────────────────
  if (type === 'drilldown_categories') {
    const { data: orders } = await supabaseAdmin.from('sales_orders').select('id').eq('tenant_id', tenantId).eq('status', 'completed')
    const orderIds = (orders ?? []).map(o => o.id)
    if (!orderIds.length) return NextResponse.json([])

    const { data: items } = await supabaseAdmin
      .from('sales_order_items')
      .select('subtotal, product:products ( id, name, category_id, category:categories ( id, name ) )')
      .in('order_id', orderIds)

    const byCat: Record<string, { name: string; catId: string; revenue: number }> = {}
    for (const item of (items ?? [])) {
      const p = item.product as any
      const catId = p?.category_id ?? 'uncategorized'
      const catName = p?.category?.name ?? 'Chưa phân loại'
      if (!byCat[catId]) byCat[catId] = { name: catName, catId, revenue: 0 }
      byCat[catId].revenue += item.subtotal ?? 0
    }

    const total = Object.values(byCat).reduce((s, c) => s + c.revenue, 0)
    const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#6b7280']

    return NextResponse.json(
      Object.values(byCat)
        .sort((a, b) => b.revenue - a.revenue)
        .map((v, i) => ({
          ...v,
          pct: total > 0 ? Math.round(v.revenue / total * 100) : 0,
          color: COLORS[i % COLORS.length],
        }))
    )
  }

  // ─── Drill-down: products in a category ──────────────────────────────────
  if (type === 'drilldown_products') {
    const categoryId = searchParams.get('category_id')
    const { data: orders } = await supabaseAdmin.from('sales_orders').select('id').eq('tenant_id', tenantId).eq('status', 'completed')
    const orderIds = (orders ?? []).map(o => o.id)
    if (!orderIds.length) return NextResponse.json([])

    const { data: items } = await supabaseAdmin
      .from('sales_order_items')
      .select('subtotal, quantity, product:products ( id, name, category_id )')
      .in('order_id', orderIds)

    const byProduct: Record<string, { name: string; revenue: number; qty: number }> = {}
    for (const item of (items ?? [])) {
      const p = item.product as any
      if (!p?.id) continue
      const itemCatId = p.category_id ?? 'uncategorized'
      if (categoryId && itemCatId !== categoryId) continue
      if (!byProduct[p.id]) byProduct[p.id] = { name: p.name, revenue: 0, qty: 0 }
      byProduct[p.id].revenue += item.subtotal ?? 0
      byProduct[p.id].qty += item.quantity ?? 0
    }

    return NextResponse.json(
      Object.entries(byProduct)
        .map(([id, v]) => ({ id, ...v, growth: 0 }))
        .sort((a, b) => b.revenue - a.revenue)
    )
  }

  // ─── Drill-down: customers for a product ─────────────────────────────────
  if (type === 'drilldown_customers') {
    const productId = searchParams.get('product_id')
    if (!productId) return NextResponse.json([])

    const { data: orders } = await supabaseAdmin
      .from('sales_orders').select('id, customer_id').eq('tenant_id', tenantId).eq('status', 'completed')
    const orderIds = (orders ?? []).map(o => o.id)
    const orderCustMap = Object.fromEntries((orders ?? []).map(o => [o.id, o.customer_id]))
    if (!orderIds.length) return NextResponse.json([])

    const [{ data: items }, { data: customers }] = await Promise.all([
      supabaseAdmin.from('sales_order_items')
        .select('subtotal, order_id')
        .in('order_id', orderIds)
        .eq('product_id', productId),
      supabaseAdmin.from('customers').select('id, name').eq('tenant_id', tenantId),
    ])

    const custMap = Object.fromEntries((customers ?? []).map(c => [c.id, c.name]))
    const byCust: Record<string, { name: string; revenue: number; orders: number }> = {}

    for (const item of (items ?? [])) {
      const custId = orderCustMap[item.order_id]
      if (!custId) continue
      if (!byCust[custId]) byCust[custId] = { name: custMap[custId] ?? custId, revenue: 0, orders: 0 }
      byCust[custId].revenue += item.subtotal ?? 0
      byCust[custId].orders += 1
    }

    return NextResponse.json(
      Object.entries(byCust)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
    )
  }

  // ─── Tồn kho hiện tại ────────────────────────────────────────────────────
  if (type === 'inventory_current') {
    const { data } = await supabaseAdmin
      .from('inventory')
      .select('quantity, product:products ( id, name, sku, unit )')
      .eq('tenant_id', tenantId)
      .gt('quantity', 0)
      .order('quantity', { ascending: false })
      .limit(50)

    // Gộp nhiều kho: cùng sản phẩm có thể xuất hiện nhiều dòng
    const byProduct: Record<string, { sku: string; name: string; unit: string; qty: number }> = {}
    for (const row of (data ?? []) as any[]) {
      const p = row.product
      const pid = p?.id ?? `${p?.sku}-${p?.name}`
      if (!byProduct[pid]) byProduct[pid] = { sku: p?.sku ?? '—', name: p?.name ?? 'Unknown', unit: p?.unit ?? '', qty: 0 }
      byProduct[pid].qty += row.quantity ?? 0
    }
    const items = Object.values(byProduct).sort((a, b) => b.qty - a.qty)

    return NextResponse.json(items)
  }

  // ─── Compare period: Sales metrics ────────────────────────────────────────
  if (type === 'compare_sales') {
    const ym = searchParams.get('year_month')
    if (!ym) return NextResponse.json(null)
    const [yr, mo] = ym.split('-').map(Number)
    const start = `${yr}-${String(mo).padStart(2, '0')}-01`
    const end   = mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, '0')}-01`

    const { data: orders } = await supabaseAdmin
      .from('sales_orders')
      .select('id, final_amount, status, customer_id')
      .eq('tenant_id', tenantId)
      .gte('ordered_at', start)
      .lt('ordered_at', end)

    const ords = orders ?? []
    const completed = ords.filter(o => o.status === 'completed')
    const cancelled = ords.filter(o => o.status === 'cancelled')
    const revenue = completed.reduce((s, o) => s + (o.final_amount ?? 0), 0)
    const customers = new Set(ords.filter(o => o.customer_id).map(o => o.customer_id)).size

    return NextResponse.json({
      orders: ords.length,
      revenue,
      customers,
      completed: completed.length,
      cancelled: cancelled.length,
      avg_order_value: completed.length > 0 ? Math.round(revenue / completed.length) : 0,
      completion_rate: ords.length > 0 ? Math.round(completed.length / ords.length * 100) : 0,
    })
  }

  // ─── Compare period: Logistics metrics ─────────────────────────────────────
  if (type === 'compare_logistics') {
    const ym = searchParams.get('year_month')
    if (!ym) return NextResponse.json(null)
    const [yr, mo] = ym.split('-').map(Number)
    const start = `${yr}-${String(mo).padStart(2, '0')}-01`
    const end   = mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, '0')}-01`

    const { data: deliveries } = await supabaseAdmin
      .from('deliveries')
      .select('id, status, route')
      .eq('tenant_id', tenantId)
      .gte('planned_date', start)
      .lt('planned_date', end)

    const dels = deliveries ?? []
    const delivered = dels.filter(d => d.status === 'delivered').length
    const failed    = dels.filter(d => d.status === 'failed').length
    const routes    = new Set(dels.map(d => d.route).filter(Boolean)).size

    return NextResponse.json({
      deliveries: dels.length,
      delivered,
      failed,
      routes,
      success_rate: dels.length > 0 ? Math.round(delivered / dels.length * 100) : 0,
    })
  }

  // ─── Compare period: Warehouse metrics ─────────────────────────────────────
  if (type === 'compare_warehouse') {
    const ym = searchParams.get('year_month')
    if (!ym) return NextResponse.json(null)
    const [yr, mo] = ym.split('-').map(Number)
    const start = `${yr}-${String(mo).padStart(2, '0')}-01`
    const end   = mo === 12 ? `${yr + 1}-01-01` : `${yr}-${String(mo + 1).padStart(2, '0')}-01`

    const [{ count: stockIn }, { count: stockOut }] = await Promise.all([
      supabaseAdmin.from('stock_receipts').select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).gte('receipt_date', start).lt('receipt_date', end),
      supabaseAdmin.from('stock_issues').select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId).gte('issue_date', start).lt('issue_date', end),
    ])

    return NextResponse.json({ stock_in: stockIn ?? 0, stock_out: stockOut ?? 0 })
  }

  // ─── Forecast per-product: sales history + inventory ────────────────────────
  if (type === 'forecast_products') {
    const twelveMonthsAgo = new Date()
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1)
    const since = `${twelveMonthsAgo.getFullYear()}-${String(twelveMonthsAgo.getMonth() + 1).padStart(2, '0')}-01`

    // Bước 1: lấy danh sách order_id đã hoàn thành trong 12 tháng (cùng pattern top_products)
    const [{ data: ordersData }, { data: invRows }] = await Promise.all([
      supabaseAdmin
        .from('sales_orders')
        .select('id, order_date')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .gte('order_date', since),
      supabaseAdmin
        .from('inventory')
        .select('product_id, quantity')
        .eq('tenant_id', tenantId),
    ])

    const orderIds = (ordersData ?? []).map((o: any) => o.id)
    if (!orderIds.length) return NextResponse.json([])

    const orderDateMap = Object.fromEntries((ordersData ?? []).map((o: any) => [o.id, o.order_date as string]))

    // Bước 2: lấy items của những order đó
    const { data: items } = await supabaseAdmin
      .from('sales_order_items')
      .select('product_id, quantity, order_id, product:products(id, sku, name, unit)')
      .in('order_id', orderIds)

    const stockMap: Record<string, number> = {}
    for (const row of (invRows ?? []) as any[]) {
      if (row.product_id) stockMap[row.product_id] = (stockMap[row.product_id] ?? 0) + (row.quantity ?? 0)
    }

    type ProdData = { sku: string; name: string; unit: string; months: Record<string, number> }
    const prodMap: Record<string, ProdData> = {}
    for (const item of (items ?? []) as any[]) {
      const pid = item.product_id
      if (!pid) continue
      const p = item.product
      if (!prodMap[pid]) prodMap[pid] = { sku: p?.sku ?? '—', name: p?.name ?? 'Unknown', unit: p?.unit ?? '', months: {} }
      const orderDate = orderDateMap[item.order_id]
      if (!orderDate) continue
      const mk = String(orderDate).slice(0, 7)   // YYYY-MM
      prodMap[pid].months[mk] = (prodMap[pid].months[mk] ?? 0) + (item.quantity ?? 0)
    }

    const result = Object.entries(prodMap).map(([pid, d]) => ({
      product_id: pid,
      sku: d.sku,
      name: d.name,
      unit: d.unit,
      current_stock: stockMap[pid] ?? 0,
      monthly_sales: Object.entries(d.months)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, qty]) => ({ key, qty })),
    }))

    return NextResponse.json(result)
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}
