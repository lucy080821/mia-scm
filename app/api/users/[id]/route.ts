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

// PATCH /api/users/[id] — cập nhật thông tin user
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const caller = await getCallerInfo(req)
  if (!caller || caller.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { full_name, phone, role, employee_code, status, password } = body

  const updateData: Record<string, string> = {}
  if (full_name !== undefined)      updateData.full_name = full_name
  if (phone !== undefined)          updateData.phone = phone
  if (role !== undefined)           updateData.role = role
  if (employee_code !== undefined)  updateData.employee_code = employee_code
  if (status !== undefined)         updateData.status = status

  const { data, error } = await supabaseAdmin
    .from('users')
    .update(updateData)
    .eq('id', id)
    .eq('tenant_id', caller.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (password) {
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(id, { password })
    if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE /api/users/[id] — xóa user
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const caller = await getCallerInfo(req)
  if (!caller || caller.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (id === caller.userId)
    return NextResponse.json({ error: 'Không thể xóa chính mình' }, { status: 400 })

  const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
