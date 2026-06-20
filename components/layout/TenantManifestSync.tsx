'use client'
import { useEffect } from 'react'
import { useTenant } from '@/contexts/TenantContext'

/**
 * Cập nhật các meta tag PWA theo tenant đang đăng nhập:
 *  - theme-color  → màu chủ đạo của công ty
 *  - apple-touch-icon → logo công ty (iOS "Add to Home Screen")
 *  - apple-mobile-web-app-title → tên công ty
 */
export default function TenantManifestSync() {
  const tenant = useTenant()

  useEffect(() => {
    // theme-color
    let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!themeMeta) {
      themeMeta = document.createElement('meta')
      themeMeta.name = 'theme-color'
      document.head.appendChild(themeMeta)
    }
    themeMeta.content = tenant.primaryColor ?? '#1e2a3a'

    // apple-mobile-web-app-title
    let titleMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    if (!titleMeta) {
      titleMeta = document.createElement('meta')
      titleMeta.name = 'apple-mobile-web-app-title'
      document.head.appendChild(titleMeta)
    }
    titleMeta.content = tenant.name ?? 'Mia SCM'

    if (tenant.logoUrl) {
      // favicon
      let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (!favicon) {
        favicon = document.createElement('link')
        favicon.rel = 'icon'
        document.head.appendChild(favicon)
      }
      favicon.href = tenant.logoUrl

      // apple-touch-icon
      let appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
      if (!appleIcon) {
        appleIcon = document.createElement('link')
        appleIcon.rel = 'apple-touch-icon'
        document.head.appendChild(appleIcon)
      }
      appleIcon.href = tenant.logoUrl
    }
  }, [tenant.primaryColor, tenant.logoUrl, tenant.name])

  return null
}
