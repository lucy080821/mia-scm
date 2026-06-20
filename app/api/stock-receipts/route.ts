import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET() {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json([])

  const { data, error } = await supabaseAdmin
    .from('stock_receipts')
    .select(`
      id, code, po_ref, purchase_order_id, receipt_date, total_amount, status, note,
      supplier:supplier_id ( id, name ),
      warehouse:warehouse_id ( id, name ),
      items:stock_receipt_items (
        id, product_id, ordered_qty, received_qty, unit_price, lot_number, expiry_date, qc_passed, note,
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
    const { supplier_id, purchase_order_id, warehouse_id, receipt_date, po_ref, note, items } = body

    if (!supplier_id || !warehouse_id || !receipt_date) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }
    const tenantId = await getServerTenantId()

    const d = new Date(receipt_date)
    const prefix = `PN-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const { count } = await supabaseAdmin.from('stock_receipts').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
    const code = `${prefix}-${String((count ?? 0) + 1).padStart(3, '0')}`

    const totalAmount = (items ?? []).reduce((s: number, it: { ordered_qty?: number; unit_price?: number }) => s + (it.ordered_qty ?? 0) * (it.unit_price ?? 0), 0)

    const { data: receipt, error: rErr } = await supabaseAdmin
      .from('stock_receipts')
      .insert({
        code,
        supplier_id,
        purchase_order_id: purchase_order_id || null,
        warehouse_id,
        receipt_date,
        po_ref: po_ref || null,
        note: note || null,
        total_amount: totalAmount,
        status: 'pending',
        tenant_id: tenantId,
      })
      .select('id, code')
      .single()

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 400 })

    const filledItems = (items ?? []).filter((it: { product_id?: string }) => it.product_id)
    if (filledItems.length > 0) {
      const rows = filledItems.map((it: { product_id: string; ordered_qty: number; unit_price?: number; lot_number?: string; expiry_date?: string }) => ({
        receipt_id: receipt.id,
        product_id: it.product_id,
        ordered_qty: it.ordered_qty,
        unit_price: it.unit_price ?? 0,
        lot_number: it.lot_number || '',
        expiry_date: it.expiry_date || null,
      }))

      const { error: itemErr } = await supabaseAdmin.from('stock_receipt_items').insert(rows)
      if (itemErr) {
        await supabaseAdmin.from('stock_receipts').delete().eq('id', receipt.id)
        return NextResponse.json({ error: itemErr.message }, { status: 400 })
      }
    }

    return NextResponse.json(receipt, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
