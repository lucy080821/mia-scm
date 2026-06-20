'use client'
import { createContext, useContext, useState, useEffect } from 'react'
import {
  TenantConfig, DEFAULT_TENANT,
  loadTenantFromStorage, saveTenantToStorage, clearTenantFromStorage,
} from '@/lib/tenant'

const TenantContext = createContext<{
  tenant: TenantConfig
  setTenant: (t: TenantConfig) => void
}>({ tenant: DEFAULT_TENANT, setTenant: () => {} })

const FONT_GOOGLE_MAP: Record<string, string> = {
  'be-vietnam-pro': 'Be+Vietnam+Pro',
  'roboto':         'Roboto',
  'nunito':         'Nunito',
}

const FONT_FAMILY_MAP: Record<string, string> = {
  'inter':          "'Inter', -apple-system, sans-serif",
  'be-vietnam-pro': "'Be Vietnam Pro', sans-serif",
  'roboto':         "'Roboto', sans-serif",
  'nunito':         "'Nunito', sans-serif",
}

const FONT_SIZE_MAP: Record<string, string> = {
  sm: '13px',
  md: '14px',
  lg: '16px',
}

function applyTheme(tenant: TenantConfig) {
  if (typeof document === 'undefined') return
  const root = document.documentElement

  // Font family
  const fontKey = tenant.themeConfig?.fontFamily ?? 'inter'
  const fontFamily = FONT_FAMILY_MAP[fontKey] ?? FONT_FAMILY_MAP.inter
  root.style.setProperty('--mia-font', fontFamily)

  // Load Google Font via <link> if not Inter (Inter is loaded by system)
  const googleFont = FONT_GOOGLE_MAP[fontKey]
  if (googleFont) {
    const linkId = `mia-gfont-${fontKey}`
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link')
      link.id = linkId
      link.rel = 'stylesheet'
      link.href = `https://fonts.googleapis.com/css2?family=${googleFont}:wght@400;500;600;700&display=swap`
      document.head.appendChild(link)
    }
  }

  // Font size
  const fontSize = FONT_SIZE_MAP[tenant.themeConfig?.fontSize ?? 'md'] ?? '14px'
  root.style.setProperty('--mia-font-size', fontSize)

  // Primary color
  root.style.setProperty('--mia-primary', tenant.primaryColor ?? '#0ea5e9')
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenantState] = useState<TenantConfig>(DEFAULT_TENANT)

  const applyTenant = (t: TenantConfig) => {
    saveTenantToStorage(t)
    setTenantState(t)
    applyTheme(t)
  }

  // Bước 1: Optimistic load từ localStorage (fast initial render)
  // Bước 2: Validate với server — /api/my-tenant dùng supabaseAdmin, luôn trả về đúng tenant
  useEffect(() => {
    const stored = loadTenantFromStorage()
    if (stored) {
      setTenantState(stored)
      applyTheme(stored)
    }

    fetch('/api/my-tenant', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then((data: TenantConfig | null) => {
        if (!data) {
          clearTenantFromStorage()
          setTenantState(DEFAULT_TENANT)
          applyTheme(DEFAULT_TENANT)
          return
        }
        applyTenant(data)
      })
      .catch(() => {})
  }, [])

  // Sync khi useAuth hoặc settings cập nhật tenant
  useEffect(() => {
    const handler = () => {
      const t = loadTenantFromStorage()
      if (t) {
        setTenantState(t)
        applyTheme(t)
      }
    }
    window.addEventListener('mia:tenant-updated', handler)
    return () => window.removeEventListener('mia:tenant-updated', handler)
  }, [])

  // Cross-tab sync
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== 'mia_tenant') return
      if (!e.newValue) {
        setTenantState(DEFAULT_TENANT)
        applyTheme(DEFAULT_TENANT)
      } else {
        try {
          const t = JSON.parse(e.newValue) as TenantConfig
          setTenantState(t)
          applyTheme(t)
        } catch {}
      }
    }
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])

  return (
    <TenantContext.Provider value={{ tenant, setTenant: applyTenant }}>
      {children}
    </TenantContext.Provider>
  )
}

export function useTenant() {
  return useContext(TenantContext).tenant
}

export function useTenantUpdater() {
  return useContext(TenantContext).setTenant
}
