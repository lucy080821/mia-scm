import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export const dynamic = 'force-dynamic'

type Period = 'day' | 'week' | 'month' | 'quarter' | 'year'

function startOf(period: Period): string {
  const now = new Date()
  switch (period) {
    case 'day': {
      const d = new Date(now); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10)
    }
    case 'week': {
      const d = new Date(now); d.setDate(d.getDate() - 83); return d.toISOString().slice(0, 10)
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    }
    case 'quarter': {
      const d = new Date(now.getFullYear() - 2, 0, 1); return `${d.getFullYear()}-01-01`
    }
    case 'year': {
      return `${now.getFullYear() - 4}-01-01`
    }
  }
}

export async function GET(req: NextRequest) {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json({ data: [] })

  const period = (req.nextUrl.searchParams.get('period') ?? 'month') as Period
  const from = startOf(period)
  const now = new Date()

  const { data: orders } = await supabaseAdmin
    .from('sales_orders')
    .select('order_date, final_amount')
    .eq('tenant_id', tenantId)
    .eq('status', 'completed')
    .gte('order_date', from)
    .order('order_date')

  const rows = orders ?? []
  const points: { label: string; revenue: number }[] = []

  if (period === 'day') {
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      const dateStr = d.toISOString().slice(0, 10)
      const label = `${d.getDate()}/${d.getMonth() + 1}`
      const revenue = rows.filter(o => o.order_date === dateStr).reduce((s, o) => s + (o.final_amount ?? 0), 0)
      points.push({ label, revenue })
    }
  } else if (period === 'week') {
    for (let i = 11; i >= 0; i--) {
      const wEnd = new Date(now); wEnd.setDate(wEnd.getDate() - i * 7)
      const wStart = new Date(wEnd); wStart.setDate(wStart.getDate() - 6)
      const wStartStr = wStart.toISOString().slice(0, 10)
      const wEndStr = wEnd.toISOString().slice(0, 10)
      const label = `T${wStart.getDate()}/${wStart.getMonth() + 1}`
      const revenue = rows.filter(o => o.order_date >= wStartStr && o.order_date <= wEndStr).reduce((s, o) => s + (o.final_amount ?? 0), 0)
      points.push({ label, revenue })
    }
  } else if (period === 'month') {
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const mStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1)
      const mEnd = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
      const label = `T${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`
      const revenue = rows.filter(o => o.order_date >= mStart && o.order_date < mEnd).reduce((s, o) => s + (o.final_amount ?? 0), 0)
      points.push({ label, revenue })
    }
  } else if (period === 'quarter') {
    for (let i = 7; i >= 0; i--) {
      const totalQ = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3) - i
      const year = Math.floor(totalQ / 4)
      const q = totalQ % 4
      const qStart = `${year}-${String(q * 3 + 1).padStart(2, '0')}-01`
      const nextQ = q === 3 ? `${year + 1}-01-01` : `${year}-${String((q + 1) * 3 + 1).padStart(2, '0')}-01`
      const label = `Q${q + 1}/${String(year).slice(2)}`
      const revenue = rows.filter(o => o.order_date >= qStart && o.order_date < nextQ).reduce((s, o) => s + (o.final_amount ?? 0), 0)
      points.push({ label, revenue })
    }
  } else if (period === 'year') {
    for (let i = 4; i >= 0; i--) {
      const year = now.getFullYear() - i
      const yStart = `${year}-01-01`
      const yEnd = `${year + 1}-01-01`
      const label = `${year}`
      const revenue = rows.filter(o => o.order_date >= yStart && o.order_date < yEnd).reduce((s, o) => s + (o.final_amount ?? 0), 0)
      points.push({ label, revenue })
    }
  }

  return NextResponse.json({ data: points })
}
