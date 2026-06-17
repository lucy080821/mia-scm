import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const [orders, receipts, issues, deliveries, purchases] = await Promise.all([
      supabaseAdmin.from('sales_orders').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      supabaseAdmin.from('stock_receipts').select('id', { count: 'exact', head: true }).in('status', ['pending', 'qc_check']),
      supabaseAdmin.from('stock_issues').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabaseAdmin.from('deliveries').select('id', { count: 'exact', head: true }).in('status', ['pending', 'assigned']),
      supabaseAdmin.from('purchase_orders').select('id', { count: 'exact', head: true }).in('status', ['draft', 'pending']),
    ])

    return NextResponse.json({
      '/ban-hang/don-hang-ban': orders.count ?? 0,
      '/kho-hang/nhap-kho': receipts.count ?? 0,
      '/kho-hang/xuat-kho': issues.count ?? 0,
      '/logistics/don-van-chuyen': deliveries.count ?? 0,
      '/mua-hang/don-mua-hang': purchases.count ?? 0,
    })
  } catch {
    return NextResponse.json({})
  }
}
