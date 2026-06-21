'use client'
import { useState, useEffect } from 'react'
import { Plus, Search, RotateCcw, CheckCircle, X, Trash2, AlertTriangle } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { formatVND, formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useTenant } from '@/contexts/TenantContext'

interface ReturnItem { id: number; product_id: string; name: string; unit: string; qty: number; price: number }
interface ReturnOrder {
  id: string; code: string; orderId: string; customer: string; customer_id: string; date: string
  reason: string; note: string; items: ReturnItem[]; refundMethod: string
  status: 'pending' | 'approved' | 'completed' | 'rejected'
}

const calcTotal = (r: ReturnOrder) => r.items.reduce((s, it) => s + it.qty * it.price, 0)

const RETURN_REASONS = [
  'Hàng lỗi / vỡ vỏ', 'Hàng gần hết hạn', 'Nhầm sản phẩm',
  'Sản phẩm bị móp / biến dạng', 'Không đúng số lượng',
  'Chất lượng không đảm bảo', 'Khách hủy đơn', 'Khác',
]

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending:   { label: 'Chờ duyệt',  className: 'bg-yellow-100 text-yellow-700' },
  approved:  { label: 'Đã duyệt',   className: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Hoàn thành', className: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Từ chối',    className: 'bg-red-100 text-red-700' },
}
const REFUND_METHOD_LABEL: Record<string, string> = {
  transfer: 'Chuyển khoản', cash: 'Tiền mặt', credit: 'Trừ vào đơn tiếp theo',
}

let itemSeq = 100

// ─── Create Return Modal ──────────────────────────────────────────────────────
function CreateReturnModal({ onClose, onCreate, customers, products }: {
  onClose: () => void
  onCreate: (r: ReturnOrder) => void
  customers: { id: string; name: string }[]
  products:  { id: string; name: string; unit: string; sale_price: number }[]
}) {
  const today = new Date().toISOString().slice(0, 10)
  const { user } = useAuth()
  const [customerId,    setCustomerId]    = useState('')
  const [orderId,       setOrderId]       = useState('')
  const [date,          setDate]          = useState(today)
  const [reason,        setReason]        = useState('')
  const [customReason,  setCustomReason]  = useState('')
  const [refundMethod,  setRefundMethod]  = useState('transfer')
  const [note,          setNote]          = useState('')
  const [items,         setItems]         = useState<ReturnItem[]>([{ id: itemSeq++, product_id: '', name: '', unit: '', qty: 1, price: 0 }])
  const [errors,        setErrors]        = useState<string[]>([])
  const [saving,        setSaving]        = useState(false)

  const addRow = () => setItems(p => [...p, { id: itemSeq++, product_id: '', name: '', unit: '', qty: 1, price: 0 }])
  const removeRow = (id: number) => setItems(p => p.filter(it => it.id !== id))
  const setItemField = (id: number, field: keyof ReturnItem, val: string | number) =>
    setItems(p => p.map(it => it.id === id ? { ...it, [field]: val } : it))

  const selectProduct = (id: number, productId: string) => {
    const p = products.find(x => x.id === productId)
    if (p) setItems(prev => prev.map(it => it.id === id ? { ...it, product_id: p.id, name: p.name, unit: p.unit, price: p.sale_price } : it))
  }

  const total = items.reduce((s, it) => s + it.qty * it.price, 0)
  const selectedCustomer = customers.find(c => c.id === customerId)

  const handleSubmit = async () => {
    const errs: string[] = []
    if (!customerId)            errs.push('Vui lòng chọn khách hàng')
    if (!date)                  errs.push('Vui lòng chọn ngày trả')
    if (!reason)                errs.push('Vui lòng chọn lý do trả hàng')
    if (reason === 'Khác' && !customReason) errs.push('Nhập lý do cụ thể')
    if (items.every(it => !it.product_id))  errs.push('Thêm ít nhất 1 sản phẩm')
    if (errs.length) { setErrors(errs); return }

    setSaving(true)
    try {
      const res = await fetch('/api/sales-returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          sales_order_id: orderId || null,
          return_date: date,
          reason: reason === 'Khác' ? customReason : reason,
          note: note || null,
          refund_method: refundMethod,
          created_by: user?.id ?? null,
          items: items.filter(it => it.product_id).map(it => ({
            product_id: it.product_id, qty: it.qty, unit_price: it.price,
          })),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        onCreate({
          id: data.id, code: data.code, customer: selectedCustomer?.name ?? '', customer_id: customerId,
          orderId: orderId || '—', date, reason: reason === 'Khác' ? customReason : reason,
          note, refundMethod, status: 'pending',
          items: items.filter(it => it.product_id).map((it, i) => ({ ...it, id: i + 1 })),
        })
        onClose()
      } else {
        const e = await res.json()
        setErrors([e.error ?? 'Lỗi tạo phiếu. Hãy chạy SQL tạo bảng sales_returns trước.'])
      }
    } catch {
      setErrors(['Lỗi kết nối. Kiểm tra lại bảng sales_returns đã được tạo chưa.'])
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[94vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Tạo phiếu trả hàng</h2>
            <p className="text-xs text-gray-500 mt-0.5">Ghi nhận yêu cầu trả / đổi hàng từ khách</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Khách hàng <span className="text-red-400">*</span></label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                <option value="">-- Chọn khách hàng --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Đơn hàng gốc (SO)</label>
              <input value={orderId} onChange={e => setOrderId(e.target.value)}
                placeholder="VD: SO-260615-001"
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Ngày trả <span className="text-red-400">*</span></label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Phương thức hoàn tiền</label>
              <select value={refundMethod} onChange={e => setRefundMethod(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                <option value="transfer">Chuyển khoản</option>
                <option value="cash">Tiền mặt</option>
                <option value="credit">Trừ vào đơn tiếp theo</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Lý do trả hàng <span className="text-red-400">*</span></label>
              <select value={reason} onChange={e => setReason(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                <option value="">-- Chọn lý do --</option>
                {RETURN_REASONS.map(r => <option key={r}>{r}</option>)}
              </select>
              {reason === 'Khác' && (
                <input value={customReason} onChange={e => setCustomReason(e.target.value)}
                  placeholder="Mô tả lý do cụ thể..."
                  className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] mt-2" />
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Hàng trả lại</h3>
              <button onClick={addRow}
                className="flex items-center gap-1 px-2.5 py-1 bg-[var(--mia-primary)]/10 text-[var(--mia-primary)] rounded-lg text-xs font-semibold hover:bg-[var(--mia-primary)]/20 transition-colors">
                <Plus size={12} /> Thêm dòng
              </button>
            </div>
            <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-[#e5e7eb]">
                    {['Sản phẩm', 'ĐVT', 'SL trả', 'Đơn giá (đ)', 'Thành tiền', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id} className="border-b border-[#f0f2f5] last:border-0">
                      <td className="px-3 py-2 min-w-[180px]">
                        <select value={it.product_id} onChange={e => selectProduct(it.id, e.target.value)}
                          className="w-full h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                          <option value="">-- Chọn SP --</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 w-16 text-xs text-gray-500">{it.unit || '—'}</td>
                      <td className="px-3 py-2 w-20">
                        <input type="number" min={1} value={it.qty || ''} onChange={e => setItemField(it.id, 'qty', +e.target.value)}
                          className="w-16 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] text-center" />
                      </td>
                      <td className="px-3 py-2 w-32">
                        <input type="number" min={0} value={it.price || ''} onChange={e => setItemField(it.id, 'price', +e.target.value)}
                          placeholder="0"
                          className="w-28 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold text-red-600 whitespace-nowrap">
                        {it.qty * it.price > 0 ? `-${formatVND(it.qty * it.price)}` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {items.length > 1 && (
                          <button onClick={() => removeRow(it.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-5">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Ghi chú</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                placeholder="Tình trạng hàng, số lô..."
                className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] resize-none" />
            </div>
            <div className="w-48 shrink-0 bg-red-50 rounded-xl p-4 flex flex-col justify-center gap-1">
              <p className="text-xs text-gray-500">Tổng hoàn tiền</p>
              <p className="text-xl font-bold text-red-600">-{formatVND(total)}</p>
              <p className="text-[10px] text-gray-400">{REFUND_METHOD_LABEL[refundMethod]}</p>
            </div>
          </div>

          {errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 flex items-center gap-1.5">
                  <AlertTriangle size={11} className="shrink-0" /> {e}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#e5e7eb] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
            <RotateCcw size={13} className="inline mr-1.5" />{saving ? 'Đang lưu...' : 'Tạo phiếu trả'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ r, onClose, onApprove, onComplete, onReject }: {
  r: ReturnOrder; onClose: () => void
  onApprove: (id: string) => void
  onComplete: (id: string) => void
  onReject: (id: string) => void
}) {
  const [confirmReject, setConfirmReject] = useState(false)
  const s = STATUS_MAP[r.status]
  const total = calcTotal(r)

  const updateStatus = async (status: string) => {
    await fetch('/api/sales-returns', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, status }),
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">{r.code || r.id}</h2>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${s.className}`}>{s.label}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-3">
            {[
              ['Khách hàng', r.customer], ['Đơn gốc', r.orderId],
              ['Ngày trả', r.date ? formatDate(r.date) : '—'], ['Lý do', r.reason],
              ['Hoàn tiền', REFUND_METHOD_LABEL[r.refundMethod] ?? r.refundMethod], ['Ghi chú', r.note || '—'],
            ].map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] text-gray-400 uppercase font-semibold">{k}</p>
                <p className="text-xs font-medium text-[#1e2a3a] mt-0.5">{v}</p>
              </div>
            ))}
          </div>

          {r.items.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Hàng trả lại</p>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e5e7eb]">
                    {['Sản phẩm', 'SL', 'Đơn giá', 'Thành tiền'].map(h => (
                      <th key={h} className="text-left pb-2 text-[10px] font-semibold text-gray-400 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((it, i) => (
                    <tr key={i} className="border-b border-[#f0f2f5]">
                      <td className="py-2.5 text-xs font-medium text-[#1e2a3a]">{it.name}</td>
                      <td className="py-2.5 text-xs text-gray-700">{it.qty}</td>
                      <td className="py-2.5 text-xs text-gray-700 whitespace-nowrap">{formatVND(it.price)}</td>
                      <td className="py-2.5 text-xs font-semibold text-red-600 whitespace-nowrap">-{formatVND(it.qty * it.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end mt-2">
                <span className="text-sm font-bold text-[#1e2a3a]">Tổng hoàn tiền: <span className="text-red-600">-{formatVND(total)}</span></span>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#e5e7eb] flex items-center justify-between gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Đóng</button>
          <div className="flex gap-2">
            {r.status === 'pending' && !confirmReject && (
              <>
                <button onClick={() => setConfirmReject(true)}
                  className="px-4 py-2 text-sm font-semibold border border-red-300 text-red-500 rounded-lg hover:bg-red-50 transition-colors">
                  Từ chối
                </button>
                <button onClick={async () => { await updateStatus('approved'); onApprove(r.id); onClose() }}
                  className="px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
                  Duyệt trả hàng
                </button>
              </>
            )}
            {r.status === 'pending' && confirmReject && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                <span className="text-xs text-red-700 font-medium">Xác nhận từ chối?</span>
                <button onClick={async () => { await updateStatus('rejected'); onReject(r.id); onClose() }}
                  className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600">Từ chối</button>
                <button onClick={() => setConfirmReject(false)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
              </div>
            )}
            {r.status === 'approved' && (
              <button onClick={async () => { await updateStatus('completed'); onComplete(r.id); onClose() }}
                className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 hover:scale-[1.02] active:scale-95 transition-all">
                <CheckCircle size={13} className="inline mr-1.5" />Hoàn tất & Hoàn tiền
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TraHangPage() {
  const { id: tenantId } = useTenant()
  const [returns,      setReturns]      = useState<ReturnOrder[]>([])
  const [loading,      setLoading]      = useState(true)
  const [customers,    setCustomers]    = useState<{ id: string; name: string }[]>([])
  const [products,     setProducts]     = useState<{ id: string; name: string; unit: string; sale_price: number }[]>([])
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate,   setShowCreate]   = useState(false)
  const [detail,       setDetail]       = useState<ReturnOrder | null>(null)
  const [toast,        setToast]        = useState('')
  const [noTable,      setNoTable]      = useState(false)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    Promise.all([
      fetch('/api/sales-returns').then(r => r.json()),
      supabase.from('customers').select('id, name').eq('tenant_id', tenantId).eq('status', 'active').order('name'),
      supabase.from('products').select('id, name, unit, sale_price').eq('tenant_id', tenantId).eq('status', 'active').order('name'),
    ]).then(([ret, { data: cust }, { data: prod }]) => {
      if (ret?.error) { setNoTable(true) } else {
        setReturns((ret ?? []).map((r: any) => ({
          id: r.id, code: r.code,
          customer: r.customer?.name ?? '—', customer_id: r.customer?.id ?? '',
          orderId: r.sales_order?.code ?? '—',
          date: r.return_date, reason: r.reason, note: r.note ?? '',
          refundMethod: r.refund_method, status: r.status, items: [],
        })))
      }
      setCustomers(cust ?? [])
      setProducts(prod ?? [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [tenantId])

  const filtered = returns.filter(r => {
    const matchSearch = r.customer.toLowerCase().includes(search.toLowerCase()) || (r.code ?? '').includes(search)
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    return matchSearch && matchStatus
  })

  const handleCreate   = (r: ReturnOrder) => { setReturns(p => [r, ...p]); showToast(`Đã tạo phiếu trả ${r.code}`) }
  const handleApprove  = (id: string) => { setReturns(p => p.map(r => r.id === id ? { ...r, status: 'approved'  as const } : r)); showToast('Đã duyệt phiếu trả') }
  const handleComplete = (id: string) => { setReturns(p => p.map(r => r.id === id ? { ...r, status: 'completed' as const } : r)); showToast('Hoàn tất trả hàng & hoàn tiền') }
  const handleReject   = (id: string) => { setReturns(p => p.map(r => r.id === id ? { ...r, status: 'rejected'  as const } : r)); showToast('Đã từ chối phiếu trả') }

  const totalRefund = returns.filter(r => r.status === 'completed').reduce((s, r) => s + calcTotal(r), 0)

  return (
    <div>
      <PageHeader title="Trả hàng bán" subtitle="Quản lý đổi trả hàng từ khách hàng">
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={15} /> Tạo phiếu trả
        </button>
      </PageHeader>

      {noTable && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
          ⚠️ Bảng <code>sales_returns</code> chưa tồn tại trong database. Hãy chạy SQL tạo bảng để sử dụng chức năng này.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Tổng phiếu trả',  value: returns.length,                                      sub: 'Tất cả',   icon: <RotateCcw size={18} className="text-red-500" />,     bg: 'bg-red-50' },
          { label: 'Chờ duyệt',       value: returns.filter(r => r.status === 'pending').length,   sub: 'Cần xử lý', icon: <AlertTriangle size={18} className="text-yellow-500" />, bg: 'bg-yellow-50' },
          { label: 'Hoàn thành',      value: returns.filter(r => r.status === 'completed').length, sub: 'Đã xử lý', icon: <CheckCircle size={18} className="text-green-500" />,   bg: 'bg-green-50' },
          { label: 'Tổng hoàn tiền',  value: formatVND(totalRefund),                               sub: 'Đã hoàn',  icon: <RotateCcw size={18} className="text-purple-500" />,   bg: 'bg-purple-50' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-[#e5e7eb] p-3 sm:p-4 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl ${k.bg} flex items-center justify-center shrink-0`}>{k.icon}</div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 truncate">{k.label}</p>
              <p className="text-sm sm:text-base font-bold text-[#1e2a3a] truncate">{loading ? '—' : k.value}</p>
              <p className="text-xs text-gray-400">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        <div className="p-4 border-b border-[#e5e7eb] flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 border border-[#e5e7eb] rounded-lg px-3 h-9 max-w-xs flex-1">
            <Search size={14} className="text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm phiếu trả, khách hàng..."
              className="flex-1 text-sm bg-transparent outline-none" />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'pending', 'approved', 'completed', 'rejected'] as const).map(s => {
              const LABELS: Record<string, string> = { all: 'Tất cả', pending: 'Chờ duyệt', approved: 'Đã duyệt', completed: 'Hoàn thành', rejected: 'Từ chối' }
              return (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-[var(--mia-primary)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {LABELS[s]}
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Đang tải dữ liệu...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400">Chưa có phiếu trả hàng nào</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-gray-50">
                {['Mã phiếu', 'Đơn gốc', 'Khách hàng', 'Lý do trả', 'Ngày', 'Trạng thái', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const s = STATUS_MAP[r.status]
                return (
                  <tr key={r.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3 text-sm font-medium text-[var(--mia-primary)]">{r.code || r.id}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{r.orderId}</td>
                    <td className="px-4 py-3 text-sm font-medium text-[#1e2a3a]">{r.customer}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px] truncate">{r.reason}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{r.date ? formatDate(r.date) : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => setDetail(r)}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all hover:scale-[1.02] active:scale-95 whitespace-nowrap ${
                          r.status === 'pending'  ? 'bg-[var(--mia-primary)] text-white hover:opacity-90' :
                          r.status === 'approved' ? 'bg-green-600 text-white hover:bg-green-700' :
                          'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}>
                        {r.status === 'pending' ? 'Duyệt' : r.status === 'approved' ? 'Hoàn tất' : 'Xem'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e2a3a] text-white text-sm px-4 py-3 rounded-xl shadow-xl">{toast}</div>
      )}

      {showCreate && (
        <CreateReturnModal
          customers={customers} products={products}
          onClose={() => setShowCreate(false)} onCreate={handleCreate}
        />
      )}
      {detail && (
        <DetailModal r={detail} onClose={() => setDetail(null)}
          onApprove={id => { handleApprove(id); setDetail(p => p ? { ...p, status: 'approved' } : null) }}
          onComplete={id => { handleComplete(id); setDetail(p => p ? { ...p, status: 'completed' } : null) }}
          onReject={id => { handleReject(id); setDetail(p => p ? { ...p, status: 'rejected' } : null) }}
        />
      )}
    </div>
  )
}
