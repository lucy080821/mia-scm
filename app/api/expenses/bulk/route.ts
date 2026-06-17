import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const { rows } = await req.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Không có dòng dữ liệu' }, { status: 400 })
    }

    const prefixes = rows.map((r: any) => {
      const d = new Date(r.expense_date)
      return `CP-${d.getFullYear().toString().slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    })

    const uniquePrefixes = [...new Set(prefixes)]
    const counters = new Map<string, number>()
    for (const prefix of uniquePrefixes) {
      const { count } = await supabaseAdmin
        .from('expenses')
        .select('id', { count: 'exact', head: true })
        .like('code', `${prefix}-%`)
      counters.set(prefix, count ?? 0)
    }

    const records = rows.map((r: any, i: number) => {
      const prefix = prefixes[i]
      const n = (counters.get(prefix) ?? 0) + 1
      counters.set(prefix, n)
      return {
        code: `${prefix}-${String(n).padStart(3, '0')}`,
        category: r.category,
        description: r.description,
        amount: Number(r.amount),
        expense_date: r.expense_date,
        note: r.note || null,
      }
    })

    const { data, error } = await supabaseAdmin
      .from('expenses')
      .insert(records)
      .select('id, code')

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ inserted: data?.length ?? 0, rows: data }, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
