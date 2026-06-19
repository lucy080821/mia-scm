'use client'
import { useEffect, useState } from 'react'
import { Activity, Users, ShoppingCart, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

interface TenantStats {
  id: string
  name: string
  plan: string
  userCount: number
  productCount: number
  customerCount: number
  ordersThisMonth: number
  warehouseCount: number
  hasInventory: boolean
  lastActivity: string | null
  onboardingScore: number
}

async function getToken() {
  const { supabase } = await import('@/lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

function relativeTimeVi(dateStr: string | null): string {
  if (!dateStr) return 'Chưa có hoạt động'
  const diff = Date.now() - new Date(dateStr).getTime()
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} phút trước`
  if (hours < 24) return `${hours} giờ trước`
  return `${days} ngày trước`
}

function healthColor(lastActivity: string | null): { dot: string; label: string } {
  if (!lastActivity) return { dot: 'bg-red-400', label: 'Không hoạt động' }
  const days = (Date.now() - new Date(lastActivity).getTime()) / 86400000
  if (days < 7) return { dot: 'bg-emerald-400', label: 'Tốt' }
  if (days <= 30) return { dot: 'bg-yellow-400', label: 'Trung bình' }
  return { dot: 'bg-red-400', label: 'Không hoạt động' }
}

function ScoreBadge({ score }: { score: number }) {
  if (score >= 80) return (
    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">{score}%</span>
  )
  if (score >= 40) return (
    <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-bold rounded-full">{score}%</span>
  )
  return (
    <span className="px-2 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded-full">{score}%</span>
  )
}

const CHECKLIST_COLS = [
  { key: 'hasStaff',    label: 'Có nhân viên' },
  { key: 'hasProduct',  label: 'Có sản phẩm' },
  { key: 'hasCustomer', label: 'Có khách hàng' },
  { key: 'hasWarehouse',label: 'Có kho' },
  { key: 'hasOrder',    label: 'Có đơn hàng' },
]

export default function HealthPage() {
  const [stats, setStats] = useState<TenantStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        const token = await getToken()
        const res = await fetch('/api/owner/stats', { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) throw new Error('Lỗi tải dữ liệu')
        setStats(await res.json())
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lỗi')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const sorted = [...stats].sort((a, b) => {
    if (!a.lastActivity && !b.lastActivity) return 0
    if (!a.lastActivity) return -1
    if (!b.lastActivity) return 1
    return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  })

  const onboardingSorted = [...stats].sort((a, b) => a.onboardingScore - b.onboardingScore)

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Đang tải dữ liệu health...</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-[#0f172a]">Health & Onboarding</h1>
        <p className="text-sm text-gray-400 mt-0.5">Theo dõi sức khoẻ hoạt động và tiến trình onboarding của từng công ty</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Section A: Health Dashboard */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Activity size={15} className="text-amber-500" />
          <h2 className="text-sm font-bold text-[#0f172a]">Health Dashboard</h2>
          <span className="text-xs text-gray-400 ml-1">— trạng thái hoạt động theo thời gian thực</span>
        </div>

        {sorted.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-16 text-center shadow-sm">
            <Activity size={32} className="text-amber-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Chưa có công ty nào</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sorted.map(t => {
              const health = healthColor(t.lastActivity)
              return (
                <div key={t.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3 mb-4">
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-700 font-bold text-sm shrink-0">
                      {t.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[#0f172a] truncate">{t.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className={`w-2 h-2 rounded-full ${health.dot}`} />
                        <span className="text-[11px] text-gray-500">{health.label}</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="flex items-center gap-2 text-gray-500">
                      <Users size={12} className="text-amber-400" />
                      <span>{t.userCount} nhân viên</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-500">
                      <ShoppingCart size={12} className="text-amber-400" />
                      <span>{t.ordersThisMonth} đơn/tháng</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-50 text-[11px] text-gray-400">
                    Hoạt động cuối: <span className="font-medium text-gray-600">{relativeTimeVi(t.lastActivity)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Section B: Onboarding Checklist */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle2 size={15} className="text-amber-500" />
          <h2 className="text-sm font-bold text-[#0f172a]">Onboarding Checklist</h2>
          <span className="text-xs text-gray-400 ml-1">— ít hoàn thành nhất ở trên</span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {onboardingSorted.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">Chưa có dữ liệu</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs font-bold text-gray-400 uppercase">Công ty</th>
                    {CHECKLIST_COLS.map(c => (
                      <th key={c.key} className="px-3 py-3 text-xs font-bold text-gray-400 uppercase text-center">{c.label}</th>
                    ))}
                    <th className="px-5 py-3 text-xs font-bold text-gray-400 uppercase text-center">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {onboardingSorted.map(t => {
                    const checks = {
                      hasStaff:    t.userCount > 1,
                      hasProduct:  t.productCount > 0,
                      hasCustomer: t.customerCount > 0,
                      hasWarehouse:t.warehouseCount > 0,
                      hasOrder:    t.ordersThisMonth > 0,
                    }
                    return (
                      <tr key={t.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 bg-amber-100 rounded-lg flex items-center justify-center text-amber-700 text-xs font-bold shrink-0">
                              {t.name.charAt(0)}
                            </div>
                            <span className="font-semibold text-[#0f172a] text-xs">{t.name}</span>
                          </div>
                        </td>
                        {CHECKLIST_COLS.map(c => {
                          const ok = checks[c.key as keyof typeof checks]
                          return (
                            <td key={c.key} className="px-3 py-3.5 text-center">
                              {ok
                                ? <CheckCircle2 size={16} className="text-emerald-500 mx-auto" />
                                : <XCircle size={16} className="text-gray-200 mx-auto" />
                              }
                            </td>
                          )
                        })}
                        <td className="px-5 py-3.5 text-center">
                          <ScoreBadge score={t.onboardingScore} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
