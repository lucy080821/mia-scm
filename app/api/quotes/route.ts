import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET() {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json([])

  const { data, error } = await supabaseAdmin
    .from('quotes')
    .select(`
      id, code, quote_date, expiry_date, total_amount, status, note, created_at,
      customer:customers ( id, name ),
      items:quote_items ( id, product_id, product_name, unit, qty, unit_price, discount_pct, subtotal )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error?.message?.includes('does not exist')) return NextResponse.json([])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { customer_id, quote_date, expiry_date, total_amount, status, note, items, created_by } = body

    const tenantId = await getServerTenantId()
    const d = new Date(quote_date)
    const prefix = `BG-${d.getFullYear().toString().slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
    const { count } = await supabaseAdmin.from('quotes').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
    const code = `${prefix}-${String((count ?? 0) + 1).padStart(3, '0')}`

    const { data: quote, error } = await supabaseAdmin
      .from('quotes')
      .insert({ code, customer_id, quote_date, expiry_date, total_amount: total_amount ?? 0, status: status ?? 'draft', note: note || null, created_by: created_by || null, tenant_id: tenantId })
      .select('id, code').single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    if (items?.length) {
      await supabaseAdmin.from('quote_items').insert(
        items.map((it: any) => ({
          quote_id: quote.id,
          product_id: it.product_id || null,
          product_name: it.name,
          unit: it.unit,
          qty: it.qty,
          unit_price: it.price,
          discount_pct: it.discount ?? 0,
          subtotal: Math.round(it.qty * it.price * (1 - (it.discount ?? 0) / 100)),
        }))
      )
    }

    return NextResponse.json(quote, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, note } = await req.json()
    const update: Record<string, any> = {}
    if (status !== undefined) update.status = status
    if (note !== undefined) update.note = note
    const { error } = await supabaseAdmin.from('quotes').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
