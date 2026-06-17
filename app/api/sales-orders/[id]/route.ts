import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    const { error } = await supabaseAdmin
      .from('sales_orders')
      .update(body)
      .eq('id', id)

    if (error) {
      console.error('[PATCH /api/sales-orders/[id]]:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[PATCH /api/sales-orders/[id]] uncaught:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
