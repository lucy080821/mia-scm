'use client'
import React, { useState, useEffect } from 'react'
import { ShoppingCart, Package, Truck, AlertTriangle, DollarSign, Users,
  BarChart2, FileText, CheckCircle2, Clock, XCircle, MapPin,
  ArrowDownToLine, ArrowUpFromLine, Star, Phone, Navigation, Banknote, TrendingUp } from 'lucide-react'
import KpiCard from '@/components/ui/KpiCard'
import Badge from '@/components/ui/Badge'
import RevenueChart from '@/components/charts/RevenueChart'
import DonutChart from '@/components/charts/DonutChart'
import SimpleBarChart from '@/components/charts/BarChart'
import { formatVND, formatDate } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

type DashboardData = {
  kpis: { revenue: number; yearRevenue: number; newOrders: number; delivering: number; customers: number; lowStock: number }
  recentOrders: { code: string; customer: string; total: number; status: string; date: string }[]
  recentDeliveries: { code: string; order: string; driver: string; route: string; status: string; eta: string }[]
  topCustomers: { name: string; amount: number; pct: number }[]
  lowStockItems: { sku: string; name: string; current: number; min: number; unit: string }[]
  pendingReceipts: { code: string; supplier: string; items: number; expected: string; status: string }[]
  pendingIssues: { code: string; order: string; items: number; warehouse: string; status: string }[]
  vehicles: { plate: string; type: string; driver: string; status: string; route: string }[]
  myDeliveries: { code: string; customer: string; address: string; items: number; status: string; eta: string; phone: string }[]
  revenueMonthly: { month: string; revenue: number }[]
  inventoryStatus: { name: string; value: number; color: string }[]
  topProducts: { label: string; value: number }[]
  deliveryWeekly: { label: string; value: number }[]
}

const EMPTY_DATA: DashboardData = {
  kpis: { revenue: 0, yearRevenue: 0, newOrders: 0, delivering: 0, customers: 0, lowStock: 0 },
  recentOrders: [], recentDeliveries: [], topCustomers: [], lowStockItems: [],
  pendingReceipts: [], pendingIssues: [], vehicles: [], myDeliveries: [],
  revenueMonthly: [], inventoryStatus: [], topProducts: [], deliveryWeekly: [],
}

function useDashboard() {
  const [data, setData] = useState<DashboardData>(EMPTY_DATA)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const fetchData = () => {
      fetch('/api/dashboard').then(r => r.json()).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
    }
    fetchData()
    const timer = setInterval(fetchData, 30_000)

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_orders' }, fetchData)
      .subscribe()

    return () => {
      clearInterval(timer)
      supabase.removeChannel(channel)
    }
  }, [])
  return { data, loading }
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionCard({ title, link, linkHref, children, className = '' }: { title: string; link?: string; linkHref?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-xl border border-[#e5e7eb] ${className}`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
        <h2 className="text-sm font-semibold text-[#1e2a3a]">{title}</h2>
        {link && linkHref && <a href={linkHref} className="text-xs text-[#0ea5e9] hover:underline">{link} →</a>}
      </div>
      {children}
    </div>
  )
}

function NotifList({ data }: { data: DashboardData }) {
  const colors: Record<string, string> = {
    warning: 'border-l-2 border-yellow-400 bg-yellow-50',
    info:    'border-l-2 border-blue-400 bg-blue-50',
    error:   'border-l-2 border-red-400 bg-red-50',
    success: 'border-l-2 border-green-400 bg-green-50',
  }

  const notifs: { type: string; msg: string; time: string }[] = []
  if (data.kpis.lowStock > 0)
    notifs.push({ type: 'warning', msg: `${data.kpis.lowStock} sản phẩm sắp hết / hết hàng`, time: 'Cảnh báo kho' })
  if (data.pendingReceipts.length > 0)
    notifs.push({ type: 'info', msg: `${data.pendingReceipts.length} phiếu nhập kho chờ duyệt`, time: 'Cần xử lý' })
  if (data.pendingIssues.length > 0)
    notifs.push({ type: 'info', msg: `${data.pendingIssues.length} phiếu xuất kho chờ xử lý`, time: 'Cần xử lý' })
  if (data.kpis.delivering > 0)
    notifs.push({ type: 'success', msg: `${data.kpis.delivering} đơn hàng đang vận chuyển`, time: 'Đang diễn ra' })
  if (data.kpis.newOrders > 0)
    notifs.push({ type: 'info', msg: `${data.kpis.newOrders} đơn hàng mới trong tháng`, time: 'Tháng này' })

  if (notifs.length === 0)
    return <div className="px-4 py-8 text-center text-sm text-gray-400">Không có thông báo mới</div>

  return (
    <div className="divide-y divide-[#e5e7eb]">
      {notifs.map((n, i) => (
        <div key={i} className={`px-4 py-3 ${colors[n.type]}`}>
          <p className="text-xs text-gray-700">{n.msg}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{n.time}</p>
        </div>
      ))}
    </div>
  )
}

function PageTitle({ name, subtitle }: { name: string; subtitle: string }) {
  const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })
  return (
    <div className="flex items-center justify-between mb-5">
      <div>
        <h1 className="text-xl font-bold text-[#1e2a3a]">Xin chào, {name.split(' ').pop()} 👋</h1>
        <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      <span className="text-xs text-gray-400 bg-white border border-[#e5e7eb] rounded-lg px-3 py-1.5">{today}</span>
    </div>
  )
}

// ─── Admin KPI Management ─────────────────────────────────────────────────────

const INIT_KPI_CONFIG = [
  { id: 1, name: 'Doanh số tháng (đ)', baseBonus: 5_000_000, coefficient: 1.5 },
  { id: 2, name: 'Số đơn hàng mới',    baseBonus: 1_000_000, coefficient: 1.0 },
  { id: 3, name: 'Tỷ lệ chốt đơn (%)', baseBonus:   800_000, coefficient: 1.2 },
]

const SALES_TEAM: { id: string; name: string; baseSalary: number; allowances: number; kpis: { target: number; actual: number }[] }[] = []

type KpiCfg = { id: number; name: string; baseBonus: number; coefficient: number }
const BLANK_KPI: KpiCfg = { id: 0, name: '', baseBonus: 500_000, coefficient: 1.0 }

const KPI_STORAGE_KEY = 'mia_kpi_config'

function loadKpiConfig(): KpiCfg[] {
  try {
    const raw = localStorage.getItem(KPI_STORAGE_KEY)
    if (raw) return JSON.parse(raw) as KpiCfg[]
  } catch {}
  return INIT_KPI_CONFIG
}

function AdminKpiSection() {
  const [kpiConfig, setKpiConfig] = useState<KpiCfg[]>(INIT_KPI_CONFIG)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'employees' | 'config'>('employees')
  const [form, setForm] = useState<KpiCfg | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [saved, setSaved] = useState(false)

  // Load từ localStorage khi mount
  React.useEffect(() => {
    setKpiConfig(loadKpiConfig())
  }, [])

  const persistConfig = (cfg: KpiCfg[]) => {
    setKpiConfig(cfg)
    try { localStorage.setItem(KPI_STORAGE_KEY, JSON.stringify(cfg)) } catch {}
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const openAdd  = () => setForm({ ...BLANK_KPI, id: 0 })
  const openEdit = (cfg: KpiCfg) => setForm({ ...cfg })
  const closeForm = () => setForm(null)

  const saveForm = () => {
    if (!form || !form.name.trim()) return
    const next = form.id === 0
      ? [...kpiConfig, { ...form, id: Date.now() }]
      : kpiConfig.map(k => k.id === form.id ? form : k)
    persistConfig(next)
    closeForm()
  }

  const deleteKpi = (id: number) => {
    persistConfig(kpiConfig.filter(k => k.id !== id))
    setDeleteConfirm(null)
  }

  const calcEmployee = (emp: typeof SALES_TEAM[0]) => {
    const kpiBonus = emp.kpis.reduce((sum, k, i) => {
      const cfg = kpiConfig[i]
      if (!cfg) return sum
      const pct = Math.min(k.actual / k.target, 1.5)
      return sum + Math.round(cfg.baseBonus * cfg.coefficient * pct)
    }, 0)
    return { kpiBonus, total: emp.baseSalary + emp.allowances + kpiBonus }
  }

  const teamStats = SALES_TEAM.map(e => {
    const avg = e.kpis.reduce((s, k) => s + k.actual / k.target, 0) / e.kpis.length
    return { ...e, avgPct: avg, ...calcEmployee(e) }
  })

  const totalPayroll = teamStats.reduce((s, e) => s + e.total, 0)
  const avgAchievement = teamStats.reduce((s, e) => s + e.avgPct, 0) / teamStats.length
  const meetingTarget = teamStats.filter(e => e.avgPct >= 0.8).length

  const pctColor = (p: number) => p >= 1 ? 'text-green-600' : p >= 0.8 ? 'text-yellow-600' : 'text-red-500'
  const barColor = (p: number) => p >= 1 ? 'bg-green-500' : p >= 0.8 ? 'bg-yellow-400' : 'bg-red-400'

  return (
    <div className="bg-white rounded-xl border border-[#e5e7eb]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e5e7eb]">
        <div className="flex items-center gap-2">
          <Banknote size={16} className="text-[#0ea5e9]" />
          <h2 className="text-sm font-semibold text-[#1e2a3a]">Quản lý KPI & Lương nhân viên — Tháng 5/2024</h2>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab('employees')}
            className={`text-xs px-3 py-1 rounded-md transition-all ${activeTab === 'employees' ? 'bg-white text-[#1e2a3a] font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Nhân viên
          </button>
          <button
            onClick={() => setActiveTab('config')}
            className={`text-xs px-3 py-1 rounded-md transition-all ${activeTab === 'config' ? 'bg-white text-[#1e2a3a] font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Cấu hình KPI
          </button>
        </div>
        {saved && <span className="text-[10px] text-green-600 font-medium">✓ Đã lưu</span>}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 divide-x divide-[#e5e7eb] border-b border-[#e5e7eb]">
        <div className="px-5 py-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Tổng quỹ lương</p>
          <p className="text-lg font-bold text-[#1e2a3a]">{formatVND(totalPayroll)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{SALES_TEAM.length} nhân viên</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Hoàn thành KPI TB</p>
          <p className={`text-lg font-bold ${pctColor(avgAchievement)}`}>{Math.round(avgAchievement * 100)}%</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Toàn đội sales</p>
        </div>
        <div className="px-5 py-4">
          <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Đạt KPI ≥ 80%</p>
          <p className="text-lg font-bold text-green-600">{meetingTarget}/{SALES_TEAM.length} NV</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Đủ điều kiện thưởng</p>
        </div>
      </div>

      {activeTab === 'employees' ? (
        /* ── Employee list ── */
        <div className="divide-y divide-[#e5e7eb]">
          {teamStats.map(emp => (
            <div key={emp.id}>
              {/* Row */}
              <div
                className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setExpanded(expanded === emp.id ? null : emp.id)}
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-[#1e2a3a] flex items-center justify-center text-white text-xs font-bold shrink-0">
                  {emp.name.split(' ').pop()?.charAt(0)}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-[#1e2a3a]">{emp.name}</p>
                    <span className="text-[10px] text-gray-400 font-mono">{emp.id}</span>
                  </div>
                  {/* Mini KPI bars */}
                  <div className="flex items-center gap-2">
                    {emp.kpis.map((k, i) => {
                      const p = Math.min(k.actual / k.target, 1)
                      return (
                        <div key={i} className="flex items-center gap-1">
                          <div className="w-16 bg-gray-100 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${barColor(p)}`} style={{ width: `${p * 100}%` }} />
                          </div>
                          <span className={`text-[10px] font-medium ${pctColor(p)}`}>{Math.round(p * 100)}%</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                {/* Salary */}
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-[#1e2a3a]">{formatVND(emp.total)}</p>
                  <p className="text-[10px] text-[#0ea5e9]">Thưởng KPI: +{formatVND(emp.kpiBonus)}</p>
                </div>
                <span className={`text-gray-400 text-xs transition-transform ${expanded === emp.id ? 'rotate-90' : ''}`}>›</span>
              </div>

              {/* Expanded detail */}
              {expanded === emp.id && (
                <div className="px-5 pb-5 bg-gray-50 border-t border-[#e5e7eb]">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4">
                    {/* Breakdown */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Bảng lương</p>
                      <div className="bg-white rounded-xl border border-[#e5e7eb] divide-y divide-[#e5e7eb]">
                        <div className="flex justify-between px-4 py-2.5 text-xs">
                          <span className="text-gray-500">Lương cơ bản</span>
                          <span className="font-semibold">{formatVND(emp.baseSalary)}</span>
                        </div>
                        <div className="flex justify-between px-4 py-2.5 text-xs">
                          <span className="text-gray-500">Phụ cấp</span>
                          <span className="font-semibold">+{formatVND(emp.allowances)}</span>
                        </div>
                        <div className="flex justify-between px-4 py-2.5 text-xs">
                          <span className="text-gray-500">Thưởng KPI</span>
                          <span className="font-semibold text-[#0ea5e9]">+{formatVND(emp.kpiBonus)}</span>
                        </div>
                        <div className="flex justify-between px-4 py-2.5 text-sm bg-[#1e2a3a] rounded-b-xl">
                          <span className="text-white font-semibold">Tổng dự kiến</span>
                          <span className="text-white font-bold">{formatVND(emp.total)}</span>
                        </div>
                      </div>
                    </div>
                    {/* KPI detail */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Chi tiết KPI</p>
                      <div className="space-y-2">
                        {emp.kpis.map((k, i) => {
                          const cfg = kpiConfig[i]
                          if (!cfg) return null
                          const pct = Math.min(k.actual / k.target, 1.5)
                          const bonus = Math.round(cfg.baseBonus * cfg.coefficient * pct)
                          return (
                            <div key={i} className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-3">
                              <div className="flex justify-between mb-2">
                                <span className="text-xs font-medium text-[#1e2a3a]">{cfg.name}</span>
                                <span className={`text-xs font-bold ${pctColor(pct)}`}>{Math.round(pct * 100)}%</span>
                              </div>
                              <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
                                <div className={`h-1.5 rounded-full ${barColor(Math.min(pct, 1))}`} style={{ width: `${Math.min(pct, 1) * 100}%` }} />
                              </div>
                              <div className="flex justify-between text-[10px] text-gray-400">
                                <span>MT: {k.target.toLocaleString('vi-VN')} · TH: {k.actual.toLocaleString('vi-VN')}</span>
                                <span className="text-[#0ea5e9] font-semibold">+{formatVND(bonus)}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* ── KPI Config ── */
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-gray-500">Cấu hình áp dụng cho toàn bộ nhân viên sales. Thay đổi tính lại lương ngay.</p>
            <button
              onClick={openAdd}
              className="flex items-center gap-1.5 text-xs bg-[#0ea5e9] text-white px-3 py-1.5 rounded-lg hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 transition-all font-medium"
            >
              + Thêm KPI
            </button>
          </div>

          {/* Add / Edit form */}
          {form !== null && (
            <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <p className="text-xs font-semibold text-[#1e2a3a] mb-3">
                {form.id === 0 ? 'Thêm KPI mới' : 'Sửa KPI'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <div className="sm:col-span-1">
                  <label className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Tên KPI</label>
                  <input
                    type="text"
                    placeholder="VD: Doanh số tháng (đ)"
                    value={form.name}
                    onChange={e => setForm(f => f && ({ ...f, name: e.target.value }))}
                    className="w-full text-xs border border-[#e5e7eb] bg-white rounded-lg px-3 py-2 outline-none focus:border-[#0ea5e9]"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Thưởng gốc (đ)</label>
                  <input
                    type="number"
                    min="0"
                    step="100000"
                    value={form.baseBonus}
                    onChange={e => setForm(f => f && ({ ...f, baseBonus: Number(e.target.value) }))}
                    className="w-full text-xs border border-[#e5e7eb] bg-white rounded-lg px-3 py-2 outline-none focus:border-[#0ea5e9] text-right"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-gray-500 uppercase block mb-1">Hệ số</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.coefficient}
                    onChange={e => setForm(f => f && ({ ...f, coefficient: Number(e.target.value) }))}
                    className="w-full text-xs border border-[#e5e7eb] bg-white rounded-lg px-3 py-2 outline-none focus:border-[#0ea5e9] text-center"
                  />
                </div>
              </div>
              {form.name && (
                <p className="text-[10px] text-gray-500 mb-3">
                  Thưởng tối đa (100%): <strong className="text-[#0ea5e9]">{formatVND(Math.round(form.baseBonus * form.coefficient))}</strong>
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={saveForm}
                  disabled={!form.name.trim()}
                  className="text-xs bg-[#1e2a3a] text-white px-4 py-1.5 rounded-lg hover:bg-[#0ea5e9] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-medium"
                >
                  {form.id === 0 ? 'Thêm' : 'Lưu thay đổi'}
                </button>
                <button onClick={closeForm} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 transition-colors">
                  Hủy
                </button>
              </div>
            </div>
          )}

          {/* KPI list */}
          <div className="rounded-xl border border-[#e5e7eb] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-[#e5e7eb]">
                  {['#', 'Tên KPI', 'Thưởng gốc', 'Hệ số', 'Tối đa (100%)', 'Thao tác'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e5e7eb]">
                {kpiConfig.map((cfg, idx) => (
                  <tr key={cfg.id} className={`transition-colors ${deleteConfirm === cfg.id ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#1e2a3a]">{cfg.name}</td>
                    <td className="px-4 py-3 text-xs text-gray-700">{formatVND(cfg.baseBonus)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-bold text-[#1e2a3a] bg-gray-100 px-2 py-0.5 rounded-full">×{cfg.coefficient}</span>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#0ea5e9]">
                      {formatVND(Math.round(cfg.baseBonus * cfg.coefficient))}
                    </td>
                    <td className="px-4 py-3">
                      {deleteConfirm === cfg.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-red-500 font-medium">Xóa KPI này?</span>
                          <button onClick={() => deleteKpi(cfg.id)} className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600 transition-colors">Xác nhận</button>
                          <button onClick={() => setDeleteConfirm(null)} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">Hủy</button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEdit(cfg)}
                            className="text-xs text-[#0ea5e9] hover:text-[#0284c7] font-medium transition-colors px-2 py-0.5 rounded hover:bg-blue-50"
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(cfg.id)}
                            className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors px-2 py-0.5 rounded hover:bg-red-50"
                          >
                            Xóa
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {kpiConfig.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-gray-400">Chưa có KPI nào. Nhấn "+ Thêm KPI" để bắt đầu.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-[#e5e7eb]">
                  <td colSpan={4} className="px-4 py-3 text-xs font-semibold text-gray-500">Tổng thưởng KPI tối đa / người</td>
                  <td className="px-4 py-3 text-sm font-bold text-[#1e2a3a]">
                    {formatVND(kpiConfig.reduce((s, k) => s + Math.round(k.baseBonus * k.coefficient), 0))}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="text-[10px] text-gray-400 mt-3 text-center">
            * Công thức: Thưởng KPI = Thưởng gốc × Hệ số × (Thực hiện / Mục tiêu), tối đa 150%
          </p>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

type RevPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year'
const REV_PERIODS: { key: RevPeriod; label: string }[] = [
  { key: 'day',     label: 'Ngày' },
  { key: 'week',    label: 'Tuần' },
  { key: 'month',   label: 'Tháng' },
  { key: 'quarter', label: 'Quý' },
  { key: 'year',    label: 'Năm' },
]

function useRevenueChart(period: RevPeriod) {
  const [chartData, setChartData] = useState<{ month: string; revenue: number }[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  useEffect(() => {
    setChartLoading(true)
    fetch(`/api/revenue-chart?period=${period}`)
      .then(r => r.json())
      .then(d => { setChartData((d.data ?? []).map((p: { label: string; revenue: number }) => ({ month: p.label, revenue: p.revenue }))); setChartLoading(false) })
      .catch(() => setChartLoading(false))
  }, [period])
  return { chartData, chartLoading }
}

function AdminDashboard({ name }: { name: string }) {
  const { data, loading } = useDashboard()
  const { kpis, recentOrders, recentDeliveries, topCustomers, lowStockItems, pendingReceipts, pendingIssues, inventoryStatus, topProducts } = data
  const [revPeriod, setRevPeriod] = useState<RevPeriod>('month')
  const { chartData, chartLoading } = useRevenueChart(revPeriod)

  return (
    <div>
      <PageTitle name={name} subtitle="Tổng quan toàn bộ hoạt động kinh doanh" />

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-5">
        <KpiCard icon={<DollarSign size={20} className="text-green-600" />}  label="Doanh thu tháng"  value={loading ? '—' : formatVND(kpis.revenue)}      sub="Tháng này"       iconBg="bg-green-100"  className="xl:col-span-2" />
        <KpiCard icon={<ShoppingCart size={20} className="text-blue-600" />} label="Đơn hàng mới"    value={loading ? '—' : kpis.newOrders}                sub="Tháng này"       iconBg="bg-blue-100" />
        <KpiCard icon={<Truck size={20} className="text-orange-600" />}      label="Đang giao hàng"  value={loading ? '—' : kpis.delivering}               sub="Hiện tại"        iconBg="bg-orange-100" />
        <KpiCard icon={<Users size={20} className="text-purple-600" />}      label="Khách hàng"      value={loading ? '—' : kpis.customers}                sub="Đang hoạt động"  iconBg="bg-purple-100" />
        <KpiCard icon={<AlertTriangle size={20} className="text-red-500" />} label="Hàng sắp hết"   value={loading ? '—' : kpis.lowStock}                 sub="Cần xử lý"       iconBg="bg-red-100" />
        <KpiCard icon={<BarChart2 size={20} className="text-teal-600" />}    label="Doanh thu năm"   value={loading ? '—' : formatVND(kpis.yearRevenue)}   sub="Năm này"         iconBg="bg-teal-100"  className="col-span-2 xl:col-span-2" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#e5e7eb] p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#1e2a3a]">Doanh thu theo thời gian</h2>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {REV_PERIODS.map(p => (
                <button key={p.key} onClick={() => setRevPeriod(p.key)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-all ${revPeriod === p.key ? 'bg-white text-[#1e2a3a] font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {chartLoading
            ? <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">Đang tải...</div>
            : <RevenueChart data={chartData} />
          }
        </div>
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
          <h2 className="text-sm font-semibold text-[#1e2a3a] mb-4">Tồn kho theo trạng thái</h2>
          {inventoryStatus.length > 0
            ? <DonutChart data={inventoryStatus} />
            : <div className="flex items-center justify-center h-44 text-sm text-gray-400">Chưa có dữ liệu tồn kho</div>
          }
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <SectionCard title="Đơn hàng mới nhất" link="Xem tất cả" linkHref="/ban-hang/don-hang-ban" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-[#e5e7eb] bg-gray-50">
                {['Mã đơn','Khách hàng','Tổng tiền','Trạng thái','Ngày'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {recentOrders.map(o => (
                  <tr key={o.code} className="border-b border-[#e5e7eb] last:border-0 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-[#0ea5e9] font-medium text-xs">{o.code}</td>
                    <td className="px-4 py-3 text-xs text-gray-700 max-w-[140px] truncate">{o.customer}</td>
                    <td className="px-4 py-3 text-xs font-medium text-[#1e2a3a] whitespace-nowrap">{formatVND(o.total)}</td>
                    <td className="px-4 py-3"><Badge status={o.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(o.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#1e2a3a]">Khách hàng Top 5</h2>
            <a href="/ban-hang/khach-hang" className="text-xs text-[#0ea5e9] hover:underline">Xem thêm →</a>
          </div>
          <div className="space-y-3">
            {topCustomers.map((c, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-700 truncate flex-1 mr-2">{c.name}</span>
                  <span className="text-xs font-medium text-[#1e2a3a]">{c.pct}%</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className="bg-[#0ea5e9] h-1.5 rounded-full" style={{ width: `${c.pct * 4}%` }} />
                </div>
                <p className="text-[10px] text-gray-400 mt-0.5">{formatVND(c.amount)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
        <SectionCard title="Lịch giao hàng hôm nay" link="Xem tất cả" linkHref="/logistics/don-van-chuyen">
          <div className="divide-y divide-[#e5e7eb]">
            {recentDeliveries.map(d => (
              <div key={d.code} className="px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#0ea5e9]">{d.code}</span>
                  <Badge status={d.status} />
                </div>
                <p className="text-xs text-gray-700 mt-0.5">{d.driver}</p>
                <p className="text-xs text-gray-400">{d.route} · ETA {d.eta && d.eta !== '—' ? formatDate(d.eta) : d.eta}</p>
              </div>
            ))}
          </div>
        </SectionCard>
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#e5e7eb] p-4">
          <h2 className="text-sm font-semibold text-[#1e2a3a] mb-4">Doanh thu theo sản phẩm</h2>
          {topProducts.length > 0
            ? <SimpleBarChart data={topProducts} height={240} formatter={v => v >= 1_000_000 ? (v/1_000_000).toFixed(1)+'tr' : Math.round(v/1_000)+'K'} />
            : <div className="flex items-center justify-center h-52 text-sm text-gray-400">Chưa có dữ liệu bán hàng</div>
          }
        </div>
        <SectionCard title="Thông báo hệ thống">
          <NotifList data={data} />
        </SectionCard>
      </div>

      <AdminKpiSection />
    </div>
  )
}

// ─── Salary / KPI component (dùng cho Sales dashboard) ───────────────────────

const SALARY_BASE = 8_000_000
const ALLOWANCES = [
  { name: 'Phụ cấp xăng xe',   amount: 500_000 },
  { name: 'Phụ cấp điện thoại', amount: 300_000 },
  { name: 'Phụ cấp ăn trưa',   amount: 600_000 },
]
const INITIAL_KPIS = [
  { id: 1, name: 'Doanh số tháng (đ)', target: 350_000_000, actual: 284_500_000, baseBonus: 5_000_000, coefficient: 1.5 },
  { id: 2, name: 'Số đơn hàng mới',    target: 20,          actual: 16,          baseBonus: 1_000_000, coefficient: 1.0 },
  { id: 3, name: 'Tỷ lệ chốt đơn (%)', target: 70,          actual: 65,          baseBonus: 800_000,   coefficient: 1.2 },
]

const SALARY_STORAGE_KEY = 'mia_salary_config'

function SalarySection() {
  const [kpis, setKpis] = React.useState(INITIAL_KPIS)
  const [baseSalary, setBaseSalary] = React.useState(SALARY_BASE)
  const [allowances, setAllowances] = React.useState(ALLOWANCES)
  const [editing, setEditing] = React.useState<number | null>(null)
  const [newKpiName, setNewKpiName] = React.useState('')
  const [showAddKpi, setShowAddKpi] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(SALARY_STORAGE_KEY)
      if (raw) {
        const cfg = JSON.parse(raw)
        if (cfg.kpis)       setKpis(cfg.kpis)
        if (cfg.baseSalary) setBaseSalary(cfg.baseSalary)
        if (cfg.allowances) setAllowances(cfg.allowances)
      }
    } catch {}
  }, [])

  const persist = (patch: Partial<{ kpis: typeof INITIAL_KPIS; baseSalary: number; allowances: typeof ALLOWANCES }>) => {
    try {
      const current = JSON.parse(localStorage.getItem(SALARY_STORAGE_KEY) ?? '{}')
      localStorage.setItem(SALARY_STORAGE_KEY, JSON.stringify({ ...current, ...patch }))
    } catch {}
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const totalAllowances = allowances.reduce((s, a) => s + a.amount, 0)

  const kpiRows = kpis.map(k => {
    const pct = Math.min(k.actual / k.target, 1.5)
    const bonus = Math.round(k.baseBonus * k.coefficient * pct)
    return { ...k, pct, bonus }
  })

  const totalKpiBonus = kpiRows.reduce((s, k) => s + k.bonus, 0)
  const grandTotal = baseSalary + totalAllowances + totalKpiBonus

  const updateKpi = (id: number, field: string, val: number) => {
    const next = kpis.map(k => k.id === id ? { ...k, [field]: val } : k)
    setKpis(next)
    persist({ kpis: next })
  }

  const removeKpi = (id: number) => {
    const next = kpis.filter(k => k.id !== id)
    setKpis(next)
    persist({ kpis: next })
  }

  const addKpi = () => {
    if (!newKpiName.trim()) return
    const next = [...kpis, { id: Date.now(), name: newKpiName.trim(), target: 100, actual: 0, baseBonus: 500_000, coefficient: 1.0 }]
    setKpis(next)
    persist({ kpis: next })
    setNewKpiName('')
    setShowAddKpi(false)
  }

  const pctColor = (pct: number) =>
    pct >= 1 ? 'text-green-600' : pct >= 0.8 ? 'text-yellow-600' : 'text-red-500'

  const barColor = (pct: number) =>
    pct >= 1 ? 'bg-green-500' : pct >= 0.8 ? 'bg-yellow-400' : 'bg-red-400'

  return (
    <div className="bg-white rounded-xl border border-[#e5e7eb]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e5e7eb]">
        <div className="flex items-center gap-2">
          <Banknote size={16} className="text-[#0ea5e9]" />
          <h2 className="text-sm font-semibold text-[#1e2a3a]">Hiệu suất & Thu nhập — Tháng 5/2024</h2>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[10px] text-green-600 font-medium">✓ Đã lưu</span>}
          <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">Tạm tính</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-[#e5e7eb]">

        {/* LEFT — Breakdown */}
        <div className="lg:col-span-2 p-5 space-y-4">
          {/* Lương cơ bản */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Lương cơ bản</p>
            <div className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-600">Lương cơ bản</span>
              {editing === -1 ? (
                <input
                  type="number"
                  className="text-xs font-semibold text-[#1e2a3a] text-right w-32 border border-[#0ea5e9] rounded px-1 outline-none"
                  value={baseSalary}
                  onChange={e => setBaseSalary(Number(e.target.value))}
                  onBlur={() => setEditing(null)}
                  autoFocus
                />
              ) : (
                <span
                  className="text-xs font-semibold text-[#1e2a3a] hover:text-[#0ea5e9] cursor-pointer"
                  onClick={() => setEditing(-1)}
                  title="Click để sửa"
                >
                  {formatVND(baseSalary)}
                </span>
              )}
            </div>
          </div>

          {/* Phụ cấp */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Phụ cấp</p>
            <div className="space-y-1.5">
              {allowances.map((a, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-600">{a.name}</span>
                  <span className="text-xs font-medium text-gray-700">+{formatVND(a.amount)}</span>
                </div>
              ))}
              <div className="flex justify-end pt-1">
                <span className="text-xs font-semibold text-gray-500">= {formatVND(totalAllowances)}</span>
              </div>
            </div>
          </div>

          {/* KPI tổng */}
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Thưởng KPI</p>
            <div className="space-y-1.5">
              {kpiRows.map(k => (
                <div key={k.id} className="flex items-center justify-between py-1.5 px-3 bg-blue-50 rounded-lg">
                  <span className="text-xs text-gray-600 truncate flex-1 mr-2">{k.name}</span>
                  <span className="text-xs font-medium text-[#0ea5e9] shrink-0">+{formatVND(k.bonus)}</span>
                </div>
              ))}
              <div className="flex justify-end pt-1">
                <span className="text-xs font-semibold text-gray-500">= {formatVND(totalKpiBonus)}</span>
              </div>
            </div>
          </div>

          {/* Grand total */}
          <div className="border-t border-dashed border-[#e5e7eb] pt-4">
            <div className="flex items-center justify-between bg-[#1e2a3a] rounded-xl px-4 py-3">
              <div>
                <p className="text-white/50 text-[10px] uppercase tracking-wider">Tổng thu nhập dự kiến</p>
                <p className="text-xl font-bold text-white mt-0.5">{formatVND(grandTotal)}</p>
              </div>
              <TrendingUp size={28} className="text-[#0ea5e9]" />
            </div>
          </div>
        </div>

        {/* RIGHT — KPI table */}
        <div className="lg:col-span-3 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Chi tiết KPI</p>
            <button
              onClick={() => setShowAddKpi(v => !v)}
              className="text-xs text-[#0ea5e9] hover:text-[#0284c7] font-medium transition-colors flex items-center gap-1"
            >
              + Thêm KPI
            </button>
          </div>

          {showAddKpi && (
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Tên KPI mới..."
                value={newKpiName}
                onChange={e => setNewKpiName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addKpi()}
                className="flex-1 text-xs border border-[#e5e7eb] rounded-lg px-3 py-1.5 outline-none focus:border-[#0ea5e9]"
                autoFocus
              />
              <button onClick={addKpi} className="text-xs bg-[#0ea5e9] text-white px-3 py-1.5 rounded-lg hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 transition-all">Thêm</button>
              <button onClick={() => setShowAddKpi(false)} className="text-xs text-gray-400 hover:text-gray-600 px-2 transition-colors">Hủy</button>
            </div>
          )}

          <div className="space-y-4">
            {kpiRows.map(k => (
              <div key={k.id} className="border border-[#e5e7eb] rounded-xl p-4 hover:border-[#0ea5e9]/40 transition-colors group">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs font-semibold text-[#1e2a3a]">{k.name}</p>
                  <button
                    onClick={() => removeKpi(k.id)}
                    className="text-[10px] text-gray-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all ml-2 shrink-0"
                  >
                    ✕
                  </button>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                  <div
                    className={`h-2 rounded-full transition-all ${barColor(k.pct)}`}
                    style={{ width: `${Math.min(k.pct * 100, 100)}%` }}
                  />
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Mục tiêu</p>
                    <input
                      type="number"
                      className="w-full text-xs font-semibold text-[#1e2a3a] text-center bg-gray-50 border border-transparent hover:border-[#e5e7eb] focus:border-[#0ea5e9] rounded px-1 py-0.5 outline-none transition-colors"
                      value={k.target}
                      onChange={e => updateKpi(k.id, 'target', Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Thực hiện</p>
                    <input
                      type="number"
                      className="w-full text-xs font-semibold text-[#1e2a3a] text-center bg-gray-50 border border-transparent hover:border-[#e5e7eb] focus:border-[#0ea5e9] rounded px-1 py-0.5 outline-none transition-colors"
                      value={k.actual}
                      onChange={e => updateKpi(k.id, 'actual', Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Hệ số</p>
                    <input
                      type="number"
                      step="0.1"
                      className="w-full text-xs font-semibold text-[#1e2a3a] text-center bg-gray-50 border border-transparent hover:border-[#e5e7eb] focus:border-[#0ea5e9] rounded px-1 py-0.5 outline-none transition-colors"
                      value={k.coefficient}
                      onChange={e => updateKpi(k.id, 'coefficient', Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 mb-0.5">Hoàn thành</p>
                    <p className={`text-xs font-bold ${pctColor(k.pct)}`}>{Math.round(k.pct * 100)}%</p>
                  </div>
                </div>

                {/* Bonus line */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-dashed border-[#e5e7eb]">
                  <div className="flex items-center gap-2 text-[10px] text-gray-400">
                    <span>Thưởng gốc:</span>
                    <input
                      type="number"
                      className="w-24 text-center bg-gray-50 border border-transparent hover:border-[#e5e7eb] focus:border-[#0ea5e9] rounded px-1 py-0.5 outline-none transition-colors text-gray-600"
                      value={k.baseBonus}
                      onChange={e => updateKpi(k.id, 'baseBonus', Number(e.target.value))}
                    />
                    <span className="text-[10px] text-gray-400">đ × {k.coefficient} × {Math.round(k.pct * 100)}%</span>
                  </div>
                  <span className="text-sm font-bold text-[#0ea5e9]">= {formatVND(k.bonus)}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-gray-400 mt-4 text-center">
            * Công thức: Thưởng KPI = Thưởng gốc × Hệ số × (Thực hiện / Mục tiêu), tối đa 150%
          </p>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALES DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function SalesDashboard({ name }: { name: string }) {
  const { data } = useDashboard()
  const myOrders = data.recentOrders.slice(0, 4)
  const topCustomers = data.topCustomers
  const quotes: { id: string; customer: string; amount: number; status: string; expiry: string }[] = []
  const [revPeriod, setRevPeriod] = useState<RevPeriod>('month')
  const { chartData, chartLoading } = useRevenueChart(revPeriod)

  return (
    <div>
      <PageTitle name={name} subtitle="Tổng quan bán hàng của bạn hôm nay" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard icon={<ShoppingCart size={20} className="text-blue-600" />}  label="Đơn của tôi"       value="—"  sub="Tháng này"  iconBg="bg-blue-100" />
        <KpiCard icon={<DollarSign size={20} className="text-green-600" />}   label="Doanh số tháng"    value="—"  sub="Tháng này"  iconBg="bg-green-100" />
        <KpiCard icon={<FileText size={20} className="text-yellow-600" />}    label="Báo giá chờ duyệt" value="—"  sub="Cần xử lý"  iconBg="bg-yellow-100" />
        <KpiCard icon={<Users size={20} className="text-purple-600" />}       label="KH phụ trách"      value="—"  sub="Tổng số"    iconBg="bg-purple-100" />
      </div>

      {/* Target progress */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-[#1e2a3a]">Tiến độ doanh số tháng này</h2>
          <span className="text-xs text-gray-400">Mục tiêu: —</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
          <div className="bg-[#0ea5e9] h-3 rounded-full transition-all" style={{ width: '0%' }} />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-[#0ea5e9] font-semibold">— đạt được (—%)</span>
          <span className="text-gray-400">Chưa có dữ liệu</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <SectionCard title="Đơn hàng của tôi" link="Xem tất cả" linkHref="/ban-hang/don-hang-ban">
          <div className="divide-y divide-[#e5e7eb]">
            {myOrders.map(o => (
              <div key={o.code} className="px-4 py-3 hover:bg-gray-50 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-[#0ea5e9]">{o.code}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{o.customer}</p>
                  <p className="text-[10px] text-gray-400">{formatVND(o.total)}</p>
                </div>
                <Badge status={o.status} />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Báo giá cần xử lý" link="Xem tất cả" linkHref="/ban-hang/bao-gia">
          <div className="divide-y divide-[#e5e7eb]">
            {quotes.map(q => (
              <div key={q.id} className="px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-[#0ea5e9]">{q.id}</span>
                  <Badge status={q.status} />
                </div>
                <p className="text-xs text-gray-600">{q.customer}</p>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-gray-400">HH: {formatDate(q.expiry)}</span>
                  <span className="text-[10px] font-semibold text-[#1e2a3a]">{formatVND(q.amount)}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Top khách hàng của tôi" link="Xem thêm" linkHref="/ban-hang/khach-hang">
          <div className="p-4 space-y-3">
            {topCustomers.slice(0, 4).map((c, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-[#1e2a3a] truncate">{c.name}</p>
                  <p className="text-[10px] text-gray-400">{formatVND(c.amount)}</p>
                </div>
                <div className="flex">
                  {[1,2,3,4,5].map(s => <Star key={s} size={10} className={s <= 4 ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'} />)}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#e5e7eb] p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#1e2a3a]">Doanh thu theo thời gian</h2>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {REV_PERIODS.map(p => (
                <button key={p.key} onClick={() => setRevPeriod(p.key)}
                  className={`text-xs px-2.5 py-1 rounded-md transition-all ${revPeriod === p.key ? 'bg-white text-[#1e2a3a] font-semibold shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {chartLoading
            ? <div className="h-[200px] flex items-center justify-center text-sm text-gray-400">Đang tải...</div>
            : <RevenueChart data={chartData} />
          }
        </div>
        <SectionCard title="Thông báo">
          <NotifList data={data} />
        </SectionCard>
      </div>

      <SalarySection />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// WAREHOUSE DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function WarehouseDashboard({ name }: { name: string }) {
  const { data, loading } = useDashboard()
  const { kpis, lowStockItems, pendingReceipts, pendingIssues, inventoryStatus } = data

  return (
    <div>
      <PageTitle name={name} subtitle="Tình trạng kho hàng hôm nay" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard icon={<ArrowDownToLine size={20} className="text-blue-600" />}  label="Phiếu nhập chờ"  value={loading ? '—' : pendingReceipts.length}  sub="Hiện tại"    iconBg="bg-blue-100" />
        <KpiCard icon={<ArrowUpFromLine size={20} className="text-orange-600" />} label="Phiếu xuất chờ" value={loading ? '—' : pendingIssues.length}    sub="Cần xử lý"   iconBg="bg-orange-100" />
        <KpiCard icon={<AlertTriangle size={20} className="text-red-500" />}      label="Hàng sắp hết"   value={loading ? '—' : kpis.lowStock}           sub="Cần xử lý"   iconBg="bg-red-100" />
        <KpiCard icon={<Package size={20} className="text-green-600" />}          label="Tổng SKU"        value="—"                                       sub="Trong hệ thống" iconBg="bg-green-100" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
          <h2 className="text-sm font-semibold text-[#1e2a3a] mb-4">Tồn kho theo trạng thái</h2>
          {inventoryStatus.length > 0
            ? <DonutChart data={inventoryStatus} />
            : <div className="flex items-center justify-center h-44 text-sm text-gray-400">Chưa có dữ liệu</div>
          }
        </div>

        <SectionCard title="Hàng sắp hết / hết hàng" link="Xem tất cả" linkHref="/kho-hang/san-pham">
          <div className="divide-y divide-[#e5e7eb]">
            {lowStockItems.map(item => (
              <div key={item.sku} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-[#1e2a3a]">{item.name}</p>
                  <p className="text-[10px] text-gray-400">{item.sku}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${item.current === 0 ? 'text-red-500' : 'text-yellow-600'}`}>
                    {item.current} {item.unit}
                  </p>
                  <p className="text-[10px] text-gray-400">Min: {item.min}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Thông báo kho">
          <NotifList data={data} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Phiếu nhập kho đang xử lý" link="Xem tất cả" linkHref="/kho-hang/nhap-kho">
          <table className="w-full">
            <thead><tr className="border-b border-[#e5e7eb] bg-gray-50">
              {['Mã phiếu', 'Nhà cung cấp', 'Ngày dự kiến', 'Trạng thái'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pendingReceipts.map(r => (
                <tr key={r.code} className="border-b border-[#f0f2f5] hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs font-medium text-[#0ea5e9]">{r.code}</td>
                  <td className="px-4 py-3 text-xs text-gray-700">{r.supplier}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(r.expected)}</td>
                  <td className="px-4 py-3"><Badge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard title="Phiếu xuất kho đang chờ" link="Xem tất cả" linkHref="/kho-hang/xuat-kho">
          <table className="w-full">
            <thead><tr className="border-b border-[#e5e7eb] bg-gray-50">
              {['Mã phiếu', 'Đơn hàng', 'Kho', 'Trạng thái'].map(h => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {pendingIssues.map(r => (
                <tr key={r.code} className="border-b border-[#f0f2f5] hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs font-medium text-[#0ea5e9]">{r.code}</td>
                  <td className="px-4 py-3 text-xs text-gray-700">{r.order}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.warehouse}</td>
                  <td className="px-4 py-3"><Badge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGISTICS DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function LogisticsDashboard({ name }: { name: string }) {
  const { data, loading } = useDashboard()
  const { vehicles, recentDeliveries, deliveryWeekly } = data
  const delivering = recentDeliveries.filter(d => d.status === 'delivering').length
  const delivered  = recentDeliveries.filter(d => d.status === 'delivered').length
  const delayed    = recentDeliveries.filter(d => d.status === 'delayed').length

  return (
    <div>
      <PageTitle name={name} subtitle="Điều phối vận chuyển hôm nay" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard icon={<Truck size={20} className="text-blue-600" />}          label="Tổng chuyến"       value={loading ? '—' : recentDeliveries.length} sub="Hôm nay"   iconBg="bg-blue-100" />
        <KpiCard icon={<CheckCircle2 size={20} className="text-green-600" />}  label="Đã giao thành công" value={loading ? '—' : delivered}             sub="Hôm nay"   iconBg="bg-green-100" />
        <KpiCard icon={<Clock size={20} className="text-orange-600" />}        label="Đang vận chuyển"   value={loading ? '—' : delivering}             sub="Hiện tại"  iconBg="bg-orange-100" />
        <KpiCard icon={<XCircle size={20} className="text-red-500" />}         label="Giao trễ / lỗi"    value={loading ? '—' : delayed}               sub="Hôm nay"   iconBg="bg-red-100" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <SectionCard title="Chuyến giao hàng hôm nay" link="Xem tất cả" linkHref="/logistics/don-van-chuyen">
          <div className="divide-y divide-[#e5e7eb]">
            {recentDeliveries.map(d => (
              <div key={d.code} className="px-4 py-3 hover:bg-gray-50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-[#0ea5e9]">{d.code}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-400">ETA {d.eta && d.eta !== '—' ? formatDate(d.eta) : d.eta}</span>
                    <Badge status={d.status} />
                  </div>
                </div>
                <p className="text-xs text-gray-700">{d.driver} · <span className="text-gray-400">{d.route}</span></p>
                <p className="text-[10px] text-gray-400 mt-0.5">Đơn: {d.order}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Tình trạng phương tiện" link="Quản lý" linkHref="/logistics/phuong-tien">
          <div className="divide-y divide-[#e5e7eb]">
            {vehicles.map(v => (
              <div key={v.plate} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-[#1e2a3a]">{v.plate}</p>
                  <p className="text-[10px] text-gray-400">{v.type} · {v.driver}</p>
                  {v.route !== '—' && <p className="text-[10px] text-sky-500 mt-0.5">{v.route}</p>}
                </div>
                <Badge status={v.status === 'on_trip' ? 'delivering' : 'active'} />
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#e5e7eb] p-4">
          <h2 className="text-sm font-semibold text-[#1e2a3a] mb-4">Hiệu suất giao hàng 7 ngày qua</h2>
          <SimpleBarChart data={deliveryWeekly} formatter={v => v + ' chuyến'} />
        </div>
        <SectionCard title="Thông báo vận chuyển">
          <NotifList data={data} />
        </SectionCard>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// DRIVER DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════

function DriverDashboard({ name }: { name: string }) {
  const { data, loading } = useDashboard()
  const myDeliveries = data.myDeliveries
  const delivered = myDeliveries.filter(d => d.status === 'delivered').length
  const remaining = myDeliveries.filter(d => d.status !== 'delivered').length

  const STATUS_COLOR: Record<string, string> = {
    delivered:  'border-l-4 border-green-400 bg-green-50',
    delivering: 'border-l-4 border-blue-400 bg-blue-50',
    pending:    'border-l-4 border-gray-200 bg-white',
  }

  return (
    <div>
      <PageTitle name={name} subtitle="Lịch giao hàng của bạn hôm nay" />

      <div className="grid grid-cols-3 gap-3 mb-5">
        <KpiCard icon={<Truck size={20} className="text-blue-600" />}         label="Tổng chuyến"    value={myDeliveries.length} sub="Hôm nay"         iconBg="bg-blue-100" />
        <KpiCard icon={<CheckCircle2 size={20} className="text-green-600" />} label="Đã giao xong"   value={delivered}           sub="Thành công"      subColor="green" iconBg="bg-green-100" />
        <KpiCard icon={<Clock size={20} className="text-orange-600" />}       label="Còn lại"        value={remaining}           sub="Cần hoàn thành"  subColor="orange" iconBg="bg-orange-100" />
      </div>

      <div className="space-y-3 mb-5">
        {myDeliveries.map((d, i) => (
          <div key={d.code} className={`rounded-xl border border-[#e5e7eb] overflow-hidden ${STATUS_COLOR[d.status]}`}>
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-gray-400">#{i + 1}</span>
                    <span className="text-sm font-bold text-[#1e2a3a]">{d.customer}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <MapPin size={11} className="shrink-0" />
                    {d.address}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <Badge status={d.status} />
                  <p className="text-[10px] text-gray-400 mt-1">ETA {d.eta && d.eta !== '—' ? formatDate(d.eta) : d.eta}</p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">{d.items} kiện hàng</span>
                  <span className="text-xs font-mono text-gray-400">{d.code}</span>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`tel:${d.phone}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-[#e5e7eb] text-xs text-gray-600 rounded-lg hover:bg-white transition-colors bg-white/60">
                    <Phone size={11} /> Gọi KH
                  </a>
                  {d.status === 'pending' && (
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0ea5e9] text-white text-xs font-semibold rounded-lg hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 transition-all">
                      <Navigation size={11} /> Bắt đầu
                    </button>
                  )}
                  {d.status === 'delivering' && (
                    <button className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 hover:scale-[1.02] active:scale-95 transition-all">
                      <CheckCircle2 size={11} /> Xác nhận POD
                    </button>
                  )}
                  {d.status === 'delivered' && (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                      <CheckCircle2 size={12} /> Đã giao
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[#1e2a3a] rounded-xl p-5 text-white">
        <h3 className="text-sm font-bold mb-3">Tóm tắt ngày làm việc</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div><p className="text-2xl font-bold text-[#0ea5e9]">{myDeliveries.length}</p><p className="text-xs text-white/50 mt-0.5">Tổng chuyến</p></div>
          <div><p className="text-2xl font-bold text-green-400">{delivered}</p><p className="text-xs text-white/50 mt-0.5">Giao thành công</p></div>
          <div><p className="text-2xl font-bold text-yellow-400">{remaining}</p><p className="text-xs text-white/50 mt-0.5">Còn lại</p></div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT — pick dashboard by role
// ═══════════════════════════════════════════════════════════════════════════════

export default function DashboardPage() {
  const { user } = useAuth()
  const name = user?.name ?? 'bạn'
  const role = user?.role ?? 'admin'

  if (role === 'sales')     return <SalesDashboard name={name} />
  if (role === 'warehouse') return <WarehouseDashboard name={name} />
  if (role === 'logistics') return <LogisticsDashboard name={name} />
  if (role === 'driver')    return <DriverDashboard name={name} />
  return <AdminDashboard name={name} />
}
