import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ deliveryId: string }> }) {
  try {
    const { deliveryId } = await params

    // Lấy delivery gốc để tìm driver_id
    const { data: origin } = await supabaseAdmin
      .from('deliveries')
      .select('id, driver_id, vehicle_id, driver:drivers(name), vehicle:vehicles(plate)')
      .eq('id', deliveryId)
      .single()

    if (!origin || !origin.driver_id) {
      return NextResponse.json({ error: 'Delivery not found' }, { status: 404 })
    }

    // Tìm tất cả deliveries cùng tài xế (kể cả đã giao hôm nay)
    const { data: deliveries } = await supabaseAdmin
      .from('deliveries')
      .select(`
        id, code, route, planned_date, status, cod_collected, actual_date,
        sales_order:sales_orders(
          id, final_amount, delivery_date,
          customer:customers(name, address),
          items:sales_order_items(
            quantity,
            product:products(name, unit)
          )
        )
      `)
      .eq('driver_id', origin.driver_id)
      .in('status', ['pending', 'assigned', 'delivering', 'delivered', 'failed'])
      .order('planned_date')

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
        items: itemsText,
        cod: Number(order?.final_amount ?? 0),
        deliveryCode: d.code,
        status: d.status,
        codCollected: Number(d.cod_collected ?? 0),
        actualDate: d.actual_date ?? null,
      }
    })

    const driverName  = (origin.driver as any)?.name ?? ''
    const vehiclePlate = (origin.vehicle as any)?.plate ?? ''

    return NextResponse.json({ driver: driverName, vehicle: vehiclePlate, stops })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
