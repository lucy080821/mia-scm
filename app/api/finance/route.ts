import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

// Returns financial summary: monthly P&L, revenue orders, expenses, debts
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') ?? 'monthly'

  if (type === 'monthly') {
    // Monthly aggregation for the last 12 months
    const now = new Date()
    const months: { key: string; label: string; start: string; end: string }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const nextM = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const end   = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, '0')}-01`
      months.push({ key: start.slice(0, 7), label: `T${d.getMonth() + 1}/${d.getFullYear()}`, start, end })
    }

    // Fetch all completed sales orders in this period
    const { data: orders } = await supabaseAdmin
      .from('sales_orders')
      .select('id, order_date, final_amount')
      .eq('status', 'completed')
      .gte('order_date', months[0].start)

    // Fetch COGS: order items with product purchase prices for completed orders
    const completedOrderIds = (orders ?? []).map((o: any) => o.id)
    const { data: orderItems } = completedOrderIds.length > 0
      ? await supabaseAdmin
          .from('sales_order_items')
          .select('order_id, quantity, product:products(purchase_price)')
          .in('order_id', completedOrderIds)
      : { data: [] }

    const orderDateMap: Record<string, string> = {}
    ;(orders ?? []).forEach((o: any) => { orderDateMap[o.id] = o.order_date })

    // Fetch expenses
    const { data: expenses } = await supabaseAdmin
      .from('expenses')
      .select('expense_date, amount, category')
      .gte('expense_date', months[0].start)

    // Fetch delivery freight costs
    const { data: deliveries } = await supabaseAdmin
      .from('deliveries')
      .select('actual_date, planned_date, freight_cost')
      .eq('status', 'delivered')
      .gte('actual_date', months[0].start)

    const monthly = months.map(m => {
      const revenue = (orders ?? [])
        .filter((o: any) => o.order_date >= m.start && o.order_date < m.end)
        .reduce((s: number, o: any) => s + (o.final_amount ?? 0), 0)

      const monthExpenses = (expenses ?? []).filter((e: any) => e.expense_date >= m.start && e.expense_date < m.end)
      const logistics = (deliveries ?? [])
        .filter((d: any) => {
          const date = d.actual_date ?? d.planned_date
          return date && date >= m.start && date < m.end
        })
        .reduce((s: number, d: any) => s + (d.freight_cost ?? 0), 0)
      const warehouse = monthExpenses.filter((e: any) => e.category === 'warehouse_rent').reduce((s: number, e: any) => s + e.amount, 0)
      const salary    = monthExpenses.filter((e: any) => e.category === 'salary').reduce((s: number, e: any) => s + e.amount, 0)
      const other     = monthExpenses.filter((e: any) => !['warehouse_rent', 'salary', 'fuel'].includes(e.category)).reduce((s: number, e: any) => s + e.amount, 0)
      const fuel      = monthExpenses.filter((e: any) => e.category === 'fuel').reduce((s: number, e: any) => s + e.amount, 0)
      const cogs = (orderItems ?? []).reduce((sum: number, item: any) => {
        const orderDate = orderDateMap[item.order_id]
        if (!orderDate || orderDate < m.start || orderDate >= m.end) return sum
        const price = (item.product as any)?.purchase_price ?? 0
        return sum + (item.quantity * price)
      }, 0)

      return { month: m.label, key: m.key, revenue, cogs, logistics: logistics + fuel, warehouse, salary, other }
    })

    return NextResponse.json(monthly)
  }

  if (type === 'orders') {
    // Revenue orders list
    const { data } = await supabaseAdmin
      .from('sales_orders')
      .select('id, code, order_date, status, payment_status, final_amount, customer:customers(name)')
      .in('status', ['completed', 'delivering', 'confirmed', 'picking', 'picked', 'pending_ship'])
      .order('order_date', { ascending: false })
      .limit(200)

    const orders = (data ?? []).map((o: any) => ({
      id: o.id,
      code: o.code,
      date: o.order_date,
      customer: o.customer?.name ?? '—',
      amount: o.final_amount ?? 0,
      paymentStatus: o.payment_status ?? 'unpaid',
      status: o.status,
    }))
    return NextResponse.json(orders)
  }

  if (type === 'expenses') {
    // Expenses list with categories
    const { data } = await supabaseAdmin
      .from('expenses')
      .select('id, code, expense_date, category, description, amount, note')
      .order('expense_date', { ascending: false })
      .limit(200)
    return NextResponse.json(data ?? [])
  }

  if (type === 'receivables') {
    // Customer debts: sum(sales_orders.final_amount) - sum(customer_payments.amount)
    const { data: orders } = await supabaseAdmin
      .from('sales_orders')
      .select('customer_id, final_amount, order_date, payment_status, code, customer:customers(name, phone)')
      .in('status', ['completed', 'delivering'])
      .neq('payment_status', 'paid')

    const { data: payments } = await supabaseAdmin
      .from('customer_payments')
      .select('customer_id, amount')

    const paymentMap: Record<string, number> = {}
    ;(payments ?? []).forEach((p: any) => {
      paymentMap[p.customer_id] = (paymentMap[p.customer_id] ?? 0) + p.amount
    })

    // Group by customer
    const byCustomer: Record<string, any> = {}
    ;(orders ?? []).forEach((o: any) => {
      const cid = o.customer_id
      if (!byCustomer[cid]) {
        byCustomer[cid] = {
          customerId: cid,
          customer: o.customer?.name ?? '—',
          phone: o.customer?.phone ?? '',
          totalOrders: 0,
          paid: paymentMap[cid] ?? 0,
          oldestDate: o.order_date,
        }
      }
      byCustomer[cid].totalOrders += o.final_amount ?? 0
      if (o.order_date < byCustomer[cid].oldestDate) byCustomer[cid].oldestDate = o.order_date
    })

    const receivables = Object.values(byCustomer).map((c: any) => ({
      ...c,
      debt: Math.max(0, c.totalOrders - c.paid),
    })).filter((c: any) => c.debt > 0)

    return NextResponse.json(receivables)
  }

  if (type === 'payables') {
    // Supplier debts: sum(purchase_orders.total_amount) - sum(supplier_payments.amount)
    const { data: orders } = await supabaseAdmin
      .from('purchase_orders')
      .select('supplier_id, total_amount, order_date, code, supplier:suppliers(name, phone)')
      .in('status', ['completed', 'delivering', 'sent'])

    const { data: payments } = await supabaseAdmin
      .from('supplier_payments')
      .select('supplier_id, amount')

    const paymentMap: Record<string, number> = {}
    ;(payments ?? []).forEach((p: any) => {
      paymentMap[p.supplier_id] = (paymentMap[p.supplier_id] ?? 0) + p.amount
    })

    const bySupplier: Record<string, any> = {}
    ;(orders ?? []).forEach((o: any) => {
      const sid = o.supplier_id
      if (!bySupplier[sid]) {
        bySupplier[sid] = {
          supplierId: sid,
          supplier: o.supplier?.name ?? '—',
          phone: o.supplier?.phone ?? '',
          totalOrders: 0,
          paid: paymentMap[sid] ?? 0,
          oldestDate: o.order_date,
        }
      }
      bySupplier[sid].totalOrders += o.total_amount ?? 0
      if (o.order_date < bySupplier[sid].oldestDate) bySupplier[sid].oldestDate = o.order_date
    })

    const payables = Object.values(bySupplier).map((s: any) => ({
      ...s,
      debt: Math.max(0, s.totalOrders - s.paid),
    })).filter((s: any) => s.debt > 0)

    return NextResponse.json(payables)
  }

  return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
}

// POST /api/finance — record a customer or supplier payment
export async function POST(req: NextRequest) {
  const { type, entityId, amount, paymentDate, method, note } = await req.json()

  if (!type || !entityId || !amount || !paymentDate)
    return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
  const tenantId = await getServerTenantId()

  const d   = new Date(paymentDate)
  const ds  = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const seq = String(Math.floor(Math.random() * 900) + 100)

  if (type === 'customer') {
    const code = `TT-${ds}-${seq}`
    const { error } = await supabaseAdmin.from('customer_payments').insert({
      code,
      customer_id:  entityId,
      amount:       Number(amount),
      payment_date: paymentDate,
      method:       method ?? 'transfer',
      note:         note || null,
      tenant_id:    tenantId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ code })
  }

  if (type === 'supplier') {
    const code = `TTNCC-${ds}-${seq}`
    const { error } = await supabaseAdmin.from('supplier_payments').insert({
      code,
      supplier_id:       entityId,
      amount:            Number(amount),
      payment_date:      paymentDate,
      method:            method ?? 'transfer',
      note:              note || null,
      tenant_id:         tenantId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ code })
  }

  return NextResponse.json({ error: 'Loại không hợp lệ' }, { status: 400 })
}
