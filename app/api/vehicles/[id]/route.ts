import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getCaller(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabaseAdmin
    .from('users').select('role, tenant_id').eq('id', user.id).single()
  return profile ? { userId: user.id, ...profile } : null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { error } = await supabaseAdmin
    .from('vehicles')
    .update({
      plate:            body.plate,
      brand:            body.brand || null,
      type:             body.type || null,
      capacity_kg:      body.capacity_kg || null,
      fuel_level:       body.fuel_level ?? 100,
      insurance_expiry: body.insurance_expiry || null,
      status:           body.status ?? 'available',
      warehouse_id:     body.warehouse_id || null,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
