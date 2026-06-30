'use client'
import { useState, useEffect } from 'react'
import { Plus, Search, FileText, Clock, CheckCircle, Send, Copy, Eye, X, Trash2, ChevronDown, Pencil, AlertTriangle } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { formatVND, formatDate } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'
import { useUnits } from '@/hooks/useUnits'

interface QuoteItem { id: number; name: string; unit: string; qty: number; price: number; discount: number }
interface PendingAction {
  type: 'create' | 'edit' | 'delete'
  payload?: { customer: string; date: string; expiry: string; amount: number; items: number; note: string; itemList: QuoteItem[] }
}
interface Quote {
  id: string; customer: string; customer_id?: string; date: string; expiry: string
  amount: number; items: number; status: string; note: string
  itemList: QuoteItem[]
  pendingAction?: PendingAction
}

type CustomerOption = { id: string; name: string }
type ProductOption  = { id: string; name: string; unit: string; price: number }

type DraftItem = { id: number; name: string; unit: string; qty: number; price: number; discount: number }
let itemIdSeq = 1
const emptyItem = (): DraftItem => ({ id: itemIdSeq++, name: '', unit: 'Thùng', qty: 1, price: 0, discount: 0 })

// ─── Create Quote Modal ───────────────────────────────────────────────────────
function CreateQuoteModal({ onClose, onCreate, customers, products }: {
  onClose: () => void
  onCreate: (q: Quote) => void
  customers: CustomerOption[]
  products: ProductOption[]
}) {
  const today     = new Date().toISOString().slice(0, 10)
  const defExpiry = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const { user }  = useAuth()

  const [customerId, setCustomerId] = useState('')
  const [date,    setDate]    = useState(today)
  const [expiry,  setExpiry]  = useState(defExpiry)
  const [note,    setNote]    = useState('')
  const [items,   setItems]   = useState<DraftItem[]>([emptyItem()])
  const [errors,  setErrors]  = useState<string[]>([])
  const [saving,  setSaving]  = useState(false)

  const setItemField = (id: number, field: keyof DraftItem, val: string | number) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: val } : it))

  const selectProduct = (id: number, productId: string) => {
    const p = products.find(x => x.id === productId)
    if (p) setItems(prev => prev.map(it => it.id === id ? { ...it, name: p.name, unit: p.unit, price: p.price } : it))
  }

  const addRow    = () => setItems(prev => [...prev, emptyItem()])
  const removeRow = (id: number) => setItems(prev => prev.filter(it => it.id !== id))

  const subtotal = items.reduce((s, it) => s + it.qty * it.price * (1 - it.discount / 100), 0)
  const vat      = Math.round(subtotal * 0.1)
  const total    = subtotal + vat

  const validate = () => {
    const errs: string[] = []
    if (!customerId) errs.push('Vui lòng chọn khách hàng')
    if (!date)       errs.push('Vui lòng chọn ngày tạo')
    if (!expiry)     errs.push('Vui lòng chọn ngày hết hạn')
    if (expiry && date && expiry < date) errs.push('Ngày hết hạn phải sau ngày tạo')
    if (items.every(it => !it.name)) errs.push('Thêm ít nhất 1 sản phẩm')
    items.forEach((it, i) => {
      if (it.name && it.qty <= 0)   errs.push(`Dòng ${i + 1}: số lượng phải > 0`)
      if (it.name && it.price <= 0) errs.push(`Dòng ${i + 1}: đơn giá phải > 0`)
      if (it.discount < 0 || it.discount > 100) errs.push(`Dòng ${i + 1}: chiết khấu 0–100%`)
    })
    return errs
  }

  const save = async (status: 'draft' | 'pending') => {
    const errs = validate()
    if (errs.length) { setErrors(errs); return }
    setSaving(true)
    const filled = items.filter(it => it.name)
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customerId,
          quote_date: date,
          expiry_date: expiry,
          total_amount: total,
          status,
          note: note || null,
          created_by: user?.id ?? null,
          items: filled.map(it => ({ name: it.name, unit: it.unit, qty: it.qty, price: it.price, discount: it.discount })),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const cust = customers.find(c => c.id === customerId)
        onCreate({
          id: data.id, customer: cust?.name ?? '', customer_id: customerId,
          date, expiry, note, status, amount: total,
          items: filled.length, itemList: filled.map((it, i) => ({ ...it, id: i + 1 })),
        })
        onClose()
      } else {
        const e = await res.json()
        setErrors([e.error ?? 'Lỗi tạo báo giá. Hãy chạy SQL tạo bảng quotes trước.'])
      }
    } catch { setErrors(['Lỗi kết nối.']) }
    setSaving(false)
  }

  const handleSaveDraft = () => save('draft')
  const handleSend      = () => save('pending')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Tạo báo giá mới</h2>
            <p className="text-xs text-gray-500 mt-0.5">Điền thông tin khách hàng và danh sách sản phẩm</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Khách hàng <span className="text-red-400">*</span></label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                <option value="">-- Chọn khách hàng --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Ngày tạo <span className="text-red-400">*</span></label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Hiệu lực đến <span className="text-red-400">*</span></label>
              <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Danh sách sản phẩm</h3>
              <button onClick={addRow}
                className="flex items-center gap-1 px-2.5 py-1 bg-[var(--mia-primary)]/10 text-[var(--mia-primary)] rounded-lg text-xs font-semibold hover:bg-[var(--mia-primary)]/20 transition-colors">
                <Plus size={12} /> Thêm dòng
              </button>
            </div>

            <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-[#e5e7eb]">
                    {['Sản phẩm', 'ĐVT', 'Số lượng', 'Đơn giá (đ)', 'CK %', 'Thành tiền', ''].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => {
                    const lineTotal = it.name ? it.qty * it.price * (1 - it.discount / 100) : 0
                    return (
                      <tr key={it.id} className="border-b border-[#f0f2f5] last:border-0">
                        <td className="px-3 py-2 min-w-[180px]">
                          <select value={it.name} onChange={e => selectProduct(it.id, e.target.value)}
                            className="w-full h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                            <option value="">-- Chọn SP --</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 w-16">
                          <input value={it.unit} onChange={e => setItemField(it.id, 'unit', e.target.value)}
                            className="w-14 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] text-center" />
                        </td>
                        <td className="px-3 py-2 w-20">
                          <input type="number" min={1} value={it.qty || ''} onChange={e => setItemField(it.id, 'qty', +e.target.value)}
                            className="w-16 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] text-center" />
                        </td>
                        <td className="px-3 py-2 w-32">
                          <input type="number" min={0} value={it.price || ''} onChange={e => setItemField(it.id, 'price', +e.target.value)}
                            placeholder="0"
                            className="w-28 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                        </td>
                        <td className="px-3 py-2 w-16">
                          <div className="flex items-center gap-0.5">
                            <input type="number" min={0} max={100} value={it.discount || ''} onChange={e => setItemField(it.id, 'discount', +e.target.value)}
                              placeholder="0"
                              className="w-12 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] text-center" />
                            <span className="text-[10px] text-gray-400">%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs font-semibold text-[#1e2a3a] whitespace-nowrap">
                          {it.name && lineTotal > 0 ? formatVND(lineTotal) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {items.length > 1 && (
                            <button onClick={() => removeRow(it.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals + Note */}
          <div className="flex gap-6">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Ghi chú</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
                placeholder="Điều kiện giao hàng, thanh toán, lưu ý khác..."
                className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] resize-none" />
            </div>
            <div className="w-56 shrink-0 bg-gray-50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Tạm tính:</span>
                <span className="font-medium text-[#1e2a3a]">{formatVND(subtotal)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">VAT (10%):</span>
                <span className="font-medium text-[#1e2a3a]">{formatVND(vat)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-[#e5e7eb] pt-2">
                <span className="text-[#1e2a3a]">Tổng cộng:</span>
                <span className="text-[var(--mia-primary)]">{formatVND(total)}</span>
              </div>
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-1">
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 flex items-center gap-1.5">
                  <span className="shrink-0">•</span> {e}
                </p>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e5e7eb] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">
            Hủy
          </button>
          <button onClick={handleSaveDraft} disabled={saving}
            className="px-4 py-2 text-sm font-semibold border border-[#e5e7eb] text-gray-700 rounded-lg hover:bg-gray-50 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
            <FileText size={13} className="inline mr-1.5" />Lưu nháp
          </button>
          <button onClick={handleSend} disabled={saving}
            className="px-5 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
            <Send size={13} className="inline mr-1.5" />{saving ? 'Đang lưu...' : 'Gửi duyệt'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Quote Modal ─────────────────────────────────────────────────────────
function EditQuoteModal({ quote, onClose, onSave, customers, products }: {
  quote: Quote
  onClose: () => void
  onSave: (id: string, data: { customer: string; date: string; expiry: string; amount: number; items: number; note: string; itemList: QuoteItem[] }) => void
  customers: CustomerOption[]
  products: ProductOption[]
}) {
  const units = useUnits()
  const [customerId, setCustomerId] = useState(quote.customer_id ?? '')
  const [date, setDate]             = useState(quote.date)
  const [expiry, setExpiry]         = useState(quote.expiry)
  const [note, setNote]             = useState(quote.note)
  const [items, setItems]           = useState<QuoteItem[]>(quote.itemList.length ? quote.itemList : [{ id: 1, name: '', unit: 'Thùng', qty: 1, price: 0, discount: 0 }])

  const setItemField = (id: number, field: keyof QuoteItem, val: string | number) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: val } : it))

  const selectProduct = (id: number, productId: string) => {
    const p = products.find(x => x.id === productId)
    if (p) setItems(prev => prev.map(it => it.id === id ? { ...it, name: p.name, unit: p.unit, price: p.price } : it))
  }

  const subtotal = items.reduce((s, it) => s + it.qty * it.price * (1 - it.discount / 100), 0)
  const total    = subtotal + Math.round(subtotal * 0.1)

  const handleSave = () => {
    if (!customerId || !date || !expiry) return
    const cust = customers.find(c => c.id === customerId)
    const filled = items.filter(it => it.name)
    onSave(quote.id, { customer: cust?.name ?? quote.customer, date, expiry, note, amount: total, items: filled.length, itemList: filled })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[94vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Sửa báo giá — {quote.id}</h2>
            <p className="text-xs text-yellow-600 mt-0.5">Thay đổi sẽ chờ admin duyệt trước khi có hiệu lực</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-500 mb-1">Khách hàng</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                <option value="">-- Chọn khách hàng --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Ngày tạo</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Hiệu lực đến</label>
              <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase">Sản phẩm</h3>
              <button onClick={() => setItems(prev => [...prev, { id: Date.now(), name: '', unit: 'Thùng', qty: 1, price: 0, discount: 0 }])}
                className="flex items-center gap-1 px-2.5 py-1 bg-[var(--mia-primary)]/10 text-[var(--mia-primary)] rounded-lg text-xs font-semibold hover:bg-[var(--mia-primary)]/20 transition-colors">
                <Plus size={12} /> Thêm dòng
              </button>
            </div>
            <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="bg-gray-50 border-b border-[#e5e7eb]">
                  {['Sản phẩm','ĐVT','SL','Đơn giá','CK%','Thành tiền',''].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id} className="border-b border-[#f0f2f5] last:border-0">
                      <td className="px-3 py-2 min-w-[160px]">
                        <select value={it.name} onChange={e => selectProduct(it.id, e.target.value)}
                          className="w-full h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                          <option value="">-- Chọn SP --</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 w-20"><select value={it.unit} onChange={e => setItemField(it.id,'unit',e.target.value)} className="w-18 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none bg-white">{units.map(u => <option key={u}>{u}</option>)}</select></td>
                      <td className="px-3 py-2 w-20"><input type="number" min={1} value={it.qty||''} onChange={e => setItemField(it.id,'qty',+e.target.value)} className="w-16 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none text-center" /></td>
                      <td className="px-3 py-2 w-32"><input type="number" min={0} value={it.price||''} onChange={e => setItemField(it.id,'price',+e.target.value)} className="w-28 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none" /></td>
                      <td className="px-3 py-2 w-16"><input type="number" min={0} max={100} value={it.discount||''} onChange={e => setItemField(it.id,'discount',+e.target.value)} className="w-12 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none text-center" /></td>
                      <td className="px-3 py-2 text-xs font-semibold text-[#1e2a3a]">{it.name ? formatVND(it.qty*it.price*(1-it.discount/100)) : '—'}</td>
                      <td className="px-3 py-2">{items.length > 1 && <button onClick={() => setItems(prev => prev.filter(x => x.id !== it.id))} className="text-gray-300 hover:text-red-400"><Trash2 size={13}/></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Ghi chú</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] resize-none" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#e5e7eb] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
          <button onClick={handleSave}
            className="px-5 py-2 bg-yellow-500 text-white text-sm font-semibold rounded-lg hover:bg-yellow-600 hover:scale-[1.02] active:scale-95 transition-all">
            <Pencil size={13} className="inline mr-1.5" />Gửi yêu cầu sửa
          </button>
        </div>
      </div>
    </div>
  )
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft:    { label: 'Bản nháp',  className: 'bg-gray-100 text-gray-600' },
  pending:  { label: 'Chờ duyệt', className: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Đã duyệt',  className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Từ chối',   className: 'bg-red-100 text-red-700' },
  expired:  { label: 'Hết hạn',   className: 'bg-gray-100 text-gray-500' },
}

// ─── Reject Modal ────────────────────────────────────────────────────────────
function RejectModal({ quoteId, onClose, onReject }: { quoteId: string; onClose: () => void; onReject: (id: string, reason: string) => void }) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-[#1e2a3a]">Từ chối báo giá</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-3">Nhập lý do từ chối báo giá <strong>{quoteId}</strong>:</p>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Ví dụ: Giá chưa phù hợp, cần điều chỉnh chiết khấu..."
          className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-xl outline-none focus:border-[var(--mia-primary)] resize-none mb-4" />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
          <button onClick={() => { onReject(quoteId, reason); onClose() }} disabled={!reason.trim()}
            className="flex-1 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
            Xác nhận từ chối
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function QuoteDetailModal({ quote, onClose, onApprove, onReject, isAdmin }: {
  quote: Quote; onClose: () => void; onApprove: (id: string) => void; onReject: (id: string, reason: string) => void; isAdmin: boolean
}) {
  const [showReject, setShowReject] = useState(false)
  const subtotal = quote.itemList.reduce((s, it) => s + it.qty * it.price * (1 - it.discount / 100), 0)
  const vat = Math.round(subtotal * 0.1)
  const s = STATUS_MAP[quote.status]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      {showReject && <RejectModal quoteId={quote.id} onClose={() => setShowReject(false)} onReject={(id, reason) => { onReject(id, reason); onClose() }} />}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">{quote.id}</h2>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${s.className}`}>{s.label}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 grid grid-cols-2 gap-3">
            {[['Khách hàng', quote.customer], ['Ngày tạo', formatDate(quote.date)], ['Hết hạn', formatDate(quote.expiry)], ['Ghi chú', quote.note || '—']].map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] text-gray-400 uppercase font-semibold">{k}</p>
                <p className="text-xs font-medium text-[#1e2a3a] mt-0.5">{v}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Chi tiết sản phẩm</h3>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#e5e7eb]">
                  {['Sản phẩm', 'ĐVT', 'SL', 'Đơn giá', 'CK', 'Thành tiền'].map(h => (
                    <th key={h} className="text-left pb-2 text-[10px] font-semibold text-gray-400 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {quote.itemList.map(it => {
                  const lineTotal = it.qty * it.price * (1 - it.discount / 100)
                  return (
                    <tr key={it.id} className="border-b border-[#f0f2f5]">
                      <td className="py-2.5 text-xs font-medium text-[#1e2a3a]">{it.name}</td>
                      <td className="py-2.5 text-xs text-gray-500">{it.unit}</td>
                      <td className="py-2.5 text-xs text-gray-700">{it.qty}</td>
                      <td className="py-2.5 text-xs text-gray-700 whitespace-nowrap">{formatVND(it.price)}</td>
                      <td className="py-2.5 text-xs text-gray-500">{it.discount}%</td>
                      <td className="py-2.5 text-xs font-semibold text-[#1e2a3a] whitespace-nowrap">{formatVND(lineTotal)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="w-56 space-y-1.5">
              <div className="flex justify-between text-xs"><span className="text-gray-500">Tạm tính:</span><span>{formatVND(subtotal)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-gray-500">VAT 10%:</span><span>{formatVND(vat)}</span></div>
              <div className="flex justify-between text-sm font-bold border-t border-[#e5e7eb] pt-1.5">
                <span className="text-[#1e2a3a]">Tổng cộng:</span>
                <span className="text-[var(--mia-primary)]">{formatVND(subtotal + vat)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-[#e5e7eb]">
          <button onClick={onClose} className={`py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors ${(quote.status === 'pending' && isAdmin) ? 'px-3' : 'flex-1'}`}>Đóng</button>
          {quote.status === 'pending' && isAdmin && (<>
            <button onClick={() => setShowReject(true)}
              className="flex-1 py-2 bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-100 transition-all hover:scale-[1.02] active:scale-95">
              Từ chối
            </button>
            <button onClick={() => { onApprove(quote.id); onClose() }}
              className="flex-1 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-all hover:scale-[1.02] active:scale-95">
              <CheckCircle size={13} className="inline mr-1.5" />Duyệt
            </button>
          </>)}
        </div>
      </div>
    </div>
  )
}

// ─── Send Confirm Modal ───────────────────────────────────────────────────────
function SendModal({ quote, onClose, onSend }: { quote: Quote; onClose: () => void; onSend: (id: string) => void }) {
  const [email, setEmail] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-[#1e2a3a]">Gửi báo giá cho khách</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Báo giá <strong className="text-[#1e2a3a]">{quote.id}</strong> sẽ được gửi đến khách hàng <strong className="text-[#1e2a3a]">{quote.customer}</strong>.</p>
        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email gửi đến</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="email@khachhang.vn"
            className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
          <button onClick={() => { onSend(quote.id); onClose() }}
            className="flex-1 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-all hover:scale-[1.02] active:scale-95">
            <Send size={13} className="inline mr-1.5" />Gửi ngay
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BaoGiaPage() {
  const { id: tenantId } = useTenant()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const units = useUnits()
  const [quotes,     setQuotes]     = useState<Quote[]>([])
  const [customers,  setCustomers]  = useState<CustomerOption[]>([])
  const [products,   setProducts]   = useState<ProductOption[]>([])
  const [loading,    setLoading]    = useState(true)
  const [noTable,    setNoTable]    = useState(false)
  const [search,     setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [viewModal,  setViewModal]  = useState<Quote | null>(null)
  const [sendModal,  setSendModal]  = useState<Quote | null>(null)
  const [editModal,  setEditModal]  = useState<Quote | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [toast,      setToast]      = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    Promise.all([
      fetch('/api/quotes').then(r => r.json()),
      supabase.from('customers').select('id, name').eq('tenant_id', tenantId).eq('status', 'active').order('name'),
      supabase.from('products').select('id, name, unit, sale_price').eq('tenant_id', tenantId).eq('status', 'active').order('name'),
    ]).then(([q, { data: cust }, { data: prod }]) => {
      if (q?.error) { setNoTable(true) } else {
        setQuotes((q ?? []).map((r: any) => ({
          id: r.id, code: r.code,
          customer: r.customer?.name ?? '—', customer_id: r.customer?.id,
          date: r.quote_date, expiry: r.expiry_date,
          amount: r.total_amount, items: r.items?.length ?? 0,
          status: r.status, note: r.note ?? '',
          itemList: (r.items ?? []).map((it: any, i: number) => ({
            id: i + 1, name: it.product_name, unit: it.unit,
            qty: it.qty, price: it.unit_price, discount: it.discount_pct,
          })),
        })))
      }
      setCustomers(cust ?? [])
      setProducts((prod ?? []).map((p: any) => ({ id: p.id, name: p.name, unit: p.unit, price: p.sale_price })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [tenantId])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const filtered = quotes.filter(q => {
    const matchSearch = q.customer.toLowerCase().includes(search.toLowerCase()) || q.id.includes(search)
    const matchStatus = statusFilter === 'all' || q.status === statusFilter
    return matchSearch && matchStatus
  })

  const handleCopy = (q: Quote) => {
    const today = new Date()
    const pad = String(quotes.length + 1).padStart(3, '0')
    const newId = `BG-${today.getFullYear().toString().slice(2)}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}-${pad}`
    const expiry = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10)
    const copy: Quote = { ...q, id: newId, status: 'draft', date: today.toISOString().slice(0, 10), expiry }
    setQuotes(prev => [copy, ...prev])
    showToast(`Đã sao chép thành ${newId}`)
  }

  const patchQuote = async (id: string, status: string, note?: string) => {
    await fetch('/api/quotes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, ...(note !== undefined ? { note } : {}) }),
    })
  }

  const handleSend = async (id: string) => {
    await patchQuote(id, 'pending')
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: 'pending' } : q))
    showToast('Đã gửi báo giá cho khách hàng')
  }

  const handleApprove = async (id: string) => {
    await patchQuote(id, 'approved')
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: 'approved' } : q))
    showToast('Đã duyệt báo giá')
  }

  const handleReject = async (id: string, reason: string) => {
    await patchQuote(id, 'rejected', reason || undefined)
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, status: 'rejected', note: reason || q.note } : q))
    showToast(`Đã từ chối báo giá${reason ? ': ' + reason : ''}`)
  }

  const handleCreate = (q: Quote) => {
    const withPending = isAdmin ? q : { ...q, pendingAction: { type: 'create' as const } }
    setQuotes(prev => [withPending, ...prev])
    showToast(isAdmin ? `Đã tạo ${q.id}` : `Đã gửi yêu cầu tạo ${q.id} — chờ admin duyệt`)
  }

  const handleEditRequest = (id: string, data: PendingAction['payload']) => {
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, pendingAction: { type: 'edit', payload: data } } : q))
    showToast('Đã gửi yêu cầu sửa — chờ admin duyệt')
    setEditModal(null)
  }

  const handleDeleteRequest = (id: string) => {
    setQuotes(prev => prev.map(q => q.id === id ? { ...q, pendingAction: { type: 'delete' } } : q))
    showToast('Đã gửi yêu cầu xóa — chờ admin duyệt')
  }

  const handleApprovePending = (id: string) => {
    setQuotes(prev => prev.flatMap(q => {
      if (q.id !== id || !q.pendingAction) return [q]
      const { type, payload } = q.pendingAction
      if (type === 'delete') return []
      if (type === 'edit' && payload) return [{ ...q, ...payload, pendingAction: undefined }]
      return [{ ...q, pendingAction: undefined }]
    }))
    showToast('Đã duyệt thay đổi')
  }

  const handleRejectPending = (id: string) => {
    setQuotes(prev => prev.flatMap(q => {
      if (q.id !== id || !q.pendingAction) return [q]
      if (q.pendingAction.type === 'create') return []
      return [{ ...q, pendingAction: undefined }]
    }))
    showToast('Đã từ chối thay đổi')
  }

  return (
    <div>
      <PageHeader title="Báo giá" subtitle="Quản lý báo giá gửi cho khách hàng">
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={15} /> Tạo báo giá
        </button>
      </PageHeader>

      {noTable && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
          ⚠️ Bảng <code>quotes</code> và <code>quote_items</code> chưa tồn tại. Hãy chạy SQL tạo bảng để sử dụng chức năng này.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Tổng báo giá',       value: quotes.length, sub: 'Tất cả',          icon: <FileText size={20} className="text-sky-500" />,     bg: 'bg-sky-50' },
          { label: 'Chờ duyệt',          value: quotes.filter(q => q.status === 'pending').length,  sub: 'Cần xử lý', icon: <Clock size={20} className="text-yellow-500" />,    bg: 'bg-yellow-50' },
          { label: 'Đã duyệt',           value: quotes.filter(q => q.status === 'approved').length, sub: 'Tháng này', icon: <CheckCircle size={20} className="text-green-500" />, bg: 'bg-green-50' },
          { label: 'Tỷ lệ chuyển đổi',  value: `${Math.round(quotes.filter(q => q.status === 'approved').length / quotes.length * 100)}%`, sub: 'Approved/Total', icon: <Send size={20} className="text-purple-500" />, bg: 'bg-purple-50' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-[#e5e7eb] p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center shrink-0`}>{k.icon}</div>
            <div>
              <p className="text-xs text-gray-500">{k.label}</p>
              <p className="text-base sm:text-xl font-bold text-[#1e2a3a] truncate">{k.value}</p>
              <p className="text-xs text-gray-400">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        <div className="p-4 border-b border-[#e5e7eb] flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-50 border border-[#e5e7eb] rounded-lg px-3 h-9 max-w-xs flex-1">
            <Search size={14} className="text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm báo giá, khách hàng..."
              className="flex-1 text-sm bg-transparent outline-none" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg bg-white text-gray-600 outline-none">
            <option value="all">Tất cả trạng thái</option>
            <option value="draft">Bản nháp</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Từ chối</option>
            <option value="expired">Hết hạn</option>
          </select>
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} báo giá</span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Đang tải dữ liệu...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-sm text-gray-400">Chưa có báo giá nào</div>
        ) : null}

        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-gray-50">
              {['Mã báo giá', 'Khách hàng', 'Ngày tạo', 'Hết hạn', 'Giá trị', 'Trạng thái', 'Thao tác'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(q => {
              const s = STATUS_MAP[q.status]
              const pa = q.pendingAction
              const paLabel = pa?.type === 'create' ? 'Chờ duyệt tạo' : pa?.type === 'edit' ? 'Chờ duyệt sửa' : pa?.type === 'delete' ? 'Chờ duyệt xóa' : null
              return (
                <tr key={q.id} className={`border-b border-[#f0f2f5] hover:bg-gray-50/50 transition-colors ${pa ? 'bg-yellow-50/30' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium text-[var(--mia-primary)]">{q.id}</td>
                  <td className="px-4 py-3 text-sm font-medium text-[#1e2a3a]">{q.customer}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(q.date)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{formatDate(q.expiry)}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-[#1e2a3a] whitespace-nowrap">{formatVND(q.amount)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium w-fit ${s.className}`}>{s.label}</span>
                      {paLabel && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-100 text-yellow-700 w-fit">
                          <AlertTriangle size={9} />{paLabel}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      <button onClick={() => setViewModal(q)} className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors" title="Xem chi tiết">
                        <Eye size={14} />
                      </button>
                      {!pa && (
                        <button onClick={() => handleCopy(q)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="Sao chép">
                          <Copy size={14} />
                        </button>
                      )}
                      {q.status === 'approved' && !pa && (
                        <button onClick={() => setSendModal(q)} className="p-1.5 rounded-lg hover:bg-sky-50 text-gray-400 hover:text-sky-500 transition-colors" title="Gửi cho khách">
                          <Send size={14} />
                        </button>
                      )}
                      {/* Nút duyệt/từ chối trạng thái báo giá (admin) */}
                      {q.status === 'pending' && isAdmin && !pa && (<>
                        <button onClick={() => handleApprove(q.id)} className="flex items-center gap-0.5 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200 transition-colors">
                          <CheckCircle size={11} />Duyệt
                        </button>
                        <button onClick={() => setViewModal(q)} className="flex items-center gap-0.5 px-2 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors">
                          <X size={11} />Từ chối
                        </button>
                      </>)}
                      {/* Nút sửa/xóa (nhân viên, chưa có pending) */}
                      {!isAdmin && !pa && !['approved','cancelled','expired'].includes(q.status) && (<>
                        <button onClick={() => setEditModal(q)} className="p-1.5 rounded-lg hover:bg-yellow-50 text-gray-400 hover:text-yellow-600 transition-colors" title="Yêu cầu sửa">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeleteRequest(q.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Yêu cầu xóa">
                          <Trash2 size={13} />
                        </button>
                      </>)}
                      {/* Admin duyệt/từ chối pending action */}
                      {isAdmin && pa && (<>
                        <button onClick={() => handleApprovePending(q.id)} className="flex items-center gap-0.5 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200 transition-colors">
                          <CheckCircle size={11} />Duyệt
                        </button>
                        <button onClick={() => handleRejectPending(q.id)} className="flex items-center gap-0.5 px-2 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors">
                          <X size={11} />Từ chối
                        </button>
                      </>)}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e2a3a] text-white text-sm px-4 py-3 rounded-xl shadow-xl animate-fade-in">
          {toast}
        </div>
      )}

      {viewModal && <QuoteDetailModal quote={viewModal} onClose={() => setViewModal(null)} onApprove={handleApprove} onReject={handleReject} isAdmin={isAdmin} />}
      {sendModal && <SendModal quote={sendModal} onClose={() => setSendModal(null)} onSend={handleSend} />}
      {showCreate && <CreateQuoteModal onClose={() => setShowCreate(false)} onCreate={handleCreate} customers={customers} products={products} />}
      {editModal && <EditQuoteModal quote={editModal} onClose={() => setEditModal(null)} onSave={handleEditRequest} customers={customers} products={products} />}
    </div>
  )
}
