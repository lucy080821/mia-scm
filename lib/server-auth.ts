import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from './supabase-admin'

export async function getServerTenantId(): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const client = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user } } = await client.auth.getUser()
    if (!user) return null
    const { data } = await supabaseAdmin
      .from('users').select('tenant_id').eq('id', user.id).single()
    return data?.tenant_id ?? null
  } catch {
    return null
  }
}
