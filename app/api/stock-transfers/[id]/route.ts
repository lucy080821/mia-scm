import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function adjustInventory(
  product_id: string,
  warehouse_id: string,
  lot_number: string,
  qty_delta: number,
) {
  const lotKey = lot_number || ''
  const { data: existing } = await supabaseAdmin
    .from('inventory')
    .select('id, quantity')
    .eq('product_id', product_id)
    .eq('warehouse_id', warehouse_id)
    .eq('lot_number', lotKey)
    .maybeSingle()

  if (existing) {
    await supabaseAdmin
      .from('inventory')
      .update({ quantity: Math.max(0, existing.quantity + qty_delta), updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else if (qty_delta > 0) {
    await supabaseAdmin
      .from('inventory')
      .insert({ product_id, warehouse_id, lot_number: lotKey, quantity: qty_delta })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { status } = body

    if (status === 'completed') {
      const { data: transfer } = await supabaseAdmin
        .from('stock_transfers')
        .select(`
          from_warehouse_id, to_warehouse_id,
          items:stock_transfer_items ( product_id, quantity, lot_number )
        `)
        .eq('id', id)
        .single()

      if (transfer && transfer.items) {
        for (const it of transfer.items as { product_id: string; quantity: number; lot_number: string }[]) {
          await adjustInventory(it.product_id, transfer.from_warehouse_id, it.lot_number || '', -it.quantity)
          await adjustInventory(it.product_id, transfer.to_warehouse_id, it.lot_number || '', it.quantity)
        }
      }
    }

    const { error } = await supabaseAdmin
      .from('stock_transfers')
      .update({ status })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
