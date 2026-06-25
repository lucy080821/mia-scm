import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function adjustInventory(
  product_id: string,
  warehouse_id: string,
  lot_number: string,
  qty_delta: number,
  expiry_date?: string | null,
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
      .insert({ product_id, warehouse_id, lot_number: lotKey, quantity: qty_delta, expiry_date: expiry_date || null })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { status, items } = body

    if ((status === 'completed' || status === 'qc_check' || status === 'approved') && items && items.length > 0) {
      const { data: receipt } = await supabaseAdmin
        .from('stock_receipts')
        .select('warehouse_id')
        .eq('id', id)
        .single()

      if (receipt) {
        for (const it of items) {
          if (it.id) {
            await supabaseAdmin
              .from('stock_receipt_items')
              .update({
                quantity: it.received_qty ?? it.quantity ?? 0,
                lot_number: it.lot_number || '',
                expiry_date: it.expiry_date || null,
              })
              .eq('id', it.id)
          }

          // Increase inventory only on completion
          if (status === 'completed') {
            const qty = it.received_qty ?? it.quantity ?? 0
            if (qty > 0) {
              await adjustInventory(it.product_id, receipt.warehouse_id, it.lot_number || '', qty, it.expiry_date)
            }
          }
        }
      }
    }

    const { error } = await supabaseAdmin
      .from('stock_receipts')
      .update({ status })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
