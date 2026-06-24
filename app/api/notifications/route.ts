import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerUserInfo } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

type NotifType = 'order' | 'inventory' | 'delivery' | 'purchase' | 'system'

interface Notif {
  id: string
  type: NotifType
  title: string
  message: string
  time: string
  href?: string
}

function vnd(n: number) {
  return Number(n).toLocaleString('vi-VN') + ' đ'
}

function allowedTypes(role: string): Set<NotifType> {
  switch (role) {
    case 'sales':    return new Set(['order', 'system'])
    case 'warehouse':return new Set(['inventory', 'purchase', 'system'])
    case 'logistics':return new Set(['delivery', 'system'])
    case 'ketoan':   return new Set(['order', 'purchase', 'system'])
    case 'driver':   return new Set(['delivery', 'system'])
    default:         return new Set(['order', 'inventory', 'delivery', 'purchase', 'system'])
  }
}

export async function GET() {
  const userInfo = await getServerUserInfo()
  if (!userInfo) return NextResponse.json([])

  const { tenantId, role, userId, fullName } = userInfo
  const allowed = allowedTypes(role)

  const notifs: Notif[] = []

  try {
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

    // For driver role: resolve which driver_ids belong to this user
    let driverIds: string[] = []
    if (role === 'driver') {
      const { data: byId } = await supabaseAdmin.from('drivers').select('id').eq('id', userId)
      driverIds = (byId ?? []).map((d: { id: string }) => d.id)
      if (fullName) {
        const { data: byName } = await supabaseAdmin.from('drivers').select('id').eq('name', fullName)
        driverIds = [...new Set([...driverIds, ...(byName ?? []).map((d: { id: string }) => d.id)])]
      }
      if (driverIds.length === 0) driverIds = [userId]
    }

    const [newOrders, pendingPOs, delayedDeliveries, doneOrders, doneDeliveries, allInv, lowProducts] =
      await Promise.all([
        // Đơn hàng mới chờ xác nhận
        allowed.has('order')
          ? supabaseAdmin
              .from('sales_orders')
              .select('code, total_amount, created_at, customer:customers(name)')
              .eq('tenant_id', tenantId)
              .eq('status', 'new')
              .order('created_at', { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [] }),

        // Đơn mua hàng chờ duyệt
        allowed.has('purchase')
          ? supabaseAdmin
              .from('purchase_orders')
              .select('code, total_amount, created_at, supplier:suppliers(name)')
              .eq('tenant_id', tenantId)
              .in('status', ['draft', 'pending'])
              .order('created_at', { ascending: false })
              .limit(10)
          : Promise.resolve({ data: [] }),

        // Giao hàng đang trên đường > 24h
        allowed.has('delivery')
          ? supabaseAdmin
              .from('deliveries')
              .select('code, driver_name, driver_id, created_at')
              .eq('tenant_id', tenantId)
              .in('status', ['delivering', 'assigned'])
              .lt('created_at', yesterday)
              .order('created_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] }),

        // Đơn hàng hoàn thành trong 24h qua
        allowed.has('order')
          ? supabaseAdmin
              .from('sales_orders')
              .select('code, total_amount, updated_at, customer:customers(name)')
              .eq('tenant_id', tenantId)
              .eq('status', 'completed')
              .gt('updated_at', yesterday)
              .order('updated_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] }),

        // Giao hàng hoàn thành trong 24h qua
        allowed.has('delivery')
          ? supabaseAdmin
              .from('deliveries')
              .select('code, driver_name, driver_id, updated_at')
              .eq('tenant_id', tenantId)
              .in('status', ['delivered', 'completed'])
              .gt('updated_at', yesterday)
              .order('updated_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] }),

        // Tồn kho hiện tại
        allowed.has('inventory')
          ? supabaseAdmin
              .from('inventory')
              .select('product_id, quantity')
              .eq('tenant_id', tenantId)
          : Promise.resolve({ data: [] }),

        // Sản phẩm có min_stock > 0
        allowed.has('inventory')
          ? supabaseAdmin
              .from('products')
              .select('id, name, unit, min_stock')
              .eq('tenant_id', tenantId)
              .gt('min_stock', 0)
              .eq('status', 'active')
          : Promise.resolve({ data: [] }),
      ])

    // Đơn hàng mới
    for (const o of (newOrders.data ?? []) as any[]) {
      const cust = (o.customer as { name?: string } | null)?.name ?? ''
      notifs.push({
        id: `ord-new-${o.code}`,
        type: 'order',
        title: 'Đơn hàng mới cần xác nhận',
        message: `${o.code}${cust ? ` — ${cust}` : ''}${o.total_amount ? ` — ${vnd(o.total_amount)}` : ''}`,
        time: o.created_at,
        href: '/ban-hang/don-hang-ban',
      })
    }

    // Đơn mua hàng chờ duyệt
    for (const po of (pendingPOs.data ?? []) as any[]) {
      const sup = (po.supplier as { name?: string } | null)?.name ?? ''
      notifs.push({
        id: `po-pend-${po.code}`,
        type: 'purchase',
        title: 'Đơn mua hàng chờ duyệt',
        message: `${po.code}${sup ? ` — ${sup}` : ''}${po.total_amount ? ` — ${vnd(po.total_amount)}` : ''}`,
        time: po.created_at,
        href: '/mua-hang/don-mua-hang',
      })
    }

    // Giao hàng có thể trễ
    for (const d of (delayedDeliveries.data ?? []) as any[]) {
      if (role === 'driver' && !driverIds.includes(d.driver_id)) continue
      notifs.push({
        id: `del-late-${d.code}`,
        type: 'delivery',
        title: 'Đơn vận chuyển có thể bị trễ',
        message: `${d.code}${d.driver_name ? ` — ${d.driver_name}` : ''} — đang giao hơn 24 giờ`,
        time: d.created_at,
        href: '/logistics/don-van-chuyen',
      })
    }

    // Đơn hàng hoàn thành
    for (const o of (doneOrders.data ?? []) as any[]) {
      const cust = (o.customer as { name?: string } | null)?.name ?? ''
      notifs.push({
        id: `ord-done-${o.code}`,
        type: 'order',
        title: 'Đơn hàng hoàn thành',
        message: `${o.code}${cust ? ` — ${cust}` : ''} — đã giao thành công`,
        time: o.updated_at,
        href: '/ban-hang/don-hang-ban',
      })
    }

    // Giao hàng hoàn thành
    for (const d of (doneDeliveries.data ?? []) as any[]) {
      if (role === 'driver' && !driverIds.includes(d.driver_id)) continue
      notifs.push({
        id: `del-done-${d.code}`,
        type: 'delivery',
        title: 'Giao hàng thành công',
        message: `${d.code}${d.driver_name ? ` — ${d.driver_name}` : ''} — đã hoàn thành`,
        time: d.updated_at,
        href: '/logistics/don-van-chuyen',
      })
    }

    // Tồn kho thấp / hết hàng
    const stockMap: Record<string, number> = {}
    for (const row of (allInv.data ?? []) as any[]) {
      stockMap[row.product_id] = (stockMap[row.product_id] ?? 0) + (row.quantity ?? 0)
    }

    for (const p of (lowProducts.data ?? []) as any[]) {
      const stock = stockMap[p.id] ?? 0
      if (stock > p.min_stock) continue
      const isOut = stock === 0
      notifs.push({
        id: `inv-${isOut ? 'oos' : 'low'}-${p.id}`,
        type: 'inventory',
        title: isOut ? 'Hết hàng' : 'Tồn kho thấp',
        message: `${p.name} — còn ${stock} ${p.unit ?? 'cái'}${isOut ? ', cần nhập ngay' : `, thấp hơn mức tối thiểu (${p.min_stock})`}`,
        time: new Date().toISOString(),
        href: '/kho-hang/san-pham',
      })
    }

    notifs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  } catch (e) {
    console.error('notifications API error:', e)
  }

  return NextResponse.json(notifs)
}
