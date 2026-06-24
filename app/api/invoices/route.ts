import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET() {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json([])

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_no, invoice_date, customer_name, customer_address, tax_code, order_ref, note, items, subtotal, vat_pct, vat, total, status, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error?.message?.includes('does not exist')) return NextResponse.json([])
  if (error) return NextResponse.json([])
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getServerTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const {
      invoice_no, invoice_date, customer_name, customer_address,
      tax_code, order_ref, note, items, subtotal, vat_pct, vat, total, status,
    } = body

    const { data, error } = await supabaseAdmin
      .from('invoices')
      .insert({
        tenant_id: tenantId,
        invoice_no: invoice_no || `HD-${Date.now()}`,
        invoice_date: invoice_date || null,
        customer_name: customer_name || null,
        customer_address: customer_address || null,
        tax_code: tax_code || null,
        order_ref: order_ref || null,
        note: note || null,
        items: items ?? [],
        subtotal: subtotal ?? 0,
        vat_pct: vat_pct ?? 10,
        vat: vat ?? 0,
        total: total ?? 0,
        status: status ?? 'draft',
      })
      .select('id')
      .single()

    if (error?.message?.includes('does not exist')) {
      return NextResponse.json({ error: 'Bảng invoices chưa được tạo — chạy migration SQL trước' }, { status: 400 })
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
