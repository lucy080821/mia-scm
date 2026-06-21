'use client'
import { useState, useEffect, useMemo } from 'react'
import { Search, Download } from 'lucide-react'
import * as XLSX from 'xlsx'

type Order = {
  id: string; code: string; date: string; customer: string
  amount: number; paymentStatus: 'paid' | 'partial' | 'unpaid'; status: string
}

const fmtVND  = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ'
const fmtDate = (d: string) => { try { return new Intl.DateTimeFormat('vi-VN').format(new Date(d)) } catch { return d } }

const PAYMENT_BADGE: Record<string, string> = {
  paid: 'bg-green-100 text-green-700', partial: 'bg-yellow-100 text-yellow-700', unpaid: 'bg-red-100 text-red-700',
}
const PAYMENT_LABEL: Record<string, string> = {
  paid: 'Đã thanh toán', partial: 'TT 1 phần', unpaid: 'Chưa thanh toán',
}

export default function DoanhThuPage() {
  const [orders,   setOrders]   = useState<Order[]>([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [monthFil, setMonthFil] = useState('Tất cả')
  const [custFil,  setCustFil]  = useState('Tất cả')
  const [payFil,   setPayFil]   = useState('Tất cả')

  useEffect(() => {
    fetch('/api/finance?type=orders').then(r => r.json()).then(d => { setOrders(d); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const months    = useMemo(() => ['Tất cả', ...Array.from(new Set(orders.map(o => { const d = new Date(o.date); return `T${d.getMonth()+1}/${d.getFullYear()}` }))).sort()], [orders])
  const customers = useMemo(() => ['Tất cả', ...Array.from(new Set(orders.map(o => o.customer))).sort()], [orders])

  const filtered = useMemo(() => {
    return orders.filter(r => {
      const d = new Date(r.date)
      const monthLabel = `T${d.getMonth()+1}/${d.getFullYear()}`
      if (monthFil !== 'Tất cả' && monthLabel !== monthFil) return false
      if (custFil  !== 'Tất cả' && r.customer !== custFil)  return false
      if (payFil   !== 'Tất cả' && r.paymentStatus !== payFil) return false
      if (search && !r.code.toLowerCase().includes(search.toLowerCase()) &&
          !r.customer.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [orders, search, monthFil, custFil, payFil])

  const totalRev  = filtered.reduce((s, r) => s + r.amount, 0)
  const totalPaid = filtered.filter(r => r.paymentStatus === 'paid').reduce((s, r) => s + r.amount, 0)
  const totalDebt = filtered.filter(r => r.paymentStatus !== 'paid').reduce((s, r) => s + r.amount, 0)

  const exportExcel = () => {
    const rows = filtered.map(r => ({
      'Mã đơn hàng': r.code, 'Ngày': fmtDate(r.date),
      'Khách hàng': r.customer, 'Thành tiền (đ)': r.amount,
      'Thanh toán': PAYMENT_LABEL[r.paymentStatus],
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Doanh thu')
    XLSX.writeFile(wb, `doanh-thu_${new Date().toISOString().slice(0,10)}.xlsx`)
  }

  return (
    <div className="p-5 bg-[#f0f2f5] min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-[#1e2a3a]">Doanh thu</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tổng hợp từ đơn hàng bán trong hệ thống</p>
        </div>
        <button onClick={exportExcel}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors self-start sm:self-auto shrink-0">
          <Download size={16}/> Xuất Excel
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Tổng doanh thu', val: totalRev,  color: 'text-[#1e2a3a]', bg: 'bg-sky-50 border-sky-100' },
          { label: 'Đã thu',        val: totalPaid, color: 'text-green-700', bg: 'bg-green-50 border-green-100' },
          { label: 'Còn nợ',        val: totalDebt, color: 'text-red-600',   bg: 'bg-red-50 border-red-100' },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border p-4 ${c.bg}`}>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{c.label}</div>
            <div className={`text-lg sm:text-xl font-bold truncate ${c.color}`}>{loading ? '—' : fmtVND(c.val)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{filtered.length} đơn hàng</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 shadow-sm mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm mã đơn, khách hàng..."
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-sky-400"/>
          </div>
          <select value={monthFil} onChange={e => setMonthFil(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400">
            {months.map(m => <option key={m}>{m}</option>)}
          </select>
          <select value={custFil} onChange={e => setCustFil(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400">
            {customers.map(c => <option key={c}>{c}</option>)}
          </select>
          <select value={payFil} onChange={e => setPayFil(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400">
            <option value="Tất cả">Tất cả trạng thái</option>
            <option value="paid">Đã thanh toán</option>
            <option value="partial">TT 1 phần</option>
            <option value="unpaid">Chưa thanh toán</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb] shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Đang tải dữ liệu...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Mã đơn hàng','Ngày','Khách hàng','Thành tiền','Thanh toán','Trạng thái'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(r => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-sky-600">{r.code}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 font-medium">{r.customer}</td>
                    <td className="px-4 py-3 font-semibold text-[#1e2a3a]">{fmtVND(r.amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_BADGE[r.paymentStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                        {PAYMENT_LABEL[r.paymentStatus] ?? r.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{r.status}</td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-300">
                    <td colSpan={3} className="px-4 py-3 font-bold text-[#1e2a3a] text-right">Tổng cộng:</td>
                    <td className="px-4 py-3 font-bold text-[#1e2a3a]">{fmtVND(totalRev)}</td>
                    <td colSpan={2}/>
                  </tr>
                </tfoot>
              )}
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-16 text-gray-400 text-sm">Không tìm thấy dữ liệu phù hợp</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
