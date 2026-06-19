import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// GET /api/me
// - Nếu có Authorization header → lookup by auth token (dùng trong useAuth)
// - Nếu có ?email=xxx         → lookup by email (dùng trong ProfileModal)
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  const emailParam = req.nextUrl.searchParams.get('email')

  if (token) {
    // useAuth path: lấy profile qua JWT token
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !user) return NextResponse.json(null)

    let { data: profile } = await supabaseAdmin
      .from('users')
      .select('id, full_name, phone, role, tenant_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile && user.email) {
      const res = await supabaseAdmin
        .from('users')
        .select('id, full_name, phone, role, tenant_id')
        .eq('email', user.email)
        .maybeSingle()
      profile = res.data
    }

    // Lấy plan từ tenants table để luôn trả về giá trị mới nhất
    let tenant_plan: string | null = null
    if (profile?.tenant_id) {
      const { data: tenant } = await supabaseAdmin
        .from('tenants')
        .select('plan')
        .eq('id', profile.tenant_id)
        .single()
      tenant_plan = tenant?.plan ?? null
    }

    return NextResponse.json(profile ? { ...profile, tenant_plan } : null)
  }

  if (emailParam) {
    // ProfileModal path: lấy profile qua email
    const { data } = await supabaseAdmin
      .from('users')
      .select('id, full_name, phone, role')
      .eq('email', emailParam)
      .maybeSingle()
    return NextResponse.json(data ?? null)
  }

  return NextResponse.json(null)
}

// PATCH /api/me — cập nhật full_name, phone theo email (bypass RLS)
export async function PATCH(req: NextRequest) {
  try {
    const { email, full_name, phone } = await req.json() as { email: string; full_name: string; phone?: string }
    if (!email || !full_name?.trim()) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existing?.id) {
      const { error } = await supabaseAdmin
        .from('users')
        .update({ full_name: full_name.trim(), phone: phone?.trim() || null })
        .eq('id', existing.id)
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    } else {
      const { error } = await supabaseAdmin
        .from('users')
        .insert({ id: crypto.randomUUID(), email, full_name: full_name.trim(), phone: phone?.trim() || null })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Lỗi server' }, { status: 500 })
  }
}
