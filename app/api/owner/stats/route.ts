import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function requireOwner(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabaseAdmin
    .from('users').select('role, tenant_id').eq('id', user.id).single()
  if (!profile || profile.role !== 'owner') return null
  return { userId: user.id, ...profile }
}

export async function GET(req: NextRequest) {
  const caller = await requireOwner(req)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get all non-platform tenants
  const { data: tenants, error: tenantsError } = await supabaseAdmin
    .from('tenants')
    .select('id, name, plan, created_at')
    .eq('is_platform', false)
    .order('created_at', { ascending: false })

  if (tenantsError) return NextResponse.json({ error: tenantsError.message }, { status: 500 })
  if (!tenants || tenants.length === 0) return NextResponse.json([])

  // Get last_sign_in_at from auth admin
  const { data: authUsersData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  const authUsers = authUsersData?.users ?? []
  const authSignInMap = new Map<string, string | null>()
  for (const u of authUsers) {
    authSignInMap.set(u.id, u.last_sign_in_at ?? null)
  }

  // Get all users with tenant_id
  const { data: allUsers } = await supabaseAdmin
    .from('users')
    .select('id, tenant_id')

  // Build map: tenant_id -> latest last_sign_in_at
  const tenantLastActivity = new Map<string, string | null>()
  for (const u of allUsers ?? []) {
    const signIn = authSignInMap.get(u.id) ?? null
    if (!signIn) continue
    const current = tenantLastActivity.get(u.tenant_id)
    if (!current || new Date(signIn) > new Date(current)) {
      tenantLastActivity.set(u.tenant_id, signIn)
    }
  }

  // Start of current month
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Parallel queries per tenant
  const stats = await Promise.all(
    tenants.map(async (tenant) => {
      const [
        { count: userCount },
        { count: productCount },
        { count: customerCount },
        { count: ordersThisMonth },
        { count: warehouseCount },
        { count: inventoryCount },
      ] = await Promise.all([
        supabaseAdmin.from('users').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        supabaseAdmin.from('products').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        supabaseAdmin.from('customers').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        supabaseAdmin.from('sales_orders').select('*', { count: 'exact', head: true })
          .eq('tenant_id', tenant.id)
          .gte('created_at', startOfMonth),
        supabaseAdmin.from('warehouses').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
        supabaseAdmin.from('inventory').select('*', { count: 'exact', head: true }).eq('tenant_id', tenant.id),
      ])

      const checks = [
        (userCount ?? 0) > 1,
        (productCount ?? 0) > 0,
        (customerCount ?? 0) > 0,
        (warehouseCount ?? 0) > 0,
        (ordersThisMonth ?? 0) > 0,
      ]
      const onboardingScore = Math.round((checks.filter(Boolean).length / 5) * 100)

      return {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan ?? 'starter',
        userCount: userCount ?? 0,
        productCount: productCount ?? 0,
        customerCount: customerCount ?? 0,
        ordersThisMonth: ordersThisMonth ?? 0,
        warehouseCount: warehouseCount ?? 0,
        hasInventory: (inventoryCount ?? 0) > 0,
        lastActivity: tenantLastActivity.get(tenant.id) ?? null,
        onboardingScore,
      }
    })
  )

  return NextResponse.json(stats)
}
