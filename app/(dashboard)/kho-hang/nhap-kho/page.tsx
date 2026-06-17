'use client'
import { useState, useEffect } from 'react'
import { Plus, Search, ArrowDownToLine, CheckCircle, Clock, X, AlertTriangle, Package, Trash2 } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import ExportButton from '@/components/ui/ExportButton'
import { formatVND, formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────
interface ReceiptItem {
  id?: string
  product_id: string; sku: string; name: string; unit: string
  ordered_qty: number; received_qty: number; lot_number: string
  expiry_date: string; qc_passed: boolean | null; note: string
}
interface StockReceipt {
  id: string; code: string; po_ref: string
  supplier_id: string; supplier: string
  warehouse_id: string; warehouse: string
  date: string
  status: 'pending' | 'qc_check' | 'approved' | 'completed' | 'cancelled'
  items: ReceiptItem[]; total_amount: number
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending:   { label: 'Chờ nhận hàng', className: 'bg-gray-100 text-gray-600' },
  qc_check:  { label: 'Đang kiểm QC',  className: 'bg-yellow-100 text-yellow-700' },
  approved:  { label: 'QC đạt',        className: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Hoàn tất nhập', className: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Đã hủy',        className: 'bg-red-100 text-red-700' },
}

function mapReceipt(r: Record<string, unknown>): StockReceipt {
  const supplier  = r.supplier  as { id: string; name: string } | null
  const warehouse = r.warehouse as { id: string; name: string } | null
  const rawItems  = (r.items as Record<string, unknown>[]) ?? []
  return {
    id: r.id as string,
    code: r.code as string,
    po_ref: (r.po_ref as string) || '—',
    supplier_id: supplier?.id ?? '',
    supplier: supplier?.name ?? '',
    warehouse_id: warehouse?.id ?? '',
    warehouse: warehouse?.name ?? '',
    date: r.receipt_date as string,
    status: r.status as StockReceipt['status'],
    total_amount: (r.total_amount as number) ?? 0,
    items: rawItems.map(it => {
      const product = it.product as { sku: string; name: string; unit: string } | null
      return {
        id: it.id as string,
        product_id: it.product_id as string,
        sku: product?.sku ?? '',
        name: product?.name ?? '',
        unit: product?.unit ?? '',
        ordered_qty: (it.ordered_qty as number) ?? 0,
        received_qty: (it.received_qty as number) ?? 0,
        lot_number: (it.lot_number as string) ?? '',
        expiry_date: (it.expiry_date as string) ?? '',
        qc_passed: it.qc_passed as boolean | null,
        note: (it.note as string) ?? '',
      }
    }),
  }
}

// ─── Dropdown types ───────────────────────────────────────────────────────────
interface DropdownItem { id: string; name: string }
interface ProductOption { id: string; sku: string; name: string; unit: string; purchase_price: number }
interface DraftItem {
  product_id: string; sku: string; name: string; unit: string
  ordered_qty: number; unit_price: number; lot_number: string; expiry_date: string
}
function emptyItem(): DraftItem {
  return { product_id: '', sku: '', name: '', unit: '', ordered_qty: 1, unit_price: 0, lot_number: '', expiry_date: '' }
}

// ─── Create Receipt Modal ─────────────────────────────────────────────────────
function CreateReceiptModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (receipt: StockReceipt) => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [supplierId,  setSupplierId]  = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [poRef,       setPoRef]       = useState('')
  const [date,        setDate]        = useState(today)
  const [note,        setNote]        = useState('')
  const [items,       setItems]       = useState<DraftItem[]>([emptyItem()])
  const [errors,      setErrors]      = useState<string[]>([])
  const [saving,      setSaving]      = useState(false)

  const [suppliers,   setSuppliers]   = useState<DropdownItem[]>([])
  const [warehouses,  setWarehouses]  = useState<DropdownItem[]>([])
  const [products,    setProducts]    = useState<ProductOption[]>([])
  const [loadingOpts, setLoadingOpts] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('suppliers').select('id, name').eq('status', 'active').order('name').limit(200),
      supabase.from('warehouses').select('id, name').eq('status', 'active').order('name').limit(50),
      supabase.from('products').select('id, sku, name, unit, purchase_price').eq('status', 'active').order('name').limit(300),
    ]).then(([s, w, p]) => {
      setSuppliers((s.data ?? []) as DropdownItem[])
      setWarehouses((w.data ?? []) as DropdownItem[])
      setProducts((p.data ?? []) as ProductOption[])
      setLoadingOpts(false)
    })
  }, [])

  const setItemField = (i: number, field: keyof DraftItem, val: string | number) => {
    setItems(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: val }; return next })
  }

  const selectProduct = (i: number, productId: string) => {
    const p = products.find(x => x.id === productId)
    if (!p) return
    setItems(prev => {
      const next = [...prev]
      next[i] = { ...next[i], product_id: p.id, sku: p.sku, name: p.name, unit: p.unit, unit_price: p.purchase_price }
      return next
    })
  }

  const addRow    = () => setItems(prev => [...prev, emptyItem()])
  const removeRow = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const totalAmount = items.reduce((s, it) => s + it.ordered_qty * it.unit_price, 0)

  const validate = () => {
    const errs: string[] = []
    if (!supplierId)  errs.push('Vui lòng chọn nhà cung cấp')
    if (!warehouseId) errs.push('Vui lòng chọn kho nhập')
    if (!date)        errs.push('Vui lòng chọn ngày nhập')
    if (items.every(it => !it.product_id)) errs.push('Thêm ít nhất 1 sản phẩm')
    items.forEach((it, i) => {
      if (it.product_id && it.ordered_qty <= 0) errs.push(`Dòng ${i + 1}: số lượng phải > 0`)
    })
    return errs
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (errs.length) { setErrors(errs); return }
    setSaving(true)

    const filledItems = items.filter(it => it.product_id)
    const res = await fetch('/api/stock-receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplier_id: supplierId,
        warehouse_id: warehouseId,
        receipt_date: date,
        po_ref: poRef || null,
        note: note || null,
        items: filledItems.map(it => ({
          product_id: it.product_id,
          ordered_qty: it.ordered_qty,
          unit_price: it.unit_price,
          lot_number: it.lot_number || '',
          expiry_date: it.expiry_date || null,
        })),
      }),
    })

    if (res.ok) {
      const { id, code } = await res.json()
      const supplierName  = suppliers.find(s => s.id === supplierId)?.name ?? ''
      const warehouseName = warehouses.find(w => w.id === warehouseId)?.name ?? ''
      onCreate({
        id, code,
        po_ref: poRef || '—',
        supplier_id: supplierId, supplier: supplierName,
        warehouse_id: warehouseId, warehouse: warehouseName,
        date, status: 'pending',
        total_amount: totalAmount,
        items: filledItems.map(it => ({
          product_id: it.product_id, sku: it.sku, name: it.name, unit: it.unit,
          ordered_qty: it.ordered_qty, received_qty: 0,
          lot_number: it.lot_number, expiry_date: it.expiry_date,
          qc_passed: null, note: '',
        })),
      })
      onClose()
    } else {
      const err = await res.json().catch(() => ({ error: 'Lỗi không xác định' }))
      setErrors([err.error ?? 'Lỗi lưu phiếu nhập'])
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Tạo phiếu nhập kho mới</h2>
            <p className="text-xs text-gray-500 mt-0.5">Điền thông tin hàng nhận từ nhà cung cấp</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {loadingOpts ? (
            <div className="text-center py-8 text-sm text-gray-400">Đang tải danh sách NCC và sản phẩm...</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Nhà cung cấp <span className="text-red-400">*</span></label>
                  <select value={supplierId} onChange={e => setSupplierId(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9] bg-white">
                    <option value="">-- Chọn NCC --</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Đơn mua hàng liên kết (PO)</label>
                  <input value={poRef} onChange={e => setPoRef(e.target.value)}
                    placeholder="VD: PO-260614-001"
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Kho nhập <span className="text-red-400">*</span></label>
                  <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9] bg-white">
                    <option value="">-- Chọn kho --</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Ngày nhập <span className="text-red-400">*</span></label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Danh sách hàng nhận</h3>
                  <button onClick={addRow}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[#0ea5e9]/10 text-[#0ea5e9] rounded-lg text-xs font-semibold hover:bg-[#0ea5e9]/20 transition-colors">
                    <Plus size={12} /> Thêm dòng
                  </button>
                </div>
                <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-[#e5e7eb]">
                        {['Sản phẩm', 'SL đặt', 'Đơn giá', 'Thành tiền', 'Số lô', 'Hạn SD', ''].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i} className="border-b border-[#f0f2f5] last:border-0">
                          <td className="px-3 py-2 min-w-[180px]">
                            <select value={it.product_id} onChange={e => selectProduct(i, e.target.value)}
                              className="w-full h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9] bg-white">
                              <option value="">-- Chọn SP --</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2 w-20">
                            <div className="flex items-center gap-1">
                              <input type="number" min={1} value={it.ordered_qty || ''} onChange={e => setItemField(i, 'ordered_qty', +e.target.value)}
                                className="w-16 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9] text-center" />
                              <span className="text-[10px] text-gray-400 whitespace-nowrap">{it.unit}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 w-28">
                            <input type="number" min={0} value={it.unit_price || ''} onChange={e => setItemField(i, 'unit_price', +e.target.value)}
                              placeholder="0"
                              className="w-full h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
                          </td>
                          <td className="px-3 py-2 text-xs font-semibold text-[#1e2a3a] whitespace-nowrap">
                            {it.unit_price && it.ordered_qty ? formatVND(it.ordered_qty * it.unit_price) : '—'}
                          </td>
                          <td className="px-3 py-2 w-28">
                            <input type="text" value={it.lot_number} onChange={e => setItemField(i, 'lot_number', e.target.value)}
                              placeholder="L240610"
                              className="w-full h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
                          </td>
                          <td className="px-3 py-2 w-32">
                            <input type="date" value={it.expiry_date} onChange={e => setItemField(i, 'expiry_date', e.target.value)}
                              className="w-full h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
                          </td>
                          <td className="px-3 py-2">
                            {items.length > 1 && (
                              <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400 transition-colors">
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

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Ghi chú</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  placeholder="Ghi chú thêm về chuyến hàng..."
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9] resize-none" />
              </div>
            </>
          )}

          {errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              {errors.map((e, i) => (
                <p key={i} className="text-xs text-red-600 flex items-center gap-1.5">
                  <AlertTriangle size={11} className="shrink-0" /> {e}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#e5e7eb] flex items-center justify-between">
          <div className="text-sm">
            <span className="text-gray-400">Tổng giá trị: </span>
            <span className="font-bold text-[#1e2a3a]">{formatVND(totalAmount)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">
              Hủy
            </button>
            <button onClick={handleSubmit} disabled={saving || loadingOpts}
              className="px-5 py-2 bg-[#0ea5e9] text-white text-sm font-semibold rounded-lg hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
              {saving ? 'Đang lưu...' : <><ArrowDownToLine size={14} className="inline mr-1.5" />Tạo phiếu nhập</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── QC Modal ─────────────────────────────────────────────────────────────────
function QCModal({ receipt, onClose, onComplete }: {
  receipt: StockReceipt; onClose: () => void
  onComplete: (id: string, items: ReceiptItem[], status: StockReceipt['status']) => void
}) {
  const [items,  setItems]  = useState<ReceiptItem[]>(receipt.items.map(it => ({ ...it })))
  const [saving, setSaving] = useState(false)

  const updateItem = (i: number, field: keyof ReceiptItem, val: string | number | boolean | null) => {
    setItems(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: val }; return next })
  }

  const allQCDone  = items.every(it => it.qc_passed !== null)
  const anyFail    = items.some(it => it.qc_passed === false)
  const isReadOnly = receipt.status === 'approved' || receipt.status === 'completed'

  const handleSubmit = async () => {
    setSaving(true)
    const newStatus: StockReceipt['status'] = anyFail ? 'approved' : 'completed'
    const res = await fetch(`/api/stock-receipts/${receipt.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, items }),
    })
    if (res.ok) {
      onComplete(receipt.id, items, newStatus)
      onClose()
    } else {
      alert('Lỗi cập nhật QC')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Kiểm tra hàng — {receipt.code}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{receipt.supplier} · {receipt.warehouse}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {items.map((it, i) => (
            <div key={it.product_id + i} className={`border rounded-xl p-4 transition-colors ${it.qc_passed === true ? 'border-green-300 bg-green-50' : it.qc_passed === false ? 'border-red-300 bg-red-50' : 'border-[#e5e7eb]'}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{it.sku}</span>
                <span className="text-sm font-semibold text-[#1e2a3a]">{it.name}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Số lượng nhận thực tế ({it.unit})</label>
                  <input type="number" min={0} value={it.received_qty || ''} onChange={e => updateItem(i, 'received_qty', +e.target.value)}
                    disabled={isReadOnly}
                    className="w-full h-8 px-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9] disabled:bg-gray-50" />
                  <p className="text-[10px] text-gray-400 mt-0.5">Đặt hàng: {it.ordered_qty} {it.unit}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Số lô sản xuất</label>
                  <input type="text" value={it.lot_number} onChange={e => updateItem(i, 'lot_number', e.target.value)}
                    disabled={isReadOnly} placeholder="VD: L240610"
                    className="w-full h-8 px-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9] disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Hạn sử dụng</label>
                  <input type="date" value={it.expiry_date} onChange={e => updateItem(i, 'expiry_date', e.target.value)}
                    disabled={isReadOnly}
                    className="w-full h-8 px-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9] disabled:bg-gray-50" />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-1">Ghi chú</label>
                  <input type="text" value={it.note} onChange={e => updateItem(i, 'note', e.target.value)}
                    disabled={isReadOnly} placeholder="Lỗi bao bì..."
                    className="w-full h-8 px-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9] disabled:bg-gray-50" />
                </div>
              </div>
              {!isReadOnly && (
                <div>
                  <label className="block text-[10px] font-semibold text-gray-500 mb-2">Kết quả kiểm tra chất lượng</label>
                  <div className="flex gap-2">
                    <button onClick={() => updateItem(i, 'qc_passed', true)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${it.qc_passed === true ? 'bg-green-600 text-white' : 'border border-green-300 text-green-600 hover:bg-green-50'}`}>
                      <CheckCircle size={13} className="inline mr-1" />Đạt QC
                    </button>
                    <button onClick={() => updateItem(i, 'qc_passed', false)}
                      className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${it.qc_passed === false ? 'bg-red-500 text-white' : 'border border-red-300 text-red-500 hover:bg-red-50'}`}>
                      <AlertTriangle size={13} className="inline mr-1" />Không đạt
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {anyFail && !isReadOnly && (
          <div className="mx-6 mb-2 p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
            <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600">Có sản phẩm không đạt QC. Phiếu chuyển sang "QC đạt" để chờ xử lý với NCC. Hàng đạt QC sẽ được nhập tồn kho.</p>
          </div>
        )}

        <div className="px-6 py-4 border-t border-[#e5e7eb] flex justify-between items-center">
          <span className="text-xs text-gray-400">{items.filter(it => it.qc_passed !== null).length}/{items.length} dòng đã kiểm</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Đóng</button>
            {!isReadOnly && (
              <button onClick={handleSubmit} disabled={!allQCDone || saving}
                className="px-4 py-2 bg-[#0ea5e9] text-white text-sm font-semibold rounded-lg hover:bg-[#0284c7] disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
                {saving ? 'Đang lưu...' : anyFail ? 'Lưu & Báo cáo NCC' : 'Xác nhận nhập kho'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20

export default function NhapKhoPage() {
  const [receipts, setReceipts]         = useState<StockReceipt[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [qcModal, setQcModal]           = useState<StockReceipt | null>(null)
  const [showCreate, setShowCreate]     = useState(false)
  const [page, setPage]                 = useState(1)

  const loadReceipts = async () => {
    setLoading(true)
    const res = await fetch('/api/stock-receipts')
    if (res.ok) {
      const data = await res.json()
      setReceipts(data.map(mapReceipt))
    }
    setLoading(false)
  }

  useEffect(() => { loadReceipts() }, [])

  const filtered = receipts.filter(r => {
    const matchSearch = r.code.includes(search) || r.supplier.toLowerCase().includes(search.toLowerCase()) || r.po_ref.includes(search)
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    return matchSearch && matchStatus
  })
  useEffect(() => { setPage(1) }, [search, statusFilter])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleQCComplete = (id: string, items: ReceiptItem[], status: StockReceipt['status']) => {
    setReceipts(prev => prev.map(r => r.id === id ? { ...r, items, status } : r))
  }

  const handleCreate = (receipt: StockReceipt) => setReceipts(prev => [receipt, ...prev])

  const handleStartQC = async (id: string) => {
    const res = await fetch(`/api/stock-receipts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'qc_check' }),
    })
    if (res.ok) {
      setReceipts(prev => prev.map(r => r.id === id ? { ...r, status: 'qc_check' } : r))
      const r = receipts.find(r => r.id === id)
      if (r) setQcModal({ ...r, status: 'qc_check' })
    }
  }

  return (
    <div>
      <PageHeader title="Nhập kho" subtitle="Nhận hàng từ nhà cung cấp, kiểm tra QC và cập nhật tồn kho">
        <ExportButton module="kho-hang" />
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-[#0ea5e9] text-white text-sm font-semibold rounded-lg hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={15} /> Tạo phiếu nhập
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Chờ nhận hàng', value: receipts.filter(r => r.status === 'pending').length,   icon: <Clock size={20} className="text-gray-500" />, bg: 'bg-gray-50' },
          { label: 'Đang kiểm QC',  value: receipts.filter(r => r.status === 'qc_check').length,  icon: <AlertTriangle size={20} className="text-yellow-500" />, bg: 'bg-yellow-50' },
          { label: 'Hoàn tất nhập', value: receipts.filter(r => r.status === 'completed').length, icon: <CheckCircle size={20} className="text-green-500" />, bg: 'bg-green-50' },
          { label: 'Tổng giá trị',  value: formatVND(receipts.reduce((s, r) => s + r.total_amount, 0)), icon: <Package size={20} className="text-blue-500" />, bg: 'bg-blue-50' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-[#e5e7eb] p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center shrink-0`}>{k.icon}</div>
            <div>
              <p className="text-xs text-gray-500">{k.label}</p>
              <p className="text-base font-bold text-[#1e2a3a]">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        <div className="p-4 border-b border-[#e5e7eb] flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-50 border border-[#e5e7eb] rounded-lg px-3 h-9 max-w-xs flex-1">
            <Search size={14} className="text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm phiếu, NCC, mã PO..."
              className="flex-1 text-sm bg-transparent outline-none" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['all', 'pending', 'qc_check', 'approved', 'completed'].map(s => {
              const LABELS: Record<string, string> = { all: 'Tất cả', pending: 'Chờ nhận', qc_check: 'Kiểm QC', approved: 'QC đạt', completed: 'Hoàn tất' }
              return (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-[#0ea5e9] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {LABELS[s]}
                </button>
              )
            })}
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-gray-50">
              {['Mã phiếu', 'PO liên kết', 'Nhà cung cấp', 'Kho nhập', 'Ngày', 'Số SP', 'Giá trị', 'Trạng thái', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-10 text-sm text-gray-400">Đang tải dữ liệu...</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-sm text-gray-400">Chưa có phiếu nhập nào</td></tr>
            ) : paged.map(r => {
              const s = STATUS_MAP[r.status]
              const qcDone = r.items.filter(it => it.qc_passed !== null).length
              return (
                <tr key={r.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-[#0ea5e9]">{r.code}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{r.po_ref}</td>
                  <td className="px-4 py-3 text-xs font-medium text-[#1e2a3a] max-w-[160px] truncate">{r.supplier}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.warehouse}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 text-center">
                    {r.status !== 'pending' ? `${qcDone}/${r.items.length}` : r.items.length}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-[#1e2a3a] whitespace-nowrap">{formatVND(r.total_amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === 'pending' && (
                      <button onClick={() => handleStartQC(r.id)}
                        className="px-3 py-1.5 bg-[#0ea5e9] text-white text-xs font-semibold rounded-lg hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap">
                        Nhận & Kiểm hàng
                      </button>
                    )}
                    {r.status === 'qc_check' && (
                      <button onClick={() => setQcModal(r)}
                        className="px-3 py-1.5 bg-yellow-500 text-white text-xs font-semibold rounded-lg hover:bg-yellow-600 hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap">
                        Tiếp tục kiểm QC
                      </button>
                    )}
                    {(r.status === 'approved' || r.status === 'completed') && (
                      <button onClick={() => setQcModal(r)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap">
                        Xem chi tiết
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
                  className={`h-7 w-7 flex items-center justify-center rounded-lg text-xs transition-colors ${n === page ? 'bg-[#0ea5e9] text-white font-semibold' : 'border border-[#e5e7eb] text-gray-600 hover:bg-gray-50'}`}>
                  {n}
                </button>
              ))}
              <button onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE >= filtered.length}
                className="h-7 px-2 rounded-lg border border-[#e5e7eb] text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors">›</button>
            </div>
          </div>
        )}
      </div>

      {qcModal    && <QCModal receipt={qcModal} onClose={() => setQcModal(null)} onComplete={handleQCComplete} />}
      {showCreate && <CreateReceiptModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
    </div>
  )
}
