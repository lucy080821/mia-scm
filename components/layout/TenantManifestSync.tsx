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

  // Meta tags
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

  // Favicon: dùng data URL để bypass browser favicon cache hoàn toàn
  useEffect(() => {
    if (!tenant?.name || tenant.id === 'default') return

    fetch(`/api/favicon?_fv=${tenant.id}`)
      .then(r => r.ok ? r.blob() : null)
      .then(blob => {
        if (!blob) return
        const reader = new FileReader()
        reader.onload = () => {
          document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]').forEach(el => el.remove())
          const link = document.createElement('link')
          link.rel = 'icon'
          link.href = reader.result as string
          document.head.appendChild(link)
        }
        reader.readAsDataURL(blob)
      })
      .catch(() => {})
  }, [tenant.id])

  return null
}
