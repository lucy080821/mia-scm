import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function adjustInventory(
  product_id: string,
  warehouse_id: string,
  tenant_id: string,
  lot_number: string | null,
  qty_delta: number,
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
  }
  // Nếu không tìm thấy row: bỏ qua (xuất kho không tạo mới inventory)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { status, items } = body

    // resync: đảm bảo SO về trạng thái 'picked' để hiện trong Kế hoạch giao hàng → Chưa phân tuyến
    if (status === 'resync') {
      const { data: issue } = await supabaseAdmin
        .from('stock_issues')
        .select('sales_order_id')
        .eq('id', id)
        .single()

      if (issue?.sales_order_id) {
        await supabaseAdmin
          .from('sales_orders')
          .update({ status: 'picked' })
          .eq('id', issue.sales_order_id)
        return NextResponse.json({ ok: true })
      }
      return NextResponse.json({ ok: false, reason: 'no_sales_order' })
    }

    if (status === 'completed') {
      const { data: issue } = await supabaseAdmin
        .from('stock_issues')
        .select('warehouse_id, sales_order_id, tenant_id')
        .eq('id', id)
        .single()

      if (issue) {
        // Điều chỉnh tồn kho theo từng item đã xuất
        if (items && items.length > 0) {
          for (const it of items) {
            const pickedQty: number = it.picked ?? 0
            const lotNumber: string | null = it.selectedLot || it.lot_number || null

            if (it.id) {
              await supabaseAdmin
                .from('stock_issue_items')
                .update({ picked_qty: pickedQty, lot_number: lotNumber })
                .eq('id', it.id)
            }

            if (pickedQty > 0) {
              await adjustInventory(
                it.product_id,
                issue.warehouse_id,
                issue.tenant_id,
                lotNumber,
                -pickedQty,
              )
            }
          }
        }

        // Cập nhật đơn hàng → picked (chờ logistics phân tuyến)
        if (issue.sales_order_id) {
          await supabaseAdmin
            .from('sales_orders')
            .update({ status: 'picked' })
            .eq('id', issue.sales_order_id)
        }
      }
    } else if (status === 'picking') {
      const { data: issue } = await supabaseAdmin
        .from('stock_issues')
        .select('sales_order_id')
        .eq('id', id)
        .single()
      if (issue?.sales_order_id) {
        await supabaseAdmin
          .from('sales_orders')
          .update({ status: 'picking' })
          .eq('id', issue.sales_order_id)
      }
    }

    const { error } = await supabaseAdmin
      .from('stock_issues')
      .update({ status })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
