'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveTenant, saveTenantToStorage, loadTenantFromStorage, clearTenantFromStorage, DEFAULT_TENANT } from '@/lib/tenant'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  initials: string
  avatarUrl?: string
  tenantId: string
}

function buildAuthUser(id: string, name: string, email: string, role: string, tenantId: string): AuthUser {
  const initials = name.split(' ').pop()?.charAt(0).toUpperCase() ?? '?'
  const avatarUrl = typeof window !== 'undefined'
    ? (localStorage.getItem('mia_avatar') ?? undefined)
    : undefined
  return { id, name, email, role, initials, avatarUrl, tenantId }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const router = useRouter()

  const loadUser = useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession()
    const session = sessionData.session
    if (!session?.user) { setUser(null); return }
    const u = session.user

    // Dùng API route + supabaseAdmin để bypass RLS — tránh null khi policy chưa set
    const profileRes = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const profile = profileRes.ok ? await profileRes.json() : null
    console.log('[useAuth] profile from /api/me:', profile)
    console.log('[useAuth] user_metadata:', u.user_metadata)

    const name     = profile?.full_name ?? u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? 'User'
    const role     = profile?.role ?? u.user_metadata?.role ?? 'admin'   // DB là source of truth
    const tenantId = profile?.tenant_id ?? u.user_metadata?.tenant_id ?? DEFAULT_TENANT.id
    console.log('[useAuth] final role:', role)

    // Resolve tenant — prefer localStorage so user's saved settings survive a page refresh
    const resolvedTenant = await resolveTenant(tenantId, supabase)
    const storedTenant = loadTenantFromStorage()
    const tenant = (storedTenant?.id === resolvedTenant.id) ? storedTenant : resolvedTenant
    saveTenantToStorage(tenant)
    window.dispatchEvent(new Event('mia:tenant-updated'))

    setUser(buildAuthUser(u.id, name, u.email ?? '', role, tenantId))
  }, [])

  useEffect(() => {
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session?.user) { setUser(null); return }
      loadUser()
    })

    window.addEventListener('mia:profile-updated', loadUser as EventListener)
    window.addEventListener('mia:avatar-updated', loadUser as EventListener)

    return () => {
      subscription.unsubscribe()
      window.removeEventListener('mia:profile-updated', loadUser as EventListener)
      window.removeEventListener('mia:avatar-updated', loadUser as EventListener)
    }
  }, [loadUser])

  const signOut = async () => {
    clearTenantFromStorage()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return { user, signOut }
}
