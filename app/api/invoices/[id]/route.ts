import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = await getServerTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await req.json()
    const {
      invoice_no, invoice_date, customer_name, customer_address,
      tax_code, order_ref, note, items, subtotal, vat_pct, vat, total, status,
    } = body

    const update: Record<string, unknown> = {}
    if (invoice_no     !== undefined) update.invoice_no       = invoice_no
    if (invoice_date   !== undefined) update.invoice_date     = invoice_date
    if (customer_name  !== undefined) update.customer_name    = customer_name
    if (customer_address !== undefined) update.customer_address = customer_address
    if (tax_code       !== undefined) update.tax_code         = tax_code
    if (order_ref      !== undefined) update.order_ref        = order_ref
    if (note           !== undefined) update.note             = note
    if (items          !== undefined) update.items            = items
    if (subtotal       !== undefined) update.subtotal         = subtotal
    if (vat_pct        !== undefined) update.vat_pct          = vat_pct
    if (vat            !== undefined) update.vat              = vat
    if (total          !== undefined) update.total            = total
    if (status         !== undefined) update.status           = status

    const { error } = await supabaseAdmin
      .from('invoices')
      .update(update)
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
