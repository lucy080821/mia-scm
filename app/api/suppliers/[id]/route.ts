import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const tenantId = await getServerTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await req.json()

    const update: Record<string, unknown> = {}
    if (body.name          !== undefined) update.name          = body.name
    if (body.type          !== undefined) update.type          = body.type
    if (body.tax_code      !== undefined) update.tax_code      = body.tax_code || null
    if (body.phone         !== undefined) update.phone         = body.phone || null
    if (body.email         !== undefined) update.email         = body.email || null
    if (body.address       !== undefined) update.address       = body.address || null
    if (body.payment_term  !== undefined) update.payment_term  = body.payment_term
    if (body.delivery_days !== undefined) update.delivery_days = body.delivery_days
    if (body.status        !== undefined) update.status        = body.status
    if (body.rating        !== undefined) update.rating        = body.rating

    const { error } = await supabaseAdmin
      .from('suppliers')
      .update(update)
      .eq('id', id)
      .eq('tenant_id', tenantId)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
