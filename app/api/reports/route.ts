import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')

  // ─── Top products by revenue ──────────────────────────────────────────────
  if (type === 'top_products') {
    const { data: orders } = await supabaseAdmin.from('sales_orders').select('id').eq('status', 'completed')
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
      Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 10)
    )
  }

  // ─── KPI per sales user ───────────────────────────────────────────────────
  if (type === 'kpi_users') {
    const [{ data: ordersData }, { data: usersData }] = await Promise.all([
      supabaseAdmin.from('sales_orders')
        .select('assigned_to, final_amount, status')
        .not('assigned_to', 'is', null),
      supabaseAdmin.from('users').select('id, full_name, employee_code'),
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
    const { data: orders } = await supabaseAdmin.from('sales_orders').select('id').eq('status', 'completed')
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
    const { data: orders } = await supabaseAdmin.from('sales_orders').select('id').eq('status', 'completed')
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
      .from('sales_orders').select('id, customer_id').eq('status', 'completed')
    const orderIds = (orders ?? []).map(o => o.id)
    const orderCustMap = Object.fromEntries((orders ?? []).map(o => [o.id, o.customer_id]))
    if (!orderIds.length) return NextResponse.json([])

    const [{ data: items }, { data: customers }] = await Promise.all([
      supabaseAdmin.from('sales_order_items')
        .select('subtotal, order_id')
        .in('order_id', orderIds)
        .eq('product_id', productId),
      supabaseAdmin.from('customers').select('id, name'),
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

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}
