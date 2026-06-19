import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getAdmin(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await supabaseAdmin.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await supabaseAdmin
    .from('users').select('role, tenant_id').eq('id', user.id).single()
  return profile?.role === 'admin' ? profile : null
}

export async function POST(req: NextRequest) {
  const admin = await getAdmin(req)
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, parent_id } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Tên không được trống' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('categories').insert({
    name: name.trim(),
    parent_id: parent_id || null,
    tenant_id: admin.tenant_id,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
