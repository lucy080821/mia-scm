import { NextRequest, NextResponse } from 'next/server'
import { getServerTenantId } from '@/lib/server-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// Proxy favicon của tenant — không redirect ra ngoài vì browser chặn cross-origin redirect cho favicon
export async function GET(req: NextRequest) {
  const origin = new URL(req.url).origin

  try {
    const tenantId = await getServerTenantId()
    if (tenantId) {
      const { data } = await supabaseAdmin
        .from('tenants').select('logo_url').eq('id', tenantId).single()

      if (data?.logo_url) {
        const imgRes = await fetch(data.logo_url, {
          headers: { 'User-Agent': 'MiaSCM/1.0' },
        })
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') ?? 'image/png'
          const buffer = await imgRes.arrayBuffer()
          return new NextResponse(buffer, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600',
            },
          })
        }
      }
    }
  } catch {}

  return NextResponse.redirect(`${origin}/mia-logo.png`, { status: 302 })
}
