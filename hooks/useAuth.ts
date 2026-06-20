'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveTenant, saveTenantToStorage, loadTenantFromStorage, clearTenantFromStorage, clearTenantCache, DEFAULT_TENANT } from '@/lib/tenant'

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
    ? (localStorage.getItem(`mia_avatar_${id}`) ?? undefined)
    : undefined
  return { id, name, email, role, initials, avatarUrl, tenantId }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const router = useRouter()

  const loadUser = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData.session
      if (!session?.user) { setUser(null); return }
      const u = session.user

      // Dùng API route + supabaseAdmin để bypass RLS — tránh null khi policy chưa set
      const profileRes = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const profile = profileRes.ok ? await profileRes.json() : null

      const name     = profile?.full_name ?? u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? 'User'
      const role     = profile?.role ?? u.user_metadata?.role ?? 'admin'
      const tenantId = profile?.tenant_id ?? u.user_metadata?.tenant_id ?? DEFAULT_TENANT.id

      // Sync role vào user_metadata để middleware đọc được đúng role
      if (role !== u.user_metadata?.role) {
        supabase.auth.updateUser({ data: { role } })
      }

      // Resolve tenant và lưu vào localStorage để TenantContext đọc được
      const resolvedTenant = await resolveTenant(tenantId, supabase)
      const storedTenant = loadTenantFromStorage()
      // Chỉ dùng storedTenant nếu id khớp — tránh dùng stale data của tenant khác
      const tenant = (storedTenant?.id === resolvedTenant.id) ? storedTenant : resolvedTenant
      saveTenantToStorage(tenant)
      window.dispatchEvent(new Event('mia:tenant-updated'))

      setUser(buildAuthUser(u.id, name, u.email ?? '', role, tenantId))
    } catch {
      // Nếu lỗi bất kỳ, vẫn dispatch event để TenantContext có thể re-fetch từ server
      window.dispatchEvent(new Event('mia:tenant-updated'))
    }
  }, [])

  useEffect(() => {
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) { setUser(null); return }
      // Xóa cache khi switch account để tránh serve tenant cũ từ in-memory cache
      if (event === 'SIGNED_IN') clearTenantCache()
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
