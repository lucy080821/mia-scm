import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('sales_returns')
    .select(`
      id, code, return_date, reason, note, refund_method, status,
      customer:customers ( id, name ),
      sales_order:sales_orders ( id, code )
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  // If table doesn't exist yet, return empty array gracefully
  if (error && error.message?.includes('does not exist')) return NextResponse.json([])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { customer_id, sales_order_id, return_date, reason, note, refund_method, items, created_by } = body

    const tenantId = await getServerTenantId()
    const d = new Date(return_date)
    const prefix = `TH-${d.getFullYear().toString().slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
    const { count } = await supabaseAdmin.from('sales_returns').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
    const code = `${prefix}-${String((count ?? 0) + 1).padStart(3, '0')}`

    const { data: ret, error } = await supabaseAdmin
      .from('sales_returns')
      .insert({ code, customer_id, sales_order_id: sales_order_id || null, return_date, reason, note: note || null, refund_method, status: 'pending', created_by: created_by || null, tenant_id: tenantId })
      .select('id, code').single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    if (items?.length) {
      await supabaseAdmin.from('sales_return_items').insert(
        items.map((it: any) => ({ return_id: ret.id, product_id: it.product_id, qty: it.qty, unit_price: it.unit_price }))
      )
    }

    return NextResponse.json(ret, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status } = await req.json()
    const { error } = await supabaseAdmin.from('sales_returns').update({ status }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
