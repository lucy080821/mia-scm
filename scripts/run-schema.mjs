/**
 * Chạy schema SQL lên Supabase qua Management API
 * Usage: node scripts/run-schema.mjs <SERVICE_ROLE_KEY>
 *
 * Lấy SERVICE_ROLE_KEY tại: Supabase Dashboard → Settings → API → service_role
 */
import { readFileSync } from 'fs'

const PROJECT_REF = 'pjbpsivmyoobtqzvcodh'
const SERVICE_KEY = process.argv[2]

if (!SERVICE_KEY) {
  console.error('❌  Thiếu service_role key.')
  console.error('    Cách lấy: Supabase Dashboard → Settings → API → service_role (secret)')
  console.error('    Chạy lại: node scripts/run-schema.mjs <service_role_key>')
  process.exit(1)
}

const sql = readFileSync('supabase/schema.sql', 'utf-8')

// Tách thành từng statement để tránh timeout
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 10 && !s.startsWith('--'))

console.log(`🚀  Chạy ${statements.length} SQL statements lên Supabase...`)

let ok = 0, fail = 0
for (const stmt of statements) {
  const res = await fetch(
    `https://${PROJECT_REF}.supabase.co/rest/v1/`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ query: stmt + ';' }),
    }
  )
  // Management API endpoint
  const mgmt = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: stmt + ';' }),
    }
  )
  if (mgmt.ok) { ok++; process.stdout.write('.') }
  else {
    const err = await mgmt.json().catch(() => ({}))
    if (err?.message?.includes('already exists') || err?.message?.includes('duplicate')) {
      ok++; process.stdout.write('·')
    } else {
      fail++
      console.warn(`\n⚠️  ${err?.message ?? mgmt.status}: ${stmt.slice(0, 60)}...`)
    }
  }
}

console.log(`\n\n✅  Hoàn thành: ${ok} thành công, ${fail} lỗi`)
