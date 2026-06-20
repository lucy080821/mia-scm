import { NextRequest, NextResponse } from 'next/server'
import { getServerTenantId } from '@/lib/server-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin

  try {
    const tenantId = await getServerTenantId()
    if (tenantId) {
      const { data } = await supabaseAdmin
        .from('tenants')
        .select('logo_url')
        .eq('id', tenantId)
        .single()

      if (data?.logo_url) {
        return NextResponse.redirect(data.logo_url, {
          status: 302,
          headers: { 'Cache-Control': 'no-cache, no-store' },
        })
      }
    }
  } catch {}

  return NextResponse.redirect(`${origin}/mia-logo.png`, {
    status: 302,
    headers: { 'Cache-Control': 'no-cache, no-store' },
  })
}
