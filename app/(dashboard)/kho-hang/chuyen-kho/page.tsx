'use client'
import { useState, useEffect } from 'react'
import { Plus, Search, ArrowLeftRight, CheckCircle, X, AlertTriangle, Trash2, MoveRight } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'

// ─── Types ────────────────────────────────────────────────────────────────────
interface TransferItem { product_id: string; sku: string; name: string; unit: string; quantity: number; lot_number: string }
interface Transfer {
  id: string; code: string
  from_id: string; from: string
  to_id: string; to: string
  date: string; reason: string
  items: TransferItem[]; status: string; createdBy: string
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending:    { label: 'Chờ duyệt',        className: 'bg-yellow-100 text-yellow-700' },
  in_transit: { label: 'Đang vận chuyển',  className: 'bg-blue-100 text-blue-700' },
  completed:  { label: 'Hoàn thành',       className: 'bg-green-100 text-green-700' },
  cancelled:  { label: 'Đã hủy',           className: 'bg-red-100 text-red-700' },
}

const REASONS = ['Cân bằng tồn kho', 'Bổ sung hàng', 'Điều chuyển theo kế hoạch', 'Giải phóng kho', 'Đơn hàng khẩn', 'Khác']

function mapTransfer(r: Record<string, unknown>): Transfer {
  const fromWh = r.from_warehouse as { id: string; name: string } | null
  const toWh   = r.to_warehouse   as { id: string; name: string } | null
  const rawItems = (r.items as Record<string, unknown>[]) ?? []
  return {
    id: r.id as string,
    code: r.code as string,
    from_id: fromWh?.id ?? '',
    from: fromWh?.name ?? '',
    to_id: toWh?.id ?? '',
    to: toWh?.name ?? '',
    date: r.transfer_date as string,
    reason: (r.reason as string) ?? '',
    status: r.status as string,
    createdBy: '',
    items: rawItems.map(it => {
      const product = it.product as { sku: string; name: string; unit: string } | null
      return {
        product_id: it.product_id as string,
        sku: product?.sku ?? '',
        name: product?.name ?? '',
        unit: product?.unit ?? '',
        quantity: (it.quantity as number) ?? 0,
        lot_number: (it.lot_number as string) ?? '',
      }
    }),
  }
}

// ─── Dropdown types ───────────────────────────────────────────────────────────
interface DropdownItem { id: string; name: string }
interface ProductOption { id: string; sku: string; name: string; unit: string; stock: number; lot: string }
interface DraftRow { product_id: string; quantity: number; lot_number: string }
function emptyRow(): DraftRow { return { product_id: '', quantity: 1, lot_number: '' } }

// ─── Create Transfer Modal ────────────────────────────────────────────────────
function CreateTransferModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (t: Transfer) => void
}) {
  const { id: tenantId } = useTenant()
  const today = new Date().toISOString().slice(0, 10)
  const [fromId,  setFromId]  = useState('')
  const [toId,    setToId]    = useState('')
  const [date,    setDate]    = useState(today)
  const [reason,  setReason]  = useState('')
  const [note,    setNote]    = useState('')
  const [rows,    setRows]    = useState<DraftRow[]>([emptyRow()])
  const [errors,  setErrors]  = useState<string[]>([])
  const [saving,  setSaving]  = useState(false)

  const [warehouses,  setWarehouses]  = useState<DropdownItem[]>([])
  const [products,    setProducts]    = useState<ProductOption[]>([])
  const [loadingOpts, setLoadingOpts] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    supabase.from('warehouses').select('id, name').eq('tenant_id', tenantId).eq('status', 'active').order('name').limit(50)
      .then(({ data }) => {
        setWarehouses((data ?? []) as DropdownItem[])
        setLoadingOpts(false)
      })
  }, [tenantId])

  // Reload product inventory when source warehouse changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!fromId) { setProducts([]); return }
    if (!tenantId) return
    supabase
      .from('inventory')
      .select('product_id, lot_number, quantity, products(id, sku, name, unit)')
      .eq('tenant_id', tenantId)
      .eq('warehouse_id', fromId)
      .gt('quantity', 0)
      .order('quantity', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        const mapped: ProductOption[] = (data ?? []).map((row: Record<string, unknown>) => {
          const p = row.products as { id: string; sku: string; name: string; unit: string } | null
          return {
            id: (row.product_id as string) ?? '',
            sku: p?.sku ?? '',
            name: p?.name ?? '',
            unit: p?.unit ?? '',
            stock: (row.quantity as number) ?? 0,
            lot: (row.lot_number as string) ?? '',
          }
        })
        setProducts(mapped)
      })
  }, [fromId, tenantId])

  const setRowField = (i: number, field: keyof DraftRow, val: string | number) => {
    setRows(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: val }; return next })
  }

  const selectProduct = (i: number, productId: string) => {
    const p = products.find(x => x.id === productId)
    setRows(prev => {
      const next = [...prev]
      next[i] = { ...next[i], product_id: productId, lot_number: p?.lot ?? '' }
      return next
    })
  }

  const addRow    = () => setRows(prev => [...prev, emptyRow()])
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i))

  const validate = () => {
    const errs: string[] = []
    if (!fromId)                     errs.push('Vui lòng chọn kho nguồn')
    if (!toId)                       errs.push('Vui lòng chọn kho đích')
    if (fromId && fromId === toId)   errs.push('Kho nguồn và kho đích không được trùng nhau')
    if (!date)                       errs.push('Vui lòng chọn ngày chuyển')
    if (rows.every(r => !r.product_id)) errs.push('Thêm ít nhất 1 sản phẩm')
    rows.forEach((r, i) => {
      if (!r.product_id) return
      if (r.quantity <= 0) errs.push(`Dòng ${i + 1}: số lượng phải > 0`)
      const p = products.find(x => x.id === r.product_id)
      if (p && r.quantity > p.stock) errs.push(`Dòng ${i + 1}: ${p.name} — yêu cầu ${r.quantity}, tồn kho ${p.stock}`)
    })
    return errs
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (errs.length) { setErrors(errs); return }
    setSaving(true)

    const filled = rows.filter(r => r.product_id)
    const res = await fetch('/api/stock-transfers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        transfer_date: date,
        reason: reason || null,
        note: note || null,
        items: filled.map(r => ({
          product_id: r.product_id,
          quantity: r.quantity,
          lot_number: r.lot_number || '',
        })),
      }),
    })

    if (res.ok) {
      const { id, code } = await res.json()
      const fromName = warehouses.find(w => w.id === fromId)?.name ?? ''
      const toName   = warehouses.find(w => w.id === toId)?.name ?? ''
      onCreate({
        id, code,
        from_id: fromId, from: fromName,
        to_id: toId, to: toName,
        date, reason: reason || 'Không có lý do',
        status: 'pending',
        createdBy: '',
        items: filled.map(r => {
          const p = products.find(x => x.id === r.product_id)!
          return { product_id: p.id, sku: p.sku, name: p.name, unit: p.unit, quantity: r.quantity, lot_number: r.lot_number }
        }),
      })
      onClose()
    } else {
      const err = await res.json().catch(() => ({ error: 'Lỗi không xác định' }))
      setErrors([err.error ?? 'Lỗi tạo phiếu chuyển kho'])
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Tạo phiếu chuyển kho</h2>
            <p className="text-xs text-gray-500 mt-0.5">Điều chuyển hàng hóa giữa các kho</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {loadingOpts ? (
            <div className="text-center py-8 text-sm text-gray-400">Đang tải danh sách kho...</div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Kho nguồn <span className="text-red-400">*</span></label>
                  <select value={fromId} onChange={e => setFromId(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                    <option value="">-- Chọn kho --</option>
                    {warehouses.map(w => <option key={w.id} value={w.id} disabled={w.id === toId}>{w.name}</option>)}
                  </select>
                </div>
                <div className="shrink-0 mt-5 text-gray-300"><MoveRight size={20} /></div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Kho đích <span className="text-red-400">*</span></label>
                  <select value={toId} onChange={e => setToId(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                    <option value="">-- Chọn kho --</option>
                    {warehouses.map(w => <option key={w.id} value={w.id} disabled={w.id === fromId}>{w.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Ngày chuyển <span className="text-red-400">*</span></label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Lý do chuyển kho</label>
                  <select value={reason} onChange={e => setReason(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                    <option value="">-- Chọn lý do --</option>
                    {REASONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Danh sách hàng chuyển
                    {!fromId && <span className="ml-2 text-gray-400 font-normal normal-case">(chọn kho nguồn trước)</span>}
                  </h3>
                  <button onClick={addRow}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[var(--mia-primary)]/10 text-[var(--mia-primary)] rounded-lg text-xs font-semibold hover:bg-[var(--mia-primary)]/20 transition-colors">
                    <Plus size={12} /> Thêm dòng
                  </button>
                </div>
                <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-[#e5e7eb]">
                        {['Sản phẩm', 'Tồn kho', 'SL chuyển', 'Số lô', ''].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const p    = products.find(x => x.id === row.product_id)
                        const over = p && row.quantity > p.stock
                        return (
                          <tr key={i} className="border-b border-[#f0f2f5] last:border-0">
                            <td className="px-3 py-2 min-w-[180px]">
                              <select value={row.product_id} onChange={e => selectProduct(i, e.target.value)}
                                disabled={!fromId}
                                className="w-full h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white disabled:bg-gray-50">
                                <option value="">-- Chọn sản phẩm --</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-xs whitespace-nowrap">
                              {p ? <span className={p.stock < 10 ? 'text-red-500 font-semibold' : 'text-gray-500'}>{p.stock} {p.unit}</span> : '—'}
                            </td>
                            <td className="px-3 py-2 w-28">
                              <div className="flex items-center gap-1">
                                <input type="number" min={1} value={row.quantity || ''} onChange={e => setRowField(i, 'quantity', +e.target.value)}
                                  className={`w-16 h-8 px-2 text-xs border rounded-lg outline-none focus:border-[var(--mia-primary)] text-center ${over ? 'border-red-400 bg-red-50' : 'border-[#e5e7eb]'}`} />
                                <span className="text-[10px] text-gray-400">{p?.unit ?? ''}</span>
                              </div>
                              {over && <p className="text-[10px] text-red-500 mt-0.5">Vượt tồn kho</p>}
                            </td>
                            <td className="px-3 py-2 w-32">
                              <input type="text" value={row.lot_number} onChange={e => setRowField(i, 'lot_number', e.target.value)}
                                placeholder="LOT-..."
                                className="w-full h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                            </td>
                            <td className="px-3 py-2">
                              {rows.length > 1 && (
                                <button onClick={() => removeRow(i)} className="text-gray-300 hover:text-red-400 transition-colors">
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

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Ghi chú</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
                  placeholder="Ghi chú thêm..."
                  className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] resize-none" />
              </div>
            </>
          )}

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

        <div className="px-6 py-4 border-t border-[#e5e7eb] flex items-center justify-between">
          {fromId && toId && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="font-medium text-[#1e2a3a]">{warehouses.find(w => w.id === fromId)?.name}</span>
              <MoveRight size={14} className="text-gray-400" />
              <span className="font-medium text-[#1e2a3a]">{warehouses.find(w => w.id === toId)?.name}</span>
              <span className="text-gray-400">· {rows.filter(r => r.product_id).length} SP</span>
            </div>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">
              Hủy
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="px-5 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
              {saving ? 'Đang lưu...' : <><ArrowLeftRight size={14} className="inline mr-1.5" />Tạo phiếu chuyển</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ transfer, onClose, onApprove, onConfirmReceived }: {
  transfer: Transfer; onClose: () => void
  onApprove: (id: string) => void
  onConfirmReceived: (id: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const s = STATUS_MAP[transfer.status]

  const handleAction = async (newStatus: string) => {
    setSaving(true)
    const res = await fetch(`/api/stock-transfers/${transfer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      if (newStatus === 'in_transit') onApprove(transfer.id)
      else onConfirmReceived(transfer.id)
      onClose()
    } else {
      alert('Lỗi cập nhật trạng thái')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">{transfer.code}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{transfer.from} → {transfer.to} · {formatDate(transfer.date)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <div className="flex-1 text-center">
              <p className="text-[10px] text-gray-400 mb-1">Kho nguồn</p>
              <p className="text-sm font-bold text-[#1e2a3a]">{transfer.from}</p>
            </div>
            <MoveRight size={18} className="text-gray-300 shrink-0" />
            <div className="flex-1 text-center">
              <p className="text-[10px] text-gray-400 mb-1">Kho đích</p>
              <p className="text-sm font-bold text-[#1e2a3a]">{transfer.to}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><span className="text-gray-400">Lý do:</span> <span className="font-medium text-[#1e2a3a] ml-1">{transfer.reason}</span></div>
            <div><span className="text-gray-400">Trạng thái:</span> <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.className}`}>{s.label}</span></div>
          </div>

          {transfer.items.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Danh sách hàng</p>
              <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-[#e5e7eb]">
                      {['Sản phẩm', 'SL', 'Số lô'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transfer.items.map((it, i) => (
                      <tr key={i} className="border-b border-[#f0f2f5] last:border-0">
                        <td className="px-3 py-2">
                          <p className="text-xs font-medium text-[#1e2a3a]">{it.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{it.sku}</p>
                        </td>
                        <td className="px-3 py-2 text-xs font-semibold text-[#1e2a3a]">{it.quantity} {it.unit}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">{it.lot_number || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {transfer.status === 'completed' && (
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle size={14} className="text-green-600 shrink-0" />
              <p className="text-xs text-green-700">Hàng đã được nhận. Tồn kho đã được cập nhật tự động.</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#e5e7eb] flex justify-between items-center">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">
            Đóng
          </button>
          <div className="flex gap-2">
            {transfer.status === 'pending' && (
              <button onClick={() => handleAction('in_transit')} disabled={saving}
                className="px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Duyệt & Vận chuyển'}
              </button>
            )}
            {transfer.status === 'in_transit' && (
              <button onClick={() => handleAction('completed')} disabled={saving}
                className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                <CheckCircle size={14} className="inline mr-1.5" />{saving ? 'Đang lưu...' : 'Xác nhận đã nhận'}
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

export default function ChuyenKhoPage() {
  const { id: tenantId } = useTenant()
  const [transfers, setTransfers]       = useState<Transfer[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate]     = useState(false)
  const [detail, setDetail]             = useState<Transfer | null>(null)
  const [page, setPage]                 = useState(1)

  const loadTransfers = async () => {
    setLoading(true)
    const res = await fetch('/api/stock-transfers')
    if (res.ok) {
      const data = await res.json()
      setTransfers(data.map(mapTransfer))
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!tenantId) return; loadTransfers() }, [tenantId])

  const filtered = transfers.filter(t => {
    const matchSearch = t.code.includes(search) || t.from.toLowerCase().includes(search.toLowerCase()) || t.to.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || t.status === statusFilter
    return matchSearch && matchStatus
  })
  useEffect(() => { setPage(1) }, [search, statusFilter])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleCreate          = (t: Transfer) => setTransfers(prev => [t, ...prev])
  const handleApprove         = (id: string)  => setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'in_transit' } : t))
  const handleConfirmReceived = (id: string)  => setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'completed' } : t))

  return (
    <div>
      <PageHeader title="Chuyển kho" subtitle="Điều chuyển hàng hóa giữa các kho">
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={15} /> Tạo phiếu chuyển
        </button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Tổng phiếu',       value: transfers.length,                                        icon: <ArrowLeftRight size={20} className="text-sky-500" />,  bg: 'bg-sky-50' },
          { label: 'Đang vận chuyển',  value: transfers.filter(t => t.status === 'in_transit').length, icon: <ArrowLeftRight size={20} className="text-blue-500" />, bg: 'bg-blue-50' },
          { label: 'Hoàn thành',       value: transfers.filter(t => t.status === 'completed').length,  icon: <CheckCircle size={20} className="text-green-500" />,   bg: 'bg-green-50' },
          { label: 'Chờ duyệt',        value: transfers.filter(t => t.status === 'pending').length,    icon: <AlertTriangle size={20} className="text-yellow-500" />, bg: 'bg-yellow-50' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-[#e5e7eb] p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center shrink-0`}>{k.icon}</div>
            <div>
              <p className="text-xs text-gray-500">{k.label}</p>
              <p className="text-xl font-bold text-[#1e2a3a]">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        <div className="p-4 border-b border-[#e5e7eb] flex items-center gap-3">
          <div className="flex items-center gap-2 bg-gray-50 border border-[#e5e7eb] rounded-lg px-3 h-9 max-w-xs flex-1">
            <Search size={14} className="text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm mã phiếu, kho..."
              className="flex-1 text-sm bg-transparent outline-none" />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'pending', 'in_transit', 'completed'] as const).map(s => {
              const LABELS: Record<string, string> = { all: 'Tất cả', pending: 'Chờ duyệt', in_transit: 'Đang vận chuyển', completed: 'Hoàn thành' }
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
              {['Mã phiếu', 'Tuyến chuyển', 'Lý do', 'Ngày tạo', 'Số SP', 'Trạng thái', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-sm text-gray-400">Đang tải dữ liệu...</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-sm text-gray-400">Chưa có phiếu chuyển kho nào</td></tr>
            ) : paged.map(t => {
              const s = STATUS_MAP[t.status]
              return (
                <tr key={t.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-[var(--mia-primary)]">{t.code}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[#1e2a3a]">
                      <span>{t.from}</span>
                      <MoveRight size={11} className="text-gray-400 shrink-0" />
                      <span>{t.to}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate">{t.reason}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(t.date)}</td>
                  <td className="px-4 py-3 text-xs text-center font-medium text-[#1e2a3a]">{t.items.length || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setDetail(t)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap">
                      {t.status === 'pending' ? 'Duyệt' : t.status === 'in_transit' ? 'Xác nhận' : 'Xem'}
                    </button>
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

      {showCreate && <CreateTransferModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      {detail && (
        <DetailModal
          transfer={detail}
          onClose={() => setDetail(null)}
          onApprove={id => { handleApprove(id); setDetail(prev => prev ? { ...prev, status: 'in_transit' } : null) }}
          onConfirmReceived={id => { handleConfirmReceived(id); setDetail(prev => prev ? { ...prev, status: 'completed' } : null) }}
        />
      )}
    </div>
  )
}
