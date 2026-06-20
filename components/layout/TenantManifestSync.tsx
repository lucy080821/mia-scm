'use client'
import { useEffect } from 'react'
import { useTenant } from '@/contexts/TenantContext'

// Cập nhật theme-color và tên app theo tenant — icon/favicon đã được phục vụ qua /api/favicon và /api/logo
export default function TenantManifestSync() {
  const tenant = useTenant()

  useEffect(() => {
    let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!themeMeta) {
      themeMeta = document.createElement('meta')
      themeMeta.name = 'theme-color'
      document.head.appendChild(themeMeta)
    }
    themeMeta.content = tenant.primaryColor ?? '#1e2a3a'

    let titleMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    if (!titleMeta) {
      titleMeta = document.createElement('meta')
      titleMeta.name = 'apple-mobile-web-app-title'
      document.head.appendChild(titleMeta)
    }
    titleMeta.content = tenant.name ?? 'Mia SCM'
  }, [tenant.primaryColor, tenant.name])

  return null
}
