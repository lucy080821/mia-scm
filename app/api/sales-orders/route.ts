import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET() {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json([])

  const { data, error } = await supabaseAdmin
    .from('sales_orders')
    .select(`
      id, code, order_date, delivery_date, total_amount, final_amount,
      payment_status, status, note, created_at,
      customer:customers(id, name, code),
      assigned:users(id, full_name),
      items:sales_order_items(
        id, product_id, quantity, unit_price, subtotal,
        product:products(name, unit, sku)
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { customer_id, order_date, delivery_date, items, note, assigned_to } = body

    if (!customer_id || !order_date || !items?.length) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }
    const tenantId = await getServerTenantId()

    // Generate unique code: SO-YYMMDD-NNN
    const d = new Date(order_date)
    const prefix = `SO-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const { count } = await supabaseAdmin
      .from('sales_orders')
      .select('id', { count: 'exact', head: true })
      .like('code', `${prefix}-%`)
    const seq = String((count ?? 0) + 1).padStart(3, '0')
    const code = `${prefix}-${seq}`

    const total_amount = items.reduce((s: number, it: { quantity: number; unit_price: number }) => s + it.quantity * it.unit_price, 0)

    const { data: order, error: orderErr } = await supabaseAdmin
      .from('sales_orders')
      .insert({
        code,
        customer_id,
        order_date,
        delivery_date: delivery_date || null,
        total_amount,
        final_amount: total_amount,
        payment_status: 'unpaid',
        status: 'new',
        assigned_to: assigned_to || null,
        note: note || null,
        tenant_id: tenantId,
      })
      .select('id, code')
      .single()

    if (orderErr) {
      console.error('[POST /api/sales-orders] insert order:', orderErr)
      return NextResponse.json({ error: orderErr.message }, { status: 400 })
    }

    const orderItems = items.map((it: { product_id: string; quantity: number; unit_price: number }) => ({
      order_id: order.id,
      product_id: it.product_id,
      quantity: it.quantity,
      unit_price: it.unit_price,
      subtotal: it.quantity * it.unit_price,
    }))

    const { error: itemsErr } = await supabaseAdmin.from('sales_order_items').insert(orderItems)
    if (itemsErr) {
      console.error('[POST /api/sales-orders] insert items:', itemsErr)
      await supabaseAdmin.from('sales_orders').delete().eq('id', order.id)
      return NextResponse.json({ error: itemsErr.message }, { status: 400 })
    }

    return NextResponse.json({ id: order.id, code: order.code }, { status: 201 })
  } catch (e) {
    console.error('[POST /api/sales-orders] uncaught:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
