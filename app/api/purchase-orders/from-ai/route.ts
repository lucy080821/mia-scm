import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function POST(req: NextRequest) {
  try {
    const { items } = await req.json() as { items: { sku: string; quantity: number }[] }
    if (!items?.length) return NextResponse.json({ error: 'Không có sản phẩm nào' }, { status: 400 })

    const tenantId = await getServerTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const skus = items.map(i => i.sku)
    const { data: prods } = await supabaseAdmin
      .from('products')
      .select('id, sku, purchase_price, supplier_id')
      .eq('tenant_id', tenantId)
      .in('sku', skus)

    if (!prods?.length) return NextResponse.json({ error: 'Không tìm thấy sản phẩm' }, { status: 400 })

    type ProdRow = { id: string; sku: string; purchase_price: number; supplier_id: string | null }
    const prodMap = Object.fromEntries((prods as ProdRow[]).map(p => [p.sku, p]))

    // Group items by supplier_id (null = 'none')
    const groups: Record<string, { supplier_id: string | null; rows: { product_id: string; quantity: number; unit_price: number }[] }> = {}
    for (const item of items) {
      const prod = prodMap[item.sku]
      if (!prod) continue
      const key = prod.supplier_id ?? 'none'
      if (!groups[key]) groups[key] = { supplier_id: prod.supplier_id ?? null, rows: [] }
      groups[key].rows.push({
        product_id: prod.id,
        quantity: Math.max(Math.round(item.quantity), 1),
        unit_price: prod.purchase_price ?? 0,
      })
    }

    const today = new Date().toISOString().slice(0, 10)
    const expectedDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    const createdOrders: { id: string; code: string }[] = []

    for (const group of Object.values(groups)) {
      const d = new Date(today)
      const prefix = `PO-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
      const { count } = await supabaseAdmin
        .from('purchase_orders').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
      const code = `${prefix}-${String((count ?? 0) + createdOrders.length + 1).padStart(3, '0')}`
      const total_amount = group.rows.reduce((s, r) => s + r.quantity * r.unit_price, 0)

      const insertPayload: Record<string, unknown> = {
        code,
        order_date: today,
        expected_date: expectedDate,
        total_amount,
        status: 'draft',
        note: 'Tự động tạo bởi AI phân tích tồn kho — cần xem xét và duyệt',
        tenant_id: tenantId,
      }
      if (group.supplier_id) insertPayload.supplier_id = group.supplier_id

      const { data: po, error: poErr } = await supabaseAdmin
        .from('purchase_orders')
        .insert(insertPayload)
        .select('id, code')
        .single()

      if (poErr || !po) {
        console.error('[from-ai] PO insert error:', poErr?.message)
        continue
      }

      await supabaseAdmin.from('purchase_order_items').insert(
        group.rows.map(r => ({
          order_id: po.id,
          product_id: r.product_id,
          quantity: r.quantity,
          unit_price: r.unit_price,
          subtotal: r.quantity * r.unit_price,
        }))
      )

      createdOrders.push({ id: po.id, code: po.code })
    }

    if (!createdOrders.length) {
      const hasNoSupplier = Object.values(groups).every(g => !g.supplier_id)
      const msg = hasNoSupplier
        ? 'Sản phẩm chưa được gán nhà cung cấp. Vui lòng chạy migration supabase/make-po-supplier-optional.sql trong Supabase Dashboard rồi thử lại.'
        : 'Không tạo được đơn — lỗi database. Kiểm tra Supabase logs.'
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    return NextResponse.json({ orders: createdOrders })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
