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
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const { status, items } = body

    // resync: tạo delivery cho issue đã completed mà chưa có delivery (không thay đổi items/tồn kho)
    if (status === 'resync') {
      const { data: issue } = await supabaseAdmin
        .from('stock_issues')
        .select('warehouse_id, sales_order_id')
        .eq('id', id)
        .single()

      if (issue?.sales_order_id) {
        const { count: existing, error: countErr } = await supabaseAdmin
          .from('deliveries')
          .select('id', { count: 'exact', head: true })
          .eq('sales_order_id', issue.sales_order_id)

        if (!countErr && existing === 0) {
          const now = new Date()
          const prefix = `DV-${now.getFullYear().toString().slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
          const { count: dvCount } = await supabaseAdmin
            .from('deliveries').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
          const dvCode = `${prefix}-${String((dvCount ?? 0) + 1).padStart(3, '0')}`
          const { data: order } = await supabaseAdmin
            .from('sales_orders').select('delivery_date').eq('id', issue.sales_order_id).single()
          const { error: dvErr } = await supabaseAdmin.from('deliveries').insert({
            code: dvCode,
            sales_order_id: issue.sales_order_id,
            planned_date: order?.delivery_date
              ? new Date(order.delivery_date).toISOString()
              : new Date(Date.now() + 86400000).toISOString(),
            carrier_type: 'own',
            status: 'pending',
          })
          if (!dvErr) {
            await supabaseAdmin.from('sales_orders').update({ status: 'picked' }).eq('id', issue.sales_order_id)
          }
          return NextResponse.json({ ok: true, created: !dvErr })
        }
        return NextResponse.json({ ok: true, created: false, reason: 'delivery_exists' })
      }
      return NextResponse.json({ ok: false, reason: 'no_sales_order' })
    }

    if (status === 'completed') {
      const { data: issue } = await supabaseAdmin
        .from('stock_issues')
        .select('warehouse_id, sales_order_id')
        .eq('id', id)
        .single()

      if (issue) {
        // Điều chỉnh tồn kho theo items (nếu có)
        if (items && items.length > 0) {
          for (const it of items) {
            const pickedQty: number = it.picked ?? 0
            const lotNumber: string = it.selectedLot ?? it.lot_number ?? ''

            if (it.id) {
              await supabaseAdmin
                .from('stock_issue_items')
                .update({ picked_qty: pickedQty, lot_number: lotNumber })
                .eq('id', it.id)
            }

            if (pickedQty > 0) {
              await adjustInventory(it.product_id, issue.warehouse_id, lotNumber, -pickedQty)
            }
          }
        }

        // Tạo delivery record nếu có đơn hàng liên kết và chưa có delivery nào
        // (tách riêng khỏi items check để luôn chạy khi hoàn tất)
        if (issue.sales_order_id) {
          const { count: existing, error: countErr } = await supabaseAdmin
            .from('deliveries')
            .select('id', { count: 'exact', head: true })
            .eq('sales_order_id', issue.sales_order_id)

          if (!countErr && existing === 0) {
            const now = new Date()
            const prefix = `DV-${now.getFullYear().toString().slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
            const { count: dvCount } = await supabaseAdmin
              .from('deliveries').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
            const dvCode = `${prefix}-${String((dvCount ?? 0) + 1).padStart(3, '0')}`

            // Lấy thông tin đơn hàng để điền vào delivery
            const { data: order } = await supabaseAdmin
              .from('sales_orders')
              .select('delivery_date, customer:customers(name, address)')
              .eq('id', issue.sales_order_id)
              .single()

            const { error: dvErr } = await supabaseAdmin.from('deliveries').insert({
              code: dvCode,
              sales_order_id: issue.sales_order_id,
              planned_date: order?.delivery_date
                ? new Date(order.delivery_date).toISOString()
                : new Date(Date.now() + 86400000).toISOString(),
              carrier_type: 'own',
              status: 'pending',
            })

            if (!dvErr) {
              // Cập nhật trạng thái đơn hàng → picked (đã xuất kho, chờ giao)
              await supabaseAdmin
                .from('sales_orders')
                .update({ status: 'picked' })
                .eq('id', issue.sales_order_id)
            }
          }
        }
      }
    } else if (status === 'picking') {
      // no inventory change, just status update
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
