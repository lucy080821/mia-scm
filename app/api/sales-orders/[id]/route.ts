import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    const { error } = await supabaseAdmin
      .from('sales_orders')
      .update(body)
      .eq('id', id)

    if (error) {
      console.error('[PATCH /api/sales-orders/[id]]:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Khi đơn chuyển sang completed/failed từ bất kỳ đâu → cascade sang delivery + driver + vehicle
    if (body.status === 'completed' || body.status === 'failed') {
      const { data: delivery } = await supabaseAdmin
        .from('deliveries')
        .select('id, vehicle_id, driver_id')
        .eq('sales_order_id', id)
        .in('status', ['pending', 'assigned', 'picking', 'delivering'])
        .maybeSingle()

      if (delivery) {
        const cascade: PromiseLike<any>[] = [
          supabaseAdmin.from('deliveries').update({
            status: body.status === 'completed' ? 'delivered' : 'failed',
            actual_date: new Date().toISOString(),
          }).eq('id', delivery.id),
        ]

        if (delivery.vehicle_id) {
          cascade.push(supabaseAdmin.from('vehicles').update({ status: 'available' }).eq('id', delivery.vehicle_id))
        }

        if (delivery.driver_id) {
          // Chỉ trả tài xế về "Sẵn sàng" nếu không còn đơn giao nào khác đang active
          const { count: remaining } = await supabaseAdmin
            .from('deliveries')
            .select('id', { count: 'exact', head: true })
            .eq('driver_id', delivery.driver_id)
            .in('status', ['pending', 'assigned', 'picking', 'delivering'])
            .neq('id', delivery.id)

          if ((remaining ?? 1) === 0) {
            cascade.push(supabaseAdmin.from('drivers').update({ status: 'available' }).eq('id', delivery.driver_id))
          }
        }

        await Promise.all(cascade)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[PATCH /api/sales-orders/[id]] uncaught:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
