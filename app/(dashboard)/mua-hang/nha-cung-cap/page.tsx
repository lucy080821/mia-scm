'use client'
import { useState, useEffect } from 'react'
import { Plus, Search, Building2, Star, Phone, Mail, X, MapPin, Clock, TrendingUp } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import ExportButton from '@/components/ui/ExportButton'
import { formatVND } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'

interface Supplier {
  id: string; code: string; name: string; type: string
  tax_code: string; phone: string; email: string; address: string
  payment_term: number; delivery_days: number; rating: number
  total_orders: number; total_amount: number
  status: 'active' | 'paused' | 'inactive'
  products: string[]; notes: string
}

const INITIAL_SUPPLIERS: Supplier[] = []

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  active:   { label: 'Đang hợp tác', className: 'bg-green-100 text-green-700' },
  paused:   { label: 'Tạm ngừng',   className: 'bg-yellow-100 text-yellow-700' },
  inactive: { label: 'Ngừng HĐ',   className: 'bg-red-100 text-red-700' },
}

type FormData = {
  name: string; type: string; tax_code: string; phone: string
  email: string; address: string; payment_term: string
  delivery_days: string; status: 'active' | 'paused' | 'inactive'
  products: string; notes: string
}

const EMPTY_FORM: FormData = {
  name: '', type: 'distributor_l1', tax_code: '', phone: '',
  email: '', address: '', payment_term: '30',
  delivery_days: '3', status: 'active', products: '', notes: '',
}

const TYPE_OPTIONS = [
  { value: 'distributor_l1', label: 'Nhà phân phối' },
  { value: 'manufacturer',   label: 'Nhà sản xuất'  },
]

const TYPE_LABEL: Record<string, string> = {
  distributor_l1: 'Nhà phân phối',
  manufacturer:   'Nhà sản xuất',
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  )
}

function inputCls(err?: string) {
  return `w-full px-3 py-2 text-sm border rounded-lg outline-none transition-colors focus:border-[var(--mia-primary)] focus:ring-1 focus:ring-[var(--mia-primary)]/20 ${err ? 'border-red-400' : 'border-[#e5e7eb]'}`
}

function SupplierFormModal({ initial, existingCodes, onSave, onClose }: {
  initial?: Supplier
  existingCodes: string[]
  onSave: (data: FormData) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<FormData>(
    initial
      ? {
          name: initial.name, type: initial.type, tax_code: initial.tax_code,
          phone: initial.phone, email: initial.email, address: initial.address,
          payment_term: String(initial.payment_term), delivery_days: String(initial.delivery_days),
          status: initial.status, products: initial.products.join(', '), notes: initial.notes,
        }
      : EMPTY_FORM
  )
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  const set = (k: keyof FormData, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: undefined }))
  }

  const validate = () => {
    const e: Partial<Record<keyof FormData, string>> = {}
    if (!form.name.trim()) e.name = 'Vui lòng nhập tên nhà cung cấp'
    if (!form.phone.trim()) e.phone = 'Vui lòng nhập số điện thoại'
    if (!form.payment_term || isNaN(Number(form.payment_term))) e.payment_term = 'Số ngày không hợp lệ'
    if (!form.delivery_days || isNaN(Number(form.delivery_days))) e.delivery_days = 'Số ngày không hợp lệ'
    return e
  }

  const handleSubmit = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    onSave(form)
  }

  const isEdit = !!initial
  const nextCode = isEdit ? initial!.code : (() => {
    const nums = existingCodes.map(c => parseInt(c.replace('NCC', ''), 10)).filter(n => !isNaN(n))
    const next = nums.length ? Math.max(...nums) + 1 : 1
    return `NCC${String(next).padStart(3, '0')}`
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">{isEdit ? 'Chỉnh sửa nhà cung cấp' : 'Thêm nhà cung cấp'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Mã: {nextCode}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <Field label="Tên nhà cung cấp *" error={errors.name}>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="VD: Công ty dầu nhờn Việt" className={inputCls(errors.name)} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Loại nhà cung cấp">
              <select value={form.type} onChange={e => set('type', e.target.value)} className={inputCls()}>
                {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Trạng thái">
              <select value={form.status} onChange={e => set('status', e.target.value as FormData['status'])} className={inputCls()}>
                <option value="active">Đang hợp tác</option>
                <option value="paused">Tạm ngừng</option>
                <option value="inactive">Ngừng HĐ</option>
              </select>
            </Field>
          </div>

          <Field label="Mã số thuế">
            <input value={form.tax_code} onChange={e => set('tax_code', e.target.value)}
              placeholder="VD: 0101234567" className={inputCls()} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Số điện thoại *" error={errors.phone}>
              <input value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="VD: 024-3456-7890" className={inputCls(errors.phone)} />
            </Field>
            <Field label="Email">
              <input value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="VD: info@ncc.vn" className={inputCls()} />
            </Field>
          </div>

          <Field label="Địa chỉ">
            <input value={form.address} onChange={e => set('address', e.target.value)}
              placeholder="VD: KCN Thăng Long, Hà Nội" className={inputCls()} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Thời hạn thanh toán (ngày)" error={errors.payment_term}>
              <input type="number" min={0} value={form.payment_term} onChange={e => set('payment_term', e.target.value)}
                placeholder="30" className={inputCls(errors.payment_term)} />
            </Field>
            <Field label="Thời gian giao hàng (ngày)" error={errors.delivery_days}>
              <input type="number" min={1} value={form.delivery_days} onChange={e => set('delivery_days', e.target.value)}
                placeholder="3" className={inputCls(errors.delivery_days)} />
            </Field>
          </div>

          <Field label="Sản phẩm cung cấp">
            <input value={form.products} onChange={e => set('products', e.target.value)}
              placeholder="VD: Dầu nhớt SN150, Phụ gia A (cách nhau bằng dấu phẩy)"
              className={inputCls()} />
          </Field>

          <Field label="Ghi chú">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3} placeholder="Ghi chú thêm về nhà cung cấp..."
              className={`${inputCls()} resize-none`} />
          </Field>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#e5e7eb] flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2 border border-[#e5e7eb] text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 transition-all">
            Hủy
          </button>
          <button onClick={handleSubmit}
            className="flex-1 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-xl hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
            {isEdit ? 'Lưu thay đổi' : 'Thêm nhà cung cấp'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SupplierDetailDrawer({ supplier, onClose, onEdit }: {
  supplier: Supplier; onClose: () => void; onEdit: () => void
}) {
  const s = STATUS_MAP[supplier.status]
  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1" />
      <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-sm font-bold text-[#1e2a3a]">{supplier.name}</h2>
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${s.className}`}>{s.label}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
            {[
              ['Mã NCC', supplier.code],
              ['Loại', TYPE_LABEL[supplier.type] ?? supplier.type],
              ['MST', supplier.tax_code],
              ['Thời hạn TT', `${supplier.payment_term} ngày`],
              ['Thời gian giao', `${supplier.delivery_days} ngày`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-xs text-gray-500">{k}</span>
                <span className="text-xs font-medium text-[#1e2a3a]">{v}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <a href={`tel:${supplier.phone}`} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
              <Phone size={14} className="text-[var(--mia-primary)]" />
              <span className="text-sm text-[#1e2a3a]">{supplier.phone}</span>
            </a>
            <a href={`mailto:${supplier.email}`} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
              <Mail size={14} className="text-[var(--mia-primary)]" />
              <span className="text-sm text-[#1e2a3a]">{supplier.email}</span>
            </a>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
              <MapPin size={14} className="text-gray-400" />
              <span className="text-sm text-gray-600">{supplier.address}</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Sản phẩm cung cấp</p>
            <div className="flex flex-wrap gap-1.5">
              {supplier.products.map(p => (
                <span key={p} className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">{p}</span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-[#1e2a3a]">{supplier.total_orders}</p>
              <p className="text-xs text-gray-500">Tổng đơn mua</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-base font-bold text-[var(--mia-primary)]">{formatVND(supplier.total_amount)}</p>
              <p className="text-xs text-gray-500">Tổng giá trị</p>
            </div>
          </div>

          {supplier.notes && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-xs text-yellow-800">{supplier.notes}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[#e5e7eb]">
          <button onClick={onEdit} className="w-full py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-all hover:scale-[1.02] active:scale-95">
            Chỉnh sửa thông tin
          </button>
        </div>
      </div>
    </div>
  )
}

const PAGE_SIZE = 20

export default function NhaCungCapPage() {
  const { id: tenantId } = useTenant()
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    async function load() {
      const { data } = await supabase.from('suppliers').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false })
      if (!data) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSuppliers(data.map((s: any) => ({
        id: s.id,
        code: s.code,
        name: s.name,
        type: s.type ?? 'Nhà sản xuất',
        tax_code: s.tax_code ?? '',
        phone: s.phone ?? '',
        email: s.email ?? '',
        address: s.address ?? '',
        payment_term: s.payment_term ?? 30,
        delivery_days: s.delivery_days ?? 3,
        rating: s.rating ?? 0,
        total_orders: 0,
        total_amount: 0,
        status: (s.status ?? 'active') as Supplier['status'],
        products: [],
        notes: '',
      })))
    }
    load()
  }, [tenantId])

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [formTarget, setFormTarget] = useState<Supplier | 'new' | null>(null)
  const [page, setPage] = useState(1)
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' } | null>(null)

  function showToast(msg: string, type: 'error' | 'success' = 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 4000)
  }

  const filtered = suppliers.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.code.includes(search)
    const matchStatus = statusFilter === 'all' || s.status === statusFilter
    return matchSearch && matchStatus
  })
  useEffect(() => { setPage(1) }, [search, statusFilter])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSave = async (data: FormData) => {
    const products = data.products.split(',').map(p => p.trim()).filter(Boolean)
    if (formTarget === 'new') {
      try {
        const res = await fetch('/api/suppliers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: data.name, type: data.type, tax_code: data.tax_code,
            phone: data.phone, email: data.email, address: data.address,
            payment_term: Number(data.payment_term),
            delivery_days: Number(data.delivery_days),
            status: data.status,
          }),
        })
        if (res.ok) {
          const saved = await res.json()
          const newSupplier: Supplier = {
            id: saved.id,
            code: saved.code,
            name: data.name, type: data.type, tax_code: data.tax_code,
            phone: data.phone, email: data.email, address: data.address,
            payment_term: Number(data.payment_term),
            delivery_days: Number(data.delivery_days),
            rating: 5.0, total_orders: 0, total_amount: 0,
            status: data.status, products, notes: data.notes,
          }
          setSuppliers(prev => [...prev, newSupplier])
        } else {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          showToast(`Lỗi lưu nhà cung cấp: ${err.error}`)
        }
      } catch {
        showToast('Lỗi kết nối — không thể lưu nhà cung cấp')
      }
    } else if (formTarget) {
      setSuppliers(prev => prev.map(s =>
        s.id === formTarget.id
          ? { ...s, name: data.name, type: data.type, tax_code: data.tax_code, phone: data.phone,
              email: data.email, address: data.address, payment_term: Number(data.payment_term),
              delivery_days: Number(data.delivery_days), status: data.status, products, notes: data.notes }
          : s
      ))
      setSelected(null)
    }
    setFormTarget(null)
  }

  return (
    <div>
      <PageHeader title="Nhà cung cấp" subtitle="Quản lý danh sách và đánh giá nhà cung cấp">
        <ExportButton module="mua-hang" />
        <button
          onClick={() => setFormTarget('new')}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={15} /> Thêm NCC
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Đang hợp tác', value: suppliers.filter(s => s.status === 'active').length,  icon: <Building2 size={20} className="text-blue-500" />,   bg: 'bg-blue-50' },
          { label: 'Tổng NCC',     value: suppliers.length,                                      icon: <TrendingUp size={20} className="text-green-500" />,  bg: 'bg-green-50' },
          { label: 'Rating TB',    value: suppliers.length > 0 ? (suppliers.reduce((s, x) => s + (x.rating ?? 0), 0) / suppliers.length).toFixed(1) + ' ★' : '—', icon: <Star size={20} className="text-yellow-500" />, bg: 'bg-yellow-50' },
          { label: 'Tạm ngừng',   value: suppliers.filter(s => s.status === 'paused').length,   icon: <Clock size={20} className="text-orange-500" />,      bg: 'bg-orange-50' },
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm nhà cung cấp, mã NCC..."
              className="flex-1 text-sm bg-transparent outline-none" />
          </div>
          <div className="flex gap-1.5">
            {['all', 'active', 'paused', 'inactive'].map(s => {
              const LABELS: Record<string, string> = { all: 'Tất cả', active: 'Đang HT', paused: 'Tạm ngừng', inactive: 'Ngừng HĐ' }
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
              {['Nhà cung cấp', 'Loại', 'Liên hệ', 'Thời hạn TT', 'Giao hàng', 'Đánh giá', 'Trạng thái', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map(s => {
              const st = STATUS_MAP[s.status]
              return (
                <tr key={s.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-[#1e2a3a] rounded-lg flex items-center justify-center shrink-0">
                        <Building2 size={14} className="text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#1e2a3a]">{s.name}</p>
                        <p className="text-[10px] text-gray-400">{s.code}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{TYPE_LABEL[s.type] ?? s.type}</td>
                  <td className="px-4 py-3">
                    <p className="text-xs text-[var(--mia-primary)]">{s.phone}</p>
                    <p className="text-[10px] text-gray-400 truncate max-w-[140px]">{s.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{s.payment_term} ngày</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{s.delivery_days} ngày</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Star size={11} className="fill-yellow-400 text-yellow-400" />
                      <span className="text-xs font-semibold text-gray-700">{s.rating.toFixed(1)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${st.className}`}>{st.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(s)}
                      className="px-3 py-1.5 border border-[#e5e7eb] text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 hover:border-[var(--mia-primary)] hover:text-[var(--mia-primary)] transition-colors">
                      Chi tiết
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

      {selected && !formTarget && (
        <SupplierDetailDrawer
          supplier={selected}
          onClose={() => setSelected(null)}
          onEdit={() => setFormTarget(selected)}
        />
      )}

      {formTarget && (
        <SupplierFormModal
          initial={formTarget === 'new' ? undefined : formTarget}
          existingCodes={suppliers.map(s => s.code)}
          onSave={handleSave}
          onClose={() => setFormTarget(null)}
        />
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 z-[100] flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm transition-all ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          <span className="flex-1">{toast.msg}</span>
          <button onClick={() => setToast(null)} className="shrink-0 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
