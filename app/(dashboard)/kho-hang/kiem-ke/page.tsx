'use client'
import { useState, useEffect } from 'react'
import { Plus, Search, ClipboardCheck, X, AlertTriangle, CheckCircle, TrendingDown, TrendingUp, Trash2 } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'

// ─── Types ────────────────────────────────────────────────────────────────────
interface StocktakeItem {
  id?: string
  product_id: string; sku: string; name: string; unit: string
  system_qty: number; counted_qty: number | null
}
interface Stocktake {
  id: string; code: string
  warehouse_id: string; warehouse: string
  date: string; note: string; status: string
  items: StocktakeItem[]
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  open:       { label: 'Đang kiểm kê',   className: 'bg-blue-100 text-blue-700' },
  counting:   { label: 'Đang kiểm kê',   className: 'bg-blue-100 text-blue-700' },
  pending:    { label: 'Chờ duyệt',       className: 'bg-yellow-100 text-yellow-700' },
  approved:   { label: 'Đã duyệt',        className: 'bg-green-100 text-green-700' },
  cancelled:  { label: 'Đã hủy',          className: 'bg-red-100 text-red-700' },
}

function mapStocktake(r: Record<string, unknown>): Stocktake {
  const wh = r.warehouse as { id: string; name: string } | null
  const rawItems = (r.items as Record<string, unknown>[]) ?? []
  return {
    id: r.id as string,
    code: r.code as string,
    warehouse_id: wh?.id ?? '',
    warehouse: wh?.name ?? '',
    date: r.stocktake_date as string,
    note: (r.note as string) ?? '',
    status: r.status as string,
    items: rawItems.map(it => {
      const p = it.product as { sku: string; name: string; unit: string } | null
      return {
        id: it.id as string,
        product_id: it.product_id as string,
        sku: p?.sku ?? '',
        name: p?.name ?? '',
        unit: p?.unit ?? '',
        system_qty: (it.system_qty as number) ?? 0,
        counted_qty: it.counted_qty as number | null,
      }
    }),
  }
}

// ─── Dropdown types ───────────────────────────────────────────────────────────
interface DropdownWarehouse { id: string; name: string }
interface ProductStock { id: string; sku: string; name: string; unit: string; system_qty: number }

// ─── Create Stocktake Modal ───────────────────────────────────────────────────
function CreateStocktakeModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (s: Stocktake) => void
}) {
  const { id: tenantId } = useTenant()
  const today = new Date().toISOString().slice(0, 10)
  const [warehouseId, setWarehouseId] = useState('')
  const [date, setDate]               = useState(today)
  const [note, setNote]               = useState('')
  const [errors, setErrors]           = useState<string[]>([])
  const [saving, setSaving]           = useState(false)

  const [warehouses, setWarehouses]   = useState<DropdownWarehouse[]>([])
  const [products, setProducts]       = useState<ProductStock[]>([])
  const [loadingWh, setLoadingWh]     = useState(true)
  const [loadingProd, setLoadingProd] = useState(false)
  const [selected, setSelected]       = useState<Set<string>>(new Set())

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    supabase.from('warehouses').select('id, name').eq('tenant_id', tenantId).eq('status', 'active').order('name').limit(50)
      .then(({ data }) => { setWarehouses((data ?? []) as DropdownWarehouse[]); setLoadingWh(false) })
  }, [tenantId])

  const selectAll   = () => setSelected(new Set(products.map(p => p.id)))
  const clearSelect = () => setSelected(new Set())

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!warehouseId) { setProducts([]); setSelected(new Set()); return }
    if (!tenantId) return
    setLoadingProd(true)
    supabase
      .from('inventory')
      .select('product_id, quantity, products(id, sku, name, unit)')
      .eq('tenant_id', tenantId)
      .eq('warehouse_id', warehouseId)
      .then(({ data }) => {
        const byProduct: Record<string, ProductStock> = {}
        for (const row of data ?? []) {
          const r = row as Record<string, unknown>
          const p = r.products as { id: string; sku: string; name: string; unit: string } | null
          if (!p) continue
          if (!byProduct[p.id]) {
            byProduct[p.id] = { id: p.id, sku: p.sku, name: p.name, unit: p.unit, system_qty: 0 }
          }
          byProduct[p.id].system_qty += (r.quantity as number) ?? 0
        }
        const list = Object.values(byProduct).sort((a, b) => a.name.localeCompare(b.name))
        setProducts(list)
        setSelected(new Set(list.map(p => p.id)))
        setLoadingProd(false)
      })
  }, [warehouseId, tenantId])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSubmit = async () => {
    const errs: string[] = []
    if (!warehouseId) errs.push('Vui lòng chọn kho')
    if (!date)        errs.push('Vui lòng chọn ngày kiểm kê')
    if (selected.size === 0) errs.push('Chọn ít nhất 1 sản phẩm để kiểm kê')
    if (errs.length) { setErrors(errs); return }

    setSaving(true)
    const chosenProducts = products.filter(p => selected.has(p.id))
    const res = await fetch('/api/stocktakes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        warehouse_id: warehouseId,
        stocktake_date: date,
        note: note || null,
        items: chosenProducts.map(p => ({ product_id: p.id, system_qty: p.system_qty })),
      }),
    })

    if (res.ok) {
      const { id, code } = await res.json()
      const whName = warehouses.find(w => w.id === warehouseId)?.name ?? ''
      onCreate({
        id, code,
        warehouse_id: warehouseId, warehouse: whName,
        date, note: note || '', status: 'open',
        items: chosenProducts.map(p => ({ product_id: p.id, sku: p.sku, name: p.name, unit: p.unit, system_qty: p.system_qty, counted_qty: null })),
      })
      onClose()
    } else {
      const err = await res.json().catch(() => ({ error: 'Lỗi không xác định' }))
      setErrors([err.error ?? 'Lỗi tạo phiếu kiểm kê'])
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Tạo phiếu kiểm kê</h2>
            <p className="text-xs text-gray-500 mt-0.5">Kiểm kê tồn kho thực tế so với hệ thống</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Kho kiểm kê <span className="text-red-400">*</span></label>
              {loadingWh ? (
                <div className="h-9 bg-gray-50 border border-[#e5e7eb] rounded-lg animate-pulse" />
              ) : (
                <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
                  <option value="">-- Chọn kho --</option>
                  {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Ngày kiểm kê <span className="text-red-400">*</span></label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Ghi chú</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú kiểm kê..."
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Danh sách sản phẩm
                {!warehouseId && <span className="ml-2 font-normal text-gray-400 normal-case">(chọn kho để xem hàng tồn)</span>}
              </h3>
              {products.length > 0 && (
                <div className="flex gap-1.5">
                  <button onClick={selectAll} className="px-2.5 py-0.5 text-xs font-medium text-[var(--mia-primary)] hover:bg-[var(--mia-primary)]/10 rounded-lg transition-colors">Chọn tất cả</button>
                  <button onClick={clearSelect} className="px-2.5 py-0.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">Bỏ chọn</button>
                </div>
              )}
            </div>

            {loadingProd ? (
              <div className="text-center py-6 text-sm text-gray-400">Đang tải sản phẩm...</div>
            ) : products.length === 0 && warehouseId ? (
              <div className="text-center py-6 text-sm text-gray-400">Kho này chưa có hàng tồn kho</div>
            ) : products.length > 0 ? (
              <div className="border border-[#e5e7eb] rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full">
                  <thead className="sticky top-0">
                    <tr className="bg-gray-50 border-b border-[#e5e7eb]">
                      <th className="px-3 py-2 w-8"></th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">Sản phẩm</th>
                      <th className="text-right px-3 py-2 text-[10px] font-semibold text-gray-500 uppercase">Tồn hệ thống</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map(p => (
                      <tr key={p.id} onClick={() => toggleSelect(p.id)}
                        className={`border-b border-[#f0f2f5] last:border-0 transition-colors ${selected.has(p.id) ? 'bg-[var(--mia-primary)]/5' : 'hover:bg-gray-50'}`}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={selected.has(p.id)} readOnly
                            className="w-3.5 h-3.5 rounded accent-[#0ea5e9]" />
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-xs font-medium text-[#1e2a3a]">{p.name}</p>
                          <p className="text-[10px] text-gray-400 font-mono">{p.sku}</p>
                        </td>
                        <td className="px-3 py-2 text-right text-xs font-semibold text-[#1e2a3a]">{p.system_qty} {p.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
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

        <div className="px-6 py-4 border-t border-[#e5e7eb] flex items-center justify-between">
          <p className="text-xs text-gray-400">{selected.size}/{products.length} sản phẩm được chọn</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
            <button onClick={handleSubmit} disabled={saving}
              className="px-5 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
              {saving ? 'Đang lưu...' : <><ClipboardCheck size={14} className="inline mr-1.5" />Tạo phiếu kiểm kê</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Counting Modal ───────────────────────────────────────────────────────────
function CountingModal({ stocktake, onClose, onSave }: {
  stocktake: Stocktake; onClose: () => void; onSave: (s: Stocktake) => void
}) {
  const [items, setItems] = useState<StocktakeItem[]>(stocktake.items.map(it => ({ ...it })))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const isApproved = stocktake.status === 'approved'

  const setCounted = (idx: number, val: string) => {
    const num = val === '' ? null : parseInt(val)
    setItems(prev => { const next = [...prev]; next[idx] = { ...next[idx], counted_qty: isNaN(num as number) ? null : num }; return next })
  }

  const handleSave = async (newStatus: string) => {
    setSaving(true); setError('')
    const res = await fetch(`/api/stocktakes/${stocktake.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: newStatus,
        items: items.map(it => ({ id: it.id, product_id: it.product_id, counted_qty: it.counted_qty })),
      }),
    })
    if (res.ok) {
      onSave({ ...stocktake, status: newStatus, items })
      onClose()
    } else {
      const err = await res.json().catch(() => ({ error: 'Lỗi không xác định' }))
      setError(err.error ?? 'Lỗi lưu kiểm kê')
    }
    setSaving(false)
  }

  const totalDiff     = items.reduce((s, it) => { if (it.counted_qty === null) return s; return s + (it.counted_qty - it.system_qty) }, 0)
  const itemsDiffOver = items.filter(it => it.counted_qty !== null && it.counted_qty > it.system_qty).length
  const itemsDiffUnder = items.filter(it => it.counted_qty !== null && it.counted_qty < it.system_qty).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">{stocktake.code}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Kho: {stocktake.warehouse} · {formatDate(stocktake.date)}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        {!isApproved && (
          <div className="px-6 py-3 border-b border-[#f0f2f5] flex items-center gap-4 text-xs text-gray-500">
            <span>Nhập số lượng thực đếm vào cột "Thực tế" rồi lưu lại.</span>
            {totalDiff !== 0 && (
              <div className="flex items-center gap-3 ml-auto">
                {itemsDiffOver  > 0 && <span className="flex items-center gap-1 text-green-600 font-medium"><TrendingUp size={12} /> {itemsDiffOver} SP thừa</span>}
                {itemsDiffUnder > 0 && <span className="flex items-center gap-1 text-red-600 font-medium"><TrendingDown size={12} /> {itemsDiffUnder} SP thiếu</span>}
              </div>
            )}
          </div>
        )}

        <div className="overflow-y-auto flex-1">
          <table className="w-full">
            <thead className="sticky top-0">
              <tr className="bg-gray-50 border-b border-[#e5e7eb]">
                {['Sản phẩm', 'HT (tồn)', 'Thực tế', 'Chênh lệch'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => {
                const diff   = it.counted_qty !== null ? it.counted_qty - it.system_qty : null
                const isOver = diff !== null && diff > 0
                const isUnder = diff !== null && diff < 0
                return (
                  <tr key={it.product_id} className="border-b border-[#f0f2f5] last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5">
                      <p className="text-xs font-medium text-[#1e2a3a]">{it.name}</p>
                      <p className="text-[10px] text-gray-400 font-mono">{it.sku}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-gray-500">{it.system_qty} {it.unit}</td>
                    <td className="px-4 py-2.5 w-32">
                      {isApproved ? (
                        <span className="text-xs font-semibold text-[#1e2a3a]">{it.counted_qty ?? '—'} {it.unit}</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <input type="number" min={0} value={it.counted_qty ?? ''} onChange={e => setCounted(i, e.target.value)}
                            placeholder="—"
                            className="w-20 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] text-center" />
                          <span className="text-[10px] text-gray-400">{it.unit}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {diff === null ? (
                        <span className="text-xs text-gray-300">—</span>
                      ) : diff === 0 ? (
                        <span className="text-xs font-medium text-gray-400">Khớp</span>
                      ) : (
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${isOver ? 'text-green-600' : 'text-red-600'}`}>
                          {isOver ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {isOver ? '+' : ''}{diff} {it.unit}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="mx-6 mt-0 mb-0 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertTriangle size={11} className="shrink-0" /> {error}</p>
          </div>
        )}

        {isApproved && (
          <div className="mx-6 my-4 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2">
            <CheckCircle size={14} className="text-green-600 shrink-0" />
            <p className="text-xs text-green-700">Kiểm kê đã được duyệt. Tồn kho hệ thống đã được điều chỉnh theo số liệu thực tế.</p>
          </div>
        )}

        <div className="px-6 py-4 border-t border-[#e5e7eb] flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">
            {isApproved ? 'Đóng' : 'Hủy'}
          </button>
          {!isApproved && (
            <div className="flex gap-2">
              <button onClick={() => handleSave('counting')} disabled={saving}
                className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
                {saving ? 'Đang lưu...' : 'Lưu tạm'}
              </button>
              <button onClick={() => handleSave('pending')} disabled={saving}
                className="px-4 py-2 bg-yellow-500 text-white text-sm font-semibold rounded-lg hover:bg-yellow-600 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                Gửi duyệt
              </button>
              <button onClick={() => handleSave('approved')} disabled={saving}
                className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">
                <CheckCircle size={14} className="inline mr-1.5" />Duyệt & Cập nhật tồn kho
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 20

export default function KiemKePage() {
  const { id: tenantId } = useTenant()
  const [stocktakes, setStocktakes]     = useState<Stocktake[]>([])
  const [loading, setLoading]           = useState(true)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate]     = useState(false)
  const [counting, setCounting]         = useState<Stocktake | null>(null)
  const [page, setPage]                 = useState(1)

  const loadStocktakes = async () => {
    setLoading(true)
    const res = await fetch('/api/stocktakes')
    if (res.ok) {
      const data = await res.json()
      setStocktakes(data.map(mapStocktake))
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!tenantId) return; loadStocktakes() }, [tenantId])

  const filtered = stocktakes.filter(s => {
    const matchSearch = s.code.includes(search) || s.warehouse.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    return matchSearch && matchStatus
  })
  useEffect(() => { setPage(1) }, [search, statusFilter])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleCreate = (s: Stocktake) => setStocktakes(prev => [s, ...prev])
  const handleSave   = (updated: Stocktake) => setStocktakes(prev => prev.map(s => s.id === updated.id ? updated : s))

  const stats = {
    total:    stocktakes.length,
    open:     stocktakes.filter(s => s.status === 'open' || s.status === 'counting').length,
    pending:  stocktakes.filter(s => s.status === 'pending').length,
    approved: stocktakes.filter(s => s.status === 'approved').length,
  }

  const countDiscrepancies = (s: Stocktake) => s.items.filter(it => it.counted_qty !== null && it.counted_qty !== it.system_qty).length

  return (
    <div>
      <PageHeader title="Kiểm kê kho" subtitle="Đối chiếu tồn kho thực tế với hệ thống">
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={15} /> Tạo phiếu kiểm kê
        </button>
      </PageHeader>

      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Tổng phiếu',    value: stats.total,    icon: <ClipboardCheck size={20} className="text-sky-500" />,    bg: 'bg-sky-50' },
          { label: 'Đang kiểm kê',  value: stats.open,     icon: <ClipboardCheck size={20} className="text-blue-500" />,   bg: 'bg-blue-50' },
          { label: 'Chờ duyệt',     value: stats.pending,  icon: <AlertTriangle size={20} className="text-yellow-500" />,  bg: 'bg-yellow-50' },
          { label: 'Đã duyệt',      value: stats.approved, icon: <CheckCircle size={20} className="text-green-500" />,     bg: 'bg-green-50' },
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
            {(['all', 'open', 'pending', 'approved'] as const).map(s => {
              const LABELS: Record<string, string> = { all: 'Tất cả', open: 'Đang kiểm', pending: 'Chờ duyệt', approved: 'Đã duyệt' }
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
              {['Mã phiếu', 'Kho', 'Ngày kiểm', 'Ghi chú', 'Số SP', 'Chênh lệch', 'Trạng thái', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-sm text-gray-400">Đang tải dữ liệu...</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-sm text-gray-400">Chưa có phiếu kiểm kê nào</td></tr>
            ) : paged.map(s => {
              const stat       = STATUS_MAP[s.status] ?? STATUS_MAP['open']
              const discrepancies = countDiscrepancies(s)
              return (
                <tr key={s.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-[var(--mia-primary)]">{s.code}</td>
                  <td className="px-4 py-3 text-sm text-[#1e2a3a]">{s.warehouse}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(s.date)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate">{s.note || '—'}</td>
                  <td className="px-4 py-3 text-xs text-center font-medium text-[#1e2a3a]">{s.items.length}</td>
                  <td className="px-4 py-3">
                    {discrepancies > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                        <AlertTriangle size={11} /> {discrepancies} SP
                      </span>
                    ) : s.status === 'approved' ? (
                      <span className="text-xs text-green-600 font-medium">Khớp</span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${stat.className}`}>{stat.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setCounting(s)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors whitespace-nowrap">
                      {s.status === 'approved' ? 'Xem' : s.status === 'pending' ? 'Duyệt' : 'Nhập liệu'}
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

      {showCreate && <CreateStocktakeModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      {counting && (
        <CountingModal
          stocktake={counting}
          onClose={() => setCounting(null)}
          onSave={updated => { handleSave(updated) }}
        />
      )}
    </div>
  )
}
