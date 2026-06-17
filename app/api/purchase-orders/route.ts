import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('purchase_orders')
    .select(`
      id, code, order_date, expected_date, total_amount, status, note, created_at,
      supplier:suppliers(id, name, code),
      created_by:users(id, full_name),
      items:purchase_order_items(
        id, product_id, quantity, unit_price, subtotal,
        product:products(name, unit, sku)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { supplier_id, order_date, expected_date, items, note, created_by } = body

    if (!supplier_id || !order_date || !items?.length) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }
    const tenantId = await getServerTenantId()

    const d = new Date(order_date)
    const prefix = `PO-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const { count } = await supabaseAdmin.from('purchase_orders').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
    const code = `${prefix}-${String((count ?? 0) + 1).padStart(3, '0')}`

    const total_amount = items.reduce((s: number, it: { quantity: number; unit_price: number }) => s + it.quantity * it.unit_price, 0)

    const { data: po, error: poErr } = await supabaseAdmin
      .from('purchase_orders')
      .insert({
        code,
        supplier_id,
        order_date,
        expected_date: expected_date || null,
        total_amount,
        status: 'draft',
        created_by: created_by || null,
        note: note || null,
        tenant_id: tenantId,
      })
      .select('id, code')
      .single()

    if (poErr) {
      console.error('[POST /api/purchase-orders]', poErr)
      return NextResponse.json({ error: poErr.message }, { status: 400 })
    }

    const orderItems = items.map((it: { product_id: string; quantity: number; unit_price: number }) => ({
      order_id: po.id,
      product_id: it.product_id,
      quantity: it.quantity,
      unit_price: it.unit_price,
      subtotal: it.quantity * it.unit_price,
    }))

    const { error: itemsErr } = await supabaseAdmin.from('purchase_order_items').insert(orderItems)
    if (itemsErr) {
      await supabaseAdmin.from('purchase_orders').delete().eq('id', po.id)
      return NextResponse.json({ error: itemsErr.message }, { status: 400 })
    }

    return NextResponse.json({ id: po.id, code: po.code }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
