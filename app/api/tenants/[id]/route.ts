import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getCallerInfo(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single()
  return profile ? { userId: user.id, ...profile } : null
}

// PATCH /api/tenants/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const caller = await getCallerInfo(req)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Owner có thể sửa bất kỳ tenant nào; admin chỉ sửa được tenant của mình
  const isOwner = caller.role === 'owner'
  const isAdminOfTenant = caller.role === 'admin' && caller.tenant_id === id
  if (!isOwner && !isAdminOfTenant)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, address, phone, tax_code, primary_color, logo_url, enabled_modules, plan } = body

  const VALID_PLANS = ['starter', 'growth', 'enterprise']
  const updateData: Record<string, unknown> = {}
  if (name !== undefined)             updateData.name = name
  if (address !== undefined)          updateData.address = address
  if (phone !== undefined)            updateData.phone = phone
  if (tax_code !== undefined)         updateData.tax_code = tax_code
  if (primary_color !== undefined)    updateData.primary_color = primary_color
  if (logo_url !== undefined)         updateData.logo_url = logo_url
  if (enabled_modules !== undefined)  updateData.enabled_modules = enabled_modules
  // Only owner can change plan
  if (plan !== undefined && isOwner) {
    if (!VALID_PLANS.includes(plan))
      return NextResponse.json({ error: 'Plan không hợp lệ' }, { status: 400 })
    updateData.plan = plan
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
