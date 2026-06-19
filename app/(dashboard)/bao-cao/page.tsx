'use client'
import { useState, useEffect } from 'react'
import {
  Download, ArrowUpRight, ArrowDownRight, ChevronRight,
  Lock, Printer, CalendarDays, Mail, Plus, Trash2,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, LineChart, Line,
} from 'recharts'
import * as XLSX from 'xlsx'

// ─── Types & helpers ──────────────────────────────────────────────────────────
type MonthRow = { month: string; key: string; revenue: number; cogs: number; logistics: number; warehouse: number; salary: number; other: number }
type CategoryRow = { catId: string; name: string; revenue: number; pct: number; color: string }
type ProductRow = { id: string; name: string; revenue: number; qty: number; growth: number }
type CustomerRow = { id: string; name: string; revenue: number; orders: number }
type UserKpi = { id: string; name: string; code: string; revenue: number; orders: number }
type PlanTier = 'starter' | 'growth' | 'enterprise'

const fmtVND   = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ'
const fmtShort = (n: number) => n >= 1e9 ? (n/1e9).toFixed(1)+'tỷ' : n >= 1e6 ? (n/1e6).toFixed(0)+'tr' : n.toString()
const opex     = (m: MonthRow) => m.logistics + m.warehouse + m.salary + m.other
const gross    = (m: MonthRow) => m.revenue - m.cogs
const net      = (m: MonthRow) => gross(m) - opex(m)
const AREA_COLORS = { revenue: '#0ea5e9', grossProfit: '#10b981', netProfit: '#8b5cf6' }
const PLAN_RANK: Record<PlanTier, number> = { starter: 0, growth: 1, enterprise: 2 }

function getPlanTier(plan: string | null | undefined): PlanTier {
  if (plan === 'enterprise') return 'enterprise'
  if (plan === 'growth' || plan === 'pro') return 'growth'
  return 'starter'
}

function usePlan(): PlanTier {
  const [plan, setPlan] = useState<PlanTier>('starter')
  useEffect(() => {
    // Hiển thị ngay từ cache
    try {
      const raw = localStorage.getItem('mia_tenant')
      if (raw) setPlan(getPlanTier(JSON.parse(raw).plan))
    } catch {}

    // Luôn fetch fresh từ server để lấy plan mới nhất
    ;(async () => {
      try {
        const { supabase } = await import('@/lib/supabase')
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch('/api/me', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (!res.ok) return
        const profile = await res.json()
        if (profile?.tenant_plan) {
          const fresh = getPlanTier(profile.tenant_plan)
          setPlan(fresh)
          // Cập nhật lại cache
          try {
            const raw = localStorage.getItem('mia_tenant')
            if (raw) {
              const cached = JSON.parse(raw)
              cached.plan = profile.tenant_plan
              localStorage.setItem('mia_tenant', JSON.stringify(cached))
            }
          } catch {}
        }
      } catch {}
    })()
  }, [])
  return plan
}

function canAccess(plan: PlanTier, minPlan: PlanTier) {
  return PLAN_RANK[plan] >= PLAN_RANK[minPlan]
}

function linearForecast(data: number[], periods: number): number[] {
  const n = data.length
  if (n < 2) return Array(periods).fill(data[0] ?? 0)
  const xMean = (n - 1) / 2
  const yMean = data.reduce((a, b) => a + b, 0) / n
  const ssXY  = data.reduce((s, y, i) => s + (i - xMean) * (y - yMean), 0)
  const ssXX  = data.reduce((s, _, i) => s + (i - xMean) ** 2, 0)
  const slope = ssXX === 0 ? 0 : ssXY / ssXX
  const intercept = yMean - slope * xMean
  return Array.from({ length: periods }, (_, i) => Math.max(0, Math.round(intercept + slope * (n + i))))
}

function nextMonthStr(lastMonthStr: string, offset: number): string {
  const parts = lastMonthStr.split('/')
  if (parts.length !== 2) return lastMonthStr
  const [m, y] = parts.map(Number)
  const d = new Date(y, m - 1 + offset)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// ─── Shared components ────────────────────────────────────────────────────────
function Delta({ cur, prev }: { cur: number; prev: number }) {
  const pct = prev === 0 ? 0 : ((cur - prev) / prev) * 100
  const up = pct >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

function DeltaRow({ label, cur, prev, format }: { label: string; cur: number; prev: number; format: (n: number) => string }) {
  const pct = prev === 0 ? 0 : ((cur - prev) / prev) * 100
  const up = pct >= 0
  return (
    <tr className="border-b border-[#e5e7eb] last:border-0 hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-[#1e2a3a] font-medium">{label}</td>
      <td className="px-4 py-3 text-sm text-right font-semibold text-[#0ea5e9]">{format(cur)}</td>
      <td className="px-4 py-3 text-sm text-right text-gray-500">{format(prev)}</td>
      <td className="px-4 py-3 text-right">
        <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
          {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
        </span>
      </td>
    </tr>
  )
}

function LockedTab({ requiredPlan }: { requiredPlan: 'growth' | 'enterprise' }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mb-4 border border-amber-100">
        <Lock size={26} className="text-amber-400" />
      </div>
      <h3 className="text-base font-bold text-[#1e2a3a] mb-2">
        Tính năng dành cho gói {requiredPlan === 'growth' ? 'Growth trở lên' : 'Enterprise'}
      </h3>
      <p className="text-sm text-gray-500 max-w-xs mb-5">
        {requiredPlan === 'growth'
          ? 'Nâng cấp lên Growth để mở biểu đồ tương tác, so sánh kỳ, drill-down danh mục và KPI nhân viên.'
          : 'Nâng cấp lên Enterprise để xem dự báo doanh thu và lên lịch gửi báo cáo tự động.'}
      </p>
      <span className="px-4 py-2 bg-amber-400 text-[#0f172a] text-sm font-bold rounded-xl">
        Liên hệ owner để nâng cấp
      </span>
    </div>
  )
}

// ─── Tab: Tổng quan cơ bản (Starter) ─────────────────────────────────────────
function TabTongQuanBasic({ monthly }: { monthly: MonthRow[] }) {
  const [topProducts, setTopProducts] = useState<{ name: string; revenue: number }[]>([])
  const [inventory,   setInventory]   = useState<{ sku: string; name: string; qty: number; unit: string }[]>([])

  useEffect(() => {
    fetch('/api/reports?type=top_products').then(r => r.json()).then(setTopProducts).catch(() => {})
    fetch('/api/reports?type=inventory_current').then(r => r.json()).then(setInventory).catch(() => {})
  }, [])

  if (!monthly.length) return <div className="text-center py-16 text-sm text-gray-400">Chưa có dữ liệu</div>

  const cur  = monthly[monthly.length - 1]
  const prev = monthly[monthly.length - 2]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: `Doanh thu ${cur.month}`, value: fmtShort(cur.revenue),   hasDelta: !!prev, cur: cur.revenue,   prev: prev?.revenue ?? 0,    color: 'text-[#0ea5e9]' },
          { label: `LN gộp ${cur.month}`,    value: fmtShort(gross(cur)),    hasDelta: !!prev, cur: gross(cur),   prev: prev ? gross(prev) : 0, color: 'text-green-600' },
          { label: 'SKU còn hàng',            value: inventory.length + ' SKU', hasDelta: false, cur: 0, prev: 0,  color: 'text-amber-600' },
          { label: 'Biên LN gộp',             value: cur.revenue > 0 ? Math.round(gross(cur)/cur.revenue*100) + '%' : '—', hasDelta: false, cur: 0, prev: 0, color: 'text-purple-600' },
        ].map(({ label, value, hasDelta, cur: c, prev: p, color }) => (
          <div key={label} className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{value}</p>
            {hasDelta && <div className="mt-1"><Delta cur={c} prev={p} /></div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Monthly table */}
        <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e5e7eb]">
            <h3 className="text-sm font-semibold text-[#1e2a3a]">Doanh thu theo tháng</h3>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="bg-gray-50">
              {['Tháng', 'Doanh thu', 'LN gộp', 'Biên%'].map(h => (
                <th key={h} className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase text-left">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {[...monthly].reverse().map(m => {
                const gp = gross(m)
                const margin = m.revenue > 0 ? Math.round(gp / m.revenue * 100) : 0
                return (
                  <tr key={m.key} className="border-t border-[#e5e7eb] hover:bg-gray-50">
                    <td className="px-3 py-2.5 text-xs font-medium">{m.month}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-[#0ea5e9]">{fmtShort(m.revenue)}</td>
                    <td className="px-3 py-2.5 text-xs text-green-600">{fmtShort(gp)}</td>
                    <td className="px-3 py-2.5 text-xs">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${margin >= 25 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{margin}%</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Top 10 products */}
        <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e5e7eb]">
            <h3 className="text-sm font-semibold text-[#1e2a3a]">Top 10 sản phẩm bán chạy</h3>
          </div>
          {topProducts.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">Chưa có đơn hàng hoàn thành</div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50">
                {['#', 'Sản phẩm', 'Doanh thu'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase text-left last:text-right">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {topProducts.slice(0, 10).map((p, i) => (
                  <tr key={p.name} className="border-t border-[#e5e7eb] hover:bg-gray-50">
                    <td className="px-3 py-2.5">
                      <span className="w-5 h-5 inline-flex items-center justify-center rounded bg-[#1e2a3a] text-white text-[10px] font-bold">{i + 1}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium text-[#1e2a3a]">{p.name}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-[#0ea5e9] text-right">{fmtShort(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Tồn kho hiện tại */}
      {inventory.length > 0 && (
        <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e5e7eb] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1e2a3a]">Tồn kho hiện tại</h3>
            <span className="text-xs text-gray-400">{inventory.length} SKU đang có hàng</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50">
                {['SKU', 'Sản phẩm', 'Tồn kho', 'Đơn vị'].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-left">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {inventory.slice(0, 20).map(item => (
                  <tr key={item.sku + item.name} className="border-t border-[#e5e7eb] hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-400">{item.sku}</td>
                    <td className="px-4 py-2.5 text-xs font-medium text-[#1e2a3a]">{item.name}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-[#0ea5e9]">{item.qty.toLocaleString('vi-VN')}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{item.unit || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Tổng quan (Growth+) ─────────────────────────────────────────────────
function TabTongQuan({ monthly }: { monthly: MonthRow[] }) {
  const [topProducts, setTopProducts] = useState<{ name: string; revenue: number }[]>([])

  useEffect(() => {
    fetch('/api/reports?type=top_products').then(r => r.json()).then(setTopProducts).catch(() => {})
  }, [])

  if (!monthly.length) return <div className="text-center py-16 text-sm text-gray-400">Chưa có dữ liệu</div>

  const cur  = monthly[monthly.length - 1]
  const prev = monthly[monthly.length - 2]

  const areaData = monthly.map(m => ({
    month: m.month,
    'Doanh thu': m.revenue,
    'LN gộp': gross(m),
    'LN ròng': net(m),
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          { label: `Doanh thu ${cur.month}`, cur: cur.revenue,    prev: prev?.revenue ?? 0,    color: 'text-[#0ea5e9]' },
          { label: `LN gộp ${cur.month}`,    cur: gross(cur),     prev: prev ? gross(prev) : 0, color: 'text-green-600' },
          { label: `LN ròng ${cur.month}`,   cur: net(cur),       prev: prev ? net(prev) : 0,   color: 'text-purple-600' },
          { label: 'Biên LN gộp',            cur: cur.revenue > 0 ? Math.round(gross(cur)/cur.revenue*100) : 0,
                                             prev: prev && prev.revenue > 0 ? Math.round(gross(prev)/prev.revenue*100) : 0,
                                             color: 'text-orange-500', unit: '%' },
        ].map(({ label, cur: c, prev: p, color, unit }) => (
          <div key={label} className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{unit ? c + unit : fmtShort(c)}</p>
            <div className="mt-1"><Delta cur={c} prev={p} /></div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white rounded-xl border border-[#e5e7eb] p-4">
          <h3 className="text-sm font-semibold text-[#1e2a3a] mb-4">Xu hướng doanh thu & lợi nhuận (6 tháng gần nhất)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={areaData.slice(-6)} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {Object.entries(AREA_COLORS).map(([k, color]) => (
                  <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={color} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} width={52} />
              <Tooltip formatter={(v: any) => fmtVND(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="Doanh thu"  stroke="#0ea5e9" fill="url(#g-revenue)"     strokeWidth={2} />
              <Area type="monotone" dataKey="LN gộp"     stroke="#10b981" fill="url(#g-grossProfit)" strokeWidth={2} />
              <Area type="monotone" dataKey="LN ròng"    stroke="#8b5cf6" fill="url(#g-netProfit)"   strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
          <h3 className="text-sm font-semibold text-[#1e2a3a] mb-4">Top sản phẩm doanh thu</h3>
          {topProducts.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-10">Chưa có dữ liệu đơn hàng hoàn thành</p>
          ) : (
            <div className="space-y-3">
              {topProducts.slice(0, 5).map((p, i) => (
                <div key={p.name}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-[#1e2a3a] text-white text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
                      <span className="text-xs font-medium text-[#1e2a3a] truncate max-w-[120px]">{p.name}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#0ea5e9] rounded-full" style={{ width: `${(p.revenue / topProducts[0].revenue) * 100}%` }} />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5 text-right">{fmtShort(p.revenue)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e5e7eb]">
          <h3 className="text-sm font-semibold text-[#1e2a3a]">Tổng hợp theo tháng · Lợi nhuận & Chi phí</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              {['Tháng', 'Doanh thu', 'Giá vốn', 'LN gộp', 'Chi phí', 'LN ròng', 'Biên LN%'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...monthly].reverse().map(m => {
              const gp = gross(m)
              const np = net(m)
              const margin = m.revenue > 0 ? Math.round(gp / m.revenue * 100) : 0
              return (
                <tr key={m.key} className="border-t border-[#e5e7eb] hover:bg-gray-50">
                  <td className="px-3 py-2.5 text-xs font-medium">{m.month}</td>
                  <td className="px-3 py-2.5 text-xs font-semibold text-[#0ea5e9]">{fmtShort(m.revenue)}</td>
                  <td className="px-3 py-2.5 text-xs text-orange-600">{fmtShort(m.cogs)}</td>
                  <td className="px-3 py-2.5 text-xs text-green-600">{fmtShort(gp)}</td>
                  <td className="px-3 py-2.5 text-xs text-gray-500">{fmtShort(opex(m))}</td>
                  <td className="px-3 py-2.5 text-xs font-semibold text-purple-600">{fmtShort(np)}</td>
                  <td className="px-3 py-2.5 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${margin >= 25 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{margin}%</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Tab: So sánh kỳ (Growth+) ───────────────────────────────────────────────
function TabSoSanh({ monthly }: { monthly: MonthRow[] }) {
  const [periodA, setPeriodA] = useState('')
  const [periodB, setPeriodB] = useState('')

  useEffect(() => {
    if (monthly.length >= 2) {
      setPeriodA(monthly[monthly.length - 1].key)
      setPeriodB(monthly[monthly.length - 2].key)
    }
  }, [monthly])

  if (monthly.length < 2) return <div className="text-center py-16 text-sm text-gray-400">Cần ít nhất 2 tháng dữ liệu để so sánh</div>

  const a = monthly.find(m => m.key === periodA)
  const b = monthly.find(m => m.key === periodB)
  if (!a || !b) return null

  const metrics = [
    { label: 'Doanh thu',          cur: a.revenue,      prev: b.revenue,       format: fmtVND },
    { label: 'Giá vốn (COGS)',     cur: a.cogs,         prev: b.cogs,          format: fmtVND },
    { label: 'Lợi nhuận gộp',      cur: gross(a),       prev: gross(b),        format: fmtVND },
    { label: 'Chi phí vận chuyển', cur: a.logistics,    prev: b.logistics,     format: fmtVND },
    { label: 'Chi phí kho',        cur: a.warehouse,    prev: b.warehouse,     format: fmtVND },
    { label: 'Lương nhân viên',    cur: a.salary,       prev: b.salary,        format: fmtVND },
    { label: 'Chi phí khác',       cur: a.other,        prev: b.other,         format: fmtVND },
    { label: 'Chi phí hoạt động',  cur: opex(a),        prev: opex(b),         format: fmtVND },
    { label: 'Lợi nhuận ròng',     cur: net(a),         prev: net(b),          format: fmtVND },
    { label: 'Biên LN gộp',        cur: a.revenue > 0 ? Math.round(gross(a)/a.revenue*100) : 0,
                                   prev: b.revenue > 0 ? Math.round(gross(b)/b.revenue*100) : 0,
                                   format: (n: number) => n + '%' },
  ]

  const barData = [
    { name: 'Doanh thu', [a.month]: a.revenue / 1e6, [b.month]: b.revenue / 1e6 },
    { name: 'LN gộp',    [a.month]: gross(a) / 1e6,  [b.month]: gross(b) / 1e6 },
    { name: 'LN ròng',   [a.month]: net(a) / 1e6,    [b.month]: net(b) / 1e6 },
    { name: 'Chi phí',   [a.month]: opex(a) / 1e6,   [b.month]: opex(b) / 1e6 },
  ]

  const revGrowth = b.revenue > 0 ? (a.revenue - b.revenue) / b.revenue * 100 : 0
  const netGrowth = net(b) !== 0 ? (net(a) - net(b)) / Math.abs(net(b)) * 100 : 0

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-sm font-semibold text-[#1e2a3a]">Chọn kỳ so sánh:</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Kỳ này</span>
            <select value={periodA} onChange={e => setPeriodA(e.target.value)}
              className="border border-[#e5e7eb] rounded-lg px-3 py-1.5 text-sm text-[#1e2a3a] outline-none focus:border-[#0ea5e9] bg-white">
              {monthly.filter(m => m.key !== periodB).map(m => <option key={m.key} value={m.key}>{m.month}</option>)}
            </select>
          </div>
          <span className="text-gray-400">vs</span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Kỳ trước</span>
            <select value={periodB} onChange={e => setPeriodB(e.target.value)}
              className="border border-[#e5e7eb] rounded-lg px-3 py-1.5 text-sm text-[#1e2a3a] outline-none focus:border-[#0ea5e9] bg-white">
              {monthly.filter(m => m.key !== periodA).map(m => <option key={m.key} value={m.key}>{m.month}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3 bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-[#e5e7eb]">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Chỉ tiêu</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-[#0ea5e9] uppercase">{a.month}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">{b.month}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Thay đổi</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map(m => <DeltaRow key={m.label} label={m.label} cur={m.cur} prev={m.prev} format={m.format} />)}
            </tbody>
          </table>
        </div>

        <div className="xl:col-span-2 bg-white rounded-xl border border-[#e5e7eb] p-4">
          <h3 className="text-sm font-semibold text-[#1e2a3a] mb-4">So sánh trực quan (triệu đ)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => v + 'tr'} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
              <Tooltip formatter={(v: any) => fmtShort(v * 1e6)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey={a.month} fill="#0ea5e9" radius={[0, 4, 4, 0]} />
              <Bar dataKey={b.month} fill="#e5e7eb" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className={`mt-3 p-3 rounded-xl text-xs ${revGrowth >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
            <p className={`font-semibold ${revGrowth >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {revGrowth >= 0 ? '📈' : '📉'} {a.month} {revGrowth >= 0 ? 'tăng trưởng tốt' : 'sụt giảm'} so với {b.month}
            </p>
            <p className={`mt-1 ${revGrowth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              Doanh thu {revGrowth >= 0 ? 'tăng' : 'giảm'} {Math.abs(revGrowth).toFixed(1)}% · LN ròng {netGrowth >= 0 ? 'tăng' : 'giảm'} {Math.abs(netGrowth).toFixed(1)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Drill-down (Growth+) ────────────────────────────────────────────────
function TabDrillDown() {
  const [categories,    setCategories]    = useState<CategoryRow[]>([])
  const [selCategory,   setSelCategory]   = useState<CategoryRow | null>(null)
  const [products,      setProducts]      = useState<ProductRow[]>([])
  const [selProduct,    setSelProduct]    = useState<ProductRow | null>(null)
  const [customers,     setCustomers]     = useState<CustomerRow[]>([])
  const [loadingCats,   setLoadingCats]   = useState(true)
  const [loadingProds,  setLoadingProds]  = useState(false)
  const [loadingCusts,  setLoadingCusts]  = useState(false)

  useEffect(() => {
    fetch('/api/reports?type=drilldown_categories').then(r => r.json())
      .then(setCategories).catch(() => {}).finally(() => setLoadingCats(false))
  }, [])

  const selectCategory = async (cat: CategoryRow) => {
    setSelCategory(cat); setSelProduct(null); setProducts([]); setCustomers([])
    setLoadingProds(true)
    const data = await fetch(`/api/reports?type=drilldown_products&category_id=${cat.catId}`).then(r => r.json()).catch(() => [])
    setProducts(data); setLoadingProds(false)
  }

  const selectProduct = async (prod: ProductRow) => {
    setSelProduct(prod); setCustomers([])
    setLoadingCusts(true)
    const data = await fetch(`/api/reports?type=drilldown_customers&product_id=${prod.id}`).then(r => r.json()).catch(() => [])
    setCustomers(data); setLoadingCusts(false)
  }

  const level = selProduct ? 2 : selCategory ? 1 : 0

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3 flex items-center gap-2 text-sm">
        <button onClick={() => { setSelCategory(null); setSelProduct(null) }}
          className={`font-medium transition-colors ${level === 0 ? 'text-[#0ea5e9]' : 'text-gray-500 hover:text-[#0ea5e9]'}`}>
          Tổng doanh thu
        </button>
        {selCategory && (<>
          <ChevronRight size={14} className="text-gray-300" />
          <button onClick={() => { setSelProduct(null) }}
            className={`font-medium transition-colors ${level === 1 ? 'text-[#0ea5e9]' : 'text-gray-500 hover:text-[#0ea5e9]'}`}>
            {selCategory.name}
          </button>
        </>)}
        {selProduct && (<>
          <ChevronRight size={14} className="text-gray-300" />
          <span className="font-medium text-[#0ea5e9]">{selProduct.name}</span>
        </>)}
        <span className="ml-auto text-xs text-gray-400">Click vào dòng để xem chi tiết →</span>
      </div>

      {level === 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2 bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e5e7eb] bg-gray-50">
              <h3 className="text-sm font-semibold text-[#1e2a3a]">Theo danh mục sản phẩm</h3>
            </div>
            {loadingCats ? <div className="py-10 text-center text-sm text-gray-400">Đang tải...</div> : categories.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">Chưa có đơn hàng hoàn thành</div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-[#e5e7eb]">
                  {['Danh mục', 'Doanh thu', 'Tỷ trọng', ''].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}
                </tr></thead>
                <tbody>
                  {categories.map(c => (
                    <tr key={c.catId} onClick={() => selectCategory(c)}
                      className="border-b border-[#e5e7eb] last:border-0 hover:bg-blue-50 cursor-pointer group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                          <span className="text-sm font-medium text-[#1e2a3a]">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#0ea5e9]">{fmtShort(c.revenue)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden w-16">
                            <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.color }} />
                          </div>
                          <span className="text-xs text-gray-500 w-8">{c.pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-300 group-hover:text-[#0ea5e9]">→</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="xl:col-span-3 bg-white rounded-xl border border-[#e5e7eb] p-4">
            <h3 className="text-sm font-semibold text-[#1e2a3a] mb-4">Phân phối doanh thu</h3>
            {categories.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={categories} cx="50%" cy="50%" outerRadius={100} innerRadius={55} dataKey="revenue" nameKey="name">
                    {categories.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtShort(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">Chưa có dữ liệu</div>}
          </div>
        </div>
      )}

      {level === 1 && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2 bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e5e7eb] bg-gray-50">
              <h3 className="text-sm font-semibold text-[#1e2a3a]">Sản phẩm — {selCategory?.name}</h3>
            </div>
            {loadingProds ? <div className="py-10 text-center text-sm text-gray-400">Đang tải...</div> : products.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">Không có sản phẩm nào</div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-[#e5e7eb]">
                  {['Sản phẩm', 'Doanh thu', 'SL', ''].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}
                </tr></thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} onClick={() => selectProduct(p)}
                      className="border-b border-[#e5e7eb] last:border-0 hover:bg-blue-50 cursor-pointer group">
                      <td className="px-4 py-3 text-sm font-medium text-[#1e2a3a]">{p.name}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#0ea5e9]">{fmtShort(p.revenue)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{p.qty.toLocaleString('vi-VN')}</td>
                      <td className="px-4 py-3 text-xs text-gray-300 group-hover:text-[#0ea5e9]">→</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="xl:col-span-3 bg-white rounded-xl border border-[#e5e7eb] p-4">
            <h3 className="text-sm font-semibold text-[#1e2a3a] mb-4">So sánh sản phẩm</h3>
            {products.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={products.map(p => ({ name: p.name.split(' ')[0], revenue: p.revenue / 1e6 }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => v + 'tr'} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any) => fmtShort(v * 1e6)} />
                  <Bar dataKey="revenue" name="Doanh thu" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>
      )}

      {level === 2 && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2 bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e5e7eb] bg-gray-50">
              <h3 className="text-sm font-semibold text-[#1e2a3a]">Khách hàng — {selProduct?.name}</h3>
            </div>
            {loadingCusts ? <div className="py-10 text-center text-sm text-gray-400">Đang tải...</div> : customers.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">Không có dữ liệu</div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-[#e5e7eb]">
                  {['Khách hàng', 'Doanh thu', 'Đơn hàng'].map(h => <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>)}
                </tr></thead>
                <tbody>
                  {customers.map((c, i) => (
                    <tr key={i} className="border-b border-[#e5e7eb] last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-[#1e2a3a]">{c.name}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[#0ea5e9]">{c.revenue > 0 ? fmtShort(c.revenue) : '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{c.orders > 0 ? c.orders + ' đơn' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="xl:col-span-3 bg-white rounded-xl border border-[#e5e7eb] p-4">
            <h3 className="text-sm font-semibold text-[#1e2a3a] mb-4">Phân bổ theo khách hàng</h3>
            {customers.filter(c => c.revenue > 0).length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={customers.filter(c => c.revenue > 0)} cx="50%" cy="50%" outerRadius={100} innerRadius={50} dataKey="revenue" nameKey="name">
                    {customers.map((_, i) => <Cell key={i} fill={['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'][i % 5]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtShort(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: KPI Nhân viên (Growth+) ─────────────────────────────────────────────
function TabKpiNhanVien() {
  const [kpiData, setKpiData] = useState<UserKpi[]>([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'revenue' | 'orders'>('revenue')

  useEffect(() => {
    fetch('/api/reports?type=kpi_users').then(r => r.json())
      .then(setKpiData).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-center py-16 text-sm text-gray-400">Đang tải...</div>
  if (!kpiData.length) return <div className="text-center py-16 text-sm text-gray-400">Chưa có đơn hàng được gán nhân viên</div>

  const sorted = [...kpiData].sort((a, b) => sortBy === 'revenue' ? b.revenue - a.revenue : b.orders - a.orders)
  const teamTotal  = kpiData.reduce((s, p) => s + p.revenue, 0)
  const teamOrders = kpiData.reduce((s, p) => s + p.orders, 0)

  const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']
  const radarData = sorted.slice(0, 5).map(p => ({
    name: p.name.split(' ').pop() ?? p.name,
    'Doanh thu': teamTotal > 0 ? Math.round(p.revenue / teamTotal * 100) : 0,
    'Đơn hàng': teamOrders > 0 ? Math.round(p.orders / teamOrders * 100) : 0,
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Tổng doanh thu team</p>
          <p className="text-lg font-bold text-[#0ea5e9]">{fmtShort(teamTotal)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{kpiData.length} nhân viên</p>
        </div>
        <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Tổng đơn hàng</p>
          <p className="text-lg font-bold text-purple-600">{teamOrders}</p>
          <p className="text-xs text-gray-400 mt-0.5">TB {kpiData.length > 0 ? Math.round(teamOrders / kpiData.length) : 0} đơn/NV</p>
        </div>
        <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Doanh thu TB/người</p>
          <p className="text-lg font-bold text-green-600">{fmtShort(kpiData.length > 0 ? Math.round(teamTotal / kpiData.length) : 0)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
            <h3 className="text-sm font-semibold text-[#1e2a3a]">Bảng xếp hạng nhân viên</h3>
            <div className="flex items-center gap-1.5 text-xs">
              {(['revenue', 'orders'] as const).map(k => (
                <button key={k} onClick={() => setSortBy(k)}
                  className={`px-2 py-1 rounded-lg transition-colors ${sortBy === k ? 'bg-[#0ea5e9] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                  {k === 'revenue' ? 'Doanh thu' : 'Đơn hàng'}
                </button>
              ))}
            </div>
          </div>
          <table className="w-full">
            <thead><tr className="bg-gray-50 border-b border-[#e5e7eb]">
              {['#', 'Nhân viên', 'Mã NV', 'Thực đạt', 'Đơn hàng', 'Tỷ trọng'].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {sorted.map((p, i) => {
                const revPct = teamTotal > 0 ? Math.round(p.revenue / teamTotal * 100) : 0
                const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null
                return (
                  <tr key={p.id} className="border-b border-[#e5e7eb] last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-3 text-sm font-bold text-gray-400">{medal ?? i + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: COLORS[i % COLORS.length] }}>
                          {(p.name ?? '?')[0].toUpperCase()}
                        </div>
                        <span className="text-xs font-semibold text-[#1e2a3a]">{p.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-400 font-mono">{p.code || '—'}</td>
                    <td className="px-3 py-3 text-xs font-bold text-[#0ea5e9]">{fmtShort(p.revenue)}</td>
                    <td className="px-3 py-3 text-xs text-gray-700">{p.orders} đơn</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#0ea5e9]" style={{ width: `${revPct}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{revPct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
          <h3 className="text-sm font-semibold text-[#1e2a3a] mb-3">Radar hiệu suất (top 5)</h3>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="name" tick={{ fontSize: 10 }} />
                <Radar name="Doanh thu" dataKey="Doanh thu" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.1} />
                <Radar name="Đơn hàng" dataKey="Đơn hàng" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Dự báo doanh thu (Enterprise) ──────────────────────────────────────
function TabDuBao({ monthly }: { monthly: MonthRow[] }) {
  if (monthly.length < 3) return (
    <div className="text-center py-16 text-sm text-gray-400">Cần ít nhất 3 tháng dữ liệu để tính dự báo</div>
  )

  const FORECAST = 3
  const revenues    = monthly.map(m => m.revenue)
  const grossProfits = monthly.map(m => gross(m))
  const revForecast = linearForecast(revenues, FORECAST)
  const gpForecast  = linearForecast(grossProfits, FORECAST)
  const lastMonth   = monthly[monthly.length - 1].month

  const chartData = [
    ...monthly.map(m => ({ month: m.month, 'Doanh thu thực': m.revenue, 'LN gộp thực': gross(m) })),
    ...Array.from({ length: FORECAST }, (_, i) => ({
      month: nextMonthStr(lastMonth, i + 1),
      'DT dự báo': revForecast[i],
      'LN dự báo': gpForecast[i],
    })),
  ]

  const lastRev  = revenues[revenues.length - 1]
  const trend    = revForecast[0] > lastRev ? 'tăng' : 'giảm'
  const trendPct = lastRev > 0 ? Math.abs((revForecast[0] - lastRev) / lastRev * 100) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {revForecast.map((rv, i) => (
          <div key={i} className="bg-white rounded-xl border border-amber-100 px-4 py-3 bg-amber-50/30">
            <p className="text-xs text-gray-500 mb-1">Dự báo {nextMonthStr(lastMonth, i + 1)}</p>
            <p className="text-lg font-bold text-[#0ea5e9]">~ {fmtShort(rv)}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">LN gộp dự kiến: ~ {fmtShort(gpForecast[i])}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[#1e2a3a]">Xu hướng & Dự báo (hồi quy tuyến tính)</h3>
          <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${trend === 'tăng' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            Xu hướng {trend} ~{trendPct.toFixed(1)}%/tháng
          </span>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} width={52} />
            <Tooltip formatter={(v: any) => fmtVND(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Doanh thu thực"   stroke="#0ea5e9" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="LN gộp thực"      stroke="#10b981" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="DT dự báo"  stroke="#0ea5e9" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 5, fill: '#0ea5e9' }} />
            <Line type="monotone" dataKey="LN dự báo"  stroke="#10b981" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 5, fill: '#10b981' }} />
          </LineChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-gray-400 text-center mt-2">
          Đường nét đứt = dự báo dựa trên {monthly.length} tháng lịch sử. Chỉ mang tính tham khảo.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e5e7eb]">
          <h3 className="text-sm font-semibold text-[#1e2a3a]">Bảng chi tiết — Thực tế & Dự báo</h3>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="bg-gray-50">
            {['Tháng', 'Loại', 'Doanh thu', 'LN gộp', 'LN ròng'].map(h => (
              <th key={h} className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase text-left">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {[...monthly].reverse().slice(0, 6).map(m => (
              <tr key={m.key} className="border-t border-[#e5e7eb] hover:bg-gray-50">
                <td className="px-4 py-2.5 text-xs font-medium">{m.month}</td>
                <td className="px-4 py-2.5"><span className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-semibold">Thực tế</span></td>
                <td className="px-4 py-2.5 text-xs font-semibold text-[#0ea5e9]">{fmtShort(m.revenue)}</td>
                <td className="px-4 py-2.5 text-xs text-green-600">{fmtShort(gross(m))}</td>
                <td className="px-4 py-2.5 text-xs text-purple-600">{fmtShort(net(m))}</td>
              </tr>
            ))}
            {revForecast.map((rv, i) => (
              <tr key={`f-${i}`} className="border-t border-[#e5e7eb] bg-amber-50/40 hover:bg-amber-50">
                <td className="px-4 py-2.5 text-xs font-medium">{nextMonthStr(lastMonth, i + 1)}</td>
                <td className="px-4 py-2.5"><span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">Dự báo</span></td>
                <td className="px-4 py-2.5 text-xs font-semibold text-[#0ea5e9]">~ {fmtShort(rv)}</td>
                <td className="px-4 py-2.5 text-xs text-green-600">~ {fmtShort(gpForecast[i])}</td>
                <td className="px-4 py-2.5 text-xs text-gray-400">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Tab: Lên lịch báo cáo (Enterprise) ──────────────────────────────────────
type ScheduledReport = { id: string; reportType: string; frequency: string; dayValue: string; email: string; createdAt: string }
const REPORT_TYPES = ['Tổng quan doanh thu', 'Lợi nhuận & Chi phí', 'Top sản phẩm', 'KPI nhân viên', 'Tồn kho']
const FREQUENCIES  = ['Hàng tuần', 'Hàng tháng', 'Hàng quý']
const STORAGE_KEY  = 'mia_scheduled_reports'

function TabLenLich() {
  const [reports,  setReports]  = useState<ScheduledReport[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ reportType: REPORT_TYPES[0], frequency: FREQUENCIES[0], dayValue: '1', email: '' })

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setReports(JSON.parse(raw))
    } catch {}
  }, [])

  const save = (updated: ScheduledReport[]) => {
    setReports(updated)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  }

  const handleAdd = () => {
    if (!form.email) return
    save([...reports, {
      id: crypto.randomUUID(),
      reportType: form.reportType,
      frequency: form.frequency,
      dayValue: form.dayValue,
      email: form.email,
      createdAt: new Date().toISOString(),
    }])
    setShowForm(false)
    setForm({ reportType: REPORT_TYPES[0], frequency: FREQUENCIES[0], dayValue: '1', email: '' })
  }

  const frequencyLabel = (r: ScheduledReport) => {
    if (r.frequency === 'Hàng tuần')  return `Thứ ${r.dayValue} mỗi tuần`
    if (r.frequency === 'Hàng tháng') return `Ngày ${r.dayValue} mỗi tháng`
    return 'Đầu mỗi quý'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
        <CalendarDays size={16} className="text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-semibold text-amber-700">Tính năng đang phát triển</p>
          <p className="text-xs text-amber-600 mt-0.5">Cài đặt lịch gửi báo cáo tự động qua email. Hiện tại lưu cục bộ — tích hợp gửi email sẽ ra mắt sớm.</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#1e2a3a]">{reports.length} lịch đã cài đặt</h3>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-3 py-2 bg-amber-400 text-[#0f172a] text-xs font-bold rounded-xl hover:bg-amber-300 transition-colors">
          <Plus size={13} /> Thêm lịch
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 shadow-sm">
          <p className="text-sm font-bold text-[#1e2a3a]">Cài đặt lịch mới</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Loại báo cáo</label>
              <select value={form.reportType} onChange={e => setForm(f => ({ ...f, reportType: e.target.value }))}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 bg-white">
                {REPORT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tần suất</label>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 bg-white">
                {FREQUENCIES.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {form.frequency !== 'Hàng quý' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  {form.frequency === 'Hàng tuần' ? 'Thứ (2–7)' : 'Ngày trong tháng'}
                </label>
                <input type="number" value={form.dayValue}
                  min={form.frequency === 'Hàng tuần' ? 2 : 1}
                  max={form.frequency === 'Hàng tuần' ? 7 : 28}
                  onChange={e => setForm(f => ({ ...f, dayValue: e.target.value }))}
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400" />
              </div>
            )}
            <div className={form.frequency === 'Hàng quý' ? 'col-span-2' : ''}>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email nhận báo cáo</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@congty.vn"
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Hủy
            </button>
            <button onClick={handleAdd} disabled={!form.email}
              className="flex-1 py-2.5 bg-amber-400 text-[#0f172a] text-sm font-bold rounded-xl hover:bg-amber-300 disabled:opacity-40 transition-all">
              Lưu lịch
            </button>
          </div>
        </div>
      )}

      {reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <Mail size={28} className="text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Chưa có lịch nào. Nhấn "Thêm lịch" để bắt đầu.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
          {reports.map(r => (
            <div key={r.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <Mail size={14} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#1e2a3a]">{r.reportType}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{frequencyLabel(r)} → {r.email}</p>
              </div>
              <span className="text-[10px] text-gray-400 shrink-0">{new Date(r.createdAt).toLocaleDateString('vi-VN')}</span>
              <button onClick={() => save(reports.filter(x => x.id !== r.id))}
                className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
const TAB_CONFIG = [
  { key: 'Tổng quan',     minPlan: 'starter'    as PlanTier, label: 'Tổng quan' },
  { key: 'So sánh kỳ',    minPlan: 'growth'     as PlanTier, label: 'So sánh kỳ' },
  { key: 'Drill-down',    minPlan: 'growth'     as PlanTier, label: 'Drill-down' },
  { key: 'KPI Nhân viên', minPlan: 'growth'     as PlanTier, label: 'KPI Nhân viên' },
  { key: 'Dự báo',        minPlan: 'enterprise' as PlanTier, label: 'Dự báo' },
  { key: 'Lên lịch',      minPlan: 'enterprise' as PlanTier, label: 'Lên lịch' },
] as const

type TabKey = typeof TAB_CONFIG[number]['key']

export default function BaoCaoPage() {
  const plan    = usePlan()
  const [tab,     setTab]     = useState<TabKey>('Tổng quan')
  const [monthly, setMonthly] = useState<MonthRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/finance?type=monthly').then(r => r.json())
      .then(setMonthly).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleExport = () => {
    const wb = XLSX.utils.book_new()
    const rows = monthly.map(m => ({
      'Tháng': m.month, 'Doanh thu': m.revenue, 'Giá vốn': m.cogs,
      'LN gộp': gross(m), 'Chi phí VT': m.logistics, 'Chi phí kho': m.warehouse,
      'Lương': m.salary, 'CP khác': m.other, 'LN ròng': net(m),
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Báo cáo tổng hợp')
    XLSX.writeFile(wb, `MiaSCM-BaoCao-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  const PLAN_DESC: Record<PlanTier, string> = {
    starter:    'Gói Starter — Báo cáo cơ bản: bảng số, tồn kho, top sản phẩm',
    growth:     'Gói Growth — Biểu đồ tương tác · So sánh kỳ · Drill-down · KPI nhân viên',
    enterprise: 'Gói Enterprise — Toàn diện · Dự báo xu hướng · Lên lịch gửi báo cáo tự động',
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a]">Báo cáo</h1>
          <p className="text-sm text-gray-500 mt-0.5">{PLAN_DESC[plan]}</p>
        </div>
        <div className="flex items-center gap-2">
          {plan !== 'starter' && (
            <button onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 border border-[#e5e7eb] bg-white rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:border-[#0ea5e9] hover:text-[#0ea5e9] transition-all">
              <Printer size={14} /> In / PDF
            </button>
          )}
          <button onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 border border-[#e5e7eb] bg-white rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:border-[#0ea5e9] hover:text-[#0ea5e9] transition-all">
            <Download size={14} /> Xuất Excel
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-white border border-[#e5e7eb] rounded-xl p-1 w-fit flex-wrap">
        {TAB_CONFIG.map(({ key, minPlan }) => {
          const locked = !canAccess(plan, minPlan)
          const active = tab === key
          return (
            <button key={key} onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                active  ? 'bg-[#0ea5e9] text-white shadow-sm' :
                locked  ? 'text-gray-300 hover:bg-gray-50' :
                          'text-gray-600 hover:text-[#1e2a3a] hover:bg-gray-50'
              }`}>
              {locked && <Lock size={10} className="shrink-0" />}
              {key}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="text-center py-16 text-sm text-gray-400">Đang tải dữ liệu...</div>
      ) : (
        <>
          {tab === 'Tổng quan'     && (plan === 'starter' ? <TabTongQuanBasic monthly={monthly} /> : <TabTongQuan monthly={monthly} />)}
          {tab === 'So sánh kỳ'   && (canAccess(plan, 'growth')     ? <TabSoSanh monthly={monthly} />  : <LockedTab requiredPlan="growth" />)}
          {tab === 'Drill-down'    && (canAccess(plan, 'growth')     ? <TabDrillDown />                 : <LockedTab requiredPlan="growth" />)}
          {tab === 'KPI Nhân viên' && (canAccess(plan, 'growth')     ? <TabKpiNhanVien />               : <LockedTab requiredPlan="growth" />)}
          {tab === 'Dự báo'        && (canAccess(plan, 'enterprise') ? <TabDuBao monthly={monthly} />   : <LockedTab requiredPlan="enterprise" />)}
          {tab === 'Lên lịch'      && (canAccess(plan, 'enterprise') ? <TabLenLich />                   : <LockedTab requiredPlan="enterprise" />)}
        </>
      )}
    </div>
  )
}
