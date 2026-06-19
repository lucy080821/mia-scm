import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getCallerInfo(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabaseAdmin
    .from('users').select('role, tenant_id').eq('id', user.id).single()
  if (!profile) return null
  return { userId: user.id, ...profile, isOwner: profile.role === 'owner' }
}

// GET /api/tenants — danh sách công ty (chỉ owner)
export async function GET(req: NextRequest) {
  const caller = await getCallerInfo(req)
  if (!caller || !caller.isOwner)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, logo_url, primary_color, enabled_modules, plan, address, phone, tax_code, is_platform, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/tenants — tạo công ty mới + tài khoản admin (chỉ owner)
export async function POST(req: NextRequest) {
  const caller = await getCallerInfo(req)
  if (!caller || !caller.isOwner)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, slug, adminEmail, adminPassword, enabledModules, address, phone, taxCode, plan } = body

  if (!name || !slug || !adminEmail || !adminPassword)
    return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })

  const VALID_PLANS = ['starter', 'growth', 'enterprise']
  const chosenPlan = VALID_PLANS.includes(plan) ? plan : 'starter'

  // Kiểm tra slug trùng
  const { data: existing } = await supabaseAdmin
    .from('tenants').select('id').eq('slug', slug).maybeSingle()
  if (existing)
    return NextResponse.json({ error: `Slug "${slug}" đã tồn tại` }, { status: 400 })

  // 1. Tạo tenant
  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .insert({
      slug,
      name,
      plan:             chosenPlan,
      primary_color:    '#0ea5e9',
      enabled_modules:  enabledModules ?? ['ban-hang', 'kho-hang', 'logistics', 'mua-hang', 'tai-chinh', 'bao-cao'],
      address:          address || null,
      phone:            phone || null,
      tax_code:         taxCode || null,
      is_platform:      false,
    })
    .select()
    .single()

  if (tenantError) return NextResponse.json({ error: tenantError.message }, { status: 500 })

  // 2. Tạo auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email:          adminEmail,
    password:       adminPassword,
    email_confirm:  true,
    user_metadata:  { full_name: `Admin ${name}`, role: 'admin' },
  })

  if (authError) {
    await supabaseAdmin.from('tenants').delete().eq('id', tenant.id)
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  // 3. Insert profile
  const { error: profileError } = await supabaseAdmin.from('users').insert({
    id:        authData.user.id,
    email:     adminEmail,
    full_name: `Admin ${name}`,
    role:      'admin',
    status:    'active',
    tenant_id: tenant.id,
  })

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    await supabaseAdmin.from('tenants').delete().eq('id', tenant.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ tenant, adminUserId: authData.user.id }, { status: 201 })
}
