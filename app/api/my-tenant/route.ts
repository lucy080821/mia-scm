import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'
import { DEFAULT_DASHBOARD_WIDGETS } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

export async function GET() {
  const tenantId = await getServerTenantId()
  if (!tenantId) return NextResponse.json(null)

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, logo_url, primary_color, enabled_modules, plan, address, phone, tax_code, is_platform, theme_config, dashboard_config')
    .eq('id', tenantId)
    .single()

  if (error || !data) return NextResponse.json(null)

  return NextResponse.json({
    id:               data.id,
    slug:             data.slug ?? data.id,
    name:             data.name,
    logoUrl:          data.logo_url ?? undefined,
    primaryColor:     data.primary_color ?? '#0ea5e9',
    enabledModules:   data.enabled_modules ?? ['ban-hang', 'kho-hang', 'logistics', 'mua-hang', 'tai-chinh', 'bao-cao'],
    plan:             data.plan ?? 'starter',
    address:          data.address ?? undefined,
    phone:            data.phone ?? undefined,
    taxCode:          data.tax_code ?? undefined,
    isPlatform:       data.is_platform ?? false,
    themeConfig:      data.theme_config ?? {},
    dashboardWidgets: data.dashboard_config ?? DEFAULT_DASHBOARD_WIDGETS,
  })
}
