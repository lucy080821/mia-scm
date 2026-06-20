import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET() {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json([])

  const { data, error } = await supabaseAdmin
    .from('stock_transfers')
    .select(`
      id, code, transfer_date, reason, note, status, created_at,
      from_warehouse:from_warehouse_id ( id, name ),
      to_warehouse:to_warehouse_id ( id, name ),
      items:stock_transfer_items (
        id, product_id, quantity, lot_number,
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
    const { from_warehouse_id, to_warehouse_id, transfer_date, reason, note, items } = body

    if (!from_warehouse_id || !to_warehouse_id || !transfer_date) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }
    const tenantId = await getServerTenantId()

    const d = new Date(transfer_date)
    const prefix = `CK-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const { count } = await supabaseAdmin.from('stock_transfers').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
    const code = `${prefix}-${String((count ?? 0) + 1).padStart(3, '0')}`

    const { data: transfer, error: tErr } = await supabaseAdmin
      .from('stock_transfers')
      .insert({
        code,
        from_warehouse_id,
        to_warehouse_id,
        transfer_date,
        reason: reason || null,
        note: note || null,
        status: 'pending',
        tenant_id: tenantId,
      })
      .select('id, code')
      .single()

    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 400 })

    const filledItems = (items ?? []).filter((it: { product_id?: string }) => it.product_id)
    if (filledItems.length > 0) {
      const rows = filledItems.map((it: { product_id: string; quantity: number; lot_number?: string }) => ({
        transfer_id: transfer.id,
        product_id: it.product_id,
        quantity: it.quantity,
        lot_number: it.lot_number || '',
      }))

      const { error: itemErr } = await supabaseAdmin.from('stock_transfer_items').insert(rows)
      if (itemErr) {
        await supabaseAdmin.from('stock_transfers').delete().eq('id', transfer.id)
        return NextResponse.json({ error: itemErr.message }, { status: 400 })
      }
    }

    return NextResponse.json(transfer, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
