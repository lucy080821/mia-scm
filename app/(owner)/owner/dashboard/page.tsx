'use client'
import React, { useEffect, useState } from 'react'
import { Building2, Users, Plus, TrendingUp, Activity, ArrowUpRight, Package, Truck, ShoppingCart, DollarSign, Clock, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

const MODULE_ICON: Record<string, React.ReactNode> = {
  'ban-hang':  <ShoppingCart size={11} />,
  'kho-hang':  <Package size={11} />,
  'logistics': <Truck size={11} />,
  'mua-hang':  <Package size={11} />,
  'tai-chinh': <DollarSign size={11} />,
  'bao-cao':   <Activity size={11} />,
}
const MODULE_LABEL: Record<string, string> = {
  'ban-hang': 'Bán hàng', 'kho-hang': 'Kho', 'logistics': 'Logistics',
  'mua-hang': 'Mua hàng', 'tai-chinh': 'Tài chính', 'bao-cao': 'Báo cáo',
}

interface Tenant {
  id: string; slug: string; name: string
  primary_color: string; enabled_modules: string[]
  address: string | null; phone: string | null
  created_at: string; is_platform: boolean
}

async function getToken() {
  const { supabase } = await import('@/lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

export default function OwnerDashboard() {
  const [companies, setCompanies] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken()
        const res = await fetch('/api/tenants', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) setCompanies(await res.json())
      } finally { setLoading(false) }
    })()
  }, [])

  const clientCompanies = companies.filter(c => !c.is_platform)
  const thisMonth = clientCompanies.filter(c => {
    const d = new Date(c.created_at)
    const now = new Date()
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })

  const KPI = [
    {
      label: 'Tổng công ty',
      value: clientCompanies.length,
      icon: Building2,
      color: 'bg-amber-400',
      textColor: 'text-amber-600',
      bg: 'bg-amber-50',
      sub: `${thisMonth.length} mới tháng này`,
    },
    {
      label: 'Đang hoạt động',
      value: clientCompanies.length,
      icon: CheckCircle2,
      color: 'bg-emerald-400',
      textColor: 'text-emerald-600',
      bg: 'bg-emerald-50',
      sub: '100% uptime',
    },
    {
      label: 'Tổng module triển khai',
      value: clientCompanies.reduce((s, c) => s + (c.enabled_modules?.length ?? 0), 0),
      icon: Package,
      color: 'bg-violet-400',
      textColor: 'text-violet-600',
      bg: 'bg-violet-50',
      sub: `TB ${clientCompanies.length ? (clientCompanies.reduce((s, c) => s + (c.enabled_modules?.length ?? 0), 0) / clientCompanies.length).toFixed(1) : 0} module/cty`,
    },
    {
      label: 'Tháng này',
      value: thisMonth.length,
      icon: TrendingUp,
      color: 'bg-sky-400',
      textColor: 'text-sky-600',
      bg: 'bg-sky-50',
      sub: 'công ty mới onboard',
    },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0f172a]">Tổng quan Platform</h1>
          <p className="text-sm text-gray-400 mt-0.5">Quản lý toàn bộ công ty khách hàng đang sử dụng Mia SCM</p>
        </div>
        <Link href="/owner/companies"
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-400 text-[#0f172a] text-sm font-bold rounded-xl hover:bg-amber-300 hover:scale-[1.02] active:scale-95 transition-all shadow-sm shadow-amber-200">
          <Plus size={15} /> Tạo công ty mới
        </Link>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {KPI.map(k => {
          const Icon = k.icon
          return (
            <div key={k.label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 ${k.bg} rounded-xl flex items-center justify-center`}>
                  <Icon size={18} className={k.textColor} />
                </div>
                <ArrowUpRight size={14} className="text-gray-300" />
              </div>
              <p className="text-2xl font-bold text-[#0f172a]">{loading ? '—' : k.value}</p>
              <p className="text-xs font-semibold text-gray-500 mt-0.5">{k.label}</p>
              <p className="text-[10px] text-gray-400 mt-1">{k.sub}</p>
            </div>
          )
        })}
      </div>

      {/* Company list */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Building2 size={15} className="text-amber-500" />
            <h2 className="text-sm font-bold text-[#0f172a]">Danh sách công ty</h2>
          </div>
          <Link href="/owner/companies"
            className="text-xs text-amber-600 hover:text-amber-700 font-semibold flex items-center gap-1 transition-colors">
            Xem tất cả <ArrowUpRight size={12} />
          </Link>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-gray-400">Đang tải...</p>
          </div>
        ) : clientCompanies.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3">
              <Building2 size={20} className="text-amber-300" />
            </div>
            <p className="text-sm font-medium text-gray-400">Chưa có công ty nào</p>
            <p className="text-xs text-gray-300 mt-1">Nhấn "Tạo công ty mới" để bắt đầu</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {clientCompanies.slice(0, 8).map(c => (
              <div key={c.id} className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50/60 transition-colors group">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm"
                  style={{ backgroundColor: c.primary_color || '#0ea5e9' }}>
                  {c.name.charAt(0)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#0f172a] truncate">{c.name}</p>
                    <span className="text-[10px] text-gray-400 font-mono shrink-0">/{c.slug}</span>
                  </div>
                  {c.address && <p className="text-xs text-gray-400 truncate mt-0.5">{c.address}</p>}
                </div>

                {/* Modules */}
                <div className="hidden lg:flex items-center gap-1 flex-wrap justify-end max-w-[200px]">
                  {(c.enabled_modules ?? []).map(m => (
                    <span key={m}
                      className="flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[10px] font-medium">
                      {MODULE_ICON[m]} {MODULE_LABEL[m] ?? m}
                    </span>
                  ))}
                </div>

                {/* Date */}
                <div className="flex items-center gap-1.5 text-xs text-gray-400 shrink-0 ml-2">
                  <Clock size={11} />
                  {new Date(c.created_at).toLocaleDateString('vi-VN')}
                </div>

                {/* Status dot */}
                <div className="w-2 h-2 bg-emerald-400 rounded-full shrink-0" title="Hoạt động" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
