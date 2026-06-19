'use client'
import { useEffect, useState } from 'react'
import { UserPlus, Building2, AlertCircle, Clock } from 'lucide-react'

interface ActivityAdmin {
  id: string
  full_name: string | null
  email: string
  tenant_id: string
  created_at: string
}

interface ActivityTenant {
  id: string
  name: string
  slug: string
  plan: string
  created_at: string
}

type EventType = 'admin' | 'tenant'

interface TimelineEvent {
  id: string
  type: EventType
  title: string
  subtitle: string
  date: string
}

type FilterType = 'all' | 'admin' | 'tenant'

async function getToken() {
  const { supabase } = await import('@/lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

function relativeTimeVi(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'Vừa xong'
  if (mins < 60) return `${mins} phút trước`
  if (hours < 24) return `${hours} giờ trước`
  return `${days} ngày trước`
}


export default function ActivityPage() {
  const [admins, setAdmins]   = useState<ActivityAdmin[]>([])
  const [tenants, setTenants] = useState<ActivityTenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [filter, setFilter]   = useState<FilterType>('all')

  useEffect(() => {
    ;(async () => {
      try {
        const token = await getToken()
        const res = await fetch('/api/owner/activity', { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error('Lỗi tải dữ liệu')
        const data = await res.json()
        setAdmins(data.admins ?? [])
        setTenants(data.tenants ?? [])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lỗi')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  // Tìm tên cty cho admin event
  const tenantMap = Object.fromEntries(tenants.map(t => [t.id, t.name]))

  const events: TimelineEvent[] = [
    ...admins.map(u => ({
      id: `admin-${u.id}`,
      type: 'admin' as EventType,
      title: `Tài khoản admin mới: ${u.full_name ?? u.email}`,
      subtitle: `${u.email} · ${tenantMap[u.tenant_id] ?? 'Chưa xác định'}`,
      date: u.created_at,
    })),
    ...tenants.map(t => ({
      id: `tenant-${t.id}`,
      type: 'tenant' as EventType,
      title: `Công ty "${t.name}" đã được tạo`,
      subtitle: `/${t.slug} · Plan: ${t.plan ?? 'starter'}`,
      date: t.created_at,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const filtered = events.filter(e => filter === 'all' || e.type === filter)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Đang tải activity log...</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0f172a]">Activity Log</h1>
        <p className="text-sm text-gray-400 mt-0.5">Lịch sử hoạt động gần đây trên toàn hệ thống</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-2">
        {([
          ['all',    'Tất cả',      null],
          ['tenant', 'Công ty',     tenants.length],
          ['admin',  'Tài khoản admin', admins.length],
        ] as [FilterType, string, number | null][]).map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              filter === key
                ? 'bg-amber-400 text-[#0f172a]'
                : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            {label}
            {count !== null && (
              <span className="ml-1.5 text-[10px] opacity-70">({count})</span>
            )}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} sự kiện
        </span>
      </div>

      {/* Timeline */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Clock size={32} className="text-amber-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Chưa có hoạt động nào</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((event, idx) => (
              <div key={event.id} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50/60 transition-colors group">
                {/* Timeline line */}
                <div className="flex flex-col items-center shrink-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    event.type === 'admin'
                      ? 'bg-sky-50 text-sky-600'
                      : 'bg-amber-50 text-amber-600'
                  }`}>
                    {event.type === 'admin'
                      ? <UserPlus size={14} />
                      : <Building2 size={14} />
                    }
                  </div>
                  {idx < filtered.length - 1 && (
                    <div className="w-px h-full bg-gray-100 mt-1 min-h-[16px]" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-1">
                  <p className="text-sm font-semibold text-[#0f172a] truncate">{event.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{event.subtitle}</p>
                </div>

                {/* Time */}
                <div className="shrink-0 text-right pt-1">
                  <p className="text-xs font-medium text-gray-500">{relativeTimeVi(event.date)}</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">
                    {new Date(event.date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
