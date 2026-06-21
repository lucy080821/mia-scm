'use client'
import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, DollarSign, BarChart2, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

type MonthRow = { month: string; key: string; revenue: number; cogs: number; logistics: number; warehouse: number; salary: number; other: number }

const fmt = (n: number) => {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + ' tỷ'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(0) + ' tr'
  return new Intl.NumberFormat('vi-VN').format(n) + ' đ'
}
const fmtFull = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ'

const opex     = (m: MonthRow) => m.logistics + m.warehouse + m.salary + m.other
const gross    = (m: MonthRow) => m.revenue - m.cogs
const net      = (m: MonthRow) => gross(m) - opex(m)
const gm       = (m: MonthRow) => m.revenue ? Math.round(gross(m) / m.revenue * 100) : 0
const nm       = (m: MonthRow) => m.revenue ? Math.round(net(m) / m.revenue * 100) : 0

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span style={{ color: p.color }}>●</span>
          <span className="text-gray-600">{p.name}:</span>
          <span className="font-medium">{fmt(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function TongQuanTaiChinhPage() {
  const [monthly, setMonthly] = useState<MonthRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/finance?type=monthly').then(r => r.json()).then(d => { setMonthly(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const cur  = monthly[monthly.length - 1]
  const prev = monthly[monthly.length - 2]
  const curMonth = cur ? new Date(cur.key + '-01').toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' }) : '—'

  const revChange  = cur && prev && prev.revenue  ? Math.round((cur.revenue  - prev.revenue)  / prev.revenue  * 100) : 0
  const costChange = cur && prev ? Math.round(((cur.cogs + opex(cur)) - (cur.cogs + opex(prev))) / Math.max(cur.cogs + opex(prev), 1) * 100) : 0
  const grossChg   = cur && prev ? Math.round((gross(cur) - gross(prev)) / Math.max(gross(prev), 1) * 100) : 0
  const netChg     = cur && prev ? Math.round((net(cur) - net(prev)) / Math.max(Math.abs(net(prev)), 1) * 100) : 0

  const chartData = monthly.slice(-6).map(m => ({
    name: m.month,
    'Doanh thu': m.revenue,
    'Chi phí':   m.cogs + opex(m),
    'LN gộp':    gross(m),
    'LN ròng':   net(m),
  }))

  const kpis = cur ? [
    { label: `Doanh thu ${curMonth}`, value: fmt(cur.revenue), sub: `${revChange >= 0 ? '+' : ''}${revChange}% so tháng trước`, up: revChange >= 0, icon: <DollarSign size={20} className="text-sky-500" />, bg: 'bg-sky-50' },
    { label: 'Tổng chi phí',          value: fmt(cur.cogs + opex(cur)), sub: `${costChange >= 0 ? '+' : ''}${costChange}% so tháng trước`, up: costChange < 0, icon: <TrendingDown size={20} className="text-orange-500" />, bg: 'bg-orange-50' },
    { label: 'Lợi nhuận gộp',         value: fmt(gross(cur)), sub: `Biên LN gộp: ${gm(cur)}%`, up: grossChg >= 0, icon: <TrendingUp size={20} className="text-green-500" />, bg: 'bg-green-50' },
    { label: 'Lợi nhuận ròng',        value: fmt(net(cur)), sub: `Biên LN ròng: ${nm(cur)}%`, up: net(cur) >= 0, icon: <BarChart2 size={20} className="text-purple-500" />, bg: 'bg-purple-50' },
  ] : []

  if (loading) return <div className="p-10 text-center text-sm text-gray-400">Đang tải dữ liệu...</div>

  if (!cur) return (
    <div className="p-10 text-center text-sm text-gray-400">
      Chưa có dữ liệu tài chính. Hãy hoàn thành một số đơn hàng để xem báo cáo.
    </div>
  )

  const totalCost = cur.cogs + opex(cur)

  return (
    <div className="p-5 bg-[#f0f2f5] min-h-screen">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#1e2a3a]">Tổng quan Tài chính</h1>
        <p className="text-sm text-gray-500 mt-0.5">Kỳ báo cáo: {curMonth} — dữ liệu thực từ hệ thống</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {kpis.map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-[#e5e7eb] p-3 sm:p-4 shadow-sm">
            <div className="flex items-start justify-between mb-2 sm:mb-3">
              <span className="text-xs font-semibold text-gray-500 uppercase leading-tight">{k.label}</span>
              <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 ${k.bg}`}>{k.icon}</div>
            </div>
            <div className="text-lg sm:text-2xl font-bold text-[#1e2a3a] truncate">{k.value}</div>
            <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${k.up ? 'text-green-600' : 'text-red-500'}`}>
              {k.up ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>}
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 shadow-sm mb-5">
        <h2 className="text-sm font-bold text-[#1e2a3a] mb-4">Doanh thu — Chi phí — Lợi nhuận (6 tháng gần nhất)</h2>
        <ResponsiveContainer width="100%" height={340}>
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorRev"   x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.15}/><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/></linearGradient>
              <linearGradient id="colorCost"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.12}/><stop offset="95%" stopColor="#f97316" stopOpacity={0}/></linearGradient>
              <linearGradient id="colorGross" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22c55e" stopOpacity={0.15}/><stop offset="95%" stopColor="#22c55e" stopOpacity={0}/></linearGradient>
              <linearGradient id="colorNet"   x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a855f7" stopOpacity={0.15}/><stop offset="95%" stopColor="#a855f7" stopOpacity={0}/></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }}/>
            <YAxis tickFormatter={v => fmt(v)} tick={{ fontSize: 11, fill: '#6b7280' }} width={70}/>
            <Tooltip content={<CustomTooltip/>}/>
            <Legend wrapperStyle={{ fontSize: 12 }}/>
            <Area type="monotone" dataKey="Doanh thu" stroke="#0ea5e9" fill="url(#colorRev)"   strokeWidth={2}/>
            <Area type="monotone" dataKey="Chi phí"   stroke="#f97316" fill="url(#colorCost)"  strokeWidth={2}/>
            <Area type="monotone" dataKey="LN gộp"    stroke="#22c55e" fill="url(#colorGross)" strokeWidth={2}/>
            <Area type="monotone" dataKey="LN ròng"   stroke="#a855f7" fill="url(#colorNet)"   strokeWidth={2}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#1e2a3a] mb-4">Cơ cấu chi phí {curMonth}</h2>
          {totalCost > 0 ? [
            { label: 'Giá vốn hàng bán (COGS)', val: cur.cogs,      color: 'bg-orange-400', pct: Math.round(cur.cogs / totalCost * 100) },
            { label: 'Chi phí vận chuyển',       val: cur.logistics, color: 'bg-sky-400',    pct: Math.round(cur.logistics / totalCost * 100) },
            { label: 'Lương nhân viên',          val: cur.salary,    color: 'bg-indigo-400', pct: Math.round(cur.salary / totalCost * 100) },
            { label: 'Thuê kho',                 val: cur.warehouse, color: 'bg-violet-400', pct: Math.round(cur.warehouse / totalCost * 100) },
            { label: 'Chi phí khác',             val: cur.other,     color: 'bg-gray-400',   pct: Math.round(cur.other / totalCost * 100) },
          ].map(row => (
            <div key={row.label} className="mb-3">
              <div className="flex justify-between text-xs text-gray-600 mb-1">
                <span>{row.label}</span>
                <span className="font-medium">{fmt(row.val)} <span className="text-gray-400">({row.pct}%)</span></span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className={`h-2 rounded-full ${row.color}`} style={{ width: `${row.pct}%` }}/>
              </div>
            </div>
          )) : <p className="text-xs text-gray-400">Chưa có dữ liệu chi phí</p>}
        </div>

        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#1e2a3a] mb-4">Báo cáo P&L {curMonth} (tóm tắt)</h2>
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: 'Doanh thu bán hàng',    val: cur.revenue,         bold: false, border: false },
                { label: '(-) Giá vốn hàng bán',  val: -cur.cogs,           bold: false, border: false },
                { label: 'Lợi nhuận gộp',          val: gross(cur),          bold: true,  border: true  },
                { label: '  Biên LN gộp',          val: null, pct: `${gm(cur)}%`, bold: false, border: false },
                { label: '(-) Chi phí vận chuyển', val: -cur.logistics,      bold: false, border: false },
                { label: '(-) Lương nhân viên',    val: -cur.salary,         bold: false, border: false },
                { label: '(-) Thuê & lưu kho',     val: -cur.warehouse,      bold: false, border: false },
                { label: '(-) Chi phí khác',       val: -cur.other,          bold: false, border: false },
                { label: 'Lợi nhuận ròng',         val: net(cur),            bold: true,  border: true  },
                { label: '  Biên LN ròng',         val: null, pct: `${nm(cur)}%`, bold: false, border: false },
              ].map((r, i) => (
                <tr key={i} className={r.border ? 'border-t border-gray-200' : ''}>
                  <td className={`py-1.5 text-gray-600 ${r.bold ? 'font-semibold text-[#1e2a3a]' : ''}`}>{r.label}</td>
                  <td className={`py-1.5 text-right ${r.bold ? 'font-bold text-[#1e2a3a]' : ''} ${r.val !== null && r.val < 0 ? 'text-red-600' : r.val !== null && r.bold ? 'text-green-700' : ''}`}>
                    {r.val !== null ? fmtFull(Math.abs(r.val)) : r.pct}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
