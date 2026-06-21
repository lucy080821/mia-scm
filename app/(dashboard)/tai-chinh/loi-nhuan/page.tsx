'use client'
import { useState, useEffect } from 'react'
import { Download, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import * as XLSX from 'xlsx'

type MonthRow = { month: string; key: string; revenue: number; cogs: number; logistics: number; warehouse: number; salary: number; other: number }

const fmtVND   = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ'
const fmtShort = (n: number) => n >= 1e9 ? (n/1e9).toFixed(1)+'tỷ' : n >= 1e6 ? (n/1e6).toFixed(0)+'tr' : n.toString()
const opex     = (m: MonthRow) => m.logistics + m.warehouse + m.salary + m.other
const gross    = (m: MonthRow) => m.revenue - m.cogs
const net      = (m: MonthRow) => gross(m) - opex(m)
const gm       = (m: MonthRow) => m.revenue ? (gross(m) / m.revenue * 100).toFixed(1) : '0'
const nm       = (m: MonthRow) => m.revenue ? (net(m)   / m.revenue * 100).toFixed(1) : '0'

export default function LoiNhuanPage() {
  const [monthly, setMonthly] = useState<MonthRow[]>([])
  const [loading, setLoading] = useState(true)
  const [period,  setPeriod]  = useState('')

  useEffect(() => {
    fetch('/api/finance?type=monthly').then(r => r.json()).then(d => {
      setMonthly(d)
      if (d.length) setPeriod(d[d.length - 1].key)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const cur  = monthly.find(m => m.key === period) ?? monthly[monthly.length - 1]
  const prev = cur ? monthly[monthly.indexOf(cur) - 1] : undefined

  const chartData = monthly.slice(-6).map(m => ({
    name: m.month,
    'Doanh thu':   m.revenue,
    'LN gộp':      gross(m),
    'LN ròng':     net(m),
  }))

  const pnlRows = cur ? [
    { label: 'Doanh thu bán hàng',    cur: cur.revenue,    prev: prev?.revenue    ?? 0, indent: 0, bold: false },
    { label: '(-) Giá vốn hàng bán',  cur: -cur.cogs,      prev: -(prev?.cogs     ?? 0), indent: 0, bold: false },
    { label: 'Lợi nhuận gộp',         cur: gross(cur),     prev: prev ? gross(prev) : 0, indent: 0, bold: true  },
    { label: '  Biên LN gộp (%)',     cur: null,           prev: null, pct: `${gm(cur)}%`, prevPct: prev ? `${gm(prev)}%` : '—', indent: 1, bold: false },
    { label: '(-) Chi phí vận chuyển',cur: -cur.logistics, prev: -(prev?.logistics ?? 0), indent: 0, bold: false },
    { label: '(-) Lương nhân viên',   cur: -cur.salary,    prev: -(prev?.salary    ?? 0), indent: 0, bold: false },
    { label: '(-) Thuê & lưu kho',    cur: -cur.warehouse, prev: -(prev?.warehouse ?? 0), indent: 0, bold: false },
    { label: '(-) Chi phí khác',      cur: -cur.other,     prev: -(prev?.other     ?? 0), indent: 0, bold: false },
    { label: 'Lợi nhuận ròng',        cur: net(cur),       prev: prev ? net(prev) : 0, indent: 0, bold: true  },
    { label: '  Biên LN ròng (%)',    cur: null,           prev: null, pct: `${nm(cur)}%`, prevPct: prev ? `${nm(prev)}%` : '—', indent: 1, bold: false },
  ] : []

  const exportExcel = () => {
    if (!cur) return
    const rows = pnlRows.map(r => ({
      'Chỉ tiêu': r.label,
      [cur.month]: r.cur !== null ? Math.abs(r.cur) : r.pct,
      [prev?.month ?? 'Kỳ trước']: r.prev !== null ? Math.abs(r.prev) : r.prevPct,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Lợi nhuận')
    XLSX.writeFile(wb, `loi-nhuan_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  if (loading) return <div className="p-10 text-center text-sm text-gray-400">Đang tải dữ liệu...</div>

  return (
    <div className="p-5 bg-[#f0f2f5] min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#1e2a3a]">Báo cáo Lợi nhuận</h1>
          <p className="text-sm text-gray-500 mt-0.5">Phân tích P&L từ dữ liệu thực</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 bg-white">
            {monthly.map(m => <option key={m.key} value={m.key}>{m.month}</option>)}
          </select>
          <button onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors">
            <Download size={16}/> Xuất Excel
          </button>
        </div>
      </div>

      {cur && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Doanh thu', val: cur.revenue, prev: prev?.revenue ?? 0, color: 'text-sky-700', bg: 'bg-sky-50 border-sky-100' },
            { label: 'LN gộp',   val: gross(cur),  prev: prev ? gross(prev) : 0, color: 'text-green-700', bg: 'bg-green-50 border-green-100' },
            { label: 'LN ròng',  val: net(cur),    prev: prev ? net(prev) : 0, color: net(cur) >= 0 ? 'text-emerald-700' : 'text-red-600', bg: net(cur) >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100' },
            { label: 'Biên LN gộp', val: null, pct: `${gm(cur)}%`, color: 'text-violet-700', bg: 'bg-violet-50 border-violet-100' },
          ].map(c => {
            const chg = c.val !== null && c.prev ? Math.round((c.val - c.prev) / Math.abs(c.prev) * 100) : null
            return (
              <div key={c.label} className={`rounded-xl border p-4 ${c.bg}`}>
                <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{c.label}</div>
                <div className={`text-base sm:text-xl font-bold truncate ${c.color}`}>{c.pct ?? fmtVND(c.val ?? 0)}</div>
                {chg !== null && (
                  <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${chg >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {chg >= 0 ? <ArrowUpRight size={12}/> : <ArrowDownRight size={12}/>}
                    {chg >= 0 ? '+' : ''}{chg}% so tháng trước
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#1e2a3a] mb-4">Báo cáo P&L chi tiết — So sánh với kỳ trước</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="py-2 text-left text-xs font-semibold text-gray-500 uppercase">Chỉ tiêu</th>
                <th className="py-2 text-right text-xs font-semibold text-gray-500 uppercase">{cur?.month ?? '—'}</th>
                <th className="py-2 text-right text-xs font-semibold text-gray-500 uppercase">{prev?.month ?? 'Kỳ trước'}</th>
                <th className="py-2 text-right text-xs font-semibold text-gray-500 uppercase">+/−%</th>
              </tr>
            </thead>
            <tbody>
              {pnlRows.map((r, i) => {
                const chg = r.cur !== null && r.prev && r.prev !== 0 ? Math.round((r.cur - r.prev) / Math.abs(r.prev) * 100) : null
                return (
                  <tr key={i} className={`${r.bold ? 'border-t border-gray-200 bg-gray-50' : ''}`}>
                    <td className={`py-2 text-gray-600 ${r.indent ? 'pl-4 text-gray-400' : ''} ${r.bold ? 'font-semibold text-[#1e2a3a]' : ''}`}>{r.label}</td>
                    <td className={`py-2 text-right ${r.bold ? 'font-bold' : ''} ${r.cur !== null && r.cur < 0 ? 'text-red-600' : r.cur !== null && r.bold ? 'text-green-700' : ''}`}>
                      {r.cur !== null ? fmtVND(Math.abs(r.cur)) : r.pct}
                    </td>
                    <td className="py-2 text-right text-gray-400 text-xs">
                      {r.prev !== null ? fmtVND(Math.abs(r.prev)) : r.prevPct}
                    </td>
                    <td className={`py-2 text-right text-xs font-medium ${chg !== null && chg >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {chg !== null ? `${chg >= 0 ? '+' : ''}${chg}%` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#1e2a3a] mb-4">Xu hướng lợi nhuận 6 tháng</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="name" tick={{ fontSize: 11 }}/>
              <YAxis tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11 }} width={50}/>
              <Tooltip formatter={(v: any) => fmtVND(v)}/>
              <Legend wrapperStyle={{ fontSize: 11 }}/>
              <Bar dataKey="Doanh thu" fill="#0ea5e9" radius={[4,4,0,0]}/>
              <Bar dataKey="LN gộp"   fill="#22c55e" radius={[4,4,0,0]}/>
              <Bar dataKey="LN ròng"  fill="#a855f7" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
