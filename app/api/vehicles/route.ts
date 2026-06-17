import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

async function getCaller(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabaseAdmin
    .from('users').select('role, tenant_id').eq('id', user.id).single()
  return profile ? { userId: user.id, ...profile } : null
}

export async function GET(req: NextRequest) {
  const caller = await getCaller(req)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('vehicles')
    .select('id, plate, brand, type, capacity_kg, fuel_level, insurance_expiry, status, warehouse_id, warehouse:warehouses(id, name)')
    .order('plate')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const caller = await getCaller(req)
    if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const tenantId = await getServerTenantId()
    const { data, error } = await supabaseAdmin
      .from('vehicles')
      .insert({
        plate:            body.plate,
        brand:            body.brand || null,
        type:             body.type || null,
        capacity_kg:      body.capacity_kg || null,
        fuel_level:       body.fuel_level ?? 100,
        insurance_expiry: body.insurance_expiry || null,
        status:           body.status ?? 'available',
        warehouse_id:     body.warehouse_id || null,
        tenant_id:        tenantId,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[POST /api/vehicles] supabase error:', error)
      return NextResponse.json({ error: error.message || error.details || JSON.stringify(error) }, { status: 400 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    console.error('[POST /api/vehicles] uncaught:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
