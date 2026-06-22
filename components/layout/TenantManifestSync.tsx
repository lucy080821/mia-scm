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

    // Dùng /api/favicon (server proxy) thay vì logoUrl trực tiếp vì:
    // 1. Supabase storage URL có thể bị CORS khi dùng làm favicon
    // 2. /api/favicon đọc JWT cookie → fetch logo từ DB → trả về đúng Content-Type
    // Cache-buster buộc browser refetch ngay thay vì dùng favicon cache cũ
    const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    const url = `/api/favicon?_t=${Date.now()}`
    if (existing) {
      existing.href = url
    } else {
      const link = document.createElement('link')
      link.rel = 'icon'
      link.href = url
      document.head.appendChild(link)
    }
  }, [tenant.name, tenant.primaryColor, tenant.logoUrl, tenant.id])

  return null
}
