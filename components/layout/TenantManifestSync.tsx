'use client'
import { useEffect } from 'react'
import { useTenant } from '@/contexts/TenantContext'

// Cập nhật title, theme-color và favicon theo tenant mỗi khi tenant thay đổi
export default function TenantManifestSync() {
  const tenant = useTenant()

  useEffect(() => {
    if (!tenant?.name || tenant.name === 'Mia SCM' || tenant.name === 'Demo') return

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
  }, [tenant.name, tenant.primaryColor, tenant.logoUrl])

  return null
}
