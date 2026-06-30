'use client'
import { useState, useEffect } from 'react'
import { Plus, Search, ArrowUpFromLine, CheckCircle, X, Package, AlertTriangle, ClipboardCheck, Trash2, ShoppingCart } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import ExportButton from '@/components/ui/ExportButton'
import { formatVND, formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'
import { useOrdersRealtime } from '@/hooks/useOrdersRealtime'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import WorkflowBanner from '@/components/workflow/WorkflowBanner'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Lot { lot_number: string; quantity: number; expiry_date: string }
interface PickItem {
  id?: string
  product_id: string; sku: string; name: string; unit: string
  required: number; picked: number
  lots: Lot[]; selectedLot: string; pickQty: number
}
interface StockIssue {
  id: string; code: string; sales_order_id?: string; sales_order_code: string
  customer_id: string; customer: string
  warehouse_id: string; warehouse: string
  date: string
  status: 'pending' | 'picking' | 'completed' | 'cancelled'
  items: PickItem[]
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending:   { label: 'Chờ soạn',  className: 'bg-yellow-100 text-yellow-700' },
  picking:   { label: 'Đang soạn', className: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Đã xuất',   className: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Đã hủy',    className: 'bg-red-100 text-red-700' },
}

function mapIssue(r: Record<string, unknown>): StockIssue {
  const salesOrder = r.sales_order as { id: string; code: string; customer: { id: string; name: string } | null } | null
  const warehouse  = r.warehouse  as { id: string; name: string } | null
  return {
    id: r.id as string,
    code: r.code as string,
    sales_order_id: r.sales_order_id as string | undefined,
    sales_order_code: salesOrder?.code ?? (r.sales_order_id as string) ?? '—',
    customer_id: salesOrder?.customer?.id ?? '',
    customer: salesOrder?.customer?.name ?? '—',
    warehouse_id: warehouse?.id ?? '',
    warehouse: warehouse?.name ?? '—',
    date: r.issue_date as string,
    status: r.status as StockIssue['status'],
    items: [],
  }
}

// ─── Dropdown types ───────────────────────────────────────────────────────────
interface DropdownItem { id: string; name: string }
interface ProductOption { id: string; sku: string; name: string; unit: string }
interface DraftRow { product_id: string; required: number }
function emptyRow(): DraftRow { return { product_id: '', required: 1 } }

// ─── Create Issue Modal ───────────────────────────────────────────────────────
function CreateIssueModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (issue: StockIssue) => void
}) {
  const { id: tenantId } = useTenant()
  const today = new Date().toISOString().slice(0, 10)
  const [customerId,  setCustomerId]  = useState('')
  const [soCode,      setSoCode]      = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [date,        setDate]        = useState(today)
  const [note,        setNote]        = useState('')
  const [rows,        setRows]        = useState<DraftRow[]>([emptyRow()])
  const [errors,      setErrors]      = useState<string[]>([])
  const [saving,      setSaving]      = useState(false)

  const [customers,   setCustomers]   = useState<DropdownItem[]>([])
  const [warehouses,  setWarehouses]  = useState<DropdownItem[]>([])
  const [products,    setProducts]    = useState<ProductOption[]>([])
  const [loadingOpts, setLoadingOpts] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    Promise.all([
      supabase.from('customers').select('id, name').eq('status', 'active').eq('tenant_id', tenantId).order('name').limit(200),
      supabase.from('warehouses').select('id, name').eq('status', 'active').eq('tenant_id', tenantId).order('name').limit(50),
      supabase.from('products').select('id, sku, name, unit').eq('status', 'active').eq('tenant_id', tenantId).order('name').limit(300),
    ]).then(([c, w, p]) => {
      setCustomers((c.data ?? []) as DropdownItem[])
      setWarehouses((w.data ?? []) as DropdownItem[])
      setProducts((p.data ?? []) as ProductOption[])
      setLoadingOpts(false)
    })
  }, [tenantId])

  const setRowField = (i: number, field: keyof DraftRow, val: string | number) => {
    setRows(prev => { const next = [...prev]; next[i] = { ...next[i], [field]: val }; return next })
  }
  const addRow    = () => setRows(prev => [...prev, emptyRow()])
  const removeRow = (i: number) => setRows(prev => prev.filter((_, idx) => idx !== i))

  const validate = () => {
    const errs: string[] = []
    if (!customerId)  errs.push('Vui lòng chọn khách hàng')
    if (!warehouseId) errs.push('Vui lòng chọn kho xuất')
    if (!date)        errs.push('Vui lòng chọn ngày xuất')
    if (rows.every(r => !r.product_id)) errs.push('Thêm ít nhất 1 sản phẩm')
    rows.forEach((r, i) => {
      if (r.product_id && r.required <= 0) errs.push(`Dòng ${i + 1}: số lượng phải > 0`)
    })
    return errs
  }

  const handleSubmit = async () => {
    const errs = validate()
    if (errs.length) { setErrors(errs); return }
    setSaving(true)

    const filled = rows.filter(r => r.product_id)
    const res = await fetch('/api/stock-issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId,
        warehouse_id: warehouseId,
        issue_date: date,
        note: note || null,
        items: filled.map(r => ({ product_id: r.product_id, required_qty: r.required })),
      }),
    })

    if (res.ok) {
      const { id, code } = await res.json()
      const customerName  = customers.find(c => c.id === customerId)?.name ?? ''
      const warehouseName = warehouses.find(w => w.id === warehouseId)?.name ?? ''
      onCreate({
        id, code,
        sales_order_code: soCode || '—',
        customer_id: customerId, customer: customerName,
        warehouse_id: warehouseId, warehouse: warehouseName,
        date, status: 'pending',
        items: filled.map(r => {
          const p = products.find(x => x.id === r.product_id)!
          return {
            product_id: p.id, sku: p.sku, name: p.name, unit: p.unit,
            required: r.required, picked: 0,
            lots: [], selectedLot: '', pickQty: 0,
          }
        }),
      })
      onClose()
    } else {
      const err = await res.json().catch(() => ({ error: 'Lỗi không xác định' }))
      setErrors([err.error ?? 'Lỗi lưu phiếu xuất'])
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Tạo phiếu xuất kho mới</h2>
            <p className="text-xs text-gray-500 mt-0.5">Xuất hàng theo đơn bán hoặc xuất thủ công</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {loadingOpts ? (
            <div className="text-center py-8 text-sm text-gray-400">Đang tải dữ liệu...</div>
          ) : (
            <>
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
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Đơn hàng liên kết (SO)</label>
                  <input value={soCode} onChange={e => setSoCode(e.target.value)}
                    placeholder="VD: SO-260614-001"
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Kho xuất <span className="text-red-400">*</span></label>
                  <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                    <option value="">-- Chọn kho --</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Ngày xuất <span className="text-red-400">*</span></label>
                  <input type="date" value={date} onChange={e => setDate(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Danh sách hàng xuất</h3>
                  <button onClick={addRow}
                    className="flex items-center gap-1 px-2.5 py-1 bg-[var(--mia-primary)]/10 text-[var(--mia-primary)] rounded-lg text-xs font-semibold hover:bg-[var(--mia-primary)]/20 transition-colors">
                    <Plus size={12} /> Thêm dòng
                  </button>
                </div>
                <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-[#e5e7eb]">
                        {['Sản phẩm', 'SL yêu cầu', ''].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => {
                        const p = products.find(x => x.id === row.product_id)
                        return (
                          <tr key={i} className="border-b border-[#f0f2f5] last:border-0">
                            <td className="px-3 py-2 min-w-[200px]">
                              <select value={row.product_id} onChange={e => setRowField(i, 'product_id', e.target.value)}
                                className="w-full h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                                <option value="">-- Chọn sản phẩm --</option>
                                {products.map(p => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2 w-36">
                              <div className="flex items-center gap-1.5">
                                <input type="number" min={1} value={row.required || ''} onChange={e => setRowField(i, 'required', +e.target.value)}
                                  className="w-20 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] text-center" />
                                <span className="text-[10px] text-gray-400">{p?.unit ?? ''}</span>
                              </div>
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
                  placeholder="Ghi chú thêm về đơn xuất..."
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

        <div className="px-6 py-4 border-t border-[#e5e7eb] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">
            Hủy
          </button>
          <button onClick={handleSubmit} disabled={saving || loadingOpts}
            className="px-5 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
            {saving ? 'Đang lưu...' : <><ArrowUpFromLine size={14} className="inline mr-1.5" />Tạo phiếu xuất</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Picking Modal ────────────────────────────────────────────────────────────
function PickingModal({ issue, onClose, onComplete, onStart }: {
  issue: StockIssue
  onClose: () => void
  onComplete: (id: string, items: PickItem[]) => void
  onStart: (id: string) => void
}) {
  const { id: tenantId } = useTenant()
  const [items,    setItems]    = useState<PickItem[]>([])
  const [saving,   setSaving]   = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  // Load items: từ stock_issue_items, fallback sang sales_order_items nếu rỗng
  useEffect(() => {
    if (!issue.warehouse_id) { setLoading(false); return }

    supabase
      .from('stock_issue_items')
      .select('id, product_id, required_qty, picked_qty, lot_number')
      .eq('stock_issue_id', issue.id)
      .then(async ({ data: issueItems }) => {
        let raw: any[] = issueItems ?? []

        // Fallback: issue cũ chưa có stock_issue_items → lấy từ SO items
        if (raw.length === 0 && issue.sales_order_id) {
          const { data: soItems } = await supabase
            .from('sales_order_items')
            .select('product_id, quantity')
            .eq('sales_order_id', issue.sales_order_id)
          raw = (soItems ?? []).map((it: any) => ({
            id: undefined,
            product_id: it.product_id,
            required_qty: it.quantity,
            picked_qty: 0,
            lot_number: null,
          }))
        }

        if (raw.length === 0) { setLoading(false); return }

        const productIds = raw.map((it: any) => it.product_id as string)

        const [{ data: products }, { data: inv }] = await Promise.all([
          supabase.from('products').select('id, sku, name, unit').in('id', productIds),
          supabase.from('inventory')
            .select('product_id, lot_number, quantity, expiry_date')
            .eq('tenant_id', tenantId)
            .eq('warehouse_id', issue.warehouse_id)
            .in('product_id', productIds)
            .gt('quantity', 0)
            .order('expiry_date', { ascending: true }),
        ])

        const productMap = new Map((products ?? []).map((p: any) => [p.id, p]))
        const invData = inv ?? []

        setItems(raw.map((it: any) => {
          const p = productMap.get(it.product_id) as any
          return {
            id: it.id as string | undefined,
            product_id: it.product_id as string,
            sku: p?.sku ?? '',
            name: p?.name ?? '',
            unit: p?.unit ?? '',
            required: (it.required_qty as number) ?? 0,
            picked: (it.picked_qty as number) ?? 0,
            lots: invData
              .filter((row: any) => row.product_id === it.product_id)
              .map((row: any) => ({
                lot_number: row.lot_number || '',
                quantity: row.quantity,
                expiry_date: row.expiry_date || '',
              })),
            selectedLot: invData.find((row: any) => row.product_id === it.product_id)?.lot_number ?? (it.lot_number ?? ''),
            pickQty: 0,
          }
        }))
        setLoading(false)
      })
  }, [issue.id, issue.sales_order_id, issue.warehouse_id, tenantId])

  const updateItem = (i: number, field: 'selectedLot' | 'pickQty', val: string | number) => {
    setItems(prev => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: val }
      return next
    })
  }

  const confirmPick = (i: number) => {
    setItems(prev => {
      const next = [...prev]
      const lot = next[i].lots.find(l => l.lot_number === next[i].selectedLot)
      const qty = Math.min(next[i].pickQty, lot?.quantity ?? 0, next[i].required - next[i].picked)
      next[i] = { ...next[i], picked: next[i].picked + qty, pickQty: 0 }
      return next
    })
  }

  const allDone = !loading && (items.length === 0 || items.every(it => it.picked >= it.required))
  const progress = items.length > 0
    ? Math.round(items.reduce((s, it) => s + Math.min(it.picked / it.required, 1), 0) / items.length * 100)
    : 0

  const handleComplete = async () => {
    setSaving(true)
    setError('')
    const res = await fetch(`/api/stock-issues/${issue.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed', items }),
    })
    if (res.ok) {
      onComplete(issue.id, items)
      onClose()
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Lỗi hoàn tất xuất kho — vui lòng thử lại')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Soạn hàng — {issue.code}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{issue.customer} · {issue.warehouse}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="px-6 py-3 bg-gray-50 border-b border-[#e5e7eb]">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-gray-500">Tiến độ soạn hàng</span>
            <span className="font-semibold text-[var(--mia-primary)]">{progress}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-[var(--mia-primary)] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-sm text-gray-400">Đang tải thông tin lô hàng...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">
              <p>Không có chi tiết hàng hóa</p>
              <p className="text-xs mt-1 text-gray-300">Nhấn &quot;Hoàn tất xuất kho&quot; để xác nhận</p>
            </div>
          ) : items.map((it, i) => {
            const done   = it.picked >= it.required
            const lot    = it.lots.find(l => l.lot_number === it.selectedLot)
            const maxPick = Math.min(lot?.quantity ?? 0, it.required - it.picked)

            return (
              <div key={it.product_id + i} className={`border rounded-xl p-4 transition-colors ${done ? 'border-green-300 bg-green-50' : 'border-[#e5e7eb] bg-white'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{it.sku}</span>
                      <span className="text-sm font-semibold text-[#1e2a3a]">{it.name}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">Yêu cầu: {it.required} {it.unit}</p>
                  </div>
                  {done
                    ? <span className="flex items-center gap-1 text-xs font-semibold text-green-600"><CheckCircle size={14} /> Đủ hàng</span>
                    : <span className="text-xs font-semibold text-orange-600">Còn thiếu: {it.required - it.picked} {it.unit}</span>
                  }
                </div>

                {it.lots.length > 0 ? (
                  <div className="bg-blue-50 rounded-lg p-3 mb-3">
                    <p className="text-[10px] font-semibold text-blue-600 uppercase mb-2">Lô hàng (FEFO — hết hạn gần nhất trước)</p>
                    <div className="space-y-1.5">
                      {it.lots.sort((a, b) => a.expiry_date.localeCompare(b.expiry_date)).map(l => (
                        <label key={l.lot_number} className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${it.selectedLot === l.lot_number ? 'bg-blue-100 border border-blue-300' : 'bg-white border border-gray-200 hover:bg-gray-50'}`}>
                          <div className="flex items-center gap-2">
                            <input type="radio" name={`lot-${i}`} value={l.lot_number}
                              checked={it.selectedLot === l.lot_number}
                              onChange={() => updateItem(i, 'selectedLot', l.lot_number)}
                              className="accent-[#0ea5e9]" />
                            <span className="text-xs font-medium text-[#1e2a3a]">Lô {l.lot_number}</span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>Tồn: <strong className="text-[#1e2a3a]">{l.quantity}</strong> {it.unit}</span>
                            {l.expiry_date && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${new Date(l.expiry_date) < new Date(Date.now() + 30 * 86400000) ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                                HSD: {formatDate(l.expiry_date)}
                              </span>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-3">
                    <p className="text-xs text-orange-600">Không có tồn kho cho sản phẩm này tại kho {issue.warehouse}</p>
                  </div>
                )}

                {!done && it.lots.length > 0 && (
                  <div className="flex items-center gap-2">
                    <input type="number" min={0} max={maxPick} value={it.pickQty || ''}
                      onChange={e => updateItem(i, 'pickQty', +e.target.value)}
                      placeholder={`Nhập số lượng (tối đa ${maxPick})`}
                      className="flex-1 h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                    <span className="text-xs text-gray-400 shrink-0">{it.unit}</span>
                    <button onClick={() => confirmPick(i)}
                      disabled={!it.pickQty || it.pickQty <= 0}
                      className="px-4 h-9 bg-[var(--mia-primary)] text-white text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
                      Xác nhận
                    </button>
                  </div>
                )}

                {it.picked > 0 && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(it.picked / it.required, 1) * 100}%` }} />
                    </div>
                    <span className="text-xs text-green-600 font-medium">{it.picked}/{it.required}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {error && (
          <div className="px-6 py-2 bg-red-50 border-t border-red-200">
            <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertTriangle size={11} />{error}</p>
          </div>
        )}
        <div className="px-6 py-4 border-t border-[#e5e7eb] flex justify-between items-center">
          {issue.status === 'pending' && (
            <button onClick={async () => {
              await fetch(`/api/stock-issues/${issue.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'picking' }),
              })
              onStart(issue.id)
              onClose()
            }}
              className="px-4 py-2 text-sm border border-[var(--mia-primary)] text-[var(--mia-primary)] rounded-lg hover:bg-blue-50 transition-colors font-medium">
              Bắt đầu soạn
            </button>
          )}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">
              Đóng
            </button>
            {allDone && !saving && (
              <button onClick={handleComplete}
                className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-all hover:scale-[1.02] active:scale-95">
                <CheckCircle size={14} className="inline mr-1.5" />Hoàn tất xuất kho
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Confirmed Orders Panel ───────────────────────────────────────────────────
interface PendingSO {
  id: string; code: string; customer: string; delivery_date: string
  status: 'confirmed' | 'picking'
  items: { name: string; quantity: number; unit: string }[]
}

function ConfirmedOrdersPanel({ onIssueCreated }: { onIssueCreated?: () => void }) {
  const { id: tenantId } = useTenant()
  const [orders, setOrders] = useState<PendingSO[]>([])
  const [updating, setUpdating] = useState<string | null>(null)
  const [warehousePicker, setWarehousePicker] = useState<{ soId: string; warehouses: { id: string; name: string }[] } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const load = async () => {
    const { data } = await supabase
      .from('sales_orders')
      .select(`id, code, status, delivery_date,
        customer:customers(name),
        items:sales_order_items(quantity, product:products(name, unit))`)
      .eq('tenant_id', tenantId)
      .in('status', ['confirmed', 'picking'])
      .order('created_at')
    setOrders((data ?? []).map((o: any) => ({
      id: o.id, code: o.code, status: o.status,
      customer: o.customer?.name ?? '—',
      delivery_date: o.delivery_date ?? '',
      items: (o.items ?? []).map((it: any) => ({
        name: it.product?.name ?? '—', quantity: it.quantity, unit: it.product?.unit ?? '',
      })),
    })))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!tenantId) return; load() }, [tenantId])
  useOrdersRealtime(load)
  useAutoRefresh(load, 15_000)

  const createAndStartIssue = async (soId: string, warehouseId: string): Promise<boolean> => {
    const { data: soItems } = await supabase
      .from('sales_order_items')
      .select('product_id, quantity')
      .eq('sales_order_id', soId)

    const now = new Date()
    const createRes = await fetch('/api/stock-issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sales_order_id: soId,
        warehouse_id: warehouseId,
        issue_date: now.toISOString().slice(0, 10),
        items: (soItems ?? []).map((it: any) => ({ product_id: it.product_id, required_qty: it.quantity })),
      }),
    })

    if (!createRes.ok) return false
    const { id } = await createRes.json()
    await fetch(`/api/stock-issues/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'picking' }),
    })
    return true
  }

  const startPicking = async (soId: string, warehouseId?: string) => {
    setUpdating(soId)
    setErrorMsg('')
    try {
      const issueRes = await fetch(`/api/stock-issues?sales_order_id=${soId}`)
      if (!issueRes.ok) throw new Error(`Lỗi tải phiếu xuất (${issueRes.status})`)

      const issues = await issueRes.json() as any[]
      const pendingIssue = issues.find((i: any) => i.status === 'pending')

      if (pendingIssue) {
        await fetch(`/api/stock-issues/${pendingIssue.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'picking' }),
        })
        onIssueCreated?.()
      } else {
        const wid = warehouseId
        if (wid) {
          const ok = await createAndStartIssue(soId, wid)
          if (!ok) throw new Error('Tạo phiếu xuất thất bại')
          onIssueCreated?.()
        } else {
          const { data: warehouses, error: wErr } = await supabase
            .from('warehouses').select('id, name').eq('tenant_id', tenantId).eq('status', 'active').order('name')
          if (wErr) throw new Error('Không lấy được danh sách kho')
          const wList = warehouses ?? []

          if (wList.length === 0) {
            throw new Error('Chưa có kho nào hoạt động — vui lòng thêm kho trong Cài đặt')
          } else if (wList.length === 1) {
            const ok = await createAndStartIssue(soId, wList[0].id)
            if (!ok) throw new Error('Tạo phiếu xuất thất bại')
            onIssueCreated?.()
          } else {
            setWarehousePicker({ soId, warehouses: wList })
            setUpdating(null)
            return
          }
        }
      }

      await load()
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'Đã xảy ra lỗi — vui lòng thử lại')
    } finally {
      setUpdating(null)
    }
  }

  if (orders.length === 0 && !warehousePicker) return null

  return (
    <>
      {warehousePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1e2a3a]">Chọn kho xuất hàng</h2>
              <button onClick={() => setWarehousePicker(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-2">
              {warehousePicker.warehouses.map(w => (
                <button key={w.id}
                  onClick={() => { setWarehousePicker(null); startPicking(warehousePicker.soId, w.id) }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 hover:border-[var(--mia-primary)] hover:bg-sky-50 transition-colors text-sm font-semibold text-[#1e2a3a]">
                  {w.name}
                </button>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end">
              <button onClick={() => setWarehousePicker(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
          <AlertTriangle size={13} className="shrink-0" />{errorMsg}
        </div>
      )}

      {orders.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart size={15} className="text-amber-600" />
            <h3 className="text-sm font-bold text-amber-800">Đơn hàng cần xuất kho ({orders.length})</h3>
            <span className="flex items-center gap-1 text-[10px] text-amber-500 ml-1">
              <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />Tự động cập nhật
            </span>
          </div>
          <div className="space-y-2">
            {orders.map(o => (
              <div key={o.id} className="bg-white rounded-xl border border-amber-100 px-4 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="shrink-0">
                    <span className="text-xs font-bold text-[var(--mia-primary)]">{o.code}</span>
                    <span className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ${o.status === 'confirmed' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'}`}>
                      {o.status === 'confirmed' ? 'Chờ soạn' : 'Đang soạn'}
                    </span>
                  </div>
                  <span className="text-xs font-medium text-[#1e2a3a] truncate max-w-[160px]">{o.customer}</span>
                  <span className="text-xs text-gray-400 truncate max-w-[200px] hidden md:block">
                    {o.items[0]?.name}{o.items.length > 1 ? ` +${o.items.length - 1} sp` : ''}
                  </span>
                  {o.delivery_date && (
                    <span className="text-xs text-gray-400 whitespace-nowrap hidden lg:block">Giao: {formatDate(o.delivery_date)}</span>
                  )}
                </div>
                <div className="shrink-0">
                  {o.status === 'confirmed' && (
                    <button onClick={() => startPicking(o.id)} disabled={updating === o.id}
                      className="px-3 py-1.5 bg-yellow-500 text-white text-xs font-semibold rounded-lg hover:bg-yellow-600 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap">
                      {updating === o.id ? '...' : 'Bắt đầu soạn'}
                    </button>
                  )}
                  {o.status === 'picking' && (
                    <span className="px-3 py-1.5 text-xs text-blue-600 font-medium whitespace-nowrap">
                      Mở phiếu xuất bên dưới để hoàn tất
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20

export default function XuatKhoPage() {
  const { id: tenantId } = useTenant()
  const [issues, setIssues]             = useState<StockIssue[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [picking, setPicking]           = useState<StockIssue | null>(null)
  const [showCreate, setShowCreate]     = useState(false)
  const [page, setPage]                 = useState(1)
  const [syncing, setSyncing]           = useState<string | null>(null)
  const [synced, setSynced]             = useState<Set<string>>(new Set())
  const [confirmedCount, setConfirmedCount] = useState(0)

  const loadIssues = async () => {
    setLoading(true)
    const [res, countRes] = await Promise.all([
      fetch('/api/stock-issues'),
      tenantId
        ? supabase.from('sales_orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'confirmed')
        : Promise.resolve({ count: 0 }),
    ])
    if (res.ok) {
      const data = await res.json()
      setIssues(data.map(mapIssue))
    }
    setConfirmedCount((countRes as any).count ?? 0)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!tenantId) return; loadIssues() }, [tenantId])

  const filtered = issues.filter(r => {
    const matchSearch = r.code.includes(search) || r.customer.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || r.status === statusFilter
    return matchSearch && matchStatus
  })
  useEffect(() => { setPage(1) }, [search, statusFilter])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleStart  = (id: string) => setIssues(prev => prev.map(r => r.id === id ? { ...r, status: 'picking' } : r))
  const handleComplete = (id: string, items: PickItem[]) => setIssues(prev => prev.map(r => r.id === id ? { ...r, status: 'completed', items } : r))
  const handleCreate = (issue: StockIssue) => setIssues(prev => [issue, ...prev])

  const handleResync = async (issueId: string) => {
    setSyncing(issueId)
    const res = await fetch(`/api/stock-issues/${issueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'resync' }),
    })
    const json = await res.json()
    setSyncing(null)
    if (json.ok) setSynced(prev => new Set([...prev, issueId]))
  }

  return (
    <div>
      <PageHeader title="Xuất kho" subtitle="Quản lý phiếu xuất và vận hành soạn hàng FEFO">
        <ExportButton module="kho-hang" />
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={15} /> Tạo phiếu xuất
        </button>
      </PageHeader>

      <WorkflowBanner
        count={confirmedCount}
        label="đơn hàng đã xác nhận, chờ soạn"
        hint="Xem danh sách bên dưới → Bắt đầu soạn"
      />

      <ConfirmedOrdersPanel onIssueCreated={loadIssues} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Chờ soạn',        value: issues.filter(r => r.status === 'pending').length,   icon: <Package size={20} className="text-yellow-500" />, bg: 'bg-yellow-50', sub: 'Cần xử lý' },
          { label: 'Đang soạn',       value: issues.filter(r => r.status === 'picking').length,   icon: <ClipboardCheck size={20} className="text-blue-500" />, bg: 'bg-blue-50', sub: 'Kho đang xử lý' },
          { label: 'Đã xuất',         value: issues.filter(r => r.status === 'completed').length, icon: <CheckCircle size={20} className="text-green-500" />, bg: 'bg-green-50', sub: 'Hoàn thành' },
          { label: 'Tổng phiếu',      value: issues.length,                                       icon: <ArrowUpFromLine size={20} className="text-sky-500" />, bg: 'bg-sky-50', sub: 'Tất cả' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-[#e5e7eb] p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center shrink-0`}>{k.icon}</div>
            <div>
              <p className="text-xs text-gray-500">{k.label}</p>
              <p className="text-xl font-bold text-[#1e2a3a]">{k.value}</p>
              <p className="text-xs text-gray-400">{k.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        <div className="p-4 border-b border-[#e5e7eb] flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-50 border border-[#e5e7eb] rounded-lg px-3 h-9 max-w-xs flex-1">
            <Search size={14} className="text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm phiếu xuất, khách hàng..."
              className="flex-1 text-sm bg-transparent outline-none" />
          </div>
          <div className="flex gap-1.5">
            {['all', 'pending', 'picking', 'completed', 'cancelled'].map(s => {
              const LABELS: Record<string, string> = { all: 'Tất cả', pending: 'Chờ soạn', picking: 'Đang soạn', completed: 'Đã xuất', cancelled: 'Đã hủy' }
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
              {['Mã phiếu', 'Đơn hàng', 'Khách hàng', 'Kho xuất', 'Ngày', 'Tiến độ', 'Trạng thái', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-sm text-gray-400">Đang tải dữ liệu...</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-sm text-gray-400">Chưa có phiếu xuất nào</td></tr>
            ) : paged.map(r => {
              const s            = STATUS_MAP[r.status]
              const totalRequired = r.items.reduce((sum, it) => sum + it.required, 0)
              const totalPicked   = r.items.reduce((sum, it) => sum + it.picked, 0)
              const pct           = totalRequired > 0 ? Math.round(totalPicked / totalRequired * 100) : 0
              return (
                <tr key={r.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-[var(--mia-primary)]">{r.code}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{r.sales_order_code}</td>
                  <td className="px-4 py-3 text-xs font-medium text-[#1e2a3a]">{r.customer}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.warehouse}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(r.date)}</td>
                  <td className="px-4 py-3 w-32">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-[var(--mia-primary)]'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 shrink-0">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.status !== 'completed' && r.status !== 'cancelled' && (
                      <button onClick={() => setPicking(r)}
                        className="px-3 py-1.5 bg-[var(--mia-primary)] text-white text-xs font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap">
                        {r.status === 'pending' ? 'Bắt đầu soạn' : 'Tiếp tục soạn'}
                      </button>
                    )}
                    {r.status === 'completed' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium whitespace-nowrap">
                          <CheckCircle size={13} /> Hoàn tất
                        </span>
                        {r.sales_order_code && r.sales_order_code !== '—' && (
                          synced.has(r.id) ? (
                            <span className="text-[10px] text-sky-600 font-medium">✓ Đã gửi VC</span>
                          ) : (
                            <button
                              onClick={() => handleResync(r.id)}
                              disabled={syncing === r.id}
                              title="Đảm bảo đơn hiển thị trong Kế hoạch giao hàng"
                              className="px-1.5 py-0.5 text-[10px] text-sky-600 border border-sky-200 rounded hover:bg-sky-50 transition-colors disabled:opacity-40 whitespace-nowrap">
                              {syncing === r.id ? '...' : '⟳ Gửi logistics'}
                            </button>
                          )
                        )}
                      </div>
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

      {picking && (
        <PickingModal issue={picking} onClose={() => setPicking(null)} onStart={handleStart} onComplete={handleComplete} />
      )}
      {showCreate && (
        <CreateIssueModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
    </div>
  )
}
