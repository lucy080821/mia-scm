import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Client-side Supabase (dùng trong Client Components)
export const supabase = createBrowserClient(url, key)

// Server-side Supabase (dùng trong Server Components / Route Handlers)
export const createServerClient = () => createClient(url, key)
