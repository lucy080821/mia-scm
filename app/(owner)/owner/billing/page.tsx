'use client'
import { useEffect, useState } from 'react'
import { CreditCard, Users, AlertCircle, CheckCircle2, ChevronDown, X } from 'lucide-react'

const PLANS = {
  starter: {
    label: 'Starter', price: 490000, maxUsers: 10, color: 'gray', colorClass: 'bg-gray-100 text-gray-700 border-gray-200',
    features: [
      '10 người dùng',
      '3 kho hàng',
      'Module bán hàng',
      'Module kho hàng',
      'Quản lý sản phẩm & danh mục',
      'Báo cáo cơ bản',
      'Xuất Excel',
      'Hỗ trợ qua email',
    ],
    notIncluded: ['Module logistics', 'API tích hợp', 'Hỗ trợ 24/7'],
  },
  growth: {
    label: 'Growth', price: 1190000, maxUsers: 50, color: 'sky', colorClass: 'bg-sky-100 text-sky-700 border-sky-200',
    features: [
      '50 người dùng',
      'Không giới hạn kho',
      'Module bán hàng',
      'Module kho hàng',
      'Module logistics & vận chuyển',
      'Module kế toán cơ bản',
      'Quản lý nhà cung cấp',
      'Báo cáo nâng cao & biểu đồ',
      'Xuất Excel / PDF',
      'Hỗ trợ ưu tiên',
    ],
    notIncluded: ['API tích hợp', 'Hỗ trợ 24/7'],
  },
  enterprise: {
    label: 'Enterprise', price: 2990000, maxUsers: 999, color: 'amber', colorClass: 'bg-amber-100 text-amber-700 border-amber-200',
    features: [
      'Không giới hạn người dùng',
      'Không giới hạn kho',
      'Tất cả module (bao gồm module tương lai)',
      'Báo cáo nâng cao & biểu đồ',
      'Xuất Excel / PDF',
      'API tích hợp bên ngoài',
      'Tuỳ chỉnh thương hiệu (logo, màu)',
      'Sao lưu dữ liệu ưu tiên',
      'Hỗ trợ 24/7 & account manager',
      'SLA cam kết 99.9%',
    ],
    notIncluded: [],
  },
} as const

type PlanKey = keyof typeof PLANS

interface Tenant {
  id: string
  name: string
  plan: string
  userCount: number
}

async function getToken() {
  const { supabase } = await import('@/lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

function formatVND(amount: number) {
  return amount.toLocaleString('vi-VN') + ' ₫'
}

function PlanBadge({ plan }: { plan: string }) {
  const p = PLANS[plan as PlanKey]
  if (!p) return <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-full border border-gray-200">{plan}</span>
  return <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${p.colorClass}`}>{p.label}</span>
}

export default function BillingPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [changingId, setChangingId] = useState<string | null>(null)
  const [changeError, setChangeError] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [pendingPlan, setPendingPlan] = useState<Record<string, string>>({})

  useEffect(() => {
    ;(async () => {
      try {
        const token = await getToken()
        // Get tenants + stats in parallel
        const [tenantsRes, statsRes] = await Promise.all([
          fetch('/api/tenants', { headers: { Authorization: `Bearer ${token}` } }),
          fetch('/api/owner/stats', { headers: { Authorization: `Bearer ${token}` } }),
        ])
        if (!tenantsRes.ok || !statsRes.ok) throw new Error('Lỗi tải dữ liệu')
        const tenantsData = await tenantsRes.json()
        const statsData: Array<{ id: string; userCount: number }> = await statsRes.json()
        const statsMap = new Map(statsData.map(s => [s.id, s.userCount]))
        setTenants(
          (tenantsData as Array<{ id: string; name: string; plan: string | null; is_platform: boolean }>)
            .filter(t => !t.is_platform)
            .map(t => ({
              id: t.id,
              name: t.name,
              plan: t.plan ?? 'starter',
              userCount: statsMap.get(t.id) ?? 0,
            }))
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Lỗi')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const planCounts = Object.keys(PLANS).reduce((acc, k) => {
    acc[k as PlanKey] = tenants.filter(t => (t.plan ?? 'starter') === k).length
    return acc
  }, {} as Record<PlanKey, number>)

  const monthlyRevenue = tenants.reduce((sum, t) => {
    const plan = PLANS[(t.plan ?? 'starter') as PlanKey]
    return sum + (plan?.price ?? 0)
  }, 0)

  const handleChangePlan = async (tenantId: string, newPlan: string) => {
    setSaving(tenantId)
    setChangeError(prev => ({ ...prev, [tenantId]: '' }))
    try {
      const token = await getToken()
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan: newPlan }),
      })
      if (!res.ok) {
        const b = await res.json()
        throw new Error(b.error ?? 'Lỗi cập nhật')
      }
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, plan: newPlan } : t))
      setChangingId(null)
      setPendingPlan(prev => { const n = { ...prev }; delete n[tenantId]; return n })
    } catch (e) {
      setChangeError(prev => ({ ...prev, [tenantId]: e instanceof Error ? e.message : 'Lỗi' }))
    } finally {
      setSaving(null)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Đang tải dữ liệu billing...</p>
      </div>
    </div>
  )

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0f172a]">Billing & Plan</h1>
        <p className="text-sm text-gray-400 mt-0.5">Quản lý gói dịch vụ cho từng công ty</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {(Object.keys(PLANS) as PlanKey[]).map(key => {
          const p = PLANS[key]
          const count = planCounts[key]
          return (
            <div key={key} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${p.colorClass}`}>{p.label}</span>
                <CreditCard size={14} className="text-gray-300" />
              </div>
              <p className="text-2xl font-bold text-[#0f172a]">{count}</p>
              <p className="text-xs text-gray-500 mt-0.5">công ty</p>
              <p className="text-xs text-gray-400 mt-2">{formatVND(count * p.price)}/tháng</p>
            </div>
          )
        })}
        <div className="bg-amber-400 rounded-2xl p-5 shadow-sm shadow-amber-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-[#0f172a]">Tổng doanh thu</span>
            <CreditCard size={14} className="text-[#0f172a]/60" />
          </div>
          <p className="text-2xl font-bold text-[#0f172a]">{formatVND(monthlyRevenue)}</p>
          <p className="text-xs text-[#0f172a]/70 mt-0.5">mỗi tháng</p>
          <p className="text-xs text-[#0f172a]/50 mt-2">{tenants.length} công ty</p>
        </div>
      </div>

      {/* Plan details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        {(Object.keys(PLANS) as PlanKey[]).map(key => {
          const p = PLANS[key]
          const isGrowth = key === 'growth'
          return (
            <div key={key} className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${isGrowth ? 'border-sky-200 ring-2 ring-sky-100' : 'border-gray-100'}`}>
              {isGrowth && (
                <div className="bg-sky-500 text-white text-[10px] font-bold text-center py-1.5 tracking-widest uppercase">
                  Phổ biến nhất
                </div>
              )}
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-sm font-bold px-2.5 py-1 rounded-xl border ${p.colorClass}`}>{p.label}</span>
                </div>
                <p className="text-2xl font-bold text-[#0f172a]">{formatVND(p.price)}<span className="text-sm font-normal text-gray-400">/tháng</span></p>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-500">
                  <Users size={11} />
                  <span>Tối đa {p.maxUsers === 999 ? 'không giới hạn' : p.maxUsers} người dùng</span>
                </div>

                <div className="mt-4 space-y-2">
                  {p.features.map(f => (
                    <div key={f} className="flex items-start gap-2 text-xs text-gray-700">
                      <CheckCircle2 size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </div>
                  ))}
                  {p.notIncluded.map(f => (
                    <div key={f} className="flex items-start gap-2 text-xs text-gray-400">
                      <X size={13} className="text-gray-300 shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Company table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
          <CreditCard size={15} className="text-amber-500" />
          <h2 className="text-sm font-bold text-[#0f172a]">Danh sách công ty</h2>
        </div>

        {tenants.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">Chưa có công ty nào</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-6 py-3 text-xs font-bold text-gray-400 uppercase">Công ty</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-center">Plan hiện tại</th>
                  <th className="px-4 py-3 text-xs font-bold text-gray-400 uppercase text-center">Người dùng</th>
                  <th className="px-6 py-3 text-xs font-bold text-gray-400 uppercase text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tenants.map(t => {
                  const currentPlan = PLANS[(t.plan ?? 'starter') as PlanKey] ?? PLANS.starter
                  const isChanging = changingId === t.id
                  const over = t.userCount > currentPlan.maxUsers
                  return (
                    <tr key={t.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center text-amber-700 text-xs font-bold shrink-0">
                            {t.name.charAt(0)}
                          </div>
                          <span className="font-semibold text-[#0f172a]">{t.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <PlanBadge plan={t.plan} />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className={`text-xs font-semibold ${over ? 'text-red-600' : 'text-gray-700'}`}>
                            {t.userCount}/{currentPlan.maxUsers === 999 ? '∞' : currentPlan.maxUsers}
                          </span>
                          {over && <AlertCircle size={12} className="text-red-500" />}
                          {!over && <CheckCircle2 size={12} className="text-emerald-400" />}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isChanging ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="relative">
                              <select
                                defaultValue={t.plan ?? 'starter'}
                                value={pendingPlan[t.id] ?? t.plan ?? 'starter'}
                                onChange={e => setPendingPlan(prev => ({ ...prev, [t.id]: e.target.value }))}
                                className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:border-amber-400 bg-white"
                              >
                                {(Object.keys(PLANS) as PlanKey[]).map(k => (
                                  <option key={k} value={k}>{PLANS[k].label} — {formatVND(PLANS[k].price)}/th</option>
                                ))}
                              </select>
                              <ChevronDown size={12} className="absolute right-2 top-2 text-gray-400 pointer-events-none" />
                            </div>
                            <button
                              onClick={() => handleChangePlan(t.id, pendingPlan[t.id] ?? t.plan ?? 'starter')}
                              disabled={saving === t.id}
                              className="px-3 py-1.5 bg-amber-400 text-[#0f172a] text-xs font-bold rounded-lg hover:bg-amber-300 disabled:opacity-50 transition-colors"
                            >
                              {saving === t.id ? 'Lưu...' : 'Lưu'}
                            </button>
                            <button
                              onClick={() => { setChangingId(null); setChangeError(prev => ({ ...prev, [t.id]: '' })) }}
                              className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setChangingId(t.id); setPendingPlan(prev => ({ ...prev, [t.id]: t.plan ?? 'starter' })) }}
                            className="px-3 py-1.5 text-xs text-amber-600 border border-amber-200 rounded-lg hover:bg-amber-50 transition-colors font-semibold"
                          >
                            Đổi plan
                          </button>
                        )}
                        {changeError[t.id] && (
                          <p className="text-[10px] text-red-500 mt-1 text-right">{changeError[t.id]}</p>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
