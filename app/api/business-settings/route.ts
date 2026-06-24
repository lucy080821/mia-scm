import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

export async function GET() {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json(null)

  const { data, error } = await supabaseAdmin
    .from('business_settings')
    .select('settings')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error?.message?.includes('does not exist')) return NextResponse.json(null)
  if (error) return NextResponse.json(null)
  return NextResponse.json(data?.settings ?? null)
}

export async function PUT(req: NextRequest) {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const settings = await req.json()

  const { error } = await supabaseAdmin
    .from('business_settings')
    .upsert(
      { tenant_id: tenantId, settings, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id' }
    )

  if (error?.message?.includes('does not exist')) return NextResponse.json({ ok: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
