import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getServerId(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const client = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user } } = await client.auth.getUser()
    return user?.id ?? null
  } catch { return null }
}

// GET ?profile_id=xxx  → warehouses assigned to that profile
// GET (no params)      → warehouses assigned to current user
export async function GET(req: NextRequest) {
  try {
    const tenantId = await getServerTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const profileId = url.searchParams.get('profile_id')

    // If no profile_id, return assignments for current user
    const targetId = profileId ?? await getServerId()
    if (!targetId) return NextResponse.json([], { status: 200 })

    const { data, error } = await supabaseAdmin
      .from('employee_warehouses')
      .select('id, warehouse_id, warehouses(id, name)')
      .eq('profile_id', targetId)
      .eq('tenant_id', tenantId)

    if (error) {
      // Table doesn't exist yet — return empty gracefully
      if (error.code === '42P01') return NextResponse.json([], { status: 200 })
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data ?? [])
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// POST { profile_id, warehouse_id } → assign warehouse to profile
export async function POST(req: NextRequest) {
  try {
    const tenantId = await getServerTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { profile_id, warehouse_id } = await req.json()
    if (!profile_id || !warehouse_id) {
      return NextResponse.json({ error: 'Thiếu profile_id hoặc warehouse_id' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('employee_warehouses')
      .upsert(
        { profile_id, warehouse_id, tenant_id: tenantId },
        { onConflict: 'profile_id,warehouse_id' }
      )

    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({ error: 'Bảng employee_warehouses chưa được tạo. Vui lòng chạy migration.' }, { status: 503 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// DELETE { profile_id, warehouse_id } → remove assignment
export async function DELETE(req: NextRequest) {
  try {
    const tenantId = await getServerTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { profile_id, warehouse_id } = await req.json()
    if (!profile_id || !warehouse_id) {
      return NextResponse.json({ error: 'Thiếu profile_id hoặc warehouse_id' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('employee_warehouses')
      .delete()
      .eq('profile_id', profile_id)
      .eq('warehouse_id', warehouse_id)
      .eq('tenant_id', tenantId)

    if (error) {
      if (error.code === '42P01') return NextResponse.json({ success: true })
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
