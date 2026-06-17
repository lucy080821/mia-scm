'use client'
import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts'

type MonthRow = { month: string; key: string; revenue: number; cogs: number; logistics: number; warehouse: number; salary: number; other: number }
type Expense  = { id: string; code: string; expense_date: string; category: string; description: string; amount: number; note: string }

const CATEGORY_LABEL: Record<string, string> = {
  salary: 'Lương nhân viên', warehouse_rent: 'Thuê kho', fuel: 'Nhiên liệu',
  maintenance: 'Bảo trì xe', other: 'Chi phí khác',
}
const COLORS = ['#f97316', '#0ea5e9', '#a855f7', '#22c55e', '#f59e0b', '#6b7280']

const fmtVND   = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ'
const fmtShort = (n: number) => n >= 1e9 ? (n/1e9).toFixed(1)+' tỷ' : n >= 1e6 ? (n/1e6).toFixed(0)+' tr' : new Intl.NumberFormat('vi-VN').format(n)
const fmtDate  = (d: string) => { try { return new Intl.DateTimeFormat('vi-VN').format(new Date(d)) } catch { return d } }
const opex     = (m: MonthRow) => m.logistics + m.warehouse + m.salary + m.other

export default function ChiPhiPage() {
  const [monthly,  setMonthly]  = useState<MonthRow[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/finance?type=monthly').then(r => r.json()),
      fetch('/api/finance?type=expenses').then(r => r.json()),
    ]).then(([m, e]) => { setMonthly(m); setExpenses(e); setLoading(false) })
    .catch(() => setLoading(false))
  }, [])

  const cur = monthly[monthly.length - 1]
  const curMonth = cur ? new Date(cur.key + '-01').toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' }) : '—'

  const donutData = cur ? [
    { name: 'Giá vốn (COGS)',   value: cur.cogs,      pct: cur.cogs + opex(cur) > 0 ? Math.round(cur.cogs      / (cur.cogs + opex(cur)) * 100) : 0 },
    { name: 'Vận chuyển',       value: cur.logistics,  pct: cur.cogs + opex(cur) > 0 ? Math.round(cur.logistics / (cur.cogs + opex(cur)) * 100) : 0 },
    { name: 'Lương NV',         value: cur.salary,     pct: cur.cogs + opex(cur) > 0 ? Math.round(cur.salary    / (cur.cogs + opex(cur)) * 100) : 0 },
    { name: 'Thuê kho',         value: cur.warehouse,  pct: cur.cogs + opex(cur) > 0 ? Math.round(cur.warehouse / (cur.cogs + opex(cur)) * 100) : 0 },
    { name: 'Chi phí khác',     value: cur.other,      pct: cur.cogs + opex(cur) > 0 ? Math.round(cur.other     / (cur.cogs + opex(cur)) * 100) : 0 },
  ].filter(d => d.value > 0) : []

  const barData = monthly.slice(-6).map(m => ({
    name: m.month,
    'COGS': m.cogs,
    'Vận chuyển': m.logistics,
    'Lương': m.salary,
    'Thuê kho': m.warehouse,
    'Khác': m.other,
  }))

  const DonutTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
        <p className="font-semibold">{payload[0].name}</p>
        <p>{fmtVND(payload[0].value)} <span className="text-gray-400">({payload[0].payload.pct}%)</span></p>
      </div>
    )
  }

  if (loading) return <div className="p-10 text-center text-sm text-gray-400">Đang tải dữ liệu...</div>

  const totalCost = cur ? cur.cogs + opex(cur) : 0

  return (
    <div className="p-5 bg-[#f0f2f5] min-h-screen">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#1e2a3a]">Chi phí</h1>
        <p className="text-sm text-gray-500 mt-0.5">Phân tích cơ cấu chi phí từ hệ thống</p>
      </div>

      {cur && (
        <div className="grid grid-cols-4 gap-4 mb-5">
          {[
            { label: 'Tổng chi phí', val: totalCost,    color: 'text-red-600',    bg: 'bg-red-50 border-red-100' },
            { label: 'Giá vốn COGS', val: cur.cogs,     color: 'text-orange-700', bg: 'bg-orange-50 border-orange-100' },
            { label: 'Vận chuyển',   val: cur.logistics, color: 'text-sky-700',   bg: 'bg-sky-50 border-sky-100' },
            { label: 'Chi phí khác', val: opex(cur) - cur.logistics, color: 'text-violet-700', bg: 'bg-violet-50 border-violet-100' },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border p-4 ${c.bg}`}>
              <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{c.label}</div>
              <div className={`text-xl font-bold ${c.color}`}>{fmtVND(c.val)}</div>
              <div className="text-xs text-gray-400 mt-0.5">{curMonth}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#1e2a3a] mb-4">Cơ cấu chi phí {curMonth}</h2>
          {donutData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={65} outerRadius={100} dataKey="value" paddingAngle={3}>
                  {donutData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]}/>)}
                </Pie>
                <Tooltip content={<DonutTooltip/>}/>
                <Legend wrapperStyle={{ fontSize: 12 }}/>
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-xs text-gray-400 text-center py-10">Chưa có dữ liệu</p>}
        </div>

        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 shadow-sm">
          <h2 className="text-sm font-bold text-[#1e2a3a] mb-4">Chi phí theo tháng (6 tháng gần nhất)</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0"/>
              <XAxis dataKey="name" tick={{ fontSize: 11 }}/>
              <YAxis tickFormatter={v => fmtShort(v)} tick={{ fontSize: 11 }} width={55}/>
              <Tooltip formatter={(v: any) => fmtVND(v)}/>
              <Legend wrapperStyle={{ fontSize: 11 }}/>
              {['COGS','Vận chuyển','Lương','Thuê kho','Khác'].map((k, i) => (
                <Bar key={k} dataKey={k} stackId="a" fill={COLORS[i]} radius={i === 4 ? [4,4,0,0] : [0,0,0,0]}/>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-sm font-bold text-[#1e2a3a]">Chi phí phát sinh gần đây</h2>
        </div>
        {expenses.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-400">Chưa có chi phí phát sinh nào được ghi nhận</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Mã','Ngày','Danh mục','Mô tả','Số tiền'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.slice(0, 50).map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-sky-600">{e.code}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(e.expense_date)}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-700">{CATEGORY_LABEL[e.category] ?? e.category}</span></td>
                  <td className="px-4 py-3 text-gray-700">{e.description}</td>
                  <td className="px-4 py-3 font-semibold text-[#1e2a3a]">{fmtVND(e.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
