import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Lấy caller's tenant_id & role từ JWT
async function getCallerInfo(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null

  // Dùng supabaseAdmin để verify token (tránh lỗi với publishable key)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null

  const { data: profile } = await supabaseAdmin
    .from('users')
    .select('role, tenant_id')
    .eq('id', user.id)
    .single()

  return profile ? { userId: user.id, ...profile } : null
}

// GET /api/users — danh sách user cùng công ty
export async function GET(req: NextRequest) {
  const caller = await getCallerInfo(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, employee_code, full_name, email, phone, role, status, created_at, avatar_url')
    .eq('tenant_id', caller.tenant_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST /api/users — tạo user mới (chỉ admin)
export async function POST(req: NextRequest) {
  const caller = await getCallerInfo(req)
  if (!caller || caller.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { full_name, email, password, phone, role, employee_code, status } = body

  if (!email || !password || !full_name)
    return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })

  // Tạo auth user
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,  // bỏ qua xác nhận email
    user_metadata: { full_name, role },
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  // Insert vào bảng users với tenant_id của admin đang tạo
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .insert({
      id:            authData.user.id,
      email,
      full_name,
      phone:         phone ?? null,
      role:          role ?? 'sales',
      employee_code: employee_code ?? null,
      status:        status ?? 'active',
      tenant_id:     caller.tenant_id,   // inject từ session, không tin frontend
    })
    .select()
    .single()

  if (profileError) {
    // Rollback auth user nếu insert thất bại
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json(profile, { status: 201 })
}
