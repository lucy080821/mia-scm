'use client'
import { useState, useEffect } from 'react'
import { Download, ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, RadarChart,
  Radar, PolarGrid, PolarAngleAxis,
} from 'recharts'
import * as XLSX from 'xlsx'

type MonthRow = { month: string; key: string; revenue: number; cogs: number; logistics: number; warehouse: number; salary: number; other: number }
type CategoryRow = { catId: string; name: string; revenue: number; pct: number; color: string }
type ProductRow = { id: string; name: string; revenue: number; qty: number; growth: number }
type CustomerRow = { id: string; name: string; revenue: number; orders: number }
type UserKpi = { id: string; name: string; code: string; revenue: number; orders: number }

const fmtVND   = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ'
const fmtShort = (n: number) => n >= 1e9 ? (n/1e9).toFixed(1)+'tỷ' : n >= 1e6 ? (n/1e6).toFixed(0)+'tr' : n.toString()
const opex     = (m: MonthRow) => m.logistics + m.warehouse + m.salary + m.other
const gross    = (m: MonthRow) => m.revenue - m.cogs
const net      = (m: MonthRow) => gross(m) - opex(m)
const AREA_COLORS = { revenue: '#0ea5e9', grossProfit: '#10b981', netProfit: '#8b5cf6' }

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

// ─── Tab: Tổng quan ───────────────────────────────────────────────────────────
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
          <h3 className="text-sm font-semibold text-[#1e2a3a]">Tổng hợp theo tháng</h3>
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

// ─── Tab: So sánh kỳ ─────────────────────────────────────────────────────────
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
  const netGrowth = b.revenue > 0 ? (net(a) - net(b)) / Math.abs(net(b)) * 100 : 0

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

// ─── Tab: Drill-down ─────────────────────────────────────────────────────────
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

      {/* Level 0: Categories */}
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

      {/* Level 1: Products */}
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

      {/* Level 2: Customers */}
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

// ─── Tab: KPI Nhân viên ───────────────────────────────────────────────────────
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

        <div className="space-y-4">
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
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
const TABS = ['Tổng quan', 'So sánh kỳ', 'Drill-down', 'KPI Nhân viên'] as const

export default function BaoCaoPage() {
  const [tab,     setTab]     = useState<typeof TABS[number]>('Tổng quan')
  const [monthly, setMonthly] = useState<MonthRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/finance?type=monthly').then(r => r.json())
      .then(setMonthly).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const handleExport = () => {
    const wb = XLSX.utils.book_new()
    const rows = monthly.map(m => ({
      'Tháng': m.month,
      'Doanh thu': m.revenue,
      'Giá vốn': m.cogs,
      'LN gộp': gross(m),
      'Chi phí VT': m.logistics,
      'Chi phí kho': m.warehouse,
      'Lương': m.salary,
      'CP khác': m.other,
      'LN ròng': net(m),
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Báo cáo tổng hợp')
    XLSX.writeFile(wb, `MiaSCM-BaoCao-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a]">Báo cáo</h1>
          <p className="text-sm text-gray-500 mt-0.5">Phân tích toàn diện · So sánh kỳ · Drill-down · KPI nhân viên</p>
        </div>
        <button onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 border border-[#e5e7eb] bg-white rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:border-[#0ea5e9] hover:text-[#0ea5e9] transition-all">
          <Download size={14} /> Xuất Excel
        </button>
      </div>

      <div className="flex items-center gap-1 bg-white border border-[#e5e7eb] rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${tab === t ? 'bg-[#0ea5e9] text-white shadow-sm' : 'text-gray-600 hover:text-[#1e2a3a] hover:bg-gray-50'}`}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-sm text-gray-400">Đang tải dữ liệu...</div>
      ) : (
        <>
          {tab === 'Tổng quan'    && <TabTongQuan monthly={monthly} />}
          {tab === 'So sánh kỳ'  && <TabSoSanh monthly={monthly} />}
          {tab === 'Drill-down'   && <TabDrillDown />}
          {tab === 'KPI Nhân viên'&& <TabKpiNhanVien />}
        </>
      )}
    </div>
  )
}
