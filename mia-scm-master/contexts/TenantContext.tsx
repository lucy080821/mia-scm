'use client'
import { createContext, useContext, useState, useEffect } from 'react'
import { TenantConfig, DEFAULT_TENANT, loadTenantFromStorage } from '@/lib/tenant'

const TenantContext = createContext<{
  tenant: TenantConfig
  setTenant: (t: TenantConfig) => void
}>({ tenant: DEFAULT_TENANT, setTenant: () => {} })

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<TenantConfig>(DEFAULT_TENANT)

  // Load from localStorage only on client (avoids SSR hydration mismatch)
  useEffect(() => {
    const stored = loadTenantFromStorage()
    if (stored) setTenant(stored)
  }, [])

  // Sync if storage changes (e.g. admin updates company info)
  useEffect(() => {
    const handler = () => {
      const t = loadTenantFromStorage()
      if (t) setTenant(t)
    }
    window.addEventListener('mia:tenant-updated', handler)
    return () => window.removeEventListener('mia:tenant-updated', handler)
  }, [])

  return (
    <TenantContext.Provider value={{ tenant, setTenant }}>
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
