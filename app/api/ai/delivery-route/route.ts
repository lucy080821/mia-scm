import { NextRequest, NextResponse } from 'next/server'
import { optimizeDeliveryRoutes } from '@/lib/groq'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    let unassigned = body.unassigned as any[] | undefined
    let vehicles   = body.vehicles   as any[] | undefined

    if (!vehicles || vehicles.length === 0) {
      const { data: veh } = await supabaseAdmin
        .from('vehicles')
        .select('plate, type, capacity_kg, drivers(name, phone)')
        .in('status', ['available', 'on_trip'])
        .limit(20)

      vehicles = (veh ?? []).map((v: any) => {
        const d = Array.isArray(v.drivers) ? v.drivers[0] : v.drivers
        return { plate: v.plate, type: v.type, driver: d?.name ?? '—', capacity_kg: v.capacity_kg ?? 1000 }
      })
    }

    if (!unassigned || unassigned.length === 0) {
      return NextResponse.json({
        grouped_orders: [],
        priority_orders: [],
        summary: 'Không có đơn hàng nào chưa phân tuyến.',
        total_km_saved: 0,
      })
    }

    const result = await optimizeDeliveryRoutes(unassigned, vehicles ?? [])
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Lỗi tối ưu tuyến đường' }, { status: 500 })
  }
}
