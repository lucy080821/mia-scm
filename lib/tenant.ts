export interface TenantConfig {
  id: string
  name: string
  slug: string
  logoUrl?: string
  primaryColor: string
  enabledModules: string[]
  plan: 'starter' | 'growth' | 'enterprise' | 'basic' | 'pro'
  address?: string
  phone?: string
  taxCode?: string
  isPlatform?: boolean  // true = chủ app, false = công ty khách hàng
}

export const DEFAULT_TENANT: TenantConfig = {
  id: 'default',
  name: 'Mia SCM',
  slug: 'mia-scm',
  primaryColor: '#0ea5e9',
  enabledModules: ['ban-hang', 'kho-hang', 'logistics', 'mua-hang', 'tai-chinh', 'bao-cao'],
  plan: 'enterprise',
  isPlatform: true,
}

// Mock tenants — replaced by Supabase query when DB is live
export const MOCK_TENANTS: Record<string, TenantConfig> = {
  't1': {
    id: 't1', slug: 'cong-ty-abc', name: 'Công ty TNHH ABC',
    primaryColor: '#0ea5e9', plan: 'pro',
    enabledModules: ['ban-hang', 'kho-hang', 'logistics', 'mua-hang', 'tai-chinh', 'bao-cao'],
    address: '123 Nguyễn Huệ, Q.1, TP.HCM', phone: '028 3822 1234', taxCode: '0301234567',
  },
  't2': {
    id: 't2', slug: 'phan-phoi-mien-trung', name: 'Phân phối Miền Trung',
    primaryColor: '#10b981', plan: 'basic',
    enabledModules: ['ban-hang', 'kho-hang', 'logistics', 'mua-hang'],
    address: '45 Trần Phú, Đà Nẵng', phone: '0236 382 5678', taxCode: '0400987654',
  },
}

const STORAGE_KEY = 'mia_tenant'

export function saveTenantToStorage(tenant: TenantConfig) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tenant))
  }
}

export function loadTenantFromStorage(): TenantConfig | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function clearTenantFromStorage() {
  if (typeof window !== 'undefined') localStorage.removeItem(STORAGE_KEY)
}

// In-memory cache để tránh gọi Supabase nhiều lần trong 1 session
const _tenantCache = new Map<string, TenantConfig>()

/** Resolve tenant từ cache → localStorage → Supabase → fallback */
export async function resolveTenant(tenantId: string | null | undefined, supabase: any): Promise<TenantConfig> {
  if (!tenantId) return DEFAULT_TENANT

  // 1. In-memory cache (tránh gọi lặp lại trong cùng session)
  if (_tenantCache.has(tenantId)) return _tenantCache.get(tenantId)!

  // 2. localStorage (survive page refresh)
  const stored = loadTenantFromStorage()
  if (stored && stored.id === tenantId) {
    _tenantCache.set(tenantId, stored)
    return stored
  }

  // 3. Supabase (chỉ gọi 1 lần, nếu lỗi thì không retry)
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('id, slug, name, logo_url, primary_color, enabled_modules, plan, address, phone, tax_code, is_platform')
      .eq('id', tenantId)
      .single()

    if (!error && data) {
      const tenant: TenantConfig = {
        id: data.id, slug: data.slug, name: data.name,
        logoUrl: data.logo_url, primaryColor: data.primary_color ?? '#0ea5e9',
        enabledModules: data.enabled_modules ?? DEFAULT_TENANT.enabledModules,
        plan: data.plan ?? 'basic',
        address: data.address, phone: data.phone, taxCode: data.tax_code,
        isPlatform: data.is_platform ?? false,
      }
      _tenantCache.set(tenantId, tenant)
      saveTenantToStorage(tenant)
      return tenant
    }
  } catch { /* tenants table chưa có RLS — bỏ qua, dùng fallback */ }

  // 4. Fallback — dùng mock hoặc default, cache lại để không retry
  const fallback = MOCK_TENANTS[tenantId] ?? DEFAULT_TENANT
  _tenantCache.set(tenantId, fallback)
  return fallback
}
