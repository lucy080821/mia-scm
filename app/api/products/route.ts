import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('id, sku, name, unit, sale_price')
    .eq('status', 'active')
    .order('name')
    .limit(500)
  if (error) return NextResponse.json([], { status: 200 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.sku || !body.name) return NextResponse.json({ error: 'Thiếu SKU hoặc tên sản phẩm' }, { status: 400 })
    const tenantId = await getServerTenantId()

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert({
        sku: body.sku,
        name: body.name,
        unit: body.unit || 'cái',
        purchase_price: body.purchase_price ?? 0,
        sale_price: body.sale_price ?? 0,
        min_stock: body.min_stock ?? 0,
        expiry_days: body.expiry_days || null,
        status: body.status ?? 'active',
        supplier_id: body.supplier_id || null,
        tenant_id: tenantId,
      })
      .select('id, sku')
      .single()

    if (error) {
      console.error('[POST /api/products]', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...fields } = body
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })

    const { error } = await supabaseAdmin.from('products').update(fields).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
