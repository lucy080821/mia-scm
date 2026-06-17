import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export interface StopConfirmation {
  stopId: string
  result: 'delivered' | 'failed'
  cod?: number
  paymentMethod?: 'cash' | 'transfer' | 'pending'
  failReason?: string
  arrivedAt: string
  confirmedAt: string
  driverNote?: string
  podPhotoUrl?: string
}

// In-memory store — fallback cho trong phiên, DB là nguồn sự thật
const store = new Map<string, StopConfirmation[]>()

export async function POST(req: NextRequest) {
  const body = await req.json() as { token: string } & StopConfirmation
  const { token, ...confirm } = body
  if (!token || !confirm.stopId || !confirm.result) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  // Update in-memory store
  const existing = store.get(token) ?? []
  const updated = [...existing.filter(c => c.stopId !== confirm.stopId), confirm]
  store.set(token, updated)

  // stopId = deliveryId của từng điểm dừng
  const stopDeliveryId = confirm.stopId

  // Lấy delivery của stop này để update
  const { data: stopDelivery, error: fetchErr } = await supabaseAdmin
    .from('deliveries')
    .select('id, vehicle_id, driver_id, sales_order_id')
    .eq('id', stopDeliveryId)
    .maybeSingle()

  if (fetchErr) {
    console.error('[delivery-confirm] fetch delivery error:', fetchErr)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  if (!stopDelivery) {
    console.error('[delivery-confirm] delivery not found:', stopDeliveryId)
    return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
  }

  const isDelivered = confirm.result === 'delivered'
  const cod = isDelivered ? (confirm.cod ?? 0) : 0

  const { error: updateErr } = await supabaseAdmin.from('deliveries').update({
    status: isDelivered ? 'delivered' : 'failed',
    cod_collected: cod,
    actual_date: new Date().toISOString(),
    payment_method: confirm.paymentMethod ?? null,
    fail_reason: confirm.failReason ?? null,
    driver_note: confirm.driverNote ?? null,
    pod_photo_url: confirm.podPhotoUrl ?? null,
  }).eq('id', stopDelivery.id)

  if (updateErr) {
    console.error('[delivery-confirm] update delivery error:', updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  const secondaryTasks: PromiseLike<any>[] = []

  if (stopDelivery.sales_order_id) {
    const allPaid = isDelivered && (confirm.paymentMethod === 'cash' || confirm.paymentMethod === 'transfer')
    secondaryTasks.push(
      supabaseAdmin.from('sales_orders').update({
        status: isDelivered ? 'completed' : 'failed',
        payment_status: allPaid ? 'paid' : isDelivered ? 'partial' : 'unpaid',
      }).eq('id', stopDelivery.sales_order_id)
    )
  }

  if (stopDelivery.driver_id) {
    const { count: remaining } = await supabaseAdmin
      .from('deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', stopDelivery.driver_id)
      .in('status', ['pending', 'assigned', 'delivering'])
      .neq('id', stopDelivery.id)

    if ((remaining ?? 1) === 0) {
      secondaryTasks.push(supabaseAdmin.from('drivers').update({ status: 'available' }).eq('id', stopDelivery.driver_id))
      if (stopDelivery.vehicle_id)
        secondaryTasks.push(supabaseAdmin.from('vehicles').update({ status: 'available' }).eq('id', stopDelivery.vehicle_id))
    }
  }

  if (secondaryTasks.length > 0) await Promise.all(secondaryTasks)

  return NextResponse.json({ ok: true, confirmations: updated })
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  return NextResponse.json({ confirmations: store.get(token) ?? [] })
}
