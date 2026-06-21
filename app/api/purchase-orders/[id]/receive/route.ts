import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

async function adjustInventory(
  product_id: string,
  warehouse_id: string,
  lot_number: string,
  qty: number,
  expiry_date?: string | null,
  tenant_id?: string,
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
      .update({ quantity: existing.quantity + qty, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabaseAdmin.from('inventory').insert({
      product_id, warehouse_id,
      lot_number: lotKey,
      quantity: qty,
      expiry_date: expiry_date || null,
      tenant_id,
    })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: poId } = await params
    const tenantId = await getServerTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json() as {
      warehouse_id: string
      receipt_date: string
      note?: string
      items: {
        product_id: string
        ordered_qty: number
        received_qty: number
        unit_price: number
        lot_number?: string
        expiry_date?: string
      }[]
    }

    const { warehouse_id, receipt_date, note, items } = body
    if (!warehouse_id || !receipt_date || !items?.length) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    // Verify PO belongs to tenant
    const { data: po } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, code, supplier_id, status')
      .eq('id', poId)
      .eq('tenant_id', tenantId)
      .single()
    if (!po) return NextResponse.json({ error: 'Không tìm thấy đơn mua hàng' }, { status: 404 })
    if (!['sent', 'delivering'].includes(po.status)) {
      return NextResponse.json({ error: 'Đơn hàng phải ở trạng thái Đã gửi NCC hoặc Đang giao' }, { status: 400 })
    }

    // Generate receipt code
    const d = new Date(receipt_date)
    const prefix = `PN-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const { count } = await supabaseAdmin.from('stock_receipts').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
    const code = `${prefix}-${String((count ?? 0) + 1).padStart(3, '0')}`

    const receivedItems = items.filter(it => it.received_qty > 0)
    const total_amount = receivedItems.reduce((s, it) => s + it.received_qty * it.unit_price, 0)

    // Create stock receipt
    const { data: receipt, error: rErr } = await supabaseAdmin
      .from('stock_receipts')
      .insert({
        code,
        supplier_id: po.supplier_id || null,
        purchase_order_id: poId,
        warehouse_id,
        receipt_date,
        po_ref: po.code,
        note: note || null,
        total_amount,
        status: 'completed',
        tenant_id: tenantId,
      })
      .select('id, code')
      .single()

    if (rErr || !receipt) return NextResponse.json({ error: rErr?.message ?? 'Lỗi tạo phiếu' }, { status: 400 })

    // Insert receipt items + update inventory
    for (const it of items) {
      await supabaseAdmin.from('stock_receipt_items').insert({
        receipt_id: receipt.id,
        product_id: it.product_id,
        ordered_qty: it.ordered_qty,
        received_qty: it.received_qty,
        unit_price: it.unit_price,
        lot_number: it.lot_number || '',
        expiry_date: it.expiry_date || null,
        qc_passed: true,
      })

      if (it.received_qty > 0) {
        await adjustInventory(
          it.product_id, warehouse_id,
          it.lot_number || '', it.received_qty,
          it.expiry_date, tenantId,
        )
      }
    }

    // Update PO status: completed if all fully received, delivering if partial
    const allReceived = items.every(it => it.received_qty >= it.ordered_qty)
    const anyReceived = items.some(it => it.received_qty > 0)
    const newPoStatus = allReceived ? 'completed' : (anyReceived ? 'delivering' : po.status)

    await supabaseAdmin.from('purchase_orders').update({ status: newPoStatus }).eq('id', poId)

    return NextResponse.json({
      receipt: { id: receipt.id, code: receipt.code },
      po_status: newPoStatus,
      message: allReceived
        ? 'Nhận hàng đầy đủ — đơn mua hàng hoàn thành'
        : `Nhận một phần — còn hàng chưa giao (đơn chuyển sang Đang giao)`,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
