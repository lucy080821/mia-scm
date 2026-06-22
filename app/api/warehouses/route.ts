import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET() {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json([], { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('warehouses')
    .select('id, name, code, status')
    .eq('tenant_id', tenantId)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getServerTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, code } = await req.json()
    if (!name?.trim() || !code?.trim()) {
      return NextResponse.json({ error: 'Tên kho và mã kho là bắt buộc' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('warehouses')
      .insert({ name: name.trim(), code: code.trim().toUpperCase(), status: 'active', tenant_id: tenantId })
      .select('id, name, code, status')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
