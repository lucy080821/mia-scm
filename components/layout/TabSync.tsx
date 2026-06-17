'use client'
import { useEffect } from 'react'
import { useTenant } from '@/contexts/TenantContext'

export default function TabSync() {
  const tenant = useTenant()

  useEffect(() => {
    document.title = tenant.name || 'Mia SCM'
  }, [tenant.name])

  useEffect(() => {
    const logoUrl = tenant.logoUrl
    let link = document.getElementById('mia-favicon') as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.id = 'mia-favicon'
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    if (logoUrl) {
      link.type = logoUrl.startsWith('data:image/svg') ? 'image/svg+xml'
        : logoUrl.startsWith('data:image/png') ? 'image/png'
        : 'image/jpeg'
      link.href = logoUrl
    } else {
      link.type = 'image/x-icon'
      link.href = '/favicon.ico'
    }
  }, [tenant.logoUrl])

  return null
}
