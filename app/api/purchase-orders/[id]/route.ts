import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const tenantId = await getServerTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { supplier_id, expected_date, note, status, items } = body

    // Verify PO belongs to tenant and is still draft
    const { data: existing } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, status')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()

    if (!existing) return NextResponse.json({ error: 'Không tìm thấy đơn' }, { status: 404 })

    const hasDataChanges = supplier_id !== undefined || expected_date !== undefined || note !== undefined || Array.isArray(items)
    if (hasDataChanges && existing.status !== 'draft') {
      return NextResponse.json({ error: 'Chỉ chỉnh sửa được đơn ở trạng thái Bản nháp' }, { status: 400 })
    }
    if (status !== undefined && status !== existing.status) {
      const allowed: Record<string, string[]> = { draft: ['pending'], pending: ['sent', 'draft'] }
      if (!(allowed[existing.status] ?? []).includes(status)) {
        return NextResponse.json({ error: `Không thể chuyển trạng thái từ ${existing.status} sang ${status}` }, { status: 400 })
      }
    }

    const total_amount = Array.isArray(items)
      ? items.reduce((s: number, it: { quantity: number; unit_price: number }) => s + it.quantity * it.unit_price, 0)
      : undefined

    const updatePayload: Record<string, unknown> = {}
    if (supplier_id !== undefined) updatePayload.supplier_id = supplier_id || null
    if (expected_date !== undefined) updatePayload.expected_date = expected_date || null
    if (note !== undefined) updatePayload.note = note || null
    if (status !== undefined) updatePayload.status = status
    if (total_amount !== undefined) updatePayload.total_amount = total_amount

    const { error: poErr } = await supabaseAdmin
      .from('purchase_orders')
      .update(updatePayload)
      .eq('id', id)

    if (poErr) return NextResponse.json({ error: poErr.message }, { status: 400 })

    // Replace items if provided
    if (Array.isArray(items)) {
      await supabaseAdmin.from('purchase_order_items').delete().eq('order_id', id)
      if (items.length > 0) {
        const rows = items
          .filter((it: { product_id: string }) => it.product_id)
          .map((it: { product_id: string; quantity: number; unit_price: number }) => ({
            order_id: id,
            product_id: it.product_id,
            quantity: it.quantity,
            unit_price: it.unit_price,
            subtotal: it.quantity * it.unit_price,
          }))
        if (rows.length) await supabaseAdmin.from('purchase_order_items').insert(rows)
      }
    }

    return NextResponse.json({ id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const tenantId = await getServerTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: existing } = await supabaseAdmin
      .from('purchase_orders')
      .select('id, status')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single()

    if (!existing) return NextResponse.json({ error: 'Không tìm thấy đơn' }, { status: 404 })
    if (existing.status !== 'draft') {
      return NextResponse.json({ error: 'Chỉ xóa được đơn ở trạng thái Bản nháp' }, { status: 400 })
    }

    await supabaseAdmin.from('purchase_order_items').delete().eq('order_id', id)
    await supabaseAdmin.from('purchase_orders').delete().eq('id', id)

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
