'use client'
import { useState, useEffect } from 'react'
import { Plus, Search, Filter, Phone, Mail, MapPin, TrendingUp, ShoppingCart, X } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import ExportButton from '@/components/ui/ExportButton'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { formatVND, formatDate } from '@/lib/utils'
import { useTenant } from '@/contexts/TenantContext'

type Customer = {
  id: string; code: string; name: string; short_name: string; type: string
  phone: string; email: string; address: string
  credit_limit: number; payment_term: number; status: string
  revenue: number; orders: number; created_at: string
}

const INITIAL_CUSTOMERS: Customer[] = []
const PAGE_SIZE = 20

const recentOrders: { code: string; date: string; amount: number; status: string }[] = []

// ─── Modal thêm khách hàng ────────────────────────────────────────────────────
function CustomerFormModal({ onClose, onCreate }: {
  onClose: () => void
  onCreate: (c: Customer) => void
}) {
  const [form, setForm] = useState({
    name: '', short_name: '', type: 'company', phone: '', email: '',
    address: '', credit_limit: 0, payment_term: 30, status: 'active',
  })
  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = () => {
    if (!form.name || !form.phone) return
    const id = String(Date.now())
    const idx = Math.floor(Math.random() * 9000) + 1000
    onCreate({
      id, code: `CUS${String(idx).padStart(4, '0')}`,
      revenue: 0, orders: 0,
      created_at: new Date().toISOString().slice(0, 10),
      ...form,
      short_name: form.short_name || form.name.split(' ').slice(-2).join(' '),
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-base font-bold text-[#1e2a3a]">Thêm khách hàng mới</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tên khách hàng *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="CÔNG TY TNHH ..."
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tên viết tắt</label>
            <input value={form.short_name} onChange={e => set('short_name', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Loại khách hàng</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]">
              <option value="company">Doanh nghiệp</option>
              <option value="individual">Cá nhân</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Số điện thoại *</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)}
              placeholder="0901 234 567"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Địa chỉ</label>
            <input value={form.address} onChange={e => set('address', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Hạn mức tín dụng (đ)</label>
            <input type="number" value={form.credit_limit} onChange={e => set('credit_limit', +e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Thời hạn thanh toán (ngày)</label>
            <input type="number" value={form.payment_term} onChange={e => set('payment_term', +e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Trạng thái</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]">
              <option value="active">Hoạt động</option>
              <option value="paused">Tạm dừng</option>
              <option value="inactive">Không HĐ</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-[#e5e7eb]">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
          <button onClick={handleSubmit} disabled={!form.name || !form.phone}
            className="flex-1 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
            Thêm khách hàng
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  useTenant()
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS)

  useEffect(() => {
    fetch('/api/customers?full=1')
      .then(r => r.ok ? r.json() : [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((data: any[]) => setCustomers(data.map(c => ({
        id: c.id,
        code: c.code ?? '',
        name: c.name,
        short_name: c.short_name ?? '',
        type: c.type ?? 'company',
        phone: c.phone ?? '',
        email: c.email ?? '',
        address: c.address ?? '',
        credit_limit: c.credit_limit ?? 0,
        payment_term: c.payment_term ?? 30,
        status: c.status ?? 'active',
        revenue: 0,
        orders: 0,
        created_at: (c.created_at ?? '').slice(0, 10),
      }))))
      .catch(() => {})
  }, [])

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [page, setPage] = useState(1)

  const filtered = customers.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase()) && !c.code.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  useEffect(() => { setPage(1) }, [search, statusFilter])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const selectedCustomer = customers.find(c => c.id === selected)

  const handleCreate = async (c: Customer) => {
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: c.name, short_name: c.short_name, type: c.type,
          phone: c.phone, email: c.email, address: c.address,
          credit_limit: c.credit_limit, payment_term: c.payment_term, status: c.status,
        }),
      })
      if (res.ok) {
        const saved = await res.json()
        const newC = { ...c, id: saved.id, code: saved.code }
        setCustomers(prev => [newC, ...prev])
        setSelected(newC.id)
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        alert(`Lỗi lưu khách hàng: ${err.error}`)
      }
    } catch (e) {
      alert('Lỗi kết nối — không thể lưu khách hàng')
    }
  }

  return (
    <div className="flex gap-4 h-full">
      {/* Left list panel */}
      <div className="flex-1 min-w-0">
        <PageHeader
          title="Khách hàng"
          subtitle={`${filtered.length} khách hàng`}
          actions={
            <>
              <ExportButton module="ban-hang" />
              <Button onClick={() => setShowAdd(true)}>
                <Plus size={14} />
                Thêm khách hàng
              </Button>
            </>
          }
        />

        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-2 bg-white border border-[#e5e7eb] rounded-lg px-3 h-9 flex-1 max-w-xs">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input type="text" placeholder="Tìm theo tên, mã KH..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 text-sm outline-none bg-transparent text-gray-700 placeholder-gray-400" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="h-9 px-3 border border-[#e5e7eb] rounded-lg text-sm text-gray-700 bg-white outline-none cursor-pointer focus:ring-2 focus:ring-[var(--mia-primary)]">
            <option value="all">Tất cả trạng thái</option>
            <option value="active">Hoạt động</option>
            <option value="paused">Tạm dừng</option>
            <option value="inactive">Không HĐ</option>
          </select>
          <Button variant="outline" size="sm"><Filter size={13} />Lọc thêm</Button>
        </div>

        <div className="space-y-2">
          {paged.map(c => (
            <div key={c.id} onClick={() => setSelected(c.id === selected ? null : c.id)}
              className={`bg-white rounded-xl border transition-all cursor-pointer hover:shadow-sm ${selected === c.id ? 'border-[var(--mia-primary)] shadow-sm' : 'border-[#e5e7eb]'}`}>
              <div className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 rounded-xl bg-[#1e2a3a] flex items-center justify-center shrink-0">
                  <span className="text-white font-bold text-sm">{c.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-[#1e2a3a] truncate">{c.name}</span>
                    <span className="text-xs text-gray-400">{c.code}</span>
                    <Badge status={c.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-gray-500"><Phone size={11} />{c.phone}</span>
                    <span className="flex items-center gap-1 text-xs text-gray-500 hidden sm:flex"><Mail size={11} />{c.email}</span>
                  </div>
                </div>
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-gray-400">Doanh thu</p>
                    <p className="text-sm font-semibold text-[#1e2a3a]">{formatVND(c.revenue)}</p>
                  </div>
                  <div className="text-right hidden md:block">
                    <p className="text-xs text-gray-400">Đơn hàng</p>
                    <p className="text-sm font-semibold text-[#1e2a3a]">{c.orders}</p>
                  </div>
                  <div className="text-right hidden lg:block">
                    <p className="text-xs text-gray-400">Hạn TT</p>
                    <p className="text-sm font-medium text-[#1e2a3a]">{c.payment_term} ngày</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-10 text-center text-gray-400 text-sm">
              Không tìm thấy khách hàng nào
            </div>
          )}
        </div>
        {Math.ceil(filtered.length / PAGE_SIZE) > 1 && (
          <div className="flex items-center justify-between mt-3 px-1">
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

      {/* Right detail panel */}
      {selectedCustomer && (
        <div className="w-[320px] shrink-0 hidden xl:flex flex-col gap-3">
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-[#1e2a3a] flex items-center justify-center">
                <span className="text-white font-bold text-lg">{selectedCustomer.name.charAt(0)}</span>
              </div>
              <div>
                <p className="font-bold text-sm text-[#1e2a3a] leading-tight">{selectedCustomer.name}</p>
                <p className="text-xs text-gray-400">{selectedCustomer.code}</p>
                <Badge status={selectedCustomer.status} className="mt-1" />
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2"><Phone size={13} className="text-gray-400 mt-0.5 shrink-0" /><span className="text-gray-700">{selectedCustomer.phone}</span></div>
              <div className="flex items-start gap-2"><Mail size={13} className="text-gray-400 mt-0.5 shrink-0" /><span className="text-gray-700">{selectedCustomer.email}</span></div>
              <div className="flex items-start gap-2"><MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" /><span className="text-gray-700">{selectedCustomer.address || '—'}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-[#e5e7eb]">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-0.5">Hạn mức tín dụng</p>
                <p className="text-sm font-bold text-[#1e2a3a]">{formatVND(selectedCustomer.credit_limit)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-0.5">Thời hạn TT</p>
                <p className="text-sm font-bold text-[#1e2a3a]">{selectedCustomer.payment_term} ngày</p>
              </div>
              <div className="bg-sky-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-0.5 flex items-center justify-center gap-1"><TrendingUp size={10} />Doanh thu</p>
                <p className="text-sm font-bold text-[var(--mia-primary)]">{formatVND(selectedCustomer.revenue)}</p>
              </div>
              <div className="bg-sky-50 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-400 mb-0.5 flex items-center justify-center gap-1"><ShoppingCart size={10} />Đơn hàng</p>
                <p className="text-sm font-bold text-[var(--mia-primary)]">{selectedCustomer.orders}</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-3">Ngày tham gia: {formatDate(selectedCustomer.created_at)}</p>
          </div>

          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
            <h3 className="text-sm font-semibold text-[#1e2a3a] mb-3">Đơn hàng gần đây</h3>
            <div className="space-y-2">
              {recentOrders.map(o => (
                <div key={o.code} className="flex items-center justify-between py-2 border-b border-[#e5e7eb] last:border-0">
                  <div>
                    <p className="text-xs font-medium text-[var(--mia-primary)]">{o.code}</p>
                    <p className="text-[10px] text-gray-400">{formatDate(o.date)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold text-[#1e2a3a]">{formatVND(o.amount)}</p>
                    <Badge status={o.status} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button className="flex-1" size="sm"><ShoppingCart size={13} />Tạo đơn hàng</Button>
            <Button variant="outline" size="sm" className="flex-1">Xem chi tiết</Button>
          </div>
        </div>
      )}

      {showAdd && <CustomerFormModal onClose={() => setShowAdd(false)} onCreate={handleCreate} />}
    </div>
  )
}
