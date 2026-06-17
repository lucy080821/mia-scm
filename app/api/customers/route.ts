import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, name, address, tax_code, phone')
    .eq('status', 'active')
    .order('name')
    .limit(500)
  if (error) return NextResponse.json([], { status: 200 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.name) return NextResponse.json({ error: 'Thiếu tên khách hàng' }, { status: 400 })
    const tenantId = await getServerTenantId()
    const { count } = await supabaseAdmin.from('customers').select('id', { count: 'exact', head: true })
    const code = `CUS${String((count ?? 0) + 1).padStart(4, '0')}`

    const { data, error } = await supabaseAdmin
      .from('customers')
      .insert({
        code,
        name: body.name,
        short_name: body.short_name || null,
        type: body.type || 'company',
        phone: body.phone || null,
        email: body.email || null,
        address: body.address || null,
        credit_limit: body.credit_limit ?? 0,
        payment_term: body.payment_term ?? 30,
        status: body.status ?? 'active',
        tenant_id: tenantId,
      })
      .select('id, code')
      .single()

    if (error) {
      console.error('[POST /api/customers]', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
