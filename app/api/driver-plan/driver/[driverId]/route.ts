import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ driverId: string }> }) {
  try {
    const { driverId } = await params

    const { data: driver } = await supabaseAdmin
      .from('drivers')
      .select('id, name, vehicle:vehicles(plate)')
      .eq('id', driverId)
      .maybeSingle()

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

    // Nếu driver không có record trong bảng drivers, vẫn tìm deliveries theo driverId
    const vehiclePlate = (driver?.vehicle as any)?.plate ?? ''

    // Nếu không tìm thấy trong bảng drivers, lấy tên từ auth user
    let driverName = driver?.name ?? null
    if (!driverName) {
      const { data: { user: authUser } } = await supabaseAdmin.auth.admin.getUserById(driverId)
      driverName = authUser?.user_metadata?.full_name ?? authUser?.email ?? 'Tài xế'
    }

    // Tìm TẤT CẢ driver IDs có cùng tên — bắt cả trường hợp drivers.id ≠ auth UUID
    const sameNameDriverIds: string[] = []
    if (driverName && driverName !== 'Tài xế') {
      const { data: sameNameDrivers } = await supabaseAdmin
        .from('drivers')
        .select('id')
        .eq('name', driverName)
      sameNameDriverIds.push(...(sameNameDrivers ?? []).map((d: any) => d.id))
    }
    const allDriverIds = [...new Set([driverId, ...sameNameDriverIds])]

    // Lấy vehicle_id của tài xế (để bắt deliveries gán theo xe, không phải theo driver_id)
    const { data: driverRecord } = await supabaseAdmin
      .from('drivers')
      .select('vehicle_id')
      .in('id', allDriverIds)
      .not('vehicle_id', 'is', null)
      .limit(5)
    const vehicleIds = (driverRecord ?? []).map((d: any) => d.vehicle_id as string).filter(Boolean)

    // Đơn đang active: tìm theo driver_id HOẶC vehicle_id (bắt deliveries cũ chưa có driver_id)
    const activeFilter = supabaseAdmin
      .from('deliveries')
      .select(selectFields)
      .in('status', ['pending', 'assigned', 'picking', 'delivering'])
      .order('planned_date')

    const { data: activeDeliveries } = vehicleIds.length > 0
      ? await activeFilter.or(`driver_id.in.(${allDriverIds.join(',')}),vehicle_id.in.(${vehicleIds.join(',')})`)
      : await activeFilter.in('driver_id', allDriverIds)

    // Cập nhật driver_id cho deliveries thiếu (không block response)
    if (vehicleIds.length > 0 && activeDeliveries) {
      const missingDriverId = activeDeliveries.filter((d: any) => !d.driver_id && vehicleIds.includes(d.vehicle_id))
      if (missingDriverId.length > 0) {
        supabaseAdmin.from('deliveries')
          .update({ driver_id: driverId })
          .in('id', missingDriverId.map((d: any) => d.id))
          .then(() => {})
      }
    }

    // Đơn đã hoàn thành/thất bại: chỉ lấy của hôm nay
    const completedFilter = supabaseAdmin
      .from('deliveries')
      .select(selectFields)
      .in('status', ['delivered', 'failed'])
      .gte('planned_date', today.toISOString())
      .order('planned_date')

    const { data: completedDeliveries } = vehicleIds.length > 0
      ? await completedFilter.or(`driver_id.in.(${allDriverIds.join(',')}),vehicle_id.in.(${vehicleIds.join(',')})`)
      : await completedFilter.in('driver_id', allDriverIds)

    const deliveries = [...(activeDeliveries ?? []), ...(completedDeliveries ?? [])]
      .filter((d, i, arr) => arr.findIndex(x => x.id === d.id) === i) // dedup
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

    return NextResponse.json({
      driver: driverName ?? 'Tài xế',
      vehicle: vehiclePlate,
      stops,
      date: today.toISOString().slice(0, 10),
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
