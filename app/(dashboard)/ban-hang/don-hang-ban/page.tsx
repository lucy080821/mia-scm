'use client'
import { useState, useEffect, useRef, type JSX } from 'react'
import { Plus, Search, Download, ShoppingCart, Clock, CheckCircle, XCircle, Truck, X, Trash2, ChevronRight, Sparkles, AlertCircle, Pencil, AlertTriangle, Package, Warehouse, MapPin, UserCheck } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import ExportButton from '@/components/ui/ExportButton'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import KpiCard from '@/components/ui/KpiCard'
import OrderActions from '@/components/workflow/OrderActions'
import { formatVND, formatDate } from '@/lib/utils'
import { STATUS_LABELS, STATUS_BADGE, type OrderStatus, type UserRole } from '@/lib/workflow/orderStateMachine'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'
import { useOrdersRealtime } from '@/hooks/useOrdersRealtime'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import WorkflowBanner from '@/components/workflow/WorkflowBanner'

interface OrderItem { product_id: string; name: string; unit: string; quantity: number; unit_price: number; quy_cach?: string }
interface OrderPendingAction {
  type: 'create' | 'edit' | 'delete'
  payload?: { customer: string; items: OrderItem[]; total: number; delivery_date: string }
}
interface Order {
  id: string; code: string; customer: string; items: OrderItem[]
  total: number; payment_status: string; status: OrderStatus
  assigned: string; date: string; delivery_date: string
  pendingAction?: OrderPendingAction
}

const INITIAL_ORDERS: Order[] = []

const fmtAmt = (s: number) => {
  if (s <= 0) return '—'
  if (s >= 1_000_000) return (s / 1_000_000).toFixed(1) + 'M'
  if (s >= 1_000) return Math.round(s / 1_000) + 'k'
  return s + 'đ'
}

// ─── Searchable Combobox ──────────────────────────────────────────────────────
interface ModalCustomer { id: string; code: string; name: string; address?: string; phone?: string; credit_limit: number; current_debt: number }
interface ModalProduct  { id: string; sku: string; name: string; unit: string; sale_price: number }

function SearchableCombobox<T extends { id: string; name: string }>({
  items, selectedId, onSelect, placeholder, loading = false, getSearchText, renderOption,
}: {
  items: T[]; selectedId: string; onSelect: (item: T | null) => void
  placeholder: string; loading?: boolean
  getSearchText: (item: T) => string
  renderOption: (item: T) => JSX.Element
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = items.find(i => i.id === selectedId) ?? null

  const filtered = query
    ? items.filter(i => getSearchText(i).toLowerCase().includes(query.toLowerCase())).slice(0, 30)
    : items.slice(0, 30)

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div
        onClick={() => { setOpen(true); setQuery(''); setTimeout(() => inputRef.current?.focus(), 0) }}
        className={`w-full h-9 px-2.5 text-sm border rounded-lg bg-white flex items-center gap-1.5 transition-colors ${open ? 'border-[var(--mia-primary)]' : 'border-[#e5e7eb]'}`}
      >
        <Search size={12} className="text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          value={open ? query : (selected ? selected.name : '')}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setOpen(true); setQuery('') }}
          placeholder={open ? (selected ? selected.name : placeholder) : placeholder}
          className="flex-1 outline-none text-sm bg-transparent min-w-0 placeholder:text-gray-400"
        />
        {selected && (
          <button type="button" onClick={e => { e.stopPropagation(); onSelect(null); setQuery('') }}
            className="shrink-0 text-gray-300 hover:text-red-400 transition-colors"><X size={12} /></button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#e5e7eb] rounded-xl shadow-xl z-[200] max-h-56 overflow-y-auto">
          {loading ? (
            <p className="px-3 py-4 text-xs text-gray-400 text-center">Đang tải...</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-4 text-xs text-gray-400 text-center">Không tìm thấy kết quả</p>
          ) : filtered.map(item => (
            <button key={item.id} type="button"
              onClick={() => { onSelect(item); setOpen(false); setQuery('') }}
              className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0 ${item.id === selectedId ? 'bg-blue-50' : ''}`}>
              {renderOption(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Tạo đơn Modal ────────────────────────────────────────────────────────────
type CreateOrderPayload = Omit<Order, 'id' | 'code' | 'assigned'> & { customer_id: string; note: string }

// Helpers chuyển đổi ngày dd/mm/yyyy ↔ yyyy-mm-dd
function toISO(dmy: string) {
  const [d, m, y] = dmy.split('/')
  if (!d || !m || !y || y.length !== 4) return ''
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}
function fromISO(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function autoSlash(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

type CreateOrderPrefill = {
  items?: { product_id: string; quantity: number; unit_price: number }[]
  note?: string
  deliveryDate?: string // ISO yyyy-mm-dd
}

function CreateOrderModal({ onClose, onCreate, prefill }: {
  onClose: () => void
  onCreate: (o: CreateOrderPayload) => void
  prefill?: CreateOrderPrefill
}) {
  const { id: tenantId } = useTenant()
  const [customerId, setCustomerId] = useState('')
  const defaultISO = prefill?.deliveryDate ?? new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const [deliveryDate, setDeliveryDate] = useState(defaultISO)
  const [deliveryDisplay, setDeliveryDisplay] = useState(fromISO(defaultISO))

  const handleDeliveryChange = (val: string) => {
    const formatted = autoSlash(val)
    setDeliveryDisplay(formatted)
    setDeliveryDate(toISO(formatted))
  }
  const [items, setItems] = useState<{ product_id: string; quantity: number; unit_price: number; quy_cach: string }[]>(
    prefill?.items?.length
      ? prefill.items.map(it => ({ ...it, quy_cach: '' }))
      : [{ product_id: '', quantity: 1, unit_price: 0, quy_cach: '' }]
  )
  const [note, setNote] = useState(prefill?.note ?? '')
  const [customers, setCustomers] = useState<ModalCustomer[]>([])
  const [products, setProducts]   = useState<ModalProduct[]>([])
  const [loadingC, setLoadingC]   = useState(false)
  const [loadingP, setLoadingP]   = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    setLoadingC(true)
    supabase.from('customers').select('id, code, name, address, phone, credit_limit').eq('tenant_id', tenantId).eq('status', 'active').order('name').limit(300)
      .then(({ data }) => { setCustomers((data ?? []).map(c => ({ ...c, current_debt: 0 }))); setLoadingC(false) })
    setLoadingP(true)
    supabase.from('products').select('id, sku, name, unit, sale_price').eq('tenant_id', tenantId).eq('status', 'active').order('name').limit(300)
      .then(({ data }) => { setProducts(data ?? []); setLoadingP(false) })
  }, [tenantId])

  const addItem    = () => setItems(prev => [...prev, { product_id: '', quantity: 1, unit_price: 0, quy_cach: '' }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: string, val: string | number) => {
    setItems(prev => {
      const next = [...prev]
      if (field === 'product_id') {
        const p = products.find(p => p.id === val)
        next[i] = { ...next[i], product_id: val as string, unit_price: p?.sale_price ?? 0 }
      } else {
        next[i] = { ...next[i], [field]: val }
      }
      return next
    })
  }

  const total    = items.reduce((s, it) => s + it.quantity * it.unit_price, 0)
  const customer = customers.find(c => c.id === customerId)
  const newDebt  = customer ? customer.current_debt + total : 0
  const creditExceeded = customer ? newDebt > customer.credit_limit && customer.credit_limit > 0 : false
  const creditWarning  = customer ? newDebt > customer.credit_limit * 0.85 && !creditExceeded && customer.credit_limit > 0 : false

  const handleSubmit = () => {
    if (!customerId || !deliveryDate || items.some(it => !it.product_id)) return
    const orderItems: OrderItem[] = items.map(it => {
      const p = products.find(p => p.id === it.product_id)!
      return { product_id: it.product_id, name: p.name, unit: p.unit, quantity: it.quantity, unit_price: it.unit_price, quy_cach: it.quy_cach || undefined }
    })
    onCreate({
      customer_id: customerId,
      customer: customer!.name, items: orderItems, total,
      payment_status: 'unpaid', status: 'new',
      date: new Date().toISOString().slice(0, 10), delivery_date: deliveryDate,
      note,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-base font-bold text-[#1e2a3a]">Tạo đơn hàng mới</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Khách hàng + ngày giao */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Khách hàng *</label>
              <SearchableCombobox<ModalCustomer>
                items={customers}
                selectedId={customerId}
                onSelect={c => setCustomerId(c?.id ?? '')}
                placeholder="Tìm tên, mã, SĐT, địa chỉ..."
                loading={loadingC}
                getSearchText={c => `${c.name} ${c.code} ${c.phone ?? ''} ${c.address ?? ''}`}
                renderOption={c => (
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[#1e2a3a] truncate">{c.name}</span>
                      <span className="text-[10px] font-mono bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded shrink-0">{c.code}</span>
                    </div>
                    {(c.address || c.phone) && (
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">{c.address || c.phone}</p>
                    )}
                  </div>
                )}
              />
              {/* Info chip khi đã chọn KH */}
              {customer && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="font-mono bg-sky-50 text-sky-700 border border-sky-100 px-1.5 py-0.5 rounded">{customer.code}</span>
                  {customer.phone && <span className="text-gray-500">📞 {customer.phone}</span>}
                  {customer.address && <span className="text-gray-500 truncate max-w-[200px]">📍 {customer.address}</span>}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ngày giao dự kiến *</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="dd/mm/yyyy"
                value={deliveryDisplay}
                onChange={e => handleDeliveryChange(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg bg-white text-gray-700 outline-none focus:border-[var(--mia-primary)]"
              />
            </div>
          </div>

          {/* Credit limit info */}
          {customer && customer.credit_limit > 0 && (
            <div className={`rounded-xl p-3 border text-xs ${creditExceeded ? 'bg-red-50 border-red-300' : creditWarning ? 'bg-yellow-50 border-yellow-300' : 'bg-green-50 border-green-200'}`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`font-semibold ${creditExceeded ? 'text-red-700' : creditWarning ? 'text-yellow-700' : 'text-green-700'}`}>
                  {creditExceeded ? '⛔ Vượt hạn mức tín dụng' : creditWarning ? '⚠️ Gần đến hạn mức' : '✅ Trong hạn mức tín dụng'}
                </span>
                <span className="text-gray-500">Hạn mức: <b>{(customer.credit_limit / 1e6).toFixed(0)}tr đ</b></span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-1.5">
                <div className={`h-1.5 rounded-full ${creditExceeded ? 'bg-red-500' : creditWarning ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min((newDebt / customer.credit_limit) * 100, 100)}%` }} />
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Dư nợ hiện tại: {(customer.current_debt / 1e6).toFixed(0)}tr đ</span>
                <span>Sau đơn này: <b className={creditExceeded ? 'text-red-600' : 'text-gray-700'}>{(newDebt / 1e6).toFixed(0)}tr đ</b></span>
              </div>
            </div>
          )}

          {/* Danh sách sản phẩm */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500">Sản phẩm *</label>
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-[var(--mia-primary)] hover:text-[#0284c7] font-medium transition-colors">
                <Plus size={12} /> Thêm dòng
              </button>
            </div>
            {/* Header — chỉ cho hàng 2 (fields con) */}
            <div className="grid grid-cols-12 gap-3 px-2 mb-1">
              <span className="col-span-6 text-xs text-gray-400">Sản phẩm</span>
              <span className="col-span-1 text-xs text-gray-400 text-center">SL</span>
              <span className="col-span-2 text-xs text-gray-400">Quy cách</span>
              <span className="col-span-2 text-xs text-gray-400 text-right">Đơn giá / Thành tiền</span>
              <span className="col-span-1" />
            </div>
            <div className="space-y-2">
              {items.map((it, i) => {
                const p = products.find(prod => prod.id === it.product_id)
                const subtotal = it.quantity * it.unit_price
                const fmtNum = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ'
                return (
                  <div key={i} className="bg-gray-50 rounded-xl px-3 py-2.5 space-y-2">
                    {/* Hàng 1: số thứ tự + tên sản phẩm */}
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-[#e5e7eb] text-[10px] font-bold text-gray-500">{i + 1}</span>
                      <div className="flex-1">
                    <SearchableCombobox<ModalProduct>
                      items={products}
                      selectedId={it.product_id}
                      onSelect={prod => updateItem(i, 'product_id', prod?.id ?? '')}
                      placeholder="Tìm tên hoặc mã sản phẩm..."
                      loading={loadingP}
                      getSearchText={prod => `${prod.name} ${prod.sku}`}
                      renderOption={prod => (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-[#1e2a3a] truncate">{prod.name}</p>
                            <p className="text-[10px] text-gray-400">{prod.sku} · {prod.unit}</p>
                          </div>
                          <span className="text-xs text-sky-600 font-semibold shrink-0">{formatVND(prod.sale_price)}</span>
                        </div>
                      )}
                    />
                      </div>
                    </div>
                    {/* Hàng 2: SL + quy cách + giá + thành tiền + xóa */}
                    <div className="grid grid-cols-12 gap-3 items-center">
                      <input type="number" min={1} value={it.quantity} onChange={e => updateItem(i, 'quantity', +e.target.value)}
                        className="col-span-1 h-7 px-1 text-xs border border-[#e5e7eb] rounded-lg bg-white text-center outline-none focus:border-[var(--mia-primary)]" />
                      <input type="text" value={it.quy_cach} onChange={e => updateItem(i, 'quy_cach', e.target.value)}
                        placeholder="Quy cách..."
                        className="col-span-2 h-7 px-2 text-xs border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-[var(--mia-primary)] placeholder:text-gray-300" />
                      <div className="col-span-4 text-right text-xs text-gray-500">
                        {it.unit_price > 0 ? fmtNum(it.unit_price) : '—'}
                      </div>
                      <div className="col-span-4 text-right">
                        <span className={`text-xs font-semibold ${subtotal > 0 ? 'text-[#1e2a3a]' : 'text-gray-300'}`}>
                          {subtotal > 0 ? fmtNum(subtotal) : '—'}
                        </span>
                      </div>
                      <button onClick={() => removeItem(i)} className="col-span-1 flex justify-center text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Ghi chú */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ghi chú</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
              placeholder="Yêu cầu đặc biệt, hướng dẫn giao hàng..."
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg bg-white text-gray-700 outline-none focus:border-[var(--mia-primary)] resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#e5e7eb] bg-gray-50 rounded-b-2xl">
          <div>
            <span className="text-xs text-gray-400">Tổng cộng</span>
            <p className="text-lg font-bold text-[var(--mia-primary)]">{formatVND(total)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Hủy bỏ</Button>
            <Button size="sm" onClick={handleSubmit} disabled={!customerId || !deliveryDate || items.some(it => !it.product_id) || creditExceeded}
              title={creditExceeded ? 'Không thể tạo đơn: khách hàng đã vượt hạn mức tín dụng' : undefined}>
              {creditExceeded ? '⛔ Vượt hạn mức' : 'Tạo đơn hàng'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AI Parse Order Modal ─────────────────────────────────────────────────────

type ParsedItem = { name: string; qty: number; unit: string; product_id: string; unit_price: number }
type ParseResult = { items: ParsedItem[]; deliveryNote: string; customerHint: string; confidence: number }

async function parseOrderFromAPI(text: string): Promise<ParseResult> {
  const res = await fetch('/api/ai/parse-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error('AI không thể phân tích tin nhắn này')
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return {
    items: (data.items ?? []).map((it: any) => ({
      product_id: it.product_id,
      name: it.product_name,
      unit: it.unit,
      qty: it.qty,
      unit_price: it.unit_price,
    })),
    deliveryNote: data.delivery_note ?? '',
    customerHint: data.customer_hint ?? '',
    confidence: data.overall_confidence ?? 70,
  }
}

const EXAMPLE_TEXT = `Anh ơi cho em 500L SN150 và 200kg phụ gia A nha, giao thứ 3 tuần này. Cảm ơn anh nhiều!`

function ParseOrderModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (items: ParsedItem[], note: string) => void
}) {
  const [text, setText] = useState('')
  const [result, setResult] = useState<ParseResult | null>(null)
  const [parsing, setParsing] = useState(false)

  const handleParse = async () => {
    if (!text.trim()) return
    setParsing(true)
    try {
      const parsed = await parseOrderFromAPI(text)
      setResult(parsed)
    } catch (err: any) {
      setResult({ items: [], deliveryNote: '', customerHint: '', confidence: 0 })
      alert('Lỗi AI: ' + (err.message ?? 'Không thể phân tích tin nhắn'))
    } finally {
      setParsing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a] flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--mia-primary)]" /> AI Parse đơn từ tin nhắn
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Dán tin nhắn Zalo/chat → AI tự tạo đơn hàng</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-500">Nội dung tin nhắn</label>
              <button onClick={() => setText(EXAMPLE_TEXT)} className="text-[11px] text-[var(--mia-primary)] hover:underline">
                Dùng ví dụ
              </button>
            </div>
            <textarea value={text} onChange={e => { setText(e.target.value); setResult(null) }} rows={5}
              placeholder={'Ví dụ:\n"Anh ơi cho em 500L SN150 và 200 phụ gia A nha, giao thứ 3 nhé"'}
              className="w-full px-3 py-2.5 text-sm border border-[#e5e7eb] rounded-xl outline-none focus:border-[var(--mia-primary)] resize-none font-mono" />
          </div>

          {!result && (
            <button onClick={handleParse} disabled={!text.trim() || parsing}
              className="w-full py-2.5 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2">
              {parsing ? <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                AI đang phân tích...
              </> : <>
                <Sparkles size={14} /> Phân tích tin nhắn
              </>}
            </button>
          )}

          {result && (
            <div className="space-y-3">
              {/* Confidence */}
              <div className={`rounded-xl p-3 border text-xs flex items-center gap-2 ${result.confidence >= 80 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-yellow-50 border-yellow-200 text-yellow-700'}`}>
                {result.confidence >= 80
                  ? <CheckCircle size={14} />
                  : <AlertCircle size={14} />}
                <span>Độ tin cậy phân tích: <b>{result.confidence}%</b>{result.confidence < 80 ? ' — Kiểm tra lại trước khi tạo đơn' : ''}</span>
              </div>

              {/* Parsed items */}
              {result.items.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Sản phẩm được nhận diện:</p>
                  <div className="space-y-2">
                    {result.items.map((it, i) => (
                      <div key={i} className="flex items-center justify-between bg-blue-50 rounded-xl px-3 py-2.5 border border-blue-100">
                        <div>
                          <p className="text-xs font-semibold text-[#1e2a3a]">{it.name}</p>
                          <p className="text-[11px] text-gray-500">{it.qty} {it.unit} × {(it.unit_price/1000).toFixed(0)}k = {((it.qty * it.unit_price)/1e6).toFixed(1)}tr đ</p>
                        </div>
                        <span className="text-xs font-bold text-[var(--mia-primary)]">{it.qty} {it.unit}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2.5 text-xs text-yellow-700">
                  Không nhận diện được sản phẩm nào. Thử sử dụng tên sản phẩm chính xác hơn.
                </div>
              )}

              {result.deliveryNote && (
                <div className="text-xs text-gray-500">📅 Giao hàng: <b className="text-[#1e2a3a]">{result.deliveryNote}</b></div>
              )}
              {result.customerHint && (
                <div className="text-xs text-gray-500">👤 Gợi ý khách hàng: <b className="text-[#1e2a3a]">{result.customerHint}</b></div>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => setResult(null)} className="flex-1 py-2 text-sm border border-[#e5e7eb] text-gray-600 rounded-xl hover:bg-gray-50 transition-colors">
                  Thử lại
                </button>
                <button onClick={() => result.items.length > 0 && (onCreate(result.items, result.deliveryNote), onClose())}
                  disabled={result.items.length === 0}
                  className="flex-1 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all">
                  Tạo đơn từ kết quả
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Chi tiết đơn Drawer ──────────────────────────────────────────────────────
function OrderDetailDrawer({ order, onClose, onTransition, role }: {
  order: Order; onClose: () => void
  onTransition: (id: string, to: OrderStatus, action: string) => void
  role?: UserRole
}) {
  const { id: tenantId } = useTenant()
  const [tab, setTab] = useState<'order' | 'warehouse' | 'logistics'>('order')
  const [stockIssue, setStockIssue] = useState<any>(null)
  const [delivery, setDelivery] = useState<any>(null)
  const [loadingExtra, setLoadingExtra] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoadingExtra(true)
      const [siRes, { data: dv }] = await Promise.all([
        fetch(`/api/stock-issues?sales_order_id=${order.id}`).then(r => r.json()),
        supabase.from('deliveries')
          .select('id, code, route, planned_date, actual_date, freight_cost, status, carrier_type, distance_km, vehicle:vehicles(plate, type, brand), driver:drivers(name, phone, license_type, rating)')
          .eq('tenant_id', tenantId)
          .eq('sales_order_id', order.id)
          .maybeSingle(),
      ])
      setStockIssue(Array.isArray(siRes) ? (siRes[0] ?? null) : null)
      setDelivery(dv)
      setLoadingExtra(false)
    }
    load()
  }, [order.id])

  const TABS = [
    { key: 'order',     label: 'Đơn hàng', icon: <ShoppingCart size={13} /> },
    { key: 'warehouse', label: 'Kho',       icon: <Warehouse size={13} /> },
    { key: 'logistics', label: 'Vận chuyển', icon: <Truck size={13} /> },
  ] as const

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1" />
      <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-sm font-bold text-[#1e2a3a]">{order.code}</h2>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${STATUS_BADGE[order.status]}`}>
              {STATUS_LABELS[order.status]}
            </span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#e5e7eb] px-4">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-[var(--mia-primary)] text-[var(--mia-primary)]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* ── Tab: Đơn hàng ── */}
          {tab === 'order' && <>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <Row label="Khách hàng" value={order.customer} bold />
              <Row label="Ngày đặt" value={formatDate(order.date)} />
              <Row label="Ngày giao dự kiến" value={formatDate(order.delivery_date)} />
              <Row label="Phụ trách" value={order.assigned} />
              <Row label="Thanh toán" value={<Badge status={order.payment_status} />} />
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Sản phẩm</h3>
              <div className="space-y-2">
                {order.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-xs font-medium text-[#1e2a3a]">{it.name}</p>
                      <p className="text-[10px] text-gray-400">{it.quantity} {it.unit} × {formatVND(it.unit_price)}</p>
                    </div>
                    <span className="text-xs font-semibold text-[#1e2a3a]">{formatVND(it.quantity * it.unit_price)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between items-center bg-[#f0f9ff] rounded-xl px-4 py-3">
              <span className="text-sm font-medium text-[#1e2a3a]">Tổng cộng</span>
              <span className="text-base font-bold text-[var(--mia-primary)]">{formatVND(order.total)}</span>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Tiến trình</h3>
              <OrderTimeline status={order.status} />
            </div>
          </>}

          {/* ── Tab: Kho hàng ── */}
          {tab === 'warehouse' && (
            loadingExtra ? (
              <p className="text-xs text-gray-400 text-center py-10">Đang tải...</p>
            ) : !stockIssue ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
                <Warehouse size={32} className="text-gray-300" />
                <p className="text-sm">Chưa có phiếu xuất kho</p>
                <p className="text-xs text-gray-300">Kho chưa xử lý đơn này</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Warehouse size={16} className="text-green-600" />
                    <span className="text-sm font-bold text-green-800">Phiếu xuất kho</span>
                    <Badge status={stockIssue.status} className="ml-auto" />
                  </div>
                  <div className="space-y-2">
                    <Row label="Mã phiếu"    value={stockIssue.code} bold />
                    <Row label="Kho xuất"    value={`${stockIssue.warehouse?.name ?? '—'} (${stockIssue.warehouse?.code ?? ''})`} />
                    <Row label="Ngày xuất"   value={stockIssue.issue_date ? formatDate(stockIssue.issue_date) : '—'} />
                    <Row label="Nhân viên"   value={stockIssue.created_by?.full_name ?? '—'} />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Thông tin đơn hàng</h3>
                  <Row label="Ngày đặt hàng" value={formatDate(order.date)} />
                  <Row label="Ngày giao dự kiến" value={formatDate(order.delivery_date)} />
                  {stockIssue.issue_date && (
                    <Row label="Xuất kho"
                      value={`${Math.ceil((new Date(stockIssue.issue_date).getTime() - new Date(order.date).getTime()) / 86400000)} ngày sau đặt hàng`} />
                  )}
                </div>
              </div>
            )
          )}

          {/* ── Tab: Vận chuyển ── */}
          {tab === 'logistics' && (
            loadingExtra ? (
              <p className="text-xs text-gray-400 text-center py-10">Đang tải...</p>
            ) : !delivery ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
                <Truck size={32} className="text-gray-300" />
                <p className="text-sm">Chưa có đơn vận chuyển</p>
                <p className="text-xs text-gray-300">Logistics chưa phân xe cho đơn này</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Truck size={16} className="text-blue-600" />
                    <span className="text-sm font-bold text-blue-800">{delivery.code}</span>
                    <Badge status={delivery.status} className="ml-auto" />
                  </div>
                  <div className="space-y-2">
                    <Row label="Tuyến đường"   value={delivery.route ?? '—'} />
                    <Row label="Ngày giao KH"  value={delivery.planned_date ? formatDate(delivery.planned_date) : '—'} />
                    <Row label="Giao thực tế"  value={delivery.actual_date ? formatDate(delivery.actual_date) : '—'} />
                    <Row label="Quãng đường"   value={delivery.distance_km ? `${delivery.distance_km} km` : '—'} />
                    <Row label="Phí vận chuyển" value={formatVND(Number(delivery.freight_cost ?? 0))} />
                    <Row label="Đơn vị VC"     value={delivery.carrier_type === 'own' ? 'Xe nhà' : delivery.carrier_type?.toUpperCase() ?? '—'} />
                  </div>
                </div>

                {delivery.driver && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <UserCheck size={14} className="text-gray-500" />
                      <h3 className="text-xs font-semibold text-gray-500 uppercase">Tài xế</h3>
                    </div>
                    <Row label="Họ tên"       value={delivery.driver.name} bold />
                    <Row label="Số điện thoại" value={delivery.driver.phone ?? '—'} />
                    <Row label="Bằng lái"     value={delivery.driver.license_type ?? '—'} />
                    {delivery.driver.rating && <Row label="Đánh giá" value={`★ ${delivery.driver.rating}`} />}
                  </div>
                )}

                {delivery.vehicle && (
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <MapPin size={14} className="text-gray-500" />
                      <h3 className="text-xs font-semibold text-gray-500 uppercase">Phương tiện</h3>
                    </div>
                    <Row label="Biển số"   value={delivery.vehicle.plate} bold />
                    <Row label="Loại xe"   value={delivery.vehicle.type ?? '—'} />
                    <Row label="Thương hiệu" value={delivery.vehicle.brand ?? '—'} />
                  </div>
                )}
              </div>
            )
          )}
        </div>

        <div className="px-5 py-4 border-t border-[#e5e7eb]">
          <OrderActions orderId={order.id} status={order.status} role={role} onTransition={onTransition} />
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: React.ReactNode; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-xs ${bold ? 'font-semibold text-[#1e2a3a]' : 'text-gray-700'}`}>{value}</span>
    </div>
  )
}

const TIMELINE_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'new', label: 'Mới' },
  { status: 'confirmed', label: 'Xác nhận' },
  { status: 'picking', label: 'Soạn hàng' },
  { status: 'picked', label: 'Xuất kho' },
  { status: 'pending_ship', label: 'Chờ giao' },
  { status: 'delivering', label: 'Đang giao' },
  { status: 'completed', label: 'Hoàn thành' },
]

const ORDER_IDX: Record<string, number> = Object.fromEntries(TIMELINE_STEPS.map((s, i) => [s.status, i]))

function OrderTimeline({ status }: { status: OrderStatus }) {
  if (status === 'cancelled' || status === 'failed') {
    return (
      <div className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2">
        <XCircle size={14} className="text-red-500" />
        <span className="text-xs text-red-600 font-medium">{STATUS_LABELS[status]}</span>
      </div>
    )
  }
  const current = ORDER_IDX[status] ?? 0
  return (
    <div className="flex items-center gap-1">
      {TIMELINE_STEPS.map((step, i) => {
        const done = i <= current
        return (
          <div key={step.status} className="flex items-center flex-1">
            <div className={`flex flex-col items-center flex-1 min-w-0`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${done ? 'bg-[var(--mia-primary)] text-white' : 'bg-gray-200 text-gray-400'}`}>
                {i + 1}
              </div>
              <span className={`text-[9px] mt-0.5 text-center leading-tight ${done ? 'text-[var(--mia-primary)] font-medium' : 'text-gray-400'}`}>{step.label}</span>
            </div>
            {i < TIMELINE_STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 mb-3 ${i < current ? 'bg-[var(--mia-primary)]' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Edit Order Modal ─────────────────────────────────────────────────────────
function EditOrderModal({ order, onClose, onSave }: {
  order: Order
  onClose: () => void
  onSave: (id: string, payload: OrderPendingAction['payload']) => void
}) {
  const { id: tenantId } = useTenant()
  const [deliveryDate, setDeliveryDate] = useState(order.delivery_date)
  const [items, setItems] = useState(order.items.map(it => ({ ...it })))
  const [products, setProducts] = useState<ModalProduct[]>([])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    supabase.from('products').select('id, sku, name, unit, sale_price').eq('tenant_id', tenantId).eq('status', 'active').order('name').limit(300)
      .then(({ data }) => setProducts(data ?? []))
  }, [tenantId])

  const addItem = () => setItems(prev => [...prev, { product_id: '', name: '', unit: '', quantity: 1, unit_price: 0 }])
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))
  const updateItem = (i: number, field: string, val: string | number) => {
    setItems(prev => {
      const next = [...prev]
      if (field === 'product_id') {
        const p = products.find(p => p.id === val)
        next[i] = { ...next[i], product_id: val as string, name: p?.name ?? '', unit: p?.unit ?? '', unit_price: p?.sale_price ?? 0 }
      } else {
        next[i] = { ...next[i], [field]: val }
      }
      return next
    })
  }

  const total = items.reduce((s, it) => s + it.quantity * it.unit_price, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Yêu cầu sửa — {order.code}</h2>
            <p className="text-xs text-yellow-600 mt-0.5">Thay đổi sẽ chờ admin duyệt trước khi có hiệu lực</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ngày giao dự kiến</label>
            <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500">Sản phẩm</label>
              <button onClick={addItem} className="flex items-center gap-1 text-xs text-[var(--mia-primary)] hover:text-[#0284c7] font-medium"><Plus size={12} />Thêm dòng</button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center bg-gray-50 rounded-lg px-2 py-2">
                  <select value={it.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)}
                    className="col-span-5 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-[var(--mia-primary)]">
                    <option value="">-- Chọn SP --</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" min={1} value={it.quantity} onChange={e => updateItem(i, 'quantity', +e.target.value)}
                    className="col-span-2 h-8 px-2 text-xs border border-[#e5e7eb] rounded-lg bg-white text-center outline-none focus:border-[var(--mia-primary)]" />
                  <span className="col-span-3 text-xs text-gray-500 text-right">{(it.quantity * it.unit_price / 1e6).toFixed(1)}M</span>
                  <button onClick={() => removeItem(i)} className="col-span-1 flex justify-center text-gray-300 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-between items-center px-6 py-4 border-t border-[#e5e7eb] bg-gray-50 rounded-b-2xl">
          <span className="text-sm font-bold text-[var(--mia-primary)]">{formatVND(total)}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-100 transition-colors">Hủy</button>
            <button onClick={() => onSave(order.id, { customer: order.customer, items, total, delivery_date: deliveryDate })}
              className="px-5 py-2 bg-yellow-500 text-white text-sm font-semibold rounded-lg hover:bg-yellow-600 hover:scale-[1.02] active:scale-95 transition-all">
              <Pencil size={13} className="inline mr-1.5" />Gửi yêu cầu sửa
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Warehouse Select Modal ───────────────────────────────────────────────────
function WarehouseSelectModal({ warehouses, onClose, onConfirm }: {
  warehouses: { id: string; name: string; code: string }[]
  onClose: () => void
  onConfirm: (warehouseId: string) => void
}) {
  const [selectedId, setSelectedId] = useState(warehouses[0]?.id ?? '')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-[#1e2a3a]">Chọn kho xuất hàng</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-gray-500">Chọn kho sẽ xử lý đơn hàng này:</p>
          {warehouses.length === 0 ? (
            <p className="text-sm text-red-500">Chưa có kho nào đang hoạt động.</p>
          ) : (
            <div className="space-y-2">
              {warehouses.map(w => (
                <label key={w.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-sky-400 hover:bg-sky-50 transition-colors cursor-pointer">
                  <input
                    type="radio"
                    name="warehouse"
                    value={w.id}
                    checked={selectedId === w.id}
                    onChange={() => setSelectedId(w.id)}
                    className="accent-sky-500"
                  />
                  <div>
                    <p className="text-sm font-semibold text-[#1e2a3a]">{w.name}</p>
                    <p className="text-xs text-gray-400">{w.code}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">Hủy</button>
          <button
            onClick={() => selectedId && onConfirm(selectedId)}
            disabled={!selectedId || warehouses.length === 0}
            className="px-4 py-2 text-sm rounded-lg bg-[var(--mia-primary)] text-white font-semibold hover:bg-sky-600 transition-colors disabled:opacity-40"
          >
            Xác nhận & Tạo phiếu xuất
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SalesOrdersPage() {
  const { id: tenantId } = useTenant()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS)
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [showCreate, setShowCreate] = useState(false)
  const [showParse, setShowParse] = useState(false)
  const [parsePrefill, setParsePrefill] = useState<CreateOrderPrefill | undefined>()
  const [selected, setSelected] = useState<Order | null>(null)
  const [editTarget, setEditTarget] = useState<Order | null>(null)
  const [toast, setToast] = useState('')
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }
  const [warehouseModal, setWarehouseModal] = useState<{ orderId: string } | null>(null)
  const [warehouses, setWarehouses] = useState<{ id: string; name: string; code: string }[]>([])
  const PAGE_SIZE = 8

  const userRole = (user?.role ?? 'sales') as UserRole

  const loadOrders = async () => {
    setLoadingOrders(true)
    try {
      const res = await fetch('/api/sales-orders')
      if (res.ok) {
        const data = await res.json()
        const mapped: Order[] = data.map((o: any) => ({
          id: o.id,
          code: o.code,
          customer: o.customer?.name ?? '—',
          items: (o.items ?? []).map((it: any) => ({
            product_id: it.product_id,
            name: it.product?.name ?? '—',
            unit: it.product?.unit ?? '',
            quantity: it.quantity,
            unit_price: it.unit_price,
          })),
          total: o.final_amount ?? o.total_amount ?? 0,
          payment_status: o.payment_status ?? 'unpaid',
          status: o.status as OrderStatus,
          assigned: o.assigned?.full_name ?? '—',
          date: o.order_date,
          delivery_date: o.delivery_date ?? '',
        }))
        setOrders(mapped)
      }
    } finally {
      setLoadingOrders(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    loadOrders()
    supabase.from('warehouses').select('id, name, code').eq('tenant_id', tenantId).eq('status', 'active').order('name')
      .then(({ data }) => { if (data) setWarehouses(data) })
  }, [tenantId])

  useOrdersRealtime(loadOrders)
  useAutoRefresh(loadOrders, 15_000)

  const filtered = orders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false
    if (search && !o.code.toLowerCase().includes(search.toLowerCase()) && !o.customer.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)

  const handleCreate = async (data: CreateOrderPayload) => {
    setShowCreate(false)
    try {
      const res = await fetch('/api/sales-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: data.customer_id,
          order_date: data.date,
          delivery_date: data.delivery_date,
          note: data.note,
          items: data.items.map(it => ({
            product_id: it.product_id,
            quantity: it.quantity,
            unit_price: it.unit_price,
          })),
        }),
      })
      if (res.ok) {
        const result = await res.json()
        showToast(`✓ Đã tạo đơn hàng ${result.code}`)
        await loadOrders()
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        showToast(`Lỗi tạo đơn: ${err.error}`)
      }
    } catch (e) {
      showToast('Lỗi kết nối — không thể lưu đơn hàng')
    }
  }

  const handleEditRequest = (id: string, payload: OrderPendingAction['payload']) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, pendingAction: { type: 'edit', payload } } : o))
    showToast('Đã gửi yêu cầu sửa — chờ admin duyệt')
    setEditTarget(null)
  }

  const handleDeleteRequest = (id: string) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, pendingAction: { type: 'delete' } } : o))
    showToast('Đã gửi yêu cầu xóa — chờ admin duyệt')
  }

  const handleApprovePending = (id: string) => {
    setOrders(prev => prev.flatMap(o => {
      if (o.id !== id || !o.pendingAction) return [o]
      const { type, payload } = o.pendingAction
      if (type === 'delete') return []
      if (type === 'edit' && payload) return [{ ...o, ...payload, pendingAction: undefined }]
      return [{ ...o, pendingAction: undefined }]
    }))
    showToast('Đã duyệt thay đổi')
  }

  const handleRejectPending = (id: string) => {
    setOrders(prev => prev.flatMap(o => {
      if (o.id !== id || !o.pendingAction) return [o]
      if (o.pendingAction.type === 'create') return []
      return [{ ...o, pendingAction: undefined }]
    }))
    showToast('Đã từ chối thay đổi')
  }

  const handleCreateFromParse = (parsedItems: ParsedItem[], deliveryNote: string) => {
    // Đóng parse modal, mở create modal với data điền sẵn để user review
    setParsePrefill({
      items: parsedItems.map(it => ({
        product_id: it.product_id,
        quantity: it.qty,
        unit_price: it.unit_price,
      })),
      note: deliveryNote,
      deliveryDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    })
    setShowParse(false)
    setShowCreate(true)
  }

  const handleTransition = async (orderId: string, to: OrderStatus, _action: string) => {
    if (to === 'confirmed') {
      setWarehouseModal({ orderId })
      return
    }
    await doTransition(orderId, to)
  }

  const isUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  const doTransition = async (orderId: string, to: OrderStatus, warehouseId?: string) => {
    const prevOrders = orders
    const prevSelected = selected
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: to } : o))
    if (selected?.id === orderId) setSelected(prev => prev ? { ...prev, status: to } : null)

    // Đơn chỉ có trong local state (chưa lưu DB) — không cần gọi API
    if (!isUUID(orderId)) {
      if (to === 'cancelled') {
        setOrders(prev => prev.filter(o => o.id !== orderId))
        setSelected(null)
        showToast('Đã hủy đơn')
      }
      return
    }

    try {
      const res = await fetch(`/api/sales-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to, ...(warehouseId ? { warehouse_id: warehouseId } : {}) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setOrders(prevOrders)
        setSelected(prevSelected)
        showToast(`❌ Lỗi cập nhật trạng thái: ${err.error}`)
        return
      }

      if (to === 'confirmed') {
        showToast(warehouseId ? '✅ Đã duyệt đơn — phiếu xuất kho đã được tạo tự động' : '✅ Đã duyệt đơn')
      }
    } catch {
      setOrders(prevOrders)
      setSelected(prevSelected)
      showToast('❌ Lỗi kết nối — không thể cập nhật trạng thái')
    }
  }

  const STATUS_FILTERS = ['all', 'new', 'confirmed', 'picking', 'picked', 'pending_ship', 'delivering', 'completed', 'cancelled']
  const FILTER_LABELS: Record<string, string> = {
    all: 'Tất cả', new: 'Mới', confirmed: 'Đã XN', picking: 'Soạn', picked: 'Xuất kho',
    pending_ship: 'Chờ giao', delivering: 'Đang giao', completed: 'Hoàn thành', cancelled: 'Đã hủy',
  }

  return (
    <div>
      <PageHeader
        title="Đơn hàng bán"
        subtitle="Quản lý và vận hành toàn bộ đơn hàng bán ra"
        actions={
          <>
            <ExportButton module="ban-hang" />
            <button onClick={() => setShowParse(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-[var(--mia-primary)] text-[var(--mia-primary)] text-sm font-semibold rounded-lg hover:bg-blue-50 transition-all">
              <Sparkles size={13} /> Nhập từ Zalo
            </button>
            <Button onClick={() => setShowCreate(true)}><Plus size={14} />Tạo đơn hàng</Button>
          </>
        }
      />

      <WorkflowBanner
        count={orders.filter(o => o.status === 'new').length}
        label="đơn mới chưa xác nhận"
        hint="Bấm vào đơn → chọn 'Xác nhận đơn' để duyệt"
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <KpiCard icon={<ShoppingCart size={18} className="text-blue-600" />} label="Tổng đơn" value={orders.length} sub="Tất cả trạng thái" iconBg="bg-blue-100" />
        <KpiCard icon={<Clock size={18} className="text-yellow-600" />} label="Mới / Chờ XN" value={orders.filter(o => o.status === 'new').length} sub="Cần xác nhận" iconBg="bg-yellow-100" subColor="orange" />
        <KpiCard icon={<ShoppingCart size={18} className="text-purple-600" />} label="Đang soạn" value={orders.filter(o => o.status === 'picking').length} sub="Kho đang xử lý" iconBg="bg-purple-100" />
        <KpiCard icon={<Truck size={18} className="text-sky-600" />} label="Đang giao" value={orders.filter(o => o.status === 'delivering').length} sub="Trên đường" iconBg="bg-sky-100" />
        <KpiCard icon={<CheckCircle size={18} className="text-green-600" />} label="Hoàn thành" value={orders.filter(o => o.status === 'completed').length} sub="Tháng này" iconBg="bg-green-100" subColor="green" />
        <KpiCard icon={<XCircle size={18} className="text-red-500" />} label="Đã hủy" value={orders.filter(o => o.status === 'cancelled').length} sub="Tháng này" iconBg="bg-red-100" subColor="red" />
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        {/* Filter bar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e5e7eb] flex-wrap">
          <div className="flex items-center gap-2 bg-gray-50 border border-[#e5e7eb] rounded-lg px-3 h-8 flex-1 min-w-[200px] max-w-xs">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input type="text" placeholder="Tìm mã đơn, khách hàng..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="flex-1 text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {STATUS_FILTERS.map(s => (
              <button key={s} onClick={() => { setStatusFilter(s); setPage(1) }}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-[var(--mia-primary)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {FILTER_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-gray-50">
                {['Mã đơn', 'Khách hàng', 'Sản phẩm', 'Tổng tiền', 'Thanh toán', 'Trạng thái', 'Ngày đặt'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap min-w-[260px]">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(o => {
                const pa = o.pendingAction
                const paLabel = pa?.type === 'create' ? 'Chờ duyệt tạo' : pa?.type === 'edit' ? 'Chờ duyệt sửa' : pa?.type === 'delete' ? 'Chờ duyệt xóa' : null
                return (
                <tr key={o.id} className={`border-b border-[#f0f2f5] hover:bg-gray-50/60 transition-colors ${pa ? 'bg-yellow-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(o)} className="flex items-center gap-1 text-[var(--mia-primary)] font-medium text-xs hover:underline">
                      {o.code} <ChevronRight size={11} />
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium text-[#1e2a3a] max-w-[160px] truncate">{o.customer}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {o.items[0]?.name}{o.items.length > 1 ? ` +${o.items.length - 1}` : ''}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-[#1e2a3a] whitespace-nowrap">{formatVND(o.total)}</td>
                  <td className="px-4 py-3"><Badge status={o.payment_status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium w-fit ${STATUS_BADGE[o.status]}`}>
                        {STATUS_LABELS[o.status]}
                      </span>
                      {paLabel && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-100 text-yellow-700 w-fit">
                          <AlertTriangle size={9} />{paLabel}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(o.date)}</td>
                  <td className="px-4 py-3 min-w-[260px]">
                    <div className="flex items-center gap-1 flex-wrap">
                      {!pa && <OrderActions orderId={o.id} status={o.status} role={userRole} onTransition={handleTransition} />}
                      {!isAdmin && !pa && o.status === 'new' && (<>
                        <button onClick={() => setEditTarget(o)} className="p-1.5 rounded-lg hover:bg-yellow-50 text-gray-400 hover:text-yellow-600 transition-colors" title="Yêu cầu sửa">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDeleteRequest(o.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Yêu cầu xóa">
                          <Trash2 size={13} />
                        </button>
                      </>)}
                      {isAdmin && pa && (<>
                        <button onClick={() => handleApprovePending(o.id)} className="flex items-center gap-0.5 px-2 py-1 bg-green-100 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-200 transition-colors">
                          <CheckCircle size={11} />Duyệt
                        </button>
                        <button onClick={() => handleRejectPending(o.id)} className="flex items-center gap-0.5 px-2 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors">
                          <X size={11} />Từ chối
                        </button>
                      </>)}
                    </div>
                  </td>
                </tr>
                )
              })}
              {loadingOrders && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">
                  <span className="inline-flex items-center gap-2"><span className="w-4 h-4 border-2 border-gray-300 border-t-[#0ea5e9] rounded-full animate-spin" />Đang tải đơn hàng...</span>
                </td></tr>
              )}
              {!loadingOrders && paged.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-gray-400">Không có đơn hàng nào</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#e5e7eb]">
            <span className="text-xs text-gray-400">Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length}</span>
            <div className="flex gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${p === page ? 'bg-[var(--mia-primary)] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showCreate && <CreateOrderModal onClose={() => { setShowCreate(false); setParsePrefill(undefined) }} onCreate={handleCreate} prefill={parsePrefill} />}
      {showParse && <ParseOrderModal onClose={() => setShowParse(false)} onCreate={handleCreateFromParse} />}
      {selected && <OrderDetailDrawer order={selected} onClose={() => setSelected(null)} onTransition={handleTransition} role={userRole} />}

      {warehouseModal && (
        <WarehouseSelectModal
          warehouses={warehouses}
          onClose={() => setWarehouseModal(null)}
          onConfirm={(warehouseId) => {
            const { orderId } = warehouseModal
            setWarehouseModal(null)
            doTransition(orderId, 'confirmed', warehouseId)
          }}
        />
      )}

      {editTarget && (
        <EditOrderModal
          order={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(id, payload) => handleEditRequest(id, payload)}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e2a3a] text-white text-sm px-4 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}
