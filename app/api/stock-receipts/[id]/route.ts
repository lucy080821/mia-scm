import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function adjustInventory(
  product_id: string,
  warehouse_id: string,
  tenant_id: string,
  lot_number: string | null,
  qty_delta: number,
  expiry_date?: string | null,
) {
  const hasLot = !!(lot_number && lot_number.trim())

  // Match cả lot_number IS NULL và lot_number = '' để cover data cũ lẫn mới
  let q = supabaseAdmin
    .from('inventory')
    .select('id, quantity')
    .eq('product_id', product_id)
    .eq('warehouse_id', warehouse_id)
    .eq('tenant_id', tenant_id)

  q = hasLot
    ? q.eq('lot_number', lot_number!)
    : (q as any).or('lot_number.is.null,lot_number.eq.')

  const { data: existing } = await (q as any).maybeSingle()

  if (existing) {
    const newQty = Math.max(0, existing.quantity + qty_delta)
    await supabaseAdmin
      .from('inventory')
      .update({ quantity: newQty, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else if (qty_delta > 0) {
    // Tạo mới khi nhập kho lần đầu
    await supabaseAdmin
      .from('inventory')
      .insert({
        product_id,
        warehouse_id,
        tenant_id,
        lot_number: lot_number || null,
        quantity: qty_delta,
        expiry_date: expiry_date || null,
      })
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
        .select('warehouse_id, tenant_id')
        .eq('id', id)
        .single()

      if (receipt) {
        for (const it of items) {
          if (it.id) {
            await supabaseAdmin
              .from('stock_receipt_items')
              .update({
                quantity: it.received_qty ?? it.quantity ?? 0,
                lot_number: it.lot_number || null,
                expiry_date: it.expiry_date || null,
              })
              .eq('id', it.id)
          }

          // Tăng tồn kho khi hoàn thành nhập
          if (status === 'completed') {
            const qty = it.received_qty ?? it.quantity ?? 0
            if (qty > 0) {
              await adjustInventory(
                it.product_id,
                receipt.warehouse_id,
                receipt.tenant_id,
                it.lot_number || null,
                qty,
                it.expiry_date,
              )
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
