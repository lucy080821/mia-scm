import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { status, items } = body

    // Always update counted_qty for items that were provided
    if (items && items.length > 0) {
      for (const it of items as { id?: string; product_id: string; counted_qty: number | null }[]) {
        if (it.id) {
          await supabaseAdmin
            .from('stocktake_items')
            .update({ counted_qty: it.counted_qty ?? null })
            .eq('id', it.id)
        }
      }
    }

    // On approve: reconcile inventory to counted values
    if (status === 'approved' && items && items.length > 0) {
      const { data: stocktake } = await supabaseAdmin
        .from('stocktakes')
        .select('warehouse_id')
        .eq('id', id)
        .single()

      if (stocktake) {
        for (const it of items as { product_id: string; counted_qty: number | null }[]) {
          if (it.counted_qty === null || it.counted_qty === undefined) continue

          // Sum all inventory rows for this product+warehouse (across all lots)
          const { data: invRows } = await supabaseAdmin
            .from('inventory')
            .select('id, quantity, lot_number')
            .eq('product_id', it.product_id)
            .eq('warehouse_id', stocktake.warehouse_id)

          const currentTotal = (invRows ?? []).reduce((s, r) => s + r.quantity, 0)
          const delta = it.counted_qty - currentTotal

          if (delta === 0) continue

          // Find the main (no-lot) row or the first row to adjust
          const mainRow = (invRows ?? []).find(r => r.lot_number === '') ?? (invRows ?? [])[0]
          if (mainRow) {
            await supabaseAdmin
              .from('inventory')
              .update({ quantity: Math.max(0, mainRow.quantity + delta), updated_at: new Date().toISOString() })
              .eq('id', mainRow.id)
          } else if (it.counted_qty > 0) {
            await supabaseAdmin
              .from('inventory')
              .insert({ product_id: it.product_id, warehouse_id: stocktake.warehouse_id, lot_number: '', quantity: it.counted_qty })
          }
        }
      }
    }

    if (status) {
      const { error } = await supabaseAdmin
        .from('stocktakes')
        .update({ status })
        .eq('id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
