import { NextResponse } from 'next/server'
import { getServerTenantId } from '@/lib/server-auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

function mimeFromUrl(url: string): string {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    webp: 'image/webp', svg: 'image/svg+xml', gif: 'image/gif',
    avif: 'image/avif',
  }
  return map[ext ?? ''] ?? 'image/png'
}

export async function GET() {
  let name = 'Mia SCM'
  let shortName = 'Mia SCM'
  let themeColor = '#1e2a3a'
  let logoUrl: string | null = null

  try {
    const tenantId = await getServerTenantId()
    if (tenantId) {
      const { data } = await supabaseAdmin
        .from('tenants')
        .select('name, logo_url, primary_color')
        .eq('id', tenantId)
        .single()

      if (data) {
        name      = data.name ?? 'Mia SCM'
        shortName = data.name ?? 'Mia SCM'
        themeColor = data.primary_color ?? '#1e2a3a'
        logoUrl   = data.logo_url ?? null
      }
    }
  } catch {}

  const icons: Array<{ src: string; sizes: string; type: string; purpose: string }> = []

  // Dùng /api/logo để proxy — tránh CDN bên ngoài chặn hotlink khi Chrome tải icon PWA
  if (logoUrl) {
    icons.push({ src: '/api/logo', sizes: '192x192', type: 'image/png', purpose: 'any' })
    icons.push({ src: '/api/logo', sizes: '512x512', type: 'image/png', purpose: 'any' })
    icons.push({ src: '/api/logo', sizes: '512x512', type: 'image/png', purpose: 'maskable' })
  }

  // Fallback icon Mia SCM
  icons.push({ src: '/mia-logo.png', sizes: '192x192', type: 'image/png', purpose: 'any' })
  icons.push({ src: '/mia-logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' })
  icons.push({ src: '/mia-logo.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' })

  const manifest = {
    name,
    short_name: shortName,
    description: 'Hệ thống quản lý chuỗi cung ứng thông minh cho nhà phân phối FMCG',
    start_url:  '/dashboard',
    scope:      '/',
    display:    'standalone',
    background_color: '#f0f2f5',
    theme_color: themeColor,
    orientation: 'any',
    lang: 'vi',
    categories: ['business', 'productivity'],
    icons,
  }

  return new NextResponse(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/manifest+json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
