'use client'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useTenant } from '@/contexts/TenantContext'

// Cập nhật title, theme-color và favicon theo tenant mỗi khi tenant thay đổi
// Cần usePathname trong deps vì Next.js App Router reset <title> từ metadata tĩnh sau mỗi navigation
export default function TenantManifestSync() {
  const tenant = useTenant()
  const pathname = usePathname()

  useEffect(() => {
    // tenant.id === 'default' là DEFAULT_TENANT (Mia platform), không phải tenant thật
    if (!tenant?.name || tenant.id === 'default') return

    // Tab title
    document.title = tenant.name

    // Apple web app title
    let titleMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    if (!titleMeta) {
      titleMeta = document.createElement('meta')
      titleMeta.name = 'apple-mobile-web-app-title'
      document.head.appendChild(titleMeta)
    }
    titleMeta.content = tenant.name

    // Theme color
    let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!themeMeta) {
      themeMeta = document.createElement('meta')
      themeMeta.name = 'theme-color'
      document.head.appendChild(themeMeta)
    }
    themeMeta.content = tenant.primaryColor ?? '#1e2a3a'

    // Favicon — inject client-side once logo URL is known, overrides static /api/favicon
    if (tenant.logoUrl) {
      // Remove old tenant favicon if exists
      document.querySelectorAll('link[data-tenant-favicon]').forEach(el => el.remove())

      const link = document.createElement('link')
      link.rel = 'icon'
      link.setAttribute('data-tenant-favicon', 'true')
      link.href = tenant.logoUrl
      link.type = 'image/png'
      document.head.appendChild(link)
    }
  // pathname trong deps đảm bảo re-apply sau mỗi navigation (Next.js reset title từ metadata tĩnh)
  }, [tenant.name, tenant.primaryColor, tenant.logoUrl, tenant.id, pathname])

  return null
}
