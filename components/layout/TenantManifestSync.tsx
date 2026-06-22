'use client'
import { useEffect } from 'react'
import { useTenant } from '@/contexts/TenantContext'

export default function TenantManifestSync() {
  const tenant = useTenant()

  // Title: dùng MutationObserver vì Next.js App Router reset <title> bất đồng bộ sau mỗi navigation
  useEffect(() => {
    if (!tenant?.name || tenant.id === 'default') return

    const name = tenant.name
    const applyTitle = () => { if (document.title !== name) document.title = name }

    applyTitle()

    const observer = new MutationObserver(applyTitle)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [tenant.name, tenant.id])

  // Theme-color, apple title, favicon — chỉ cần set 1 lần khi tenant load, không bị Next.js reset
  useEffect(() => {
    if (!tenant?.name || tenant.id === 'default') return

    let titleMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]')
    if (!titleMeta) {
      titleMeta = document.createElement('meta')
      titleMeta.name = 'apple-mobile-web-app-title'
      document.head.appendChild(titleMeta)
    }
    titleMeta.content = tenant.name

    let themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!themeMeta) {
      themeMeta = document.createElement('meta')
      themeMeta.name = 'theme-color'
      document.head.appendChild(themeMeta)
    }
    themeMeta.content = tenant.primaryColor ?? '#1e2a3a'

    if (tenant.logoUrl) {
      // Cập nhật href của <link rel="icon"> tĩnh thay vì thêm link mới (tránh ambiguity)
      // Cache-buster buộc browser refetch ngay, không dùng favicon cache cũ
      const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      const url = `${tenant.logoUrl}?_t=${Date.now()}`
      if (existing) {
        existing.href = url
      } else {
        const link = document.createElement('link')
        link.rel = 'icon'
        link.href = url
        document.head.appendChild(link)
      }
    }
  }, [tenant.name, tenant.primaryColor, tenant.logoUrl, tenant.id])

  return null
}
