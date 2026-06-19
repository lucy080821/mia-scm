import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function requireOwner(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabaseAdmin
    .from('users').select('role, tenant_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return null
  return { userId: user.id, ...profile }
}

export async function GET(req: NextRequest) {
  const caller = await requireOwner(req)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Chỉ lấy sự kiện cấp công ty: tạo cty + tài khoản admin đại diện
  const [tenantsResult, adminsResult] = await Promise.all([
    supabaseAdmin
      .from('tenants')
      .select('id, name, slug, plan, created_at')
      .eq('is_platform', false)
      .order('created_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('users')
      .select('id, full_name, email, tenant_id, created_at')
      .eq('role', 'admin')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return NextResponse.json({
    tenants: tenantsResult.data ?? [],
    admins:  adminsResult.data ?? [],
  })
}
