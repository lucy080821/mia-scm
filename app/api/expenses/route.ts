import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET() {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json([])

  const { data, error } = await supabaseAdmin
    .from('expenses')
    .select('id, code, category, description, amount, expense_date, note, created_at')
    .eq('tenant_id', tenantId)
    .order('expense_date', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.category || !body.description || !body.amount || !body.expense_date) {
      return NextResponse.json({ error: 'Thiếu thông tin bắt buộc' }, { status: 400 })
    }
    const tenantId = await getServerTenantId()

    const d = new Date(body.expense_date)
    const prefix = `CP-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    const { count } = await supabaseAdmin.from('expenses').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
    const code = `${prefix}-${String((count ?? 0) + 1).padStart(3, '0')}`

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .insert({
        code,
        category: body.category,
        description: body.description,
        amount: body.amount,
        expense_date: body.expense_date,
        note: body.note || null,
        tenant_id: tenantId,
      })
      .select('id, code')
      .single()

    if (error) {
      console.error('[POST /api/expenses]', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Thiếu id' }, { status: 400 })
    const { error } = await supabaseAdmin.from('expenses').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
