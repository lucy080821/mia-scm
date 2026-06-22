'use client'
import { useEffect } from 'react'
import { useTenant } from '@/contexts/TenantContext'

export default function TenantManifestSync() {
  const tenant = useTenant()

  // Title: MutationObserver để re-apply sau mỗi navigation (Next.js reset <title> bất đồng bộ)
  useEffect(() => {
    if (!tenant?.name || tenant.id === 'default') return

    const name = tenant.name
    const applyTitle = () => { if (document.title !== name) document.title = name }

    applyTitle()

    const observer = new MutationObserver(applyTitle)
    observer.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [tenant.name, tenant.id])

  // Meta tags (apple title, theme-color)
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
  }, [tenant.name, tenant.primaryColor, tenant.id])

  // Favicon: fetch /api/favicon → blob URL
  // Blob URL là unique mỗi lần → browser không cache → favicon luôn cập nhật
  // QUAN TRỌNG: chỉ xóa link[data-tenant-favicon] (do chúng ta inject),
  // KHÔNG xóa link[rel="icon"] tĩnh của React — sẽ gây lỗi removeChild null
  useEffect(() => {
    if (!tenant?.name || tenant.id === 'default') return

    let blobUrl: string | null = null
    let injectedLink: HTMLLinkElement | null = null

    fetch('/api/favicon')
      .then(r => r.ok ? r.blob() : Promise.reject())
      .then(blob => {
        blobUrl = URL.createObjectURL(blob)
        // Chỉ xóa link do chúng ta đã inject trước đó
        document.querySelectorAll('link[data-tenant-favicon]').forEach(el => el.remove())
        const link = document.createElement('link')
        link.rel = 'icon'
        link.setAttribute('data-tenant-favicon', 'true')
        link.href = blobUrl
        document.head.appendChild(link)
        injectedLink = link
      })
      .catch(() => {})

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      // Safe remove: check parentNode trước để tránh removeChild null
      if (injectedLink?.parentNode) injectedLink.parentNode.removeChild(injectedLink)
    }
  }, [tenant.id])

  return null
}
