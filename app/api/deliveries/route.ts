import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getServerTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { code, sales_order_id, vehicle_id, driver_id, planned_date, carrier_type, status, warehouse_id } = body

    if (!code || !sales_order_id) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('deliveries')
      .insert({
        code,
        tenant_id: tenantId,
        sales_order_id,
        vehicle_id: vehicle_id ?? null,
        driver_id: driver_id ?? null,
        planned_date: planned_date ?? new Date().toISOString(),
        carrier_type: carrier_type ?? 'own',
        status: status ?? 'pending',
        warehouse_id: warehouse_id ?? null,
      })
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ id: data.id })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
