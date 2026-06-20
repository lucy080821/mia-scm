import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET(req: NextRequest) {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json([])

  const { searchParams } = new URL(req.url)
  const salesOrderId = searchParams.get('sales_order_id')

  let query = supabaseAdmin
    .from('stock_issues')
    .select(`
      id, code, sales_order_id, issue_date, status, note, created_at,
      sales_order:sales_orders ( id, code, customer:customers ( id, name ) ),
      warehouse:warehouses ( id, code, name ),
      created_by:users ( full_name )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (salesOrderId) {
    query = query.eq('sales_order_id', salesOrderId)
  } else {
    query = query.limit(200)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { sales_order_id, customer_id, warehouse_id, issue_date, note, items } = body

    if (!warehouse_id || !issue_date) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }
    const tenantId = await getServerTenantId()

    const d = new Date(issue_date)
    const prefix = `PX-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const { count } = await supabaseAdmin.from('stock_issues').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
    const code = `${prefix}-${String((count ?? 0) + 1).padStart(3, '0')}`

    const { data: issue, error: iErr } = await supabaseAdmin
      .from('stock_issues')
      .insert({
        code,
        sales_order_id: sales_order_id || null,
        warehouse_id,
        issue_date,
        note: note || null,
        status: 'pending',
        tenant_id: tenantId,
      })
      .select('id, code')
      .single()

    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 400 })

    return NextResponse.json(issue, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
