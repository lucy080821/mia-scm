'use client'
import { useEffect, useState } from 'react'
import { Settings, Globe, Shield, Key, CreditCard, Users, Building2 } from 'lucide-react'

const PLANS = {
  starter:    { label: 'Starter',    price: 500000,  maxUsers: 5,   desc: 'Phù hợp cho team nhỏ dưới 5 người',         colorClass: 'border-gray-200 bg-gray-50', badgeClass: 'bg-gray-100 text-gray-700' },
  growth:     { label: 'Growth',     price: 1200000, maxUsers: 20,  desc: 'Dành cho doanh nghiệp vừa, tới 20 người',   colorClass: 'border-sky-200 bg-sky-50',   badgeClass: 'bg-sky-100 text-sky-700' },
  enterprise: { label: 'Enterprise', price: 3000000, maxUsers: 999, desc: 'Không giới hạn, hỗ trợ ưu tiên 24/7',       colorClass: 'border-amber-200 bg-amber-50', badgeClass: 'bg-amber-100 text-amber-700' },
} as const

type PlanKey = keyof typeof PLANS

interface TenantStats {
  id: string
  plan: string
}

async function getToken() {
  const { supabase } = await import('@/lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

function formatVND(amount: number) {
  return amount.toLocaleString('vi-VN') + ' ₫'
}

export default function OwnerSettings() {
  const [planCounts, setPlanCounts] = useState<Record<string, number>>({})
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const token = await getToken()
        const res = await fetch('/api/owner/stats', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const stats: TenantStats[] = await res.json()
          const counts: Record<string, number> = {}
          for (const s of stats) {
            const plan = s.plan ?? 'starter'
            counts[plan] = (counts[plan] ?? 0) + 1
          }
          setPlanCounts(counts)
        }
      } finally {
        setLoadingStats(false)
      }
    })()
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0f172a]">Cài đặt Platform</h1>
        <p className="text-sm text-gray-400 mt-0.5">Cấu hình hệ thống toàn cục</p>
      </div>

      {/* Plan Management */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard size={15} className="text-amber-500" />
          <h2 className="text-sm font-bold text-[#0f172a]">Quản lý Plan</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(Object.keys(PLANS) as PlanKey[]).map(key => {
            const p = PLANS[key]
            const count = planCounts[key] ?? 0
            return (
              <div key={key} className={`rounded-2xl border p-5 shadow-sm ${p.colorClass}`}>
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${p.badgeClass}`}>{p.label}</span>
                  {key === 'enterprise' && (
                    <span className="text-[10px] px-2 py-0.5 bg-amber-200 text-amber-800 rounded-full font-semibold">Phổ biến</span>
                  )}
                </div>
                <p className="text-2xl font-bold text-[#0f172a]">
                  {formatVND(p.price)}
                  <span className="text-sm font-normal text-gray-400">/tháng</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">{p.desc}</p>
                <div className="flex items-center gap-3 mt-4 pt-4 border-t border-black/5">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Users size={12} />
                    <span>{p.maxUsers === 999 ? 'Không giới hạn' : `Tối đa ${p.maxUsers} users`}</span>
                  </div>
                  {loadingStats ? (
                    <span className="ml-auto text-xs text-gray-300">...</span>
                  ) : (
                    <div className="ml-auto flex items-center gap-1.5 text-xs">
                      <Building2 size={11} className="text-gray-400" />
                      <span className="font-semibold text-[#0f172a]">{count}</span>
                      <span className="text-gray-400">cty</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Coming soon features */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Settings size={15} className="text-amber-500" />
          <h2 className="text-sm font-bold text-[#0f172a]">Tính năng sắp ra mắt</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { icon: Globe,    title: 'Tên miền',         desc: 'Cấu hình domain cho từng công ty' },
            { icon: Shield,   title: 'Bảo mật',          desc: 'Chính sách mật khẩu, 2FA toàn hệ thống' },
            { icon: Key,      title: 'API Keys',         desc: 'Quản lý API keys tích hợp bên ngoài' },
            { icon: Settings, title: 'Cấu hình hệ thống', desc: 'Giới hạn người dùng, dung lượng, timezone' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex items-start gap-4 opacity-70">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                <Icon size={18} className="text-amber-500" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[#0f172a]">{title}</p>
                  <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full font-medium">Sắp ra mắt</span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
