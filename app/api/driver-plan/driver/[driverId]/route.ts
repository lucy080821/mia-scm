import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ driverId: string }> }) {
  try {
    const { driverId } = await params

    const { data: driver } = await supabaseAdmin
      .from('drivers')
      .select('id, name, vehicle:vehicles(plate)')
      .eq('id', driverId)
      .single()

    if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 })

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const selectFields = `
      id, code, route, planned_date, status, cod_collected, actual_date,
      sales_order:sales_orders(
        id, final_amount,
        customer:customers(name, address, phone),
        items:sales_order_items(quantity, product:products(name, unit))
      )
    `

    // Tìm TẤT CẢ driver IDs có cùng tên (tránh mismatch khi có 2 row cùng người)
    const { data: sameNameDrivers } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('name', driver.name)
    const allDriverIds = [...new Set([driverId, ...(sameNameDrivers ?? []).map((d: any) => d.id)])]

    // Đơn đang active: không lọc theo ngày (tránh mất đơn tạo hôm qua chưa giao xong)
    const { data: activeDeliveries } = await supabaseAdmin
      .from('deliveries')
      .select(selectFields)
      .in('driver_id', allDriverIds)
      .in('status', ['pending', 'assigned', 'delivering'])
      .order('planned_date')

    // Đơn đã hoàn thành/thất bại: chỉ lấy của hôm nay
    const { data: completedDeliveries } = await supabaseAdmin
      .from('deliveries')
      .select(selectFields)
      .in('driver_id', allDriverIds)
      .in('status', ['delivered', 'failed'])
      .gte('planned_date', today.toISOString())
      .order('planned_date')

    const deliveries = [...(activeDeliveries ?? []), ...(completedDeliveries ?? [])]
      .sort((a, b) => new Date(a.planned_date ?? 0).getTime() - new Date(b.planned_date ?? 0).getTime())

    const stops = (deliveries ?? []).map((d: any, i: number) => {
      const order = d.sales_order
      const itemsText = (order?.items ?? [])
        .map((it: any) => `${it.quantity} ${it.product?.unit ?? ''} ${it.product?.name ?? ''}`.trim())
        .join(', ') || 'Hàng hóa theo đơn'

      return {
        id: d.id,
        seq: i + 1,
        customer: order?.customer?.name ?? '—',
        address: order?.customer?.address ?? '',
        phone: order?.customer?.phone ?? null,
        items: itemsText,
        cod: Number(order?.final_amount ?? 0),
        deliveryCode: d.code,
        status: d.status,
        codCollected: Number(d.cod_collected ?? 0),
        actualDate: d.actual_date ?? null,
      }
    })

    // Debug: tìm tất cả deliveries thuộc driver này (bỏ qua filter status)
    const { data: allDeliveriesForDriver } = await supabaseAdmin
      .from('deliveries')
      .select('id, code, status, driver_id, planned_date')
      .in('driver_id', allDriverIds)
      .limit(20)

    // Debug: lấy sample deliveries để xem driver_id thực tế trong DB
    const { data: sampleDeliveries } = await supabaseAdmin
      .from('deliveries')
      .select('id, code, status, driver_id')
      .not('driver_id', 'is', null)
      .limit(5)

    return NextResponse.json({
      driver: driver.name,
      vehicle: (driver.vehicle as any)?.plate ?? '',
      stops,
      date: today.toISOString().slice(0, 10),
      _debug: {
        driverId,
        allDriverIds,
        activeCount: activeDeliveries?.length ?? 0,
        completedCount: completedDeliveries?.length ?? 0,
        allDeliveriesForDriver,
        sampleDeliveries,
        todayIso: today.toISOString(),
      },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
