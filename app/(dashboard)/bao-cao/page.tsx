'use client'
import { useState, useEffect, useRef } from 'react'
import {
  Download, ArrowUpRight, ArrowDownRight, ChevronRight,
  Lock, Printer, CalendarDays, Mail, Plus, Trash2,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, LineChart, Line, ReferenceLine,
} from 'recharts'
import * as XLSX from 'xlsx'
import { loadBusinessSettings, loadBusinessSettingsAsync, saveBusinessSettingsAsync } from '@/lib/business-settings'

// ─── Types & helpers ──────────────────────────────────────────────────────────
type MonthRow = { month: string; key: string; revenue: number; cogs: number; logistics: number; warehouse: number; salary: number; other: number }
type CategoryRow = { catId: string; name: string; revenue: number; pct: number; color: string }
type ProductRow = { id: string; name: string; revenue: number; qty: number; growth: number }
type CustomerRow = { id: string; name: string; revenue: number; orders: number }
type UserKpi = { id: string; name: string; code: string; revenue: number; orders: number }
type PlanTier = 'starter' | 'growth' | 'enterprise'
type CompareDomain  = 'tai-chinh' | 'ban-hang' | 'logistics' | 'kho-hang'
type SalesMetrics   = { orders: number; revenue: number; customers: number; completed: number; cancelled: number; avg_order_value: number; completion_rate: number }
type LogisticsMetrics = { deliveries: number; delivered: number; failed: number; routes: number; success_rate: number }
type WarehouseMetrics = { stock_in: number; stock_out: number }
type ProductForecastRaw = {
  product_id: string; sku: string; name: string; unit: string
  current_stock: number; monthly_sales: { key: string; qty: number }[]
}
type ProductForecast = ProductForecastRaw & {
  avg_monthly: number; f1: number; f2: number; f3: number
  months_remaining: number
  risk: 'out' | 'dead' | 'critical' | 'low' | 'ok'
  method: string; data_months: number
}

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

// Trả về "YYYY-MM" để dùng làm chart key (không có "/" tránh Recharts parse sai)
function nextKey(lastKey: string, offset: number): string {
  const [yr, mo] = lastKey.split('-').map(Number)
  if (isNaN(yr) || isNaN(mo)) return lastKey
  const d = new Date(yr, mo - 1 + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
// Trả về "TM/YYYY" để hiển thị trong label, table, badge
function nextMonthStr(lastKey: string, offset: number): string {
  const k = nextKey(lastKey, offset)
  const [yr, mo] = k.split('-').map(Number)
  return `T${mo}/${yr}`
}
// Chuyển YYYY-MM → TM/YYYY cho XAxis tickFormatter
function keyToLabel(k: string): string {
  const [yr, mo] = k.split('-').map(Number)
  if (isNaN(yr) || isNaN(mo)) return k
  return `T${mo}/${yr}`
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
      <td className="px-4 py-3 text-sm text-right font-semibold text-[var(--mia-primary)]">{format(cur)}</td>
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
          { label: `Doanh thu ${cur.month}`, value: fmtShort(cur.revenue),   hasDelta: !!prev, cur: cur.revenue,   prev: prev?.revenue ?? 0,    color: 'text-[var(--mia-primary)]' },
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
                    <td className="px-3 py-2.5 text-xs font-semibold text-[var(--mia-primary)]">{fmtShort(m.revenue)}</td>
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
                  <tr key={(p as any).product_id ?? p.name} className="border-t border-[#e5e7eb] hover:bg-gray-50">
                    <td className="px-3 py-2.5">
                      <span className="w-5 h-5 inline-flex items-center justify-center rounded bg-[#1e2a3a] text-white text-[10px] font-bold">{i + 1}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium text-[#1e2a3a]">{p.name}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold text-[var(--mia-primary)] text-right">{fmtShort(p.revenue)}</td>
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
                {inventory.slice(0, 20).map((item, i) => (
                  <tr key={item.sku || i} className="border-t border-[#e5e7eb] hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-xs font-mono text-gray-400">{item.sku}</td>
                    <td className="px-4 py-2.5 text-xs font-medium text-[#1e2a3a]">{item.name}</td>
                    <td className="px-4 py-2.5 text-xs font-bold text-[var(--mia-primary)]">{item.qty.toLocaleString('vi-VN')}</td>
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
          { label: `Doanh thu ${cur.month}`, cur: cur.revenue,    prev: prev?.revenue ?? 0,    color: 'text-[var(--mia-primary)]' },
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
                <div key={(p as any).product_id ?? p.name}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-[#1e2a3a] text-white text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
                      <span className="text-xs font-medium text-[#1e2a3a] truncate max-w-[120px]">{p.name}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--mia-primary)] rounded-full" style={{ width: `${(p.revenue / topProducts[0].revenue) * 100}%` }} />
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
                  <td className="px-3 py-2.5 text-xs font-semibold text-[var(--mia-primary)]">{fmtShort(m.revenue)}</td>
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

// ─── Tab: So sánh kỳ ─────────────────────────────────────────────────────────
const COMPARE_DOMAINS: { key: CompareDomain; label: string }[] = [
  { key: 'tai-chinh', label: 'Tài chính' },
  { key: 'ban-hang',  label: 'Bán hàng' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'kho-hang',  label: 'Kho hàng' },
]
type CompareMode = 'mom' | 'yoy' | 'custom'
const COMPARE_MODES: { key: CompareMode; label: string; desc: string }[] = [
  { key: 'mom',    label: 'Tháng trước',          desc: 'So sánh với tháng liền kề trước' },
  { key: 'yoy',    label: 'Cùng kỳ năm ngoái',    desc: 'So sánh cùng tháng năm trước' },
  { key: 'custom', label: 'Tùy chỉnh',             desc: 'Chọn thủ công 2 kỳ bất kỳ' },
]

function TabSoSanh({ monthly }: { monthly: MonthRow[] }) {
  const [domain,      setDomain]      = useState<CompareDomain>('tai-chinh')
  const [compareMode, setCompareMode] = useState<CompareMode>('mom')
  const [periodA,     setPeriodA]     = useState('')
  const [periodB,     setPeriodB]     = useState('')
  const [dataA,     setDataA]     = useState<SalesMetrics | LogisticsMetrics | WarehouseMetrics | null>(null)
  const [dataB,     setDataB]     = useState<SalesMetrics | LogisticsMetrics | WarehouseMetrics | null>(null)
  const [fetching,  setFetching]  = useState(false)
  const [aiInsight, setAiInsight] = useState<{ headline: string; sentiment: string; insights: string[]; risks: string[]; suggestions: string[] } | null>(null)
  const [loadingAI, setLoadingAI] = useState(false)
  const aiCache = useRef<Record<string, typeof aiInsight>>({})

  const applyPreset = (mode: CompareMode, rows: typeof monthly = monthly) => {
    setCompareMode(mode)
    if (rows.length < 2) return
    const latest = rows[rows.length - 1]
    if (mode === 'mom') {
      setPeriodA(latest.key)
      setPeriodB(rows[rows.length - 2].key)
    } else if (mode === 'yoy') {
      const [yr, mo] = latest.key.split('-').map(Number)
      const yoyKey   = `${yr - 1}-${String(mo).padStart(2, '0')}`
      const yoyRow   = rows.find(r => r.key === yoyKey)
      if (yoyRow) {
        setPeriodA(latest.key)
        setPeriodB(yoyRow.key)
      }
      // nếu không có data năm ngoái → giữ nguyên, UI sẽ báo
    }
    // custom: không đổi, user tự chọn
  }

  useEffect(() => {
    if (monthly.length >= 2) applyPreset('mom', monthly)
  }, [monthly])

  useEffect(() => {
    if (domain === 'tai-chinh' || !periodA || !periodB) return
    const apiType = domain === 'ban-hang' ? 'compare_sales' : domain === 'logistics' ? 'compare_logistics' : 'compare_warehouse'
    setFetching(true); setDataA(null); setDataB(null)
    Promise.all([
      fetch(`/api/reports?type=${apiType}&year_month=${periodA}`).then(r => r.json()).catch(() => null),
      fetch(`/api/reports?type=${apiType}&year_month=${periodB}`).then(r => r.json()).catch(() => null),
    ]).then(([a, b]) => { setDataA(a); setDataB(b) }).finally(() => setFetching(false))
  }, [domain, periodA, periodB])

  // Trigger AI analysis once data is ready
  useEffect(() => {
    const isDataReady = domain === 'tai-chinh' ? true : !fetching
    if (!isDataReady || !periodA || !periodB) return
    const ma_ = monthly.find(m => m.key === periodA)
    const mb_ = monthly.find(m => m.key === periodB)
    if (!ma_ || !mb_) return

    const cacheKey = `${domain}-${periodA}-${periodB}`
    if (aiCache.current[cacheKey]) { setAiInsight(aiCache.current[cacheKey]); return }

    const delta = (cur: number, prev: number) =>
      prev !== 0 ? Math.round((cur - prev) / Math.abs(prev) * 100) : 0

    let metrics: { label: string; cur: number; prev: number; change_pct: number }[] = []

    if (domain === 'tai-chinh') {
      metrics = [
        { label: 'Doanh thu', cur: ma_.revenue, prev: mb_.revenue, change_pct: delta(ma_.revenue, mb_.revenue) },
        { label: 'Lợi nhuận gộp', cur: gross(ma_), prev: gross(mb_), change_pct: delta(gross(ma_), gross(mb_)) },
        { label: 'Chi phí hoạt động', cur: opex(ma_), prev: opex(mb_), change_pct: delta(opex(ma_), opex(mb_)) },
        { label: 'Lợi nhuận ròng', cur: net(ma_), prev: net(mb_), change_pct: delta(net(ma_), net(mb_)) },
        { label: 'Biên LN gộp (%)', cur: ma_.revenue > 0 ? Math.round(gross(ma_)/ma_.revenue*100) : 0, prev: mb_.revenue > 0 ? Math.round(gross(mb_)/mb_.revenue*100) : 0, change_pct: 0 },
      ]
    } else if (domain === 'ban-hang') {
      const sa_ = dataA as SalesMetrics | null; const sb_ = dataB as SalesMetrics | null
      if (!sa_ || !sb_) return
      metrics = [
        { label: 'Tổng đơn hàng', cur: sa_.orders, prev: sb_.orders, change_pct: delta(sa_.orders, sb_.orders) },
        { label: 'Đơn hoàn thành', cur: sa_.completed, prev: sb_.completed, change_pct: delta(sa_.completed, sb_.completed) },
        { label: 'Đơn hủy', cur: sa_.cancelled, prev: sb_.cancelled, change_pct: delta(sa_.cancelled, sb_.cancelled) },
        { label: 'Tỷ lệ hoàn thành (%)', cur: sa_.completion_rate, prev: sb_.completion_rate, change_pct: delta(sa_.completion_rate, sb_.completion_rate) },
        { label: 'Khách hàng mua', cur: sa_.customers, prev: sb_.customers, change_pct: delta(sa_.customers, sb_.customers) },
        { label: 'Doanh thu đơn HT', cur: sa_.revenue, prev: sb_.revenue, change_pct: delta(sa_.revenue, sb_.revenue) },
        { label: 'Giá trị đơn TB', cur: sa_.avg_order_value, prev: sb_.avg_order_value, change_pct: delta(sa_.avg_order_value, sb_.avg_order_value) },
      ]
    } else if (domain === 'logistics') {
      const la_ = dataA as LogisticsMetrics | null; const lb_ = dataB as LogisticsMetrics | null
      if (!la_ || !lb_) return
      metrics = [
        { label: 'Tổng chuyến giao', cur: la_.deliveries, prev: lb_.deliveries, change_pct: delta(la_.deliveries, lb_.deliveries) },
        { label: 'Giao thành công', cur: la_.delivered, prev: lb_.delivered, change_pct: delta(la_.delivered, lb_.delivered) },
        { label: 'Giao thất bại', cur: la_.failed, prev: lb_.failed, change_pct: delta(la_.failed, lb_.failed) },
        { label: 'Tỷ lệ thành công (%)', cur: la_.success_rate, prev: lb_.success_rate, change_pct: delta(la_.success_rate, lb_.success_rate) },
      ]
    } else {
      const wda_ = dataA as WarehouseMetrics | null; const wdb_ = dataB as WarehouseMetrics | null
      if (!wda_ || !wdb_) return
      metrics = [
        { label: 'Phiếu nhập kho', cur: wda_.stock_in, prev: wdb_.stock_in, change_pct: delta(wda_.stock_in, wdb_.stock_in) },
        { label: 'Phiếu xuất kho', cur: wda_.stock_out, prev: wdb_.stock_out, change_pct: delta(wda_.stock_out, wdb_.stock_out) },
      ]
    }

    setAiInsight(null); setLoadingAI(true)
    fetch('/api/ai/compare-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, periodA: ma_.month, periodB: mb_.month, metrics }),
    }).then(r => r.json()).then(data => {
      aiCache.current[cacheKey] = data
      setAiInsight(data)
    }).catch(() => {}).finally(() => setLoadingAI(false))
  }, [fetching, domain, periodA, periodB, dataA, dataB])

  if (monthly.length < 2) return <div className="text-center py-16 text-sm text-gray-400">Cần ít nhất 2 tháng dữ liệu để so sánh</div>

  const ma = monthly.find(m => m.key === periodA)
  const mb = monthly.find(m => m.key === periodB)
  if (!ma || !mb) return null

  const fmtCount = (unit: string) => (n: number) => n.toLocaleString('vi-VN') + ' ' + unit
  const fmtPct   = (n: number) => n + '%'

  // Finance metrics
  const finMetrics = [
    { label: 'Doanh thu',          cur: ma.revenue,   prev: mb.revenue,    format: fmtVND },
    { label: 'Giá vốn (COGS)',     cur: ma.cogs,      prev: mb.cogs,       format: fmtVND },
    { label: 'Lợi nhuận gộp',      cur: gross(ma),    prev: gross(mb),     format: fmtVND },
    { label: 'Chi phí vận chuyển', cur: ma.logistics, prev: mb.logistics,  format: fmtVND },
    { label: 'Chi phí kho',        cur: ma.warehouse, prev: mb.warehouse,  format: fmtVND },
    { label: 'Lương nhân viên',    cur: ma.salary,    prev: mb.salary,     format: fmtVND },
    { label: 'Chi phí khác',       cur: ma.other,     prev: mb.other,      format: fmtVND },
    { label: 'Chi phí hoạt động',  cur: opex(ma),     prev: opex(mb),      format: fmtVND },
    { label: 'Lợi nhuận ròng',     cur: net(ma),      prev: net(mb),       format: fmtVND },
    { label: 'Biên LN gộp',        cur: ma.revenue > 0 ? Math.round(gross(ma)/ma.revenue*100) : 0,
                                   prev: mb.revenue > 0 ? Math.round(gross(mb)/mb.revenue*100) : 0,
                                   format: fmtPct },
  ]
  const finBarData = [
    { name: 'Doanh thu', [ma.month]: ma.revenue / 1e6, [mb.month]: mb.revenue / 1e6 },
    { name: 'LN gộp',    [ma.month]: gross(ma) / 1e6,  [mb.month]: gross(mb) / 1e6 },
    { name: 'LN ròng',   [ma.month]: net(ma) / 1e6,    [mb.month]: net(mb) / 1e6 },
    { name: 'Chi phí',   [ma.month]: opex(ma) / 1e6,   [mb.month]: opex(mb) / 1e6 },
  ]
  const revGrowth = mb.revenue > 0 ? (ma.revenue - mb.revenue) / mb.revenue * 100 : 0
  const netGrowth = net(mb) !== 0 ? (net(ma) - net(mb)) / Math.abs(net(mb)) * 100 : 0

  // Sales metrics
  const sa = dataA as SalesMetrics | null
  const sb = dataB as SalesMetrics | null
  const salesMetrics = [
    { label: 'Tổng đơn hàng',     cur: sa?.orders ?? 0,           prev: sb?.orders ?? 0,           format: fmtCount('đơn') },
    { label: 'Đơn hoàn thành',     cur: sa?.completed ?? 0,        prev: sb?.completed ?? 0,        format: fmtCount('đơn') },
    { label: 'Đơn hủy',            cur: sa?.cancelled ?? 0,        prev: sb?.cancelled ?? 0,        format: fmtCount('đơn') },
    { label: 'Tỷ lệ hoàn thành',   cur: sa?.completion_rate ?? 0,  prev: sb?.completion_rate ?? 0,  format: fmtPct },
    { label: 'Khách hàng mua',      cur: sa?.customers ?? 0,        prev: sb?.customers ?? 0,        format: fmtCount('KH') },
    { label: 'Doanh thu (đơn HT)', cur: sa?.revenue ?? 0,          prev: sb?.revenue ?? 0,          format: fmtVND },
    { label: 'Giá trị đơn TB',      cur: sa?.avg_order_value ?? 0,  prev: sb?.avg_order_value ?? 0,  format: fmtVND },
  ]
  const salesBarData = [
    { name: 'Tổng đơn',   [ma.month]: sa?.orders ?? 0,    [mb.month]: sb?.orders ?? 0 },
    { name: 'Hoàn thành', [ma.month]: sa?.completed ?? 0, [mb.month]: sb?.completed ?? 0 },
    { name: 'KH mua',     [ma.month]: sa?.customers ?? 0, [mb.month]: sb?.customers ?? 0 },
  ]

  // Logistics metrics
  const la = dataA as LogisticsMetrics | null
  const lb = dataB as LogisticsMetrics | null
  const logMetrics = [
    { label: 'Tổng chuyến giao',  cur: la?.deliveries ?? 0,   prev: lb?.deliveries ?? 0,   format: fmtCount('chuyến') },
    { label: 'Giao thành công',    cur: la?.delivered ?? 0,    prev: lb?.delivered ?? 0,    format: fmtCount('chuyến') },
    { label: 'Giao thất bại',      cur: la?.failed ?? 0,       prev: lb?.failed ?? 0,       format: fmtCount('chuyến') },
    { label: 'Tỷ lệ thành công',   cur: la?.success_rate ?? 0, prev: lb?.success_rate ?? 0, format: fmtPct },
    { label: 'Số tuyến đường',      cur: la?.routes ?? 0,       prev: lb?.routes ?? 0,       format: fmtCount('tuyến') },
  ]
  const logBarData = [
    { name: 'Tổng chuyến', [ma.month]: la?.deliveries ?? 0, [mb.month]: lb?.deliveries ?? 0 },
    { name: 'Thành công',  [ma.month]: la?.delivered ?? 0,  [mb.month]: lb?.delivered ?? 0 },
    { name: 'Thất bại',    [ma.month]: la?.failed ?? 0,     [mb.month]: lb?.failed ?? 0 },
  ]

  // Warehouse metrics
  const wda = dataA as WarehouseMetrics | null
  const wdb = dataB as WarehouseMetrics | null
  const whMetrics = [
    { label: 'Phiếu nhập kho', cur: wda?.stock_in ?? 0,  prev: wdb?.stock_in ?? 0,  format: fmtCount('phiếu') },
    { label: 'Phiếu xuất kho', cur: wda?.stock_out ?? 0, prev: wdb?.stock_out ?? 0, format: fmtCount('phiếu') },
  ]
  const whBarData = [
    { name: 'Nhập kho', [ma.month]: wda?.stock_in ?? 0,  [mb.month]: wdb?.stock_in ?? 0 },
    { name: 'Xuất kho', [ma.month]: wda?.stock_out ?? 0, [mb.month]: wdb?.stock_out ?? 0 },
  ]

  const currentMetrics = domain === 'ban-hang' ? salesMetrics : domain === 'logistics' ? logMetrics : domain === 'kho-hang' ? whMetrics : finMetrics
  const currentBarData = domain === 'ban-hang' ? salesBarData : domain === 'logistics' ? logBarData : domain === 'kho-hang' ? whBarData : finBarData
  const isFin = domain === 'tai-chinh'

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 space-y-3">
        {/* Chế độ phân tích kỳ */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 shrink-0">Phân tích kỳ:</span>
          {COMPARE_MODES.map(m => (
            <button key={m.key} onClick={() => applyPreset(m.key)} title={m.desc}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                compareMode === m.key
                  ? 'bg-[var(--mia-primary)] text-white border-[var(--mia-primary)]'
                  : 'text-gray-500 border-[#e5e7eb] hover:border-[var(--mia-primary)] hover:text-[var(--mia-primary)]'
              }`}>
              {m.label}
            </button>
          ))}
          {compareMode === 'yoy' && !monthly.find(m => {
            const latest = monthly[monthly.length - 1]
            const [yr, mo] = latest.key.split('-').map(Number)
            return m.key === `${yr - 1}-${String(mo).padStart(2, '0')}`
          }) && (
            <span className="text-xs text-orange-500">Chưa có dữ liệu cùng kỳ năm ngoái</span>
          )}
        </div>

        {/* Kỳ đang so sánh */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-[#1e2a3a] shrink-0">So sánh:</span>
          <select value={periodA} onChange={e => { setPeriodA(e.target.value); setCompareMode('custom') }}
            className="border border-[#e5e7eb] rounded-lg px-3 py-1.5 text-sm text-[#1e2a3a] outline-none focus:border-[var(--mia-primary)] bg-white">
            {monthly.filter(m => m.key !== periodB).map(m => <option key={m.key} value={m.key}>{m.month}</option>)}
          </select>
          <span className="text-gray-400 text-sm">vs</span>
          <select value={periodB} onChange={e => { setPeriodB(e.target.value); setCompareMode('custom') }}
            className="border border-[#e5e7eb] rounded-lg px-3 py-1.5 text-sm text-[#1e2a3a] outline-none focus:border-[var(--mia-primary)] bg-white">
            {monthly.filter(m => m.key !== periodA).map(m => <option key={m.key} value={m.key}>{m.month}</option>)}
          </select>
        </div>

        {/* Domain */}
        <div className="flex gap-1 pt-0.5 border-t border-[#e5e7eb]">
          {COMPARE_DOMAINS.map(d => (
            <button key={d.key} onClick={() => setDomain(d.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${domain === d.key ? 'bg-[var(--mia-primary)] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {!isFin && fetching ? (
        <div className="text-center py-16 text-sm text-gray-400">Đang tải...</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-3 bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-[#e5e7eb]">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Chỉ tiêu</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--mia-primary)] uppercase">{ma.month}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase">{mb.month}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Thay đổi</th>
                </tr>
              </thead>
              <tbody>
                {currentMetrics.map(m => <DeltaRow key={m.label} label={m.label} cur={m.cur} prev={m.prev} format={m.format} />)}
              </tbody>
            </table>
          </div>

          <div className="xl:col-span-2 bg-white rounded-xl border border-[#e5e7eb] p-4">
            <h3 className="text-sm font-semibold text-[#1e2a3a] mb-4">
              So sánh trực quan{isFin ? ' (triệu đ)' : ''}
            </h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={currentBarData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => isFin ? v + 'tr' : String(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
                <Tooltip formatter={(v: any) => isFin ? fmtShort(v * 1e6) : v} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey={ma.month} fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                <Bar dataKey={mb.month} fill="#e5e7eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {/* AI insight panel — hiển thị cho tất cả domain */}
            {loadingAI && (
              <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-100 text-xs text-blue-500 flex items-center gap-2">
                <svg className="animate-spin h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                AI đang phân tích...
              </div>
            )}
            {!loadingAI && aiInsight && (() => {
              const s = aiInsight.sentiment
              const bg   = s === 'positive' ? 'bg-green-50 border-green-200' : s === 'negative' ? 'bg-red-50 border-red-200' : s === 'mixed' ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'
              const hdr  = s === 'positive' ? 'text-green-700' : s === 'negative' ? 'text-red-600' : s === 'mixed' ? 'text-yellow-700' : 'text-gray-700'
              const icon = s === 'positive' ? '📈' : s === 'negative' ? '📉' : s === 'mixed' ? '📊' : '📋'
              return (
                <div className={`mt-3 p-3 rounded-xl border text-xs space-y-2 ${bg}`}>
                  <p className={`font-semibold ${hdr}`}>{icon} {aiInsight.headline}</p>
                  {aiInsight.insights.length > 0 && (
                    <ul className="space-y-0.5">
                      {aiInsight.insights.map((t, i) => (
                        <li key={i} className="text-gray-700 flex gap-1.5"><span className="text-gray-400 shrink-0">•</span>{t}</li>
                      ))}
                    </ul>
                  )}
                  {aiInsight.risks.length > 0 && (
                    <div className="pt-1 border-t border-black/5">
                      <p className="font-medium text-orange-600 mb-0.5">Cần lưu ý</p>
                      {aiInsight.risks.map((r, i) => (
                        <p key={i} className="text-orange-700 flex gap-1.5"><span className="shrink-0">⚠</span>{r}</p>
                      ))}
                    </div>
                  )}
                  {aiInsight.suggestions.length > 0 && (
                    <div className="pt-1 border-t border-black/5">
                      <p className="font-medium text-blue-600 mb-0.5">Đề xuất</p>
                      {aiInsight.suggestions.map((s, i) => (
                        <p key={i} className="text-blue-700 flex gap-1.5"><span className="shrink-0">→</span>{s}</p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: Drill-down (Growth+) ────────────────────────────────────────────────
function TabDrillDown() {
  const [hasCategories, setHasCategories]   = useState<boolean | null>(null)
  const [categories,    setCategories]      = useState<CategoryRow[]>([])
  const [selCategory,   setSelCategory]     = useState<CategoryRow | null>(null)
  const [products,      setProducts]        = useState<ProductRow[]>([])
  const [selProduct,    setSelProduct]      = useState<ProductRow | null>(null)
  const [customers,     setCustomers]       = useState<CustomerRow[]>([])
  const [loadingProds,  setLoadingProds]    = useState(false)
  const [loadingCusts,  setLoadingCusts]    = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/reports?type=drilldown_categories').then(r => r.json()).catch(() => []),
      fetch('/api/reports?type=drilldown_products').then(r => r.json()).catch(() => []),
    ]).then(([cats, prods]: [CategoryRow[], ProductRow[]]) => {
      const realCats = cats.filter(c => c.catId !== 'uncategorized')
      if (realCats.length > 0) {
        setHasCategories(true)
        setCategories(cats)
      } else {
        setHasCategories(false)
        setProducts(prods)
      }
    })
  }, [])

  const selectCategory = async (cat: CategoryRow) => {
    setSelCategory(cat); setSelProduct(null); setProducts([]); setCustomers([])
    setLoadingProds(true)
    const data = await fetch(`/api/reports?type=drilldown_products&category_id=${cat.catId}`)
      .then(r => r.json()).catch(() => [])
    setProducts(data); setLoadingProds(false)
  }

  const selectProduct = async (prod: ProductRow) => {
    setSelProduct(prod); setCustomers([])
    setLoadingCusts(true)
    const data = await fetch(`/api/reports?type=drilldown_customers&product_id=${prod.id}`)
      .then(r => r.json()).catch(() => [])
    setCustomers(data); setLoadingCusts(false)
  }

  const COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444']
  const total  = products.reduce((s, p) => s + p.revenue, 0)

  if (hasCategories === null) {
    return <div className="bg-white rounded-xl border border-[#e5e7eb] py-16 text-center text-sm text-gray-400">Đang tải...</div>
  }

  const level = hasCategories
    ? (selProduct ? 2 : selCategory ? 1 : 0)
    : (selProduct ? 1 : 0)

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3 flex items-center gap-2 text-sm">
        <button onClick={() => { setSelCategory(null); setSelProduct(null) }}
          className={`font-medium transition-colors ${level === 0 ? 'text-[var(--mia-primary)]' : 'text-gray-500 hover:text-[var(--mia-primary)]'}`}>
          Tổng doanh thu
        </button>
        {hasCategories && selCategory && (<>
          <ChevronRight size={14} className="text-gray-300" />
          <button onClick={() => setSelProduct(null)}
            className={`font-medium transition-colors ${level === 1 ? 'text-[var(--mia-primary)]' : 'text-gray-500 hover:text-[var(--mia-primary)]'}`}>
            {selCategory.name}
          </button>
        </>)}
        {selProduct && (<>
          <ChevronRight size={14} className="text-gray-300" />
          <span className="font-medium text-[var(--mia-primary)]">{selProduct.name}</span>
        </>)}
        <span className="ml-auto text-xs text-gray-400">Click vào dòng để xem chi tiết →</span>
      </div>

      {/* Level 0a — Danh mục (khi cty có gán danh mục) */}
      {hasCategories && level === 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2 bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e5e7eb] bg-gray-50">
              <h3 className="text-sm font-semibold text-[#1e2a3a]">Theo danh mục sản phẩm</h3>
            </div>
            {categories.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">Chưa có đơn hàng hoàn thành</div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-[#e5e7eb]">
                  {['Danh mục', 'Doanh thu', 'Tỷ trọng', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {categories.map((c, i) => (
                    <tr key={c.catId} onClick={() => selectCategory(c)}
                      className="border-b border-[#e5e7eb] last:border-0 hover:bg-blue-50 cursor-pointer group">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                          <span className="text-sm font-medium text-[#1e2a3a]">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-[var(--mia-primary)]">{fmtShort(c.revenue)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden w-16">
                            <div className="h-full rounded-full" style={{ width: `${c.pct}%`, background: c.color }} />
                          </div>
                          <span className="text-xs text-gray-500 w-8">{c.pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-300 group-hover:text-[var(--mia-primary)]">→</td>
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

      {/* Level 0b — Sản phẩm trực tiếp (khi không gán danh mục) */}
      {!hasCategories && level === 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <div className="xl:col-span-2 bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e5e7eb] bg-gray-50">
              <h3 className="text-sm font-semibold text-[#1e2a3a]">Sản phẩm theo doanh thu</h3>
            </div>
            {products.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">Chưa có đơn hàng hoàn thành</div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-[#e5e7eb]">
                  {['Sản phẩm', 'Doanh thu', 'Tỷ trọng', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {products.map((p, i) => {
                    const pct = total > 0 ? Math.round(p.revenue / total * 100) : 0
                    return (
                      <tr key={p.id} onClick={() => selectProduct(p)}
                        className="border-b border-[#e5e7eb] last:border-0 hover:bg-blue-50 cursor-pointer group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                            <span className="text-sm font-medium text-[#1e2a3a]">{p.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-[var(--mia-primary)]">{fmtShort(p.revenue)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden w-16">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }} />
                            </div>
                            <span className="text-xs text-gray-500 w-8">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-300 group-hover:text-[var(--mia-primary)]">→</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div className="xl:col-span-3 bg-white rounded-xl border border-[#e5e7eb] p-4">
            <h3 className="text-sm font-semibold text-[#1e2a3a] mb-4">Phân phối doanh thu theo sản phẩm</h3>
            {products.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={products.slice(0, 10)} cx="50%" cy="50%" outerRadius={100} innerRadius={55} dataKey="revenue" nameKey="name">
                    {products.slice(0, 10).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtShort(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">Chưa có dữ liệu</div>}
          </div>
        </div>
      )}

      {/* Level 1 — Sản phẩm trong danh mục (khi có categories) */}
      {hasCategories && level === 1 && (
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
                  {['Sản phẩm', 'Doanh thu', 'SL', ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {products.map(p => (
                    <tr key={p.id} onClick={() => selectProduct(p)}
                      className="border-b border-[#e5e7eb] last:border-0 hover:bg-blue-50 cursor-pointer group">
                      <td className="px-4 py-3 text-sm font-medium text-[#1e2a3a]">{p.name}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[var(--mia-primary)]">{fmtShort(p.revenue)}</td>
                      <td className="px-4 py-3 text-xs text-gray-500">{p.qty.toLocaleString('vi-VN')}</td>
                      <td className="px-4 py-3 text-xs text-gray-300 group-hover:text-[var(--mia-primary)]">→</td>
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

      {/* Tầng khách hàng — Level 1 (no-cat) hoặc Level 2 (có cat) */}
      {((!hasCategories && level === 1) || (hasCategories && level === 2)) && (
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
                  {['Khách hàng', 'Doanh thu', 'Đơn hàng'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {customers.map((c, i) => (
                    <tr key={i} className="border-b border-[#e5e7eb] last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-[#1e2a3a]">{c.name}</td>
                      <td className="px-4 py-3 text-sm font-semibold text-[var(--mia-primary)]">{c.revenue > 0 ? fmtShort(c.revenue) : '—'}</td>
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
                    {customers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
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
          <p className="text-lg font-bold text-[var(--mia-primary)]">{fmtShort(teamTotal)}</p>
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
                  className={`px-2 py-1 rounded-lg transition-colors ${sortBy === k ? 'bg-[var(--mia-primary)] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
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
                    <td className="px-3 py-3 text-xs font-bold text-[var(--mia-primary)]">{fmtShort(p.revenue)}</td>
                    <td className="px-3 py-3 text-xs text-gray-700">{p.orders} đơn</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[var(--mia-primary)]" style={{ width: `${revPct}%` }} />
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

// ─── Helpers: per-product quantity forecast ──────────────────────────────────

// Tự tính hệ số mùa vụ từ dữ liệu thực khi có ≥ 12 tháng lịch sử
function computeAutoSeasonalFactors(sales: { key: string; qty: number }[]): number[] {
  const byMonth: Record<number, number[]> = {}
  for (const s of sales) {
    const m = parseInt(s.key.split('-')[1])
    if (!byMonth[m]) byMonth[m] = []
    byMonth[m].push(s.qty)
  }
  const overallAvg = sales.reduce((s, v) => s + v.qty, 0) / sales.length
  const raw = Array.from({ length: 12 }, (_, i) => {
    const ms = byMonth[i + 1]
    if (!ms || ms.length === 0) return 1
    return overallAvg > 0 ? (ms.reduce((s, v) => s + v, 0) / ms.length) / overallAvg : 1
  })
  const mean = raw.reduce((s, v) => s + v, 0) / 12
  return mean > 0 ? raw.map(f => f / mean) : raw
}

type ForecastResult = {
  f1: number; f2: number; f3: number
  months_remaining: number
  method: string   // 'avg' | 'wma' | 'wls' | 'auto'
  data_months: number
}

function forecastProductQty(
  sales: { key: string; qty: number }[],
  stock: number,
  manualFactors: number[],
  model: 'linear' | 'seasonal',
): ForecastResult {
  const n = sales.length
  const lastMon = n > 0 ? parseInt(sales[n - 1].key.split('-')[1]) : (new Date().getMonth() + 1)

  if (n === 0) return { f1: 0, f2: 0, f3: 0, months_remaining: stock > 0 ? 999 : 0, method: 'none', data_months: 0 }

  const vals = sales.map(s => s.qty)
  const mons = sales.map(s => parseInt(s.key.split('-')[1]))

  // 1. Chọn hệ số mùa vụ
  let factors = Array(12).fill(1) as number[]
  let method = 'avg'

  if (model === 'seasonal') {
    if (n >= 12) {
      // Tự tính từ data — chính xác hơn nhập tay
      factors = computeAutoSeasonalFactors(sales)
      method = 'auto'
    } else {
      const mAvg = manualFactors.reduce((a, b) => a + b, 0) / 12
      factors = mAvg > 0 ? manualFactors.map(f => f / mAvg) : Array(12).fill(1)
      method = n < 3 ? 'avg' : n < 6 ? 'wma' : 'wls'
    }
  } else {
    method = n < 3 ? 'avg' : n < 6 ? 'wma' : 'wls'
  }

  // 2. Khử mùa vụ
  const deseason = vals.map((v, i) => {
    const f = factors[mons[i] - 1]
    return f > 0 ? v / f : v
  })

  // 3. Tính xu hướng
  // n < 3: trung bình đơn giản (không đủ dữ liệu)
  // n 3–5: WMA — trọng số tăng dần theo thời gian, kháng nhiễu tốt hơn OLS
  // n ≥ 6: WLS — Weighted Least Squares, gần = OLS nhưng tháng gần được coi trọng hơn
  let getBase: (offset: number) => number

  if (n < 3) {
    const avg = deseason.reduce((s, v) => s + v, 0) / n
    getBase = () => avg
  } else if (n < 6) {
    const totalW = n * (n + 1) / 2
    const wma    = deseason.reduce((s, v, i) => s + v * (i + 1), 0) / totalW
    getBase = () => wma
    if (method !== 'auto') method = 'wma'
  } else {
    // Weighted Least Squares: w[i] = i+1 (tháng càng mới, trọng số càng cao)
    const w     = Array.from({ length: n }, (_, i) => i + 1)
    const wSum  = w.reduce((s, wi) => s + wi, 0)
    const xMean = w.reduce((s, wi, i) => s + wi * i, 0) / wSum
    const yMean = w.reduce((s, wi, i) => s + wi * deseason[i], 0) / wSum
    const ssXY  = w.reduce((s, wi, i) => s + wi * (i - xMean) * (deseason[i] - yMean), 0)
    const ssXX  = w.reduce((s, wi, i) => s + wi * (i - xMean) ** 2, 0)
    const slope = ssXX === 0 ? 0 : ssXY / ssXX
    const intercept = yMean - slope * xMean
    getBase = (offset: number) => Math.max(0, intercept + slope * (n + offset))
    if (method !== 'auto') method = 'wls'
  }

  // 4. Tái mùa vụ → T+1, T+2, T+3
  const forecasts = Array.from({ length: 3 }, (_, i) => {
    const fMon = ((lastMon + i) % 12) + 1
    return Math.max(0, Math.round(getBase(i) * factors[fMon - 1]))
  })

  // 5. Simulate tồn kho từng tháng (chính xác hơn chia trung bình)
  let months_remaining = 999
  if (stock <= 0) {
    months_remaining = 0
  } else {
    let remaining = stock
    for (let i = 0; i < 24; i++) {
      const fMon        = ((lastMon + i) % 12) + 1
      const consumption = Math.max(0, getBase(i) * factors[fMon - 1])
      if (consumption <= 0) continue
      if (remaining <= consumption) {
        months_remaining = i + remaining / consumption
        break
      }
      remaining -= consumption
    }
  }

  return { f1: forecasts[0], f2: forecasts[1], f3: forecasts[2], months_remaining, method, data_months: n }
}

const RISK_COLORS = { out: '#ef4444', critical: '#f97316', low: '#f59e0b', dead: '#9ca3af', ok: '#10b981' }
const RISK_ORDER  = { out: 0, critical: 1, low: 2, dead: 3, ok: 4 }
const METHOD_LABEL: Record<string, string> = { avg: 'TB', wma: 'WMA', wls: 'WLS', auto: 'Auto', none: '—' }

function RiskBadge({ p }: { p: ProductForecast }) {
  if (p.risk === 'out')      return <span className="text-[10px] px-2 py-0.5 bg-red-100 text-red-600 rounded-full font-semibold whitespace-nowrap">Hết hàng</span>
  if (p.risk === 'dead')     return <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full font-semibold whitespace-nowrap">Tồn đọng</span>
  if (p.risk === 'critical') return <span className="text-[10px] px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full font-semibold whitespace-nowrap">{'< 1 tháng'}</span>
  if (p.risk === 'low')      return <span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold whitespace-nowrap">{'< 3 tháng'}</span>
  const display = p.months_remaining >= 99 ? '—' : p.months_remaining > 12 ? '≥ 12 tháng' : `~${p.months_remaining.toFixed(1)} tháng`
  return <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-semibold whitespace-nowrap">{display}</span>
}

function TabDuBaoTonKho({ factors, model }: { factors: number[]; model: 'linear' | 'seasonal' }) {
  const [products, setProducts] = useState<ProductForecast[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')

  useEffect(() => {
    setLoading(true)
    fetch('/api/reports?type=forecast_products')
      .then(r => r.json())
      .then((raw: ProductForecastRaw[]) => {
        const computed: ProductForecast[] = raw.map(p => {
          const totalSold = p.monthly_sales.reduce((s, m) => s + m.qty, 0)
          // Dead stock: có tồn nhưng 12 tháng không bán được gì
          if (totalSold === 0) {
            return {
              ...p, avg_monthly: 0, f1: 0, f2: 0, f3: 0,
              months_remaining: 999,
              risk: p.current_stock > 0 ? 'dead' : 'out' as ProductForecast['risk'],
              method: 'none', data_months: 0,
            }
          }
          const res = forecastProductQty(p.monthly_sales, p.current_stock, factors, model)
          const avgMonthly = (res.f1 + res.f2 + res.f3) / 3
          const risk: ProductForecast['risk'] =
            p.current_stock <= 0 ? 'out' :
            res.months_remaining < 1 ? 'critical' :
            res.months_remaining < 3 ? 'low' : 'ok'
          return {
            ...p,
            avg_monthly: Math.round(avgMonthly),
            f1: res.f1, f2: res.f2, f3: res.f3,
            months_remaining: res.months_remaining,
            risk, method: res.method, data_months: res.data_months,
          }
        }).sort((a, b) => {
          const rd = RISK_ORDER[a.risk] - RISK_ORDER[b.risk]
          return rd !== 0 ? rd : a.months_remaining - b.months_remaining
        })
        setProducts(computed)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [factors, model])

  const filtered  = search ? products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
  ) : products

  const outCount      = products.filter(p => p.risk === 'out').length
  const criticalCount = products.filter(p => p.risk === 'critical').length
  const lowCount      = products.filter(p => p.risk === 'low').length
  const deadCount     = products.filter(p => p.risk === 'dead').length

  // Biểu đồ chỉ hiển thị nhóm đang hết/sắp hết — dead stock là vấn đề khác
  const barData = products.filter(p => p.risk === 'out' || p.risk === 'critical' || p.risk === 'low').slice(0, 20).map(p => ({
    name: p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name,
    months: p.risk === 'out' ? 0 : Math.min(p.months_remaining, 6),
    risk: p.risk,
  }))

  if (loading) return <div className="text-center py-16 text-sm text-gray-400">Đang tính dự báo sản phẩm…</div>
  if (!products.length) return <div className="text-center py-16 text-sm text-gray-400">Chưa có dữ liệu bán hàng để dự báo</div>

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
        <span className="text-blue-400 text-base leading-none mt-0.5">ℹ</span>
        <p className="text-xs text-blue-700 leading-relaxed">
          Dự báo lượng bán theo từng sản phẩm dựa trên lịch sử 12 tháng gần nhất · Kết hợp tồn kho hiện tại để ước tính thời gian hết hàng nếu không nhập thêm.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-3">
        <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Tổng SKU</p>
          <p className="text-2xl font-bold text-[#1e2a3a]">{products.length}</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${outCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-[#e5e7eb]'}`}>
          <p className="text-xs text-gray-500 mb-1">Hết hàng</p>
          <p className={`text-2xl font-bold ${outCount > 0 ? 'text-red-600' : 'text-gray-300'}`}>{outCount}</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${criticalCount > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-[#e5e7eb]'}`}>
          <p className="text-xs text-gray-500 mb-1">Dưới 1 tháng</p>
          <p className={`text-2xl font-bold ${criticalCount > 0 ? 'text-orange-600' : 'text-gray-300'}`}>{criticalCount}</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${lowCount > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-[#e5e7eb]'}`}>
          <p className="text-xs text-gray-500 mb-1">Dưới 3 tháng</p>
          <p className={`text-2xl font-bold ${lowCount > 0 ? 'text-amber-600' : 'text-gray-300'}`}>{lowCount}</p>
        </div>
        <div className={`rounded-xl border px-4 py-3 ${deadCount > 0 ? 'bg-gray-50 border-gray-200' : 'bg-white border-[#e5e7eb]'}`}>
          <p className="text-xs text-gray-500 mb-1">Tồn đọng</p>
          <p className={`text-2xl font-bold ${deadCount > 0 ? 'text-gray-500' : 'text-gray-300'}`}>{deadCount}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">Có hàng, 0 đơn/12T</p>
        </div>
      </div>

      {barData.length > 0 && (
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
          <h3 className="text-sm font-semibold text-[#1e2a3a] mb-3">Top sản phẩm có nguy cơ hết hàng (tháng còn lại)</h3>
          <ResponsiveContainer width="100%" height={Math.max(160, barData.length * 30)}>
            <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
              <XAxis type="number" domain={[0, 6]} tick={{ fontSize: 10 }}
                tickFormatter={v => v === 0 ? '0' : v === 6 ? '≥6T' : `${v}T`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
              <Tooltip formatter={(v: any, _: any, props: any) => [
                props.payload.risk === 'out' ? 'Hết hàng' : `${Number(v).toFixed(1)} tháng`, 'Tồn dự báo'
              ]} />
              <ReferenceLine x={1} stroke="#ef4444" strokeDasharray="4 3" />
              <ReferenceLine x={3} stroke="#f59e0b" strokeDasharray="4 3" />
              <Bar dataKey="months" radius={[0, 4, 4, 0]}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={RISK_COLORS[entry.risk as keyof typeof RISK_COLORS]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 justify-center">
            {([['out','#ef4444','Hết hàng'], ['critical','#f97316','< 1 tháng'], ['low','#f59e0b','< 3 tháng']] as const).map(([r, c, label]) => (
              <div key={r} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
                <span className="text-[10px] text-gray-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#e5e7eb] flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-[#1e2a3a] shrink-0">Bảng dự báo sản phẩm</h3>
          <input
            type="text" placeholder="Tìm theo tên / mã SKU…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="text-xs border border-[#e5e7eb] rounded-lg px-3 py-1.5 w-56 outline-none focus:border-[var(--mia-primary)]"
          />
        </div>
        <div className="px-4 py-2 border-b border-[#e5e7eb] bg-gray-50/60 flex flex-wrap gap-x-5 gap-y-1">
          <span className="text-[11px] text-gray-400"><span className="font-semibold text-gray-500">TB/tháng</span> — lượng bán trung bình dự kiến mỗi tháng tới</span>
          <span className="text-[11px] text-gray-400"><span className="font-semibold text-gray-500">T+1 / T+2 / T+3</span> — ước tính số lượng bán tháng 1, 2, 3 tiếp theo</span>
          <span className="text-[11px] text-gray-400"><span className="font-semibold text-gray-500">—</span> hiện khi chưa đủ 3 tháng lịch sử để tính xu hướng</span>
          <span className="text-[11px] text-gray-400"><span className="font-semibold text-gray-500">Còn ~</span> — tồn kho hiện tại ÷ TB/tháng = số tháng trước khi hết hàng</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="bg-gray-50">
              {['SKU', 'Tên sản phẩm', 'TB/tháng', 'T+1', 'T+2', 'T+3', 'Tồn kho', 'Còn ~'].map(h => (
                <th key={h} className="px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase text-left whitespace-nowrap">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.product_id}
                  className={`border-t border-[#e5e7eb] hover:bg-gray-50/80 ${p.risk === 'out' ? 'bg-red-50/40' : p.risk === 'critical' ? 'bg-orange-50/30' : ''}`}>
                  <td className="px-3 py-2 text-xs font-mono text-gray-500 whitespace-nowrap">{p.sku}</td>
                  <td className="px-3 py-2 text-xs font-medium text-[#1e2a3a] max-w-[180px] truncate">{p.name}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="text-xs text-gray-600">{p.avg_monthly > 0 ? `${p.avg_monthly} ${p.unit}` : '—'}</div>
                    <div className="text-[10px] text-gray-300 mt-0.5">{METHOD_LABEL[p.method] ?? p.method}</div>
                  </td>
                  <td className="px-3 py-2 text-xs font-semibold text-[var(--mia-primary)] whitespace-nowrap">{p.f1 > 0 ? `~${p.f1}` : '—'}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{p.data_months >= 3 ? <span className="text-[var(--mia-primary)]">~{p.f2}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">{p.data_months >= 3 ? <span className="text-[var(--mia-primary)]">~{p.f3}</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-3 py-2 text-xs font-semibold text-[#1e2a3a] whitespace-nowrap">{p.current_stock} {p.unit}</td>
                  <td className="px-3 py-2"><RiskBadge p={p} /></td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-gray-400">Không tìm thấy sản phẩm</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Dự báo doanh thu ────────────────────────────────────────────────────
const MONTH_LABELS   = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12']
const PRESET_FMCG_VN = [1.8, 1.4, 1.1, 1.0, 1.0, 0.8, 0.8, 0.9, 1.0, 1.1, 1.3, 1.5]

function getMonthNum(key: string): number { return parseInt(key.split('-')[1]) }

function seasonalForecast(
  monthly: MonthRow[],
  rawFactors: number[],
  field: 'revenue' | 'gross',
  periods: number,
): number[] {
  const n   = monthly.length
  if (n < 2) return Array(periods).fill(0)
  const avg  = rawFactors.reduce((a, b) => a + b, 0) / 12
  const facs = avg > 0 ? rawFactors.map(f => f / avg) : Array(12).fill(1)
  const vals = monthly.map(m => field === 'revenue' ? m.revenue : gross(m))
  const mons = monthly.map(m => getMonthNum(m.key))
  const deseason = vals.map((v, i) => { const f = facs[mons[i] - 1]; return f > 0 ? v / f : v })
  const xMean = (n - 1) / 2
  const yMean = deseason.reduce((a, b) => a + b, 0) / n
  const ssXY  = deseason.reduce((s, y, i) => s + (i - xMean) * (y - yMean), 0)
  const ssXX  = deseason.reduce((s, _, i) => s + (i - xMean) ** 2, 0)
  const slope = ssXX === 0 ? 0 : ssXY / ssXX
  const intercept = yMean - slope * xMean
  const lastMon   = mons[n - 1]
  return Array.from({ length: periods }, (_, i) => {
    const fMon = ((lastMon + i) % 12) + 1
    return Math.max(0, Math.round(Math.max(0, intercept + slope * (n + i)) * facs[fMon - 1]))
  })
}

function TabDuBao({ monthly }: { monthly: MonthRow[] }) {
  const [subTab,     setSubTab]     = useState<'doanh-thu' | 'ton-kho'>('doanh-thu')
  const [model,      setModel]      = useState<'linear' | 'seasonal'>('linear')
  const [factors,    setFactors]    = useState<number[]>(Array(12).fill(1.0))
  const [showConfig, setShowConfig] = useState(false)
  const [saved,      setSaved]      = useState(false)

  useEffect(() => {
    loadBusinessSettingsAsync().then(s => {
      if (Array.isArray(s.forecastSeasonalFactors) && s.forecastSeasonalFactors.length === 12)
        setFactors(s.forecastSeasonalFactors)
    })
  }, [])

  const handleFactorChange = (idx: number, val: string) => {
    const v = parseFloat(val)
    if (isNaN(v) || v <= 0) return
    const next = [...factors]; next[idx] = v; setFactors(next)
  }

  const handleSaveFactors = () => {
    const current = loadBusinessSettings()
    saveBusinessSettingsAsync({ ...current, forecastSeasonalFactors: factors })
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const FORECAST     = 3
  const lastKey      = monthly.length > 0 ? monthly[monthly.length - 1].key : ''
  const revenues     = monthly.map(m => m.revenue)
  const grossProfits = monthly.map(m => gross(m))
  const curMonthIdx  = new Date().getMonth()
  const facBarData   = MONTH_LABELS.map((m, i) => ({ month: m, 'Hệ số': Math.round(factors[i] * 100) / 100 }))

  const revForecast = monthly.length >= 3
    ? (model === 'seasonal' ? seasonalForecast(monthly, factors, 'revenue', FORECAST) : linearForecast(revenues, FORECAST))
    : [0, 0, 0]
  const gpForecast = monthly.length >= 3
    ? (model === 'seasonal' ? seasonalForecast(monthly, factors, 'gross', FORECAST) : linearForecast(grossProfits, FORECAST))
    : [0, 0, 0]

  const chartData = monthly.length >= 3 ? [
    ...monthly.map(m => ({ key: m.key, 'Doanh thu thực': m.revenue, 'LN gộp thực': gross(m) })),
    ...Array.from({ length: FORECAST }, (_, i) => ({
      key: nextKey(lastKey, i + 1),
      'DT dự báo': revForecast[i],
      'LN dự báo': gpForecast[i],
    })),
  ] : []

  const lastRev  = revenues.length > 0 ? revenues[revenues.length - 1] : 0
  const trend    = revForecast[0] > lastRev ? 'tăng' : 'giảm'
  const trendPct = lastRev > 0 ? Math.abs((revForecast[0] - lastRev) / lastRev * 100) : 0

  return (
    <div className="space-y-4">
      {/* Sub-tab selector */}
      <div className="flex gap-1 bg-white rounded-xl border border-[#e5e7eb] px-3 py-2 w-fit">
        {(['doanh-thu', 'ton-kho'] as const).map(st => (
          <button key={st} onClick={() => setSubTab(st)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${subTab === st ? 'bg-[var(--mia-primary)] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
            {st === 'doanh-thu' ? 'Doanh thu' : 'Sản phẩm & Tồn kho'}
          </button>
        ))}
      </div>

      {subTab === 'doanh-thu' && (
        <>
          {monthly.length < 3 ? (
            <div className="text-center py-16 text-sm text-gray-400">Cần ít nhất 3 tháng dữ liệu để tính dự báo doanh thu</div>
          ) : (
            <>
              {/* Model selector */}
              <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
                <span className="text-sm font-semibold text-[#1e2a3a]">Mô hình dự báo:</span>
                <div className="flex gap-1">
                  {(['linear', 'seasonal'] as const).map(m => (
                    <button key={m} onClick={() => { setModel(m); if (m === 'seasonal') setShowConfig(true) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${model === m ? 'bg-[var(--mia-primary)] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                      {m === 'linear' ? 'Tuyến tính' : 'Mùa vụ'}
                    </button>
                  ))}
                </div>
                {model === 'seasonal' && (
                  <button onClick={() => setShowConfig(v => !v)}
                    className="ml-auto text-xs text-[var(--mia-primary)] font-medium hover:underline">
                    {showConfig ? 'Ẩn cài đặt ▲' : 'Cài đặt hệ số mùa vụ ▼'}
                  </button>
                )}
              </div>

              {/* Seasonal config panel */}
              {model === 'seasonal' && showConfig && (
                <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-[#1e2a3a]">Hệ số mùa vụ theo tháng</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Hệ số &gt; 1 = cao điểm · &lt; 1 = thấp điểm · = 1 = bình thường · Hệ thống tự chuẩn hoá trước khi tính.
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button onClick={() => setFactors([...PRESET_FMCG_VN])}
                        className="px-3 py-1.5 text-xs font-medium border border-[#e5e7eb] rounded-lg hover:bg-gray-50 text-gray-600 whitespace-nowrap">
                        Preset FMCG Việt Nam
                      </button>
                      <button onClick={handleSaveFactors}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${saved ? 'bg-green-500 text-white' : 'bg-[var(--mia-primary)] text-white hover:opacity-90'}`}>
                        {saved ? '✓ Đã lưu' : 'Lưu cài đặt'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-1.5">
                    {MONTH_LABELS.map((label, i) => (
                      <div key={i} className={`flex flex-col items-center gap-1.5 p-2 rounded-lg ${i === curMonthIdx ? 'bg-blue-50 border border-blue-100' : 'bg-gray-50'}`}>
                        <span className={`text-[10px] font-bold ${i === curMonthIdx ? 'text-[var(--mia-primary)]' : 'text-gray-500'}`}>{label}</span>
                        <input
                          type="number" step="0.1" min="0.1" max="5"
                          value={factors[i]}
                          onChange={e => handleFactorChange(i, e.target.value)}
                          className="w-full text-center text-xs font-bold border border-gray-200 rounded py-1 outline-none focus:border-[var(--mia-primary)] bg-white"
                        />
                        <div className="w-full bg-gray-200 rounded-full h-1 overflow-hidden">
                          <div className={`h-1 rounded-full transition-all ${factors[i] >= 1 ? 'bg-[var(--mia-primary)]' : 'bg-amber-400'}`}
                            style={{ width: `${Math.min(100, (factors[i] / 2.5) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <p className="text-xs text-gray-400 mb-2">Biểu đồ hệ số mùa vụ</p>
                    <ResponsiveContainer width="100%" height={80}>
                      <BarChart data={facBarData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis domain={[0, Math.max(2, ...factors) * 1.15]} hide />
                        <Tooltip formatter={(v: any) => ['×' + v, 'Hệ số']} />
                        <ReferenceLine y={1} stroke="#9ca3af" strokeDasharray="4 3" />
                        <Bar dataKey="Hệ số" radius={[3, 3, 0, 0]}>
                          {facBarData.map((entry, i) => (
                            <Cell key={i} fill={entry['Hệ số'] >= 1 ? '#0ea5e9' : '#f59e0b'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* KPI cards */}
              <div className="grid grid-cols-3 gap-3">
                {revForecast.map((rv, i) => (
                  <div key={i} className="bg-white rounded-xl border border-amber-100 bg-amber-50/30 px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1">Dự báo {nextMonthStr(lastKey, i + 1)}</p>
                    <p className="text-lg font-bold text-[var(--mia-primary)]">~ {fmtShort(rv)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">LN gộp dự kiến: ~ {fmtShort(gpForecast[i])}</p>
                  </div>
                ))}
              </div>

              {/* Main chart */}
              <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-[#1e2a3a]">
                    Xu hướng & Dự báo ({model === 'seasonal' ? 'mô hình mùa vụ' : 'hồi quy tuyến tính'})
                  </h3>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${trend === 'tăng' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    Xu hướng {trend} ~{trendPct.toFixed(1)}%/tháng
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="key" tick={{ fontSize: 11 }} tickFormatter={keyToLabel} />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 11 }} width={52} />
                    <Tooltip formatter={(v: any) => fmtVND(v)} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="Doanh thu thực" stroke="#0ea5e9" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="LN gộp thực"    stroke="#10b981" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="DT dự báo" stroke="#0ea5e9" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 5, fill: '#0ea5e9' }} />
                    <Line type="monotone" dataKey="LN dự báo" stroke="#10b981" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 5, fill: '#10b981' }} />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-[10px] text-gray-400 text-center mt-2">
                  Đường nét đứt = dự báo {monthly.length} tháng lịch sử
                  {model === 'seasonal' ? ' · áp dụng hệ số mùa vụ đã cài đặt' : ' · hồi quy tuyến tính'}.
                  Chỉ mang tính tham khảo.
                </p>
              </div>

              {/* Detail table */}
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
                        <td className="px-4 py-2.5 text-xs font-semibold text-[var(--mia-primary)]">{fmtShort(m.revenue)}</td>
                        <td className="px-4 py-2.5 text-xs text-green-600">{fmtShort(gross(m))}</td>
                        <td className="px-4 py-2.5 text-xs text-purple-600">{fmtShort(net(m))}</td>
                      </tr>
                    ))}
                    {revForecast.map((rv, i) => (
                      <tr key={`f-${i}`} className="border-t border-[#e5e7eb] bg-amber-50/40 hover:bg-amber-50">
                        <td className="px-4 py-2.5 text-xs font-medium">{nextMonthStr(lastKey, i + 1)}</td>
                        <td className="px-4 py-2.5"><span className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">Dự báo</span></td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-[var(--mia-primary)]">~ {fmtShort(rv)}</td>
                        <td className="px-4 py-2.5 text-xs text-green-600">~ {fmtShort(gpForecast[i])}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {subTab === 'ton-kho' && (
        <TabDuBaoTonKho factors={factors} model={model} />
      )}
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
  { key: 'Tổng quan',     minPlan: 'starter' as PlanTier, label: 'Tổng quan' },
  { key: 'So sánh kỳ',    minPlan: 'starter' as PlanTier, label: 'So sánh kỳ' },
  { key: 'Drill-down',    minPlan: 'starter' as PlanTier, label: 'Drill-down' },
  { key: 'KPI Nhân viên', minPlan: 'starter' as PlanTier, label: 'KPI Nhân viên' },
  { key: 'Dự báo',        minPlan: 'starter' as PlanTier, label: 'Dự báo' },
  { key: 'Lên lịch',      minPlan: 'starter' as PlanTier, label: 'Lên lịch' },
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
    starter:    'Báo cáo toàn diện: tổng quan · so sánh kỳ · drill-down · KPI · dự báo',
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
              className="flex items-center gap-2 px-4 py-2 border border-[#e5e7eb] bg-white rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:border-[var(--mia-primary)] hover:text-[var(--mia-primary)] transition-all">
              <Printer size={14} /> In / PDF
            </button>
          )}
          <button onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 border border-[#e5e7eb] bg-white rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:border-[var(--mia-primary)] hover:text-[var(--mia-primary)] transition-all">
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
                active  ? 'bg-[var(--mia-primary)] text-white shadow-sm' :
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
          {tab === 'Tổng quan'     && <TabTongQuan monthly={monthly} />}
          {tab === 'So sánh kỳ'   && <TabSoSanh monthly={monthly} />}
          {tab === 'Drill-down'    && <TabDrillDown />}
          {tab === 'KPI Nhân viên' && <TabKpiNhanVien />}
          {tab === 'Dự báo'        && <TabDuBao monthly={monthly} />}
          {tab === 'Lên lịch'      && <TabLenLich />}
        </>
      )}
    </div>
  )
}
