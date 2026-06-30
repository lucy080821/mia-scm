import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json() as { status?: string; vehicle_id?: string; driver_id?: string; route?: string | null; cod_collected?: number; fail_reason?: string }
    const { status, vehicle_id, driver_id, route, cod_collected, fail_reason } = body

    const updatePayload: Record<string, unknown> = {}
    if (status !== undefined) updatePayload.status = status
    if (vehicle_id !== undefined) updatePayload.vehicle_id = vehicle_id
    if (driver_id !== undefined) updatePayload.driver_id = driver_id
    if (route !== undefined) updatePayload.route = route || null
    if (cod_collected !== undefined) updatePayload.cod_collected = cod_collected
    if (fail_reason !== undefined) updatePayload.fail_reason = fail_reason

    const { error } = await supabaseAdmin
      .from('deliveries')
      .update(updatePayload)
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    // Cascade khi có thay đổi status liên quan tới driver/vehicle
    if (status === 'delivering' || status === 'assigned' ||
        status === 'delivered' || status === 'failed') {
      const { data: delivery } = await supabaseAdmin
        .from('deliveries')
        .select('sales_order_id, vehicle_id, driver_id')
        .eq('id', id)
        .single()

      if (delivery) {
        const cascade: PromiseLike<any>[] = []

        if (status === 'delivering' || status === 'assigned') {
          // Đặt xe & tài xế sang on_trip khi phân công hoặc điều xe xuất phát
          if (delivery.vehicle_id)
            cascade.push(supabaseAdmin.from('vehicles').update({ status: 'on_trip' }).eq('id', delivery.vehicle_id))
          if (delivery.driver_id)
            cascade.push(supabaseAdmin.from('drivers').update({ status: 'on_trip' }).eq('id', delivery.driver_id))
        }

        if (status === 'delivering' && delivery.sales_order_id) {
          cascade.push(
            supabaseAdmin.from('sales_orders').update({ status: 'delivering' }).eq('id', delivery.sales_order_id)
          )
        }

        if (status === 'delivered' || status === 'failed') {
          // Cập nhật đơn hàng bán
          if (delivery.sales_order_id) {
            cascade.push(
              supabaseAdmin.from('sales_orders').update({
                status: status === 'delivered' ? 'completed' : 'failed',
                payment_status: status === 'delivered' ? 'paid' : 'unpaid',
              }).eq('id', delivery.sales_order_id),
          supabaseAdmin.from('deliveries').update({ actual_date: new Date().toISOString() }).eq('id', id)
            )
          }

          // Reset xe về available nếu không còn đơn active nào khác
          if (delivery.vehicle_id) {
            const { count: vehicleRemaining } = await supabaseAdmin
              .from('deliveries')
              .select('id', { count: 'exact', head: true })
              .eq('vehicle_id', delivery.vehicle_id)
              .in('status', ['pending', 'assigned', 'delivering'])
            if ((vehicleRemaining ?? 0) === 0)
              cascade.push(supabaseAdmin.from('vehicles').update({ status: 'available' }).eq('id', delivery.vehicle_id))
          }

          // Reset tài xế về available nếu không còn đơn active nào khác; đếm lại total_trips
          if (delivery.driver_id) {
            const { count: driverRemaining } = await supabaseAdmin
              .from('deliveries')
              .select('id', { count: 'exact', head: true })
              .eq('driver_id', delivery.driver_id)
              .in('status', ['pending', 'assigned', 'delivering'])
            if ((driverRemaining ?? 0) === 0) {
              if (status === 'delivered') {
                const { count: totalDelivered } = await supabaseAdmin
                  .from('deliveries')
                  .select('id', { count: 'exact', head: true })
                  .eq('driver_id', delivery.driver_id)
                  .eq('status', 'delivered')
                cascade.push(supabaseAdmin.from('drivers').update({
                  status: 'available',
                  total_trips: totalDelivered ?? 0,
                }).eq('id', delivery.driver_id))
              } else {
                cascade.push(supabaseAdmin.from('drivers').update({ status: 'available' }).eq('id', delivery.driver_id))
              }
            }
          }
        }

        if (cascade.length) await Promise.all(cascade)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[PATCH /api/deliveries/[id]]:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
