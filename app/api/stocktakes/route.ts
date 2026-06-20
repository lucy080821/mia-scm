import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET() {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json([])

  const { data, error } = await supabaseAdmin
    .from('stocktakes')
    .select(`
      id, code, stocktake_date, note, status, created_at,
      warehouse:warehouse_id ( id, name ),
      items:stocktake_items (
        id, product_id, system_qty, counted_qty, note,
        product:product_id ( sku, name, unit )
      )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { warehouse_id, stocktake_date, note, items } = body

    if (!warehouse_id || !stocktake_date) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }
    const tenantId = await getServerTenantId()

    const d = new Date(stocktake_date)
    const prefix = `KK-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const { count } = await supabaseAdmin.from('stocktakes').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
    const code = `${prefix}-${String((count ?? 0) + 1).padStart(3, '0')}`

    const { data: stocktake, error: stErr } = await supabaseAdmin
      .from('stocktakes')
      .insert({ code, warehouse_id, stocktake_date, note: note || null, status: 'open', tenant_id: tenantId })
      .select('id, code')
      .single()

    if (stErr) return NextResponse.json({ error: stErr.message }, { status: 400 })

    if (items && items.length > 0) {
      const rows = items.map((it: { product_id: string; system_qty?: number }) => ({
        stocktake_id: stocktake.id,
        product_id: it.product_id,
        system_qty: it.system_qty ?? 0,
      }))

      const { error: itemErr } = await supabaseAdmin.from('stocktake_items').insert(rows)
      if (itemErr) {
        await supabaseAdmin.from('stocktakes').delete().eq('id', stocktake.id)
        return NextResponse.json({ error: itemErr.message }, { status: 400 })
      }
    }

    return NextResponse.json(stocktake, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
