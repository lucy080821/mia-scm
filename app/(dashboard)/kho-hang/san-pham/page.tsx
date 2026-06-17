'use client'
import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { Plus, Search, Package, X, Clock, AlertTriangle, TrendingDown } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import ExportButton from '@/components/ui/ExportButton'
import Badge from '@/components/ui/Badge'
import DataTable, { ColumnDef } from '@/components/ui/DataTable'
import KpiCard from '@/components/ui/KpiCard'
import { formatVND } from '@/lib/utils'
import { calcDaysOfStock, calcDateElapsedPct, getAlertLevel } from '@/lib/stock-alerts'
import { calcSafetyStock, calcROP, calcEOQ, classifyABC, AbcClass } from '@/lib/inventory-formulas'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

type Product = {
  id: string; sku: string; name: string; category: string; supplier: string; supplier_id: string | null
  unit: string; purchase_price: number; sale_price: number; stock: number
  min_stock: number; expiry_days: number | null; status: string; created_at: string
  avg_daily_sales: number; manufacture_date: string | null; lead_time_days: number
  abc_class: AbcClass | null
  safety_stock: number
  rop: number
  eoq: number
}

const BLANK_PRODUCT = (): Omit<Product, 'id' | 'stock' | 'created_at' | 'abc_class' | 'safety_stock' | 'rop' | 'eoq'> => ({
  sku: '', name: '', category: '', supplier: '', supplier_id: null, unit: 'L',
  purchase_price: 0, sale_price: 0, min_stock: 0, expiry_days: null, status: 'active',
  avg_daily_sales: 0, manufacture_date: null, lead_time_days: 7,
})

// ─── Helper renderers ─────────────────────────────────────────────────────────

function AbcBadge({ cls }: { cls: AbcClass | null }) {
  if (!cls) return <span className="text-[10px] text-gray-300">—</span>
  const style = {
    A: 'bg-green-100 text-green-700 border border-green-200',
    B: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
    C: 'bg-gray-100 text-gray-500 border border-gray-200',
  }[cls]
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${style}`}>{cls}</span>
}

function DaysOfStockBadge({ stock, avgDailySales }: { stock: number; avgDailySales: number }) {
  if (stock === 0) return <span className="text-[10px] font-semibold text-red-500">Hết hàng</span>
  const days = calcDaysOfStock(stock, avgDailySales)
  if (days === null) return <span className="text-[10px] text-gray-300">—</span>
  if (days <= 3) return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-600">{days} ngày</span>
  if (days <= 7) return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-600">{days} ngày</span>
  if (days <= 14) return <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-50 text-yellow-700">{days} ngày</span>
  return <span className="text-xs text-gray-400 whitespace-nowrap">~{days} ngày</span>
}

function DateElapsedBar({ manufactureDate, expiryDays }: { manufactureDate: string | null; expiryDays: number | null }) {
  const pct = calcDateElapsedPct(manufactureDate, expiryDays) // % còn lại
  if (pct === null) return <span className="text-[10px] text-gray-300">—</span>
  // pct = % HSD còn lại: cao = xanh (tốt), thấp = đỏ (sắp hết hạn)
  const barColor = pct <= 10 ? 'bg-red-500' : pct <= 25 ? 'bg-orange-400' : pct <= 50 ? 'bg-yellow-400' : 'bg-green-400'
  const textColor = pct <= 10 ? 'text-red-600' : pct <= 25 ? 'text-orange-500' : pct <= 50 ? 'text-yellow-600' : 'text-green-600'
  return (
    <div className="flex items-center gap-1.5 min-w-[72px]">
      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[10px] font-semibold ${textColor} w-7 text-right shrink-0`}>{pct}%</span>
    </div>
  )
}

function RopCell({ stock, rop, eoq, unit }: { stock: number; rop: number; eoq: number; unit: string }) {
  if (rop === 0) return <span className="text-[10px] text-gray-300">—</span>
  const belowRop = stock <= rop
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1">
        {belowRop && <span className="text-[9px] font-bold text-red-500">⚠</span>}
        <span className={`text-[10px] font-semibold ${belowRop ? 'text-red-600' : 'text-gray-600'}`}>
          {rop.toLocaleString('vi-VN')}
        </span>
      </div>
      {eoq > 0 && (
        <div className="text-[10px] text-sky-600 font-medium">
          EOQ {eoq.toLocaleString('vi-VN')} {unit}
        </div>
      )}
    </div>
  )
}

// ─── Product Form Modal ───────────────────────────────────────────────────────

function ProductFormModal({ product, onClose, onSave }: {
  product?: Product; onClose: () => void; onSave: (p: Product) => void
}) {
  const [form, setForm] = useState<Omit<Product, 'id' | 'stock' | 'created_at' | 'abc_class' | 'safety_stock' | 'rop' | 'eoq'>>(
    product
      ? {
          sku: product.sku, name: product.name, category: product.category,
          supplier: product.supplier, supplier_id: product.supplier_id, unit: product.unit,
          purchase_price: product.purchase_price, sale_price: product.sale_price,
          min_stock: product.min_stock, expiry_days: product.expiry_days,
          status: product.status, avg_daily_sales: product.avg_daily_sales,
          manufacture_date: product.manufacture_date, lead_time_days: product.lead_time_days,
        }
      : BLANK_PRODUCT()
  )
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const previewSS  = calcSafetyStock(form.avg_daily_sales, form.lead_time_days)
  const previewROP = calcROP(form.avg_daily_sales, form.lead_time_days)
  const previewEOQ = calcEOQ(form.avg_daily_sales, form.purchase_price)

  const handleSave = () => {
    if (!form.sku || !form.name) return
    onSave({
      ...form,
      id: product?.id ?? String(Date.now()),
      stock: product?.stock ?? 0,
      created_at: product?.created_at ?? new Date().toISOString().slice(0, 10),
      abc_class: product?.abc_class ?? null,
      safety_stock: previewSS,
      rop: previewROP,
      eoq: previewEOQ,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-base font-bold text-[#1e2a3a]">{product ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">SKU <span className="text-red-400">*</span></label>
            <input value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="SN150-5L"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Đơn vị tính <span className="text-red-400">*</span></label>
            <select value={form.unit} onChange={e => set('unit', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]">
              {['L', 'kg', 'thùng', 'cái', 'gói', 'hộp'].map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tên sản phẩm <span className="text-red-400">*</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Tên đầy đủ của sản phẩm"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Danh mục</label>
            <input value={form.category} onChange={e => set('category', e.target.value)} placeholder="Nhớt động cơ"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nhà cung cấp</label>
            <input value={form.supplier} onChange={e => set('supplier', e.target.value)} placeholder="Castrol VN"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Giá nhập (đ)</label>
            <input type="number" min={0} value={form.purchase_price} onChange={e => set('purchase_price', Number(e.target.value))}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Giá bán (đ)</label>
            <input type="number" min={0} value={form.sale_price} onChange={e => set('sale_price', Number(e.target.value))}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tồn tối thiểu</label>
            <input type="number" min={0} value={form.min_stock} onChange={e => set('min_stock', Number(e.target.value))}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Hạn sử dụng (ngày)</label>
            <input type="number" min={0} value={form.expiry_days ?? ''} onChange={e => set('expiry_days', e.target.value ? Number(e.target.value) : null)}
              placeholder="Để trống nếu không hết hạn"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">TB xuất / ngày</label>
            <input type="number" min={0} value={form.avg_daily_sales} onChange={e => set('avg_daily_sales', Number(e.target.value))}
              placeholder="Tự động tính từ lịch sử bán"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Lead time NCC (ngày)</label>
            <input type="number" min={1} value={form.lead_time_days} onChange={e => set('lead_time_days', Number(e.target.value) || 7)}
              placeholder="7"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ngày sản xuất (lô hiện tại)</label>
            <input type="date" value={form.manufacture_date ?? ''} onChange={e => set('manufacture_date', e.target.value || null)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Trạng thái</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]">
              <option value="active">Đang bán</option>
              <option value="inactive">Ngừng bán</option>
              <option value="pending">Chờ duyệt</option>
            </select>
          </div>

          {(previewROP > 0 || previewEOQ > 0) && (
            <div className="col-span-2 bg-sky-50 border border-sky-200 rounded-xl p-3 grid grid-cols-3 gap-3">
              {[
                { label: 'Safety Stock', val: previewSS },
                { label: 'ROP (điểm đặt hàng)', val: previewROP },
                { label: 'EOQ (số lượng tối ưu)', val: previewEOQ },
              ].map(({ label, val }) => (
                <div key={label}>
                  <div className="text-[10px] font-semibold uppercase text-sky-500 mb-0.5">{label}</div>
                  <div className="text-sm font-bold text-sky-700">{val.toLocaleString('vi-VN')} {form.unit}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-[#e5e7eb]">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
          <button onClick={handleSave} disabled={!form.sku || !form.name}
            className="flex-1 py-2 bg-[#0ea5e9] text-white text-sm font-semibold rounded-lg hover:bg-[#0284c7] disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
            {product ? 'Cập nhật' : 'Thêm sản phẩm'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    async function load() {
      const [{ data: prods }, { data: inv }] = await Promise.all([
        supabase.from('products')
          .select('*, category:categories(name), supplier:suppliers(name, delivery_days)')
          .order('created_at', { ascending: false }),
        supabase.from('inventory').select('product_id, quantity'),
      ])
      if (!prods) return

      const stockMap: Record<string, number> = {}
      ;(inv ?? []).forEach((r: { product_id: string; quantity: number }) => {
        stockMap[r.product_id] = (stockMap[r.product_id] ?? 0) + r.quantity
      })

      // ── Tính avg_daily_sales từ 90 ngày bán gần nhất ───────────────────────
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
      const { data: recentOrders } = await supabase
        .from('sales_orders')
        .select('id')
        .gte('order_date', ninetyDaysAgo)
        .in('status', ['completed', 'delivering', 'confirmed'])

      const orderIds = (recentOrders ?? []).map((o: { id: string }) => o.id)
      const { data: soItems } = orderIds.length > 0
        ? await supabase
            .from('sales_order_items')
            .select('product_id, quantity, subtotal')
            .in('order_id', orderIds)
        : { data: [] as { product_id: string; quantity: number; subtotal: number }[] }

      const qtyMap: Record<string, number> = {}
      const revenueMap: Record<string, number> = {}
      ;(soItems ?? []).forEach((item: { product_id: string; quantity: number; subtotal: number }) => {
        qtyMap[item.product_id]     = (qtyMap[item.product_id] ?? 0) + (item.quantity ?? 0)
        revenueMap[item.product_id] = (revenueMap[item.product_id] ?? 0) + (item.subtotal ?? 0)
      })

      // ABC từ doanh thu 90 ngày
      const abcMap = classifyABC(
        Object.entries(revenueMap).map(([id, revenue]) => ({ id, revenue }))
      )

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setProducts(prods.map((p: any) => {
        const lead_time_days   = p.supplier?.delivery_days ?? 7
        const avg_daily_sales  = qtyMap[p.id]
          ? Math.round((qtyMap[p.id] / 90) * 10) / 10
          : (p.avg_daily_sales ?? 0)
        return {
          id:             p.id,
          sku:            p.sku,
          name:           p.name,
          category:       p.category?.name ?? '',
          supplier:       p.supplier?.name ?? '',
          supplier_id:    p.supplier_id ?? null,
          unit:           p.unit,
          purchase_price: p.purchase_price ?? 0,
          sale_price:     p.sale_price ?? 0,
          stock:          stockMap[p.id] ?? 0,
          min_stock:      p.min_stock ?? 0,
          expiry_days:    p.expiry_days ?? null,
          status:         p.status ?? 'active',
          created_at:     p.created_at ?? '',
          avg_daily_sales,
          manufacture_date: p.manufacture_date ?? null,
          lead_time_days,
          abc_class:    abcMap[p.id] ?? null,
          safety_stock: calcSafetyStock(avg_daily_sales, lead_time_days),
          rop:          calcROP(avg_daily_sales, lead_time_days),
          eoq:          calcEOQ(avg_daily_sales, p.purchase_price ?? 0),
        }
      }))
    }
    load()
  }, [])

  const [search, setSearch]       = useState('')
  const [category, setCategory]   = useState('all')
  const [abcFilter, setAbcFilter] = useState<AbcClass | 'all'>('all')
  const [page, setPage]           = useState(1)
  const [modal, setModal]         = useState<Product | 'new' | null>(null)

  const categories = ['all', ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))]

  const filtered = products.filter(p => {
    if (category !== 'all' && p.category !== category) return false
    if (abcFilter !== 'all' && p.abc_class !== abcFilter) return false
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.sku.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleSave = async (p: Product) => {
    const isExisting = products.some(x => x.id === p.id)
    if (isExisting) {
      setProducts(prev => prev.map(x => x.id === p.id ? p : x))
      await fetch('/api/products', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: p.id, name: p.name, unit: p.unit,
          purchase_price: p.purchase_price, sale_price: p.sale_price,
          min_stock: p.min_stock, status: p.status,
          supplier_id: p.supplier_id || null,
          avg_daily_sales: p.avg_daily_sales,
        }),
      })
    } else {
      try {
        const res = await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sku: p.sku, name: p.name, unit: p.unit,
            purchase_price: p.purchase_price, sale_price: p.sale_price,
            min_stock: p.min_stock, status: p.status,
            supplier_id: p.supplier_id || null,
            avg_daily_sales: p.avg_daily_sales,
          }),
        })
        if (res.ok) {
          const saved = await res.json()
          setProducts(prev => [{ ...p, id: saved.id }, ...prev])
        } else {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          alert(`Lỗi lưu sản phẩm: ${err.error}`)
        }
      } catch {
        alert('Lỗi kết nối — không thể lưu sản phẩm')
      }
    }
  }

  // ─── Export Excel ──────────────────────────────────────────────────────────
  const exportToExcel = () => {
    const STATUS_LABEL: Record<string, string> = { active: 'Hoạt động', inactive: 'Ngừng bán', pending: 'Chờ duyệt' }
    const rows = filtered.map(p => {
      const days = calcDaysOfStock(p.stock, p.avg_daily_sales)
      const pct  = calcDateElapsedPct(p.manufacture_date, p.expiry_days)
      return {
        'ABC':               p.abc_class ?? '',
        'SKU':               p.sku,
        'Tên sản phẩm':     p.name,
        'Danh mục':         p.category,
        'Nhà cung cấp':     p.supplier,
        'ĐVT':              p.unit,
        'Giá nhập (đ)':     p.purchase_price,
        'Giá bán (đ)':      p.sale_price,
        'Tồn kho':          p.stock,
        'Tồn tối thiểu':    p.min_stock,
        'Safety Stock':     p.safety_stock,
        'ROP':              p.rop,
        'EOQ (đặt tối ưu)': p.eoq,
        'TB xuất/ngày':     p.avg_daily_sales,
        'DOS (ngày tồn)':      days ?? '',
        'HSD (ngày)':          p.expiry_days ?? '',
        'Ngày SX':             p.manufacture_date ?? '',
        '% Còn HSD':           pct != null ? `${pct}%` : '',
        'Trạng thái':       STATUS_LABEL[p.status] ?? p.status,
      }
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 5 }, { wch: 14 }, { wch: 28 }, { wch: 18 }, { wch: 20 }, { wch: 8 },
      { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 },
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 12 },
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sản phẩm')
    XLSX.writeFile(wb, `san-pham_${new Date().toISOString().slice(0, 10).replaceAll('-', '')}.xlsx`)
  }

  // ─── KPI metrics ───────────────────────────────────────────────────────────
  const totalValue = products.reduce((s, p) => s + p.purchase_price * p.stock, 0)
  const outOfStock = products.filter(p => p.stock === 0).length
  const belowROP   = products.filter(p => p.rop > 0 && p.stock > 0 && p.stock <= p.rop).length
  const soonOut    = products.filter(p => {
    const days = calcDaysOfStock(p.stock, p.avg_daily_sales)
    return p.stock > 0 && ((days !== null && days <= 7) || p.stock < p.min_stock)
  }).length
  const nearExpiry = products.filter(p => {
    const pct = calcDateElapsedPct(p.manufacture_date, p.expiry_days) // % còn lại
    return pct !== null && pct <= 25
  }).length

  // ─── Table columns ─────────────────────────────────────────────────────────
  const columns: ColumnDef<Product>[] = [
    { key: 'sku', header: 'SKU / ABC', render: r => (
      <div className="flex items-center gap-1.5">
        <AbcBadge cls={r.abc_class} />
        <span className="text-xs font-mono text-[#0ea5e9]">{r.sku}</span>
      </div>
    )},
    { key: 'name', header: 'Tên sản phẩm', render: r => <span className="text-sm font-medium text-[#1e2a3a]">{r.name}</span> },
    { key: 'category', header: 'Danh mục', render: r => <span className="text-xs text-gray-500">{r.category}</span> },
    { key: 'unit', header: 'ĐVT', render: r => <span className="text-xs text-gray-600">{r.unit}</span> },
    { key: 'purchase_price', header: 'Giá nhập', render: r => <span className="text-xs text-gray-700">{formatVND(r.purchase_price)}</span> },
    { key: 'sale_price', header: 'Giá bán', render: r => <span className="text-xs font-semibold text-[#1e2a3a]">{formatVND(r.sale_price)}</span> },
    { key: 'stock', header: 'Tồn kho', render: r => {
      const level = getAlertLevel({
        stock: r.stock, min_stock: r.min_stock,
        daysOfStock: calcDaysOfStock(r.stock, r.avg_daily_sales),
        dateElapsedPct: calcDateElapsedPct(r.manufacture_date, r.expiry_days),
      })
      return (
        <span className={`text-sm font-bold ${
          level === 'critical' ? 'text-red-500' : level === 'warning' ? 'text-yellow-600' : 'text-green-600'
        }`}>
          {r.stock.toLocaleString('vi-VN')}
        </span>
      )
    }},
    { key: 'rop', header: 'ROP / EOQ',
      tooltip: 'ROP (Điểm đặt hàng lại): khi tồn ≤ ROP thì cần đặt hàng ngay để không bị đứt hàng.\nEOQ: số lượng tối ưu mỗi lần đặt để tối thiểu hoá tổng chi phí đặt hàng + lưu kho.',
      render: r => <RopCell stock={r.stock} rop={r.rop} eoq={r.eoq} unit={r.unit} />,
    },
    { key: 'avg_daily_sales', header: 'DOS',
      tooltip: 'Days of Stock: số ngày tồn kho còn đủ dùng với tốc độ bán hiện tại. VD: DOS = 30 → còn hàng dùng được 30 ngày nữa.',
      render: r => <DaysOfStockBadge stock={r.stock} avgDailySales={r.avg_daily_sales} />,
    },
    { key: 'expiry_days', header: '% Còn HSD', render: r => (
      <DateElapsedBar manufactureDate={r.manufacture_date} expiryDays={r.expiry_days} />
    )},
    { key: 'status', header: 'Trạng thái', render: r => <Badge status={r.status} /> },
    { key: 'id', header: '', render: r => (
      <button onClick={() => setModal(r)}
        className="px-2.5 py-1 text-xs text-gray-500 border border-[#e5e7eb] rounded-lg hover:border-[#0ea5e9] hover:text-[#0ea5e9] transition-colors">
        Sửa
      </button>
    )},
  ]

  return (
    <div>
      <PageHeader title="Sản phẩm" subtitle={`${products.length} sản phẩm trong danh mục`}>
        <ExportButton module="kho-hang" />
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 bg-[#0ea5e9] text-white text-sm font-semibold rounded-lg hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={14} /> Thêm sản phẩm
        </button>
      </PageHeader>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <KpiCard icon={<Package size={18} className="text-blue-600" />} label="Tổng sản phẩm" value={products.length} iconBg="bg-blue-100" />
        <KpiCard label="Giá trị tồn kho" value={formatVND(totalValue)} sub="Tổng giá trị" subColor="green" />
        <KpiCard icon={<TrendingDown size={18} className="text-red-500" />} label="Dưới ROP" value={belowROP} sub="Cần đặt hàng ngay" subColor="red" iconBg="bg-red-100" />
        <KpiCard icon={<Clock size={18} className="text-orange-500" />} label="DOS ≤ 7 ngày" value={soonOut} sub="Sắp hết hàng" subColor="orange" iconBg="bg-orange-100" />
        <KpiCard icon={<AlertTriangle size={18} className="text-yellow-500" />} label="Sắp hết hạn" value={nearExpiry} sub="Còn ≤ 25% HSD" subColor="orange" iconBg="bg-yellow-100" />
        <KpiCard label="Hết hàng" value={outOfStock} sub="Cần nhập ngay" subColor="red" iconBg="bg-red-100" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e5e7eb] flex-wrap">
          <div className="flex items-center gap-2 bg-gray-50 border border-[#e5e7eb] rounded-lg px-3 h-8 flex-1 min-w-[200px] max-w-sm">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input type="text" placeholder="Tìm theo tên, SKU..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="flex-1 text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" />
          </div>
          <select value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}
            className="h-8 px-3 border border-[#e5e7eb] rounded-lg text-xs text-gray-700 bg-white outline-none focus:ring-2 focus:ring-[#0ea5e9]">
            {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'Tất cả danh mục' : c}</option>)}
          </select>

          {/* ABC Filter */}
          <div className="flex items-center gap-1">
            {(['all', 'A', 'B', 'C'] as const).map(cls => (
              <button key={cls} onClick={() => { setAbcFilter(cls); setPage(1) }}
                className={`px-2.5 h-8 text-xs font-semibold rounded-lg transition-all ${
                  abcFilter === cls
                    ? cls === 'A' ? 'bg-green-100 text-green-700 border border-green-300'
                      : cls === 'B' ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
                      : cls === 'C' ? 'bg-gray-100 text-gray-600 border border-gray-300'
                      : 'bg-[#0ea5e9] text-white border border-[#0ea5e9]'
                    : 'border border-[#e5e7eb] text-gray-500 hover:bg-gray-50'
                }`}>
                {cls === 'all' ? 'Tất cả' : `Nhóm ${cls}`}
              </button>
            ))}
          </div>
        </div>

        <DataTable columns={columns} data={filtered} total={filtered.length} page={page} pageSize={10} onPageChange={setPage} selectable keyField="id" />
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 px-1 text-xs text-gray-400 flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-green-400" />ABC A: Top 70% doanh thu — ưu tiên kiểm soát chặt</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-yellow-400" />ABC B: 70–90%</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-gray-300" />ABC C: 90–100%</span>
        <span className="flex items-center gap-1.5 text-red-400">⚠ ROP: Cần đặt hàng khi tồn ≤ điểm này</span>
        <span className="flex items-center gap-1.5 text-sky-500">EOQ: Số lượng đặt tối ưu hoá chi phí</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-green-400" />% Còn HSD ≥ 75%: tốt</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-orange-400" />≤ 25%: sắp hết hạn</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded bg-red-500" />≤ 10%: nguy hiểm</span>
      </div>

      {modal && (
        <ProductFormModal
          product={modal === 'new' ? undefined : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
