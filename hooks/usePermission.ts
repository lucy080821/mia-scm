'use client'
import { useAuth } from './useAuth'
import { hasPermission, canAccessModule, type Permission, type Role } from '@/lib/permissions'

export function usePermission() {
  const { user } = useAuth()
  const role = (user?.role ?? 'sales') as Role

  return {
    can: (p: Permission) => user ? hasPermission(role, p) : false,
    canAccess: (m: string) => user ? canAccessModule(role, m) : false,
    role,
  }
}
