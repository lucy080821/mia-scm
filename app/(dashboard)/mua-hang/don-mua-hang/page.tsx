'use client'
import { useState, useEffect } from 'react'
import { Plus, Search, ClipboardList, Clock, CheckCircle, Send, X, Trash2, ChevronRight, Copy, Check, Pencil } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import ExportButton from '@/components/ui/ExportButton'
import { formatVND, formatDate } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'

// ─── Types ────────────────────────────────────────────────────────────────────
interface POItem { product_id: string; name: string; unit: string; quantity: number; unit_price: number }
interface PurchaseOrder {
  id: string; code: string; supplier: string; supplier_id: string
  order_date: string; expected_date: string; total_amount: number
  status: 'draft' | 'pending' | 'sent' | 'delivering' | 'completed'
  created_by: string; note: string; items: POItem[]
}

// Suppliers + products loaded from DB inside modal

const INITIAL_POS: PurchaseOrder[] = []

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  draft:      { label: 'Bản nháp',    className: 'bg-gray-100 text-gray-600' },
  pending:    { label: 'Chờ duyệt',   className: 'bg-yellow-100 text-yellow-700' },
  sent:       { label: 'Đã gửi NCC',  className: 'bg-blue-100 text-blue-700' },
  delivering: { label: 'Đang giao',   className: 'bg-sky-100 text-sky-700' },
  completed:  { label: 'Hoàn thành',  className: 'bg-green-100 text-green-700' },
}

// ─── Create PO Modal ──────────────────────────────────────────────────────────
function CreatePOModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (po: Omit<PurchaseOrder, 'id' | 'code' | 'created_by'> & { supplier_id: string }) => void
}) {
  const { id: tenantId } = useTenant()
  const [supplierId, setSupplierId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [note, setNote] = useState('')
  const [items, setItems] = useState<POItem[]>([{ product_id: '', name: '', unit: '', quantity: 1, unit_price: 0 }])
  const [dbSuppliers, setDbSuppliers] = useState<{ id: string; name: string }[]>([])
  const [dbProducts, setDbProducts] = useState<{ id: string; name: string; unit: string; purchase_price: number }[]>([])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    supabase.from('suppliers').select('id, name').eq('status', 'active').eq('tenant_id', tenantId).order('name').limit(200)
      .then(({ data }) => setDbSuppliers(data ?? []))
    supabase.from('products').select('id, name, unit, purchase_price').eq('status', 'active').eq('tenant_id', tenantId).order('name').limit(300)
      .then(({ data }) => setDbProducts(data ?? []))
  }, [tenantId])

  const addItem = () => setItems(prev => [...prev, { product_id: '', name: '', unit: '', quantity: 1, unit_price: 0 }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: string, val: string | number) => {
    setItems(prev => {
      const next = [...prev]
      if (field === 'product_id') {
        const p = dbProducts.find(p => p.id === val)
        next[i] = { ...next[i], product_id: val as string, name: p?.name ?? '', unit: p?.unit ?? '', unit_price: p?.purchase_price ?? 0 }
      } else {
        next[i] = { ...next[i], [field]: val }
      }
      return next
    })
  }

  const total = items.reduce((s, it) => s + it.quantity * it.unit_price, 0)
  const supplier = dbSuppliers.find(s => s.id === supplierId)

  const handleSubmit = (status: 'draft' | 'pending') => {
    if (!supplierId) return
    onCreate({ supplier: supplier!.name, supplier_id: supplierId, order_date: new Date().toISOString().slice(0, 10), expected_date: expectedDate, total_amount: total, status, note, items: items.filter(it => it.product_id) })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-base font-bold text-[#1e2a3a]">Tạo đơn mua hàng mới</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nhà cung cấp *</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]">
                <option value="">-- Chọn NCC --</option>
                {dbSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ngày giao dự kiến</label>
              <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500">Danh sách sản phẩm</label>
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-[var(--mia-primary)] font-medium hover:text-[#0284c7] transition-colors">
                <Plus size={12} /> Thêm dòng
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-2">
                <span className="col-span-5 text-xs text-gray-400">Sản phẩm</span>
                <span className="col-span-2 text-xs text-gray-400 text-center">Số lượng</span>
                <span className="col-span-3 text-xs text-gray-400 text-right">Đơn giá</span>
                <span className="col-span-2 text-xs text-gray-400 text-right">Thành tiền</span>
              </div>
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-lg px-2 py-2">
                  <select value={it.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)}
                    className="col-span-5 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-[var(--mia-primary)]">
                    <option value="">-- Chọn SP --</option>
                    {dbProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" min={1} value={it.quantity} onChange={e => updateItem(i, 'quantity', +e.target.value)}
                    className="col-span-2 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg bg-white text-center outline-none focus:border-[var(--mia-primary)]" />
                  <input type="number" value={it.unit_price} onChange={e => updateItem(i, 'unit_price', +e.target.value)}
                    className="col-span-3 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg bg-white text-right outline-none focus:border-[var(--mia-primary)]" />
                  <div className="col-span-1 text-right text-xs font-semibold text-[#1e2a3a]">
                    {it.quantity * it.unit_price > 0 ? (it.quantity * it.unit_price / 1000000).toFixed(1) + 'M' : '—'}
                  </div>
                  <button onClick={() => removeItem(i)} className="col-span-1 flex justify-center text-gray-300 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ghi chú</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-[#e5e7eb] bg-gray-50 rounded-b-2xl">
          <div>
            <span className="text-xs text-gray-400">Tổng cộng</span>
            <p className="text-lg font-bold text-[var(--mia-primary)]">{formatVND(total)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => handleSubmit('draft')} disabled={!supplierId}
              className="px-4 py-2 text-sm border border-[#e5e7eb] text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors font-medium">
              Lưu nháp
            </button>
            <button onClick={() => handleSubmit('pending')} disabled={!supplierId || items.every(it => !it.product_id)}
              className="px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
              <Send size={13} className="inline mr-1.5" />Gửi duyệt
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Edit PO Modal ────────────────────────────────────────────────────────────
function EditPOModal({ po, onClose, onSave }: {
  po: PurchaseOrder
  onClose: () => void
  onSave: (id: string, patch: { supplier_id: string; expected_date: string; note: string; items: POItem[] }) => Promise<void>
}) {
  const { id: tenantId } = useTenant()
  const [supplierId, setSupplierId] = useState(po.supplier_id)
  const [expectedDate, setExpectedDate] = useState(po.expected_date)
  const [note, setNote] = useState(po.note)
  const [items, setItems] = useState<POItem[]>(po.items.length ? po.items : [{ product_id: '', name: '', unit: '', quantity: 1, unit_price: 0 }])
  const [dbSuppliers, setDbSuppliers] = useState<{ id: string; name: string }[]>([])
  const [dbProducts, setDbProducts] = useState<{ id: string; name: string; unit: string; purchase_price: number }[]>([])
  const [saving, setSaving] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    supabase.from('suppliers').select('id, name').eq('status', 'active').eq('tenant_id', tenantId).order('name').limit(200)
      .then(({ data }) => setDbSuppliers(data ?? []))
    supabase.from('products').select('id, name, unit, purchase_price').eq('status', 'active').eq('tenant_id', tenantId).order('name').limit(300)
      .then(({ data }) => setDbProducts(data ?? []))
  }, [tenantId])

  const addItem = () => setItems(prev => [...prev, { product_id: '', name: '', unit: '', quantity: 1, unit_price: 0 }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: string, val: string | number) => {
    setItems(prev => {
      const next = [...prev]
      if (field === 'product_id') {
        const p = dbProducts.find(p => p.id === val)
        next[i] = { ...next[i], product_id: val as string, name: p?.name ?? next[i].name, unit: p?.unit ?? next[i].unit, unit_price: p?.purchase_price ?? next[i].unit_price }
      } else {
        next[i] = { ...next[i], [field]: val }
      }
      return next
    })
  }

  const total = items.reduce((s, it) => s + it.quantity * it.unit_price, 0)

  const handleSave = async () => {
    setSaving(true)
    await onSave(po.id, { supplier_id: supplierId, expected_date: expectedDate, note, items })
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Chỉnh sửa đơn mua hàng</h2>
            <p className="text-xs text-gray-400 mt-0.5">{po.code}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nhà cung cấp</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]">
                <option value="">-- Chọn NCC --</option>
                {dbSuppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ngày giao dự kiến</label>
              <input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500">Danh sách sản phẩm</label>
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-[var(--mia-primary)] font-medium hover:text-[#0284c7] transition-colors">
                <Plus size={12} /> Thêm dòng
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-2">
                <span className="col-span-5 text-xs text-gray-400">Sản phẩm</span>
                <span className="col-span-2 text-xs text-gray-400 text-center">Số lượng</span>
                <span className="col-span-3 text-xs text-gray-400 text-right">Đơn giá</span>
                <span className="col-span-2 text-xs text-gray-400 text-right">Thành tiền</span>
              </div>
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-lg px-2 py-2">
                  <select value={it.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)}
                    className="col-span-5 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-[var(--mia-primary)]">
                    <option value="">-- Chọn SP --</option>
                    {dbProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" min={1} value={it.quantity} onChange={e => updateItem(i, 'quantity', +e.target.value)}
                    className="col-span-2 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg bg-white text-center outline-none focus:border-[var(--mia-primary)]" />
                  <input type="number" value={it.unit_price} onChange={e => updateItem(i, 'unit_price', +e.target.value)}
                    className="col-span-3 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg bg-white text-right outline-none focus:border-[var(--mia-primary)]" />
                  <div className="col-span-1 text-right text-xs font-semibold text-[#1e2a3a]">
                    {it.quantity * it.unit_price > 0 ? (it.quantity * it.unit_price / 1000000).toFixed(1) + 'M' : '—'}
                  </div>
                  <button onClick={() => removeItem(i)} className="col-span-1 flex justify-center text-gray-300 hover:text-red-400 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ghi chú</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] resize-none" />
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-[#e5e7eb] bg-gray-50 rounded-b-2xl">
          <div>
            <span className="text-xs text-gray-400">Tổng cộng</span>
            <p className="text-lg font-bold text-[var(--mia-primary)]">{formatVND(total)}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm border border-[#e5e7eb] text-gray-600 rounded-lg hover:bg-gray-100 transition-colors font-medium">
              Huỷ
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-95">
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Approval Modal ───────────────────────────────────────────────────────────
function ApprovalModal({ po, onClose, onApprove, onReject }: {
  po: PurchaseOrder
  onClose: () => void
  onApprove: (id: string, note: string) => void
  onReject: (id: string, reason: string) => void
}) {
  const [note, setNote] = useState('')
  const [mode, setMode] = useState<'view' | 'reject'>('view')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Duyệt đơn mua hàng</h2>
            <p className="text-xs text-gray-400 mt-0.5">{po.code}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 mb-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Nhà cung cấp:</span>
            <span className="font-semibold text-[#1e2a3a]">{po.supplier}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Giá trị đơn:</span>
            <span className="font-bold text-[var(--mia-primary)]">{formatVND(po.total_amount)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Số sản phẩm:</span>
            <span className="text-[#1e2a3a]">{po.items.length} sản phẩm</span>
          </div>
          {po.expected_date && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Ngày giao DK:</span>
              <span className="text-[#1e2a3a]">{formatDate(po.expected_date)}</span>
            </div>
          )}
          {po.note && <p className="text-xs text-gray-400 pt-1 border-t border-[#e5e7eb]">Ghi chú: {po.note}</p>}
        </div>

        {mode === 'reject' ? (
          <>
            <p className="text-xs text-gray-500 mb-2">Lý do từ chối:</p>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Nhập lý do từ chối đơn hàng này..."
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-xl outline-none focus:border-red-400 resize-none mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setMode('view')} className="flex-1 py-2 text-sm border border-[#e5e7eb] text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">Quay lại</button>
              <button onClick={() => { onReject(po.id, note); onClose() }} disabled={!note.trim()}
                className="flex-1 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                Xác nhận từ chối
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-2">Ghi chú phê duyệt (không bắt buộc):</p>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Thêm ghi chú khi duyệt..."
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-xl outline-none focus:border-[var(--mia-primary)] resize-none mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setMode('reject')}
                className="flex-1 py-2 bg-red-50 border border-red-200 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-100 transition-all">
                Từ chối
              </button>
              <button onClick={() => { onApprove(po.id, note); onClose() }}
                className="flex-1 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-1.5">
                <CheckCircle size={14} /> Duyệt đơn
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Send Preview Modal ───────────────────────────────────────────────────────
function buildPreviewText(po: PurchaseOrder): string {
  const lines: string[] = []
  lines.push(`ĐƠN MUA HÀNG - ${po.code}`)
  lines.push('='.repeat(40))
  lines.push(`Nhà cung cấp : ${po.supplier}`)
  lines.push(`Ngày đặt     : ${formatDate(po.order_date)}`)
  if (po.expected_date) lines.push(`Ngày giao DK : ${formatDate(po.expected_date)}`)
  lines.push('')
  lines.push('DANH SÁCH SẢN PHẨM:')
  po.items.forEach((it, i) => {
    const total = it.quantity * it.unit_price
    lines.push(`  ${i + 1}. ${it.name}`)
    lines.push(`     ${it.quantity} ${it.unit} × ${it.unit_price.toLocaleString('vi-VN')}đ = ${total.toLocaleString('vi-VN')}đ`)
  })
  lines.push('')
  lines.push(`TỔNG CỘNG: ${po.total_amount.toLocaleString('vi-VN')}đ`)
  if (po.note) { lines.push(''); lines.push(`Ghi chú: ${po.note}`) }
  lines.push('')
  lines.push('---')
  lines.push('Đơn hàng từ hệ thống Mia SCM')
  return lines.join('\n')
}

function SendPreviewModal({ po, onClose, onConfirm }: {
  po: PurchaseOrder; onClose: () => void; onConfirm: () => void
}) {
  const [copied, setCopied] = useState(false)
  const text = buildPreviewText(po)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Xem trước nội dung gửi NCC</h2>
            <p className="text-xs text-gray-400 mt-0.5">{po.code} · {po.supplier}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="relative">
            <pre className="bg-gray-50 border border-[#e5e7eb] rounded-xl p-4 text-xs text-gray-700 font-mono leading-relaxed whitespace-pre-wrap select-all">
              {text}
            </pre>
            <button
              onClick={handleCopy}
              className={`absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                copied
                  ? 'bg-green-100 text-green-700'
                  : 'bg-white border border-[#e5e7eb] text-gray-600 hover:border-[var(--mia-primary)] hover:text-[var(--mia-primary)]'
              }`}>
              {copied ? <><Check size={12} /> Đã copy!</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-3 text-center">
            Copy nội dung trên rồi paste vào email, Zalo hoặc kênh liên lạc với NCC.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-[#e5e7eb] flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2 border border-[#e5e7eb] text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-all">
            Đóng
          </button>
          <button onClick={() => { onConfirm(); onClose() }}
            className="flex-1 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-xl hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2">
            <CheckCircle size={15} /> Xác nhận đã gửi NCC
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20

export default function DonMuaHangPage() {
  const { id: tenantId } = useTenant()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [pos, setPos] = useState<PurchaseOrder[]>(INITIAL_POS)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [detail, setDetail] = useState<PurchaseOrder | null>(null)
  const [editTarget, setEditTarget] = useState<PurchaseOrder | null>(null)
  const [sendTarget, setSendTarget] = useState<PurchaseOrder | null>(null)
  const [approveTarget, setApproveTarget] = useState<PurchaseOrder | null>(null)
  const [toast, setToast] = useState('')
  const [page, setPage] = useState(1)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadPOs = async () => {
    const res = await fetch('/api/purchase-orders')
    if (res.ok) {
      const data = await res.json()
      const mapped: PurchaseOrder[] = data.map((o: any) => ({
        id: o.id,
        code: o.code,
        supplier: o.supplier?.name ?? '—',
        supplier_id: o.supplier?.id ?? '',
        order_date: o.order_date,
        expected_date: o.expected_date ?? '',
        total_amount: o.total_amount ?? 0,
        status: o.status,
        created_by: o.created_by?.full_name ?? '—',
        note: o.note ?? '',
        items: (o.items ?? []).map((it: any) => ({
          product_id: it.product_id,
          name: it.product?.name ?? '—',
          unit: it.product?.unit ?? '',
          quantity: it.quantity,
          unit_price: it.unit_price,
        })),
      }))
      setPos(mapped)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!tenantId) return; loadPOs() }, [tenantId])

  const filtered = pos.filter(p => {
    const matchSearch = p.code.includes(search) || p.supplier.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || p.status === statusFilter
    return matchSearch && matchStatus
  })
  useEffect(() => { setPage(1) }, [search, statusFilter])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleCreate = async (data: Omit<PurchaseOrder, 'id' | 'code' | 'created_by'> & { supplier_id: string }) => {
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: data.supplier_id,
          order_date: data.order_date,
          expected_date: data.expected_date || null,
          note: data.note,
          status: data.status,
          items: data.items.map(it => ({ product_id: it.product_id, quantity: it.quantity, unit_price: it.unit_price })),
        }),
      })
      if (res.ok) {
        const saved = await res.json()
        showToast(`✓ Đã tạo đơn mua ${saved.code}`)
        await loadPOs()
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        showToast(`Lỗi tạo đơn: ${err.error}`)
      }
    } catch (e) {
      showToast('Lỗi kết nối — không thể lưu đơn mua hàng')
    }
  }

  const handleEdit = async (id: string, patch: { supplier_id: string; expected_date: string; note: string; items: POItem[] }) => {
    const res = await fetch(`/api/purchase-orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: patch.supplier_id || null,
        expected_date: patch.expected_date || null,
        note: patch.note || null,
        items: patch.items.filter(it => it.product_id).map(it => ({
          product_id: it.product_id, quantity: it.quantity, unit_price: it.unit_price,
        })),
      }),
    })
    if (res.ok) {
      showToast('Đã lưu thay đổi')
      await loadPOs()
    } else {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      showToast(`Lỗi: ${err.error}`)
    }
  }

  const handleSubmitForApproval = (id: string) => {
    setPos(prev => prev.map(p => p.id === id ? { ...p, status: 'pending' } : p))
    showToast('Đã gửi đơn chờ duyệt')
  }

  const handleSend = (id: string) => {
    setPos(prev => prev.map(p => p.id === id ? { ...p, status: 'sent' } : p))
    showToast('Đã gửi đơn cho nhà cung cấp')
  }

  const handleApprove = (id: string, note: string) => {
    setPos(prev => prev.map(p => p.id === id ? { ...p, status: 'sent', note: note || p.note } : p))
    showToast('Đã duyệt đơn mua hàng — chuyển sang Đã gửi NCC')
  }

  const handleRejectPO = (id: string, reason: string) => {
    setPos(prev => prev.map(p => p.id === id ? { ...p, status: 'draft', note: reason || p.note } : p))
    showToast('Đã từ chối — đơn trả về Bản nháp')
  }

  return (
    <div>
      <PageHeader title="Đơn mua hàng" subtitle="Tạo và theo dõi đơn mua từ nhà cung cấp">
        <ExportButton module="mua-hang" />
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={15} /> Tạo đơn mua
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Đang giao',    value: pos.filter(p => p.status === 'delivering').length,  icon: <Clock size={20} className="text-sky-500" />,         bg: 'bg-sky-50' },
          { label: 'Đã gửi NCC',  value: pos.filter(p => p.status === 'sent').length,        icon: <Send size={20} className="text-blue-500" />,          bg: 'bg-blue-50' },
          { label: 'Hoàn thành',  value: pos.filter(p => p.status === 'completed').length,   icon: <CheckCircle size={20} className="text-green-500" />,  bg: 'bg-green-50' },
          { label: 'Bản nháp',    value: pos.filter(p => p.status === 'draft').length,       icon: <ClipboardList size={20} className="text-gray-400" />, bg: 'bg-gray-50' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-[#e5e7eb] p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center shrink-0`}>{k.icon}</div>
            <div><p className="text-xs text-gray-500">{k.label}</p><p className="text-xl font-bold text-[#1e2a3a]">{k.value}</p></div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        <div className="p-4 border-b border-[#e5e7eb] flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-50 border border-[#e5e7eb] rounded-lg px-3 h-9 max-w-xs flex-1">
            <Search size={14} className="text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm mã PO, nhà cung cấp..."
              className="flex-1 text-sm bg-transparent outline-none" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['all', 'draft', 'pending', 'sent', 'delivering', 'completed'].map(s => {
              const LABELS: Record<string, string> = { all: 'Tất cả', draft: 'Nháp', pending: 'Chờ duyệt', sent: 'Đã gửi', delivering: 'Đang giao', completed: 'Hoàn thành' }
              return (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-[var(--mia-primary)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {LABELS[s]}
                </button>
              )
            })}
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-gray-50">
              {['Mã đơn', 'Nhà cung cấp', 'Ngày đặt', 'Ngày giao DK', 'Sản phẩm', 'Giá trị', 'Trạng thái', 'Hành động'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map(p => {
              const s = STATUS_MAP[p.status]
              return (
                <tr key={p.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <button onClick={() => setDetail(p)} className="flex items-center gap-1 text-xs font-medium text-[var(--mia-primary)] hover:underline">
                      {p.code}<ChevronRight size={11} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-[#1e2a3a] max-w-[180px] truncate">{p.supplier}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(p.order_date)}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{p.expected_date ? formatDate(p.expected_date) : '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {p.items.length > 0 ? `${p.items[0].name}${p.items.length > 1 ? ` +${p.items.length - 1}` : ''}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-[#1e2a3a] whitespace-nowrap">{formatVND(p.total_amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {p.status === 'draft' && (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setEditTarget(p)}
                          className="flex items-center gap-1 px-2.5 py-1.5 border border-[#e5e7eb] text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-100 transition-all">
                          <Pencil size={11} />Sửa
                        </button>
                        <button onClick={() => handleSubmitForApproval(p.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[var(--mia-primary)] text-white text-xs font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
                          <Send size={11} />Gửi duyệt
                        </button>
                      </div>
                    )}
                    {p.status === 'pending' && isAdmin && (
                      <button onClick={() => setApproveTarget(p)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 hover:scale-[1.02] active:scale-95 transition-all">
                        <CheckCircle size={11} />Duyệt
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {Math.ceil(filtered.length / PAGE_SIZE) > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#e5e7eb]">
            <span className="text-xs text-gray-500">Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length} kết quả</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                className="h-7 px-2 rounded-lg border border-[#e5e7eb] text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors">‹</button>
              {Array.from({ length: Math.ceil(filtered.length / PAGE_SIZE) }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setPage(n)}
                  className={`h-7 w-7 flex items-center justify-center rounded-lg text-xs transition-colors ${n === page ? 'bg-[var(--mia-primary)] text-white font-semibold' : 'border border-[#e5e7eb] text-gray-600 hover:bg-gray-50'}`}>
                  {n}
                </button>
              ))}
              <button onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE >= filtered.length}
                className="h-7 px-2 rounded-lg border border-[#e5e7eb] text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors">›</button>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e2a3a] text-white text-sm px-4 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}

      {showCreate && <CreatePOModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}

      {editTarget && (
        <EditPOModal
          po={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
        />
      )}

      {approveTarget && (
        <ApprovalModal
          po={approveTarget}
          onClose={() => setApproveTarget(null)}
          onApprove={handleApprove}
          onReject={handleRejectPO}
        />
      )}

      {sendTarget && (
        <SendPreviewModal
          po={sendTarget}
          onClose={() => setSendTarget(null)}
          onConfirm={() => handleSend(sendTarget.id)}
        />
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setDetail(null)}>
          <div className="flex-1" />
          <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
              <div>
                <h2 className="text-sm font-bold text-[#1e2a3a]">{detail.code}</h2>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${STATUS_MAP[detail.status].className}`}>{STATUS_MAP[detail.status].label}</span>
              </div>
              <button onClick={() => setDetail(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                {[['NCC', detail.supplier], ['Ngày đặt', formatDate(detail.order_date)], ['Ngày giao DK', detail.expected_date ? formatDate(detail.expected_date) : '—'], ['Người tạo', detail.created_by]].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-xs text-gray-500">{k}</span>
                    <span className="text-xs font-medium text-[#1e2a3a]">{v}</span>
                  </div>
                ))}
              </div>
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Sản phẩm</h3>
                <div className="space-y-2">
                  {detail.items.map((it, i) => (
                    <div key={i} className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2">
                      <div>
                        <p className="text-xs font-medium text-[#1e2a3a]">{it.name}</p>
                        <p className="text-[10px] text-gray-400">{it.quantity} {it.unit} × {formatVND(it.unit_price)}</p>
                      </div>
                      <span className="text-xs font-semibold text-[#1e2a3a]">{formatVND(it.quantity * it.unit_price)}</span>
                    </div>
                  ))}
                  {detail.items.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Chưa có sản phẩm</p>}
                </div>
              </div>
              <div className="flex justify-between bg-[#f0f9ff] rounded-xl px-4 py-3">
                <span className="text-sm font-medium text-[#1e2a3a]">Tổng cộng</span>
                <span className="text-base font-bold text-[var(--mia-primary)]">{formatVND(detail.total_amount)}</span>
              </div>
              {detail.note && <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{detail.note}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
