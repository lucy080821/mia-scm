'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Search, X, CreditCard } from 'lucide-react'

type Receivable = { customerId: string; customer: string; phone: string; totalOrders: number; paid: number; debt: number; oldestDate: string }
type Payable    = { supplierId: string; supplier: string;  phone: string; totalOrders: number; paid: number; debt: number; oldestDate: string }

type PayModal = {
  open: boolean
  type: 'customer' | 'supplier'
  entityId: string
  name: string
  debt: number
  amount: string
  method: string
  date: string
  note: string
  saving: boolean
}

const BLANK_PAY: PayModal = {
  open: false, type: 'customer', entityId: '', name: '', debt: 0,
  amount: '', method: 'transfer', date: new Date().toISOString().slice(0, 10), note: '', saving: false,
}

const fmtVND  = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ'
const TODAY   = new Date()

function daysDiff(date: string) {
  return Math.floor((TODAY.getTime() - new Date(date).getTime()) / 86400000)
}
function agingBucket(date: string): '0-30' | '31-60' | '60+' {
  const days = daysDiff(date)
  if (days <= 30) return '0-30'
  if (days <= 60) return '31-60'
  return '60+'
}

const AGING_BADGE: Record<string, string> = {
  '0-30': 'bg-yellow-100 text-yellow-700',
  '31-60': 'bg-orange-100 text-orange-700',
  '60+': 'bg-red-100 text-red-700',
}
const AGING_LABEL: Record<string, string> = {
  '0-30': '0–30 ngày', '31-60': '31–60 ngày', '60+': '>60 ngày',
}

export default function CongNoPage() {
  const [tab,          setTab]          = useState<'receivable' | 'payable'>('receivable')
  const [receivables,  setReceivables]  = useState<Receivable[]>([])
  const [payables,     setPayables]     = useState<Payable[]>([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [agingFilter,  setAgingFilter]  = useState('Tất cả')
  const [payModal,     setPayModal]     = useState<PayModal>(BLANK_PAY)
  const [toast,        setToast]        = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [rec, pay] = await Promise.all([
        fetch('/api/finance?type=receivables').then(r => r.json()),
        fetch('/api/finance?type=payables').then(r => r.json()),
      ])
      setReceivables(Array.isArray(rec) ? rec : [])
      setPayables(Array.isArray(pay) ? pay : [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const data = tab === 'receivable'
    ? receivables.filter(r => !search || r.customer.toLowerCase().includes(search.toLowerCase()))
    : payables.filter(p => !search || p.supplier.toLowerCase().includes(search.toLowerCase()))

  const filteredData = useMemo(() => {
    return data.filter(r => {
      if (agingFilter === 'Tất cả') return true
      return agingBucket(r.oldestDate) === agingFilter
    })
  }, [data, agingFilter])

  const totalDebt  = filteredData.reduce((s, r) => s + r.debt, 0)
  const totalPaid  = filteredData.reduce((s, r) => s + r.paid, 0)
  const totalOrder = filteredData.reduce((s, r) => s + r.totalOrders, 0)

  const openPayModal = (row: any) => {
    const isReceivable = tab === 'receivable'
    setPayModal({
      open:     true,
      type:     isReceivable ? 'customer' : 'supplier',
      entityId: isReceivable ? row.customerId : row.supplierId,
      name:     isReceivable ? row.customer  : row.supplier,
      debt:     row.debt,
      amount:   String(row.debt),
      method:   'transfer',
      date:     new Date().toISOString().slice(0, 10),
      note:     '',
      saving:   false,
    })
  }

  const handlePaySubmit = async () => {
    const amt = Number(payModal.amount)
    if (!amt || amt <= 0) { alert('Vui lòng nhập số tiền hợp lệ'); return }
    if (amt > payModal.debt) { alert('Số tiền không được vượt quá số nợ còn lại'); return }

    setPayModal(m => ({ ...m, saving: true }))
    try {
      const res = await fetch('/api/finance', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          type:        payModal.type,
          entityId:    payModal.entityId,
          amount:      amt,
          paymentDate: payModal.date,
          method:      payModal.method,
          note:        payModal.note,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Lỗi không xác định')
      setPayModal(BLANK_PAY)
      showToast(`Đã ghi nhận ${fmtVND(amt)} — mã phiếu: ${data.code}`)
      await loadData()
    } catch (e: any) {
      setPayModal(m => ({ ...m, saving: false }))
      alert(e.message || 'Lỗi ghi nhận thanh toán')
    }
  }

  return (
    <div className="p-5 bg-[#f0f2f5] min-h-screen">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#1e2a3a]">Công nợ</h1>
        <p className="text-sm text-gray-500 mt-0.5">Công nợ phải thu từ khách hàng & phải trả nhà cung cấp</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Tổng đơn hàng',   val: totalOrder, color: 'text-gray-700',  bg: 'bg-white border-gray-200' },
          { label: 'Đã thanh toán',   val: totalPaid,  color: 'text-green-700', bg: 'bg-green-50 border-green-100' },
          { label: 'Còn phải thu/trả', val: totalDebt,  color: 'text-red-600',   bg: 'bg-red-50 border-red-100' },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border p-4 ${c.bg}`}>
            <div className="text-xs font-semibold text-gray-500 uppercase mb-1">{c.label}</div>
            <div className={`text-lg sm:text-xl font-bold truncate ${c.color}`}>{loading ? '—' : fmtVND(c.val)}</div>
            <div className="text-xs text-gray-400 mt-0.5">{filteredData.length} đối tác</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white border border-[#e5e7eb] rounded-xl p-1 w-fit mb-4">
        {[
          { key: 'receivable', label: 'Phải thu (Khách hàng)' },
          { key: 'payable',   label: 'Phải trả (Nhà cung cấp)' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-all ${tab === t.key ? 'bg-[#1e2a3a] text-white' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 shadow-sm mb-4 flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'receivable' ? 'Tìm khách hàng...' : 'Tìm nhà cung cấp...'}
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-sky-400"/>
        </div>
        <select value={agingFilter} onChange={e => setAgingFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400">
          <option value="Tất cả">Tất cả tuổi nợ</option>
          <option value="0-30">0–30 ngày</option>
          <option value="31-60">31–60 ngày</option>
          <option value="60+">{'>'} 60 ngày</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb] shadow-sm overflow-hidden">
        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Đang tải dữ liệu...</div>
        ) : filteredData.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400">Không có công nợ nào</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {[tab === 'receivable' ? 'Khách hàng' : 'Nhà cung cấp', 'Điện thoại', 'Tổng đơn', 'Đã TT', 'Còn lại', 'Tuổi nợ', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredData.map((r: any) => {
                const name  = tab === 'receivable' ? r.customer : r.supplier
                const aging = agingBucket(r.oldestDate)
                return (
                  <tr key={r.customerId ?? r.supplierId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-[#1e2a3a]">{name}</td>
                    <td className="px-4 py-3 text-gray-500">{r.phone || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{fmtVND(r.totalOrders)}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{fmtVND(r.paid)}</td>
                    <td className="px-4 py-3 font-bold text-red-600">{fmtVND(r.debt)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${AGING_BADGE[aging]}`}>
                        {AGING_LABEL[aging]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openPayModal(r)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--mia-primary)] text-white text-xs font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap">
                        <CreditCard size={11} /> Ghi TT
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* Payment modal */}
      {payModal.open && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) setPayModal(BLANK_PAY) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-[#1e2a3a] text-base">Ghi nhận thanh toán</h3>
              <button onClick={() => setPayModal(BLANK_PAY)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-0.5">{payModal.type === 'customer' ? 'Khách hàng' : 'Nhà cung cấp'}</p>
                <p className="font-semibold text-[#1e2a3a]">{payModal.name}</p>
                <p className="text-xs text-red-600 mt-1">Còn nợ: {fmtVND(payModal.debt)}</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Số tiền thanh toán *</label>
                <input
                  type="number" min={0} max={payModal.debt}
                  value={payModal.amount}
                  onChange={e => setPayModal(m => ({ ...m, amount: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-[#1e2a3a] outline-none focus:ring-2 focus:ring-[var(--mia-primary)]"
                  placeholder="Nhập số tiền..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phương thức</label>
                  <select value={payModal.method} onChange={e => setPayModal(m => ({ ...m, method: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[var(--mia-primary)]">
                    <option value="transfer">Chuyển khoản</option>
                    <option value="cash">Tiền mặt</option>
                    <option value="cod">COD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ngày thanh toán</label>
                  <input type="date" value={payModal.date}
                    onChange={e => setPayModal(m => ({ ...m, date: e.target.value }))}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[var(--mia-primary)]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Ghi chú</label>
                <textarea rows={2} value={payModal.note}
                  onChange={e => setPayModal(m => ({ ...m, note: e.target.value }))}
                  placeholder="Số tài khoản, lý do..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[var(--mia-primary)] resize-none" />
              </div>
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setPayModal(BLANK_PAY)}
                className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 hover:scale-[1.02] active:scale-95 transition-all">
                Hủy
              </button>
              <button onClick={handlePaySubmit} disabled={payModal.saving}
                className="flex-1 py-2.5 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-xl hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60 disabled:scale-100">
                {payModal.saving ? 'Đang lưu...' : 'Xác nhận thanh toán'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e2a3a] text-white text-sm px-4 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}
