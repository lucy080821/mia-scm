import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.name) return NextResponse.json({ error: 'Thiếu tên nhà cung cấp' }, { status: 400 })
    const tenantId = await getServerTenantId()

    const { count } = await supabaseAdmin.from('suppliers').select('id', { count: 'exact', head: true })
    const code = `NCC${String((count ?? 0) + 1).padStart(4, '0')}`

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .insert({
        code,
        name: body.name,
        type: body.type || null,
        tax_code: body.tax_code || null,
        phone: body.phone || null,
        email: body.email || null,
        address: body.address || null,
        payment_term: body.payment_term ?? 30,
        delivery_days: body.delivery_days ?? 3,
        rating: body.rating || null,
        status: body.status ?? 'active',
        tenant_id: tenantId,
      })
      .select('id, code')
      .single()

    if (error) {
      console.error('[POST /api/suppliers]', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
