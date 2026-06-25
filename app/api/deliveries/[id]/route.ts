import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json() as { status?: string; vehicle_id?: string; driver_id?: string; route?: string | null }
    const { status, vehicle_id, driver_id, route } = body

    const updatePayload: Record<string, unknown> = {}
    if (status !== undefined) { updatePayload.status = status; updatePayload.actual_date = new Date().toISOString() }
    if (vehicle_id !== undefined) updatePayload.vehicle_id = vehicle_id
    if (driver_id !== undefined) updatePayload.driver_id = driver_id
    if (route !== undefined) updatePayload.route = route || null

    const { error } = await supabaseAdmin
      .from('deliveries')
      .update(updatePayload)
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Khi giao thành công / thất bại → cascade sang sales_order, vehicle, driver
    if (status === 'delivered' || status === 'failed') {
      const { data: delivery } = await supabaseAdmin
        .from('deliveries')
        .select('sales_order_id, vehicle_id, driver_id')
        .eq('id', id)
        .single()

      if (delivery) {
        const cascade: PromiseLike<any>[] = []

        if (delivery.sales_order_id) {
          cascade.push(
            supabaseAdmin.from('sales_orders').update({
              status: status === 'delivered' ? 'completed' : 'failed',
              payment_status: status === 'delivered' ? 'paid' : 'unpaid',
            }).eq('id', delivery.sales_order_id)
          )
        }
        if (delivery.vehicle_id)
          cascade.push(supabaseAdmin.from('vehicles').update({ status: 'available' }).eq('id', delivery.vehicle_id))
        if (delivery.driver_id) {
          if (status === 'delivered') {
            // Đếm lại toàn bộ chuyến đã giao (kể cả chuyến cũ) — self-healing
            const { count } = await supabaseAdmin
              .from('deliveries')
              .select('id', { count: 'exact', head: true })
              .eq('driver_id', delivery.driver_id)
              .eq('status', 'delivered')
            cascade.push(supabaseAdmin.from('drivers').update({
              status: 'available',
              total_trips: count ?? 0,
            }).eq('id', delivery.driver_id))
          } else {
            cascade.push(supabaseAdmin.from('drivers').update({ status: 'available' }).eq('id', delivery.driver_id))
          }
        }

        await Promise.all(cascade)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[PATCH /api/deliveries/[id]]:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
