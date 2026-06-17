'use client'
import { useState, useEffect } from 'react'
import { Plus, Search, Phone, Star, Truck, CheckCircle, X, UserCheck, Link2, Copy, Check, ExternalLink } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { supabase } from '@/lib/supabase'
import { createDriverToken } from '@/lib/delivery-token'

interface Driver {
  id: string; name: string; phone: string; license_type: string
  vehicle_plate: string; rating: number; total_trips: number
  status: 'available' | 'on_trip' | 'off_duty' | 'inactive'
  joined_date: string; address: string; notes: string
  warehouse_id: string | null; warehouse_name?: string
}

const STATUS_MAP: Record<string, { label: string; className: string; dot: string }> = {
  available: { label: 'Sẵn sàng',  className: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  on_trip:   { label: 'Đang giao', className: 'bg-sky-100 text-sky-700',       dot: 'bg-sky-500' },
  off_duty:  { label: 'Nghỉ phép', className: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  inactive:  { label: 'Ngừng HĐ', className: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
}

// Fetch users with role='driver', merge with drivers table for persisted extra fields
async function loadAllDrivers(): Promise<Driver[]> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) return []

  const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) return []
  const users = await res.json()
  const driverUsers = users.filter((u: { role: string }) => u.role === 'driver')
  if (driverUsers.length === 0) return []

  // Fetch matching drivers records (using user UUID as PK in drivers table)
  const { data: driverRecords } = await supabase
    .from('drivers')
    .select('id, license_type, rating, total_trips, status, warehouse_id, warehouse:warehouses(id, name), vehicle:vehicles(plate)')
    .in('id', driverUsers.map((u: { id: string }) => u.id))

  const drMap: Record<string, any> = {}
  ;(driverRecords ?? []).forEach((d: any) => { drMap[d.id] = d })

  return driverUsers.map((u: { id: string; full_name: string | null; email: string; phone: string | null; status: string | null }) => {
    const dr = drMap[u.id]
    const vehicleRaw = dr?.vehicle
    const plate = Array.isArray(vehicleRaw) ? vehicleRaw[0]?.plate : vehicleRaw?.plate
    const warehouseRaw = dr?.warehouse
    const wh = Array.isArray(warehouseRaw) ? warehouseRaw[0] : warehouseRaw
    return {
      id: u.id,
      name: u.full_name ?? u.email ?? '',
      phone: u.phone ?? '',
      license_type: dr?.license_type ?? '',
      vehicle_plate: plate ?? '',
      rating: dr?.rating ?? 5.0,
      total_trips: dr?.total_trips ?? 0,
      status: (dr?.status ?? (u.status === 'active' ? 'available' : 'inactive')) as Driver['status'],
      joined_date: '',
      address: '',
      notes: '',
      warehouse_id: dr?.warehouse_id ?? null,
      warehouse_name: wh?.name ?? undefined,
    }
  })
}

// Upsert extra driver info using user UUID as drivers.id (implicit link, no schema change needed)
async function saveDriverToDB(driver: Driver) {
  // Try to find vehicle by plate
  let vehicleId: string | null = null
  if (driver.vehicle_plate.trim()) {
    const { data } = await supabase
      .from('vehicles')
      .select('id')
      .eq('plate', driver.vehicle_plate.trim())
      .maybeSingle()
    vehicleId = data?.id ?? null
  }

  await supabase.from('drivers').upsert({
    id:           driver.id,
    name:         driver.name,
    phone:        driver.phone,
    license_type: driver.license_type || null,
    vehicle_id:   vehicleId,
    rating:       driver.rating,
    total_trips:  driver.total_trips,
    status:       driver.status,
    warehouse_id: driver.warehouse_id || null,
  }, { onConflict: 'id' })
}

// ─── Driver Link Modal ────────────────────────────────────────────────────────
function DriverLinkModal({ driver, onClose }: { driver: Driver; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const token = createDriverToken({ id: driver.id, name: driver.name })
  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/giao-hang/driver/${token}`
    : ''

  const handleCopy = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-[#0ea5e9]" />
            <h2 className="text-base font-bold text-[#1e2a3a]">Link giao hàng</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Driver info */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <div className="w-10 h-10 bg-[#1e2a3a] rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0">
              {driver.name.split(' ').pop()?.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-bold text-[#1e2a3a]">{driver.name}</p>
              <p className="text-xs text-gray-500">{driver.vehicle_plate || 'Chưa có xe'} · {driver.phone || '—'}</p>
            </div>
          </div>

          {/* Link */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Link cố định (dùng mãi, không hết hạn)</p>
            <div className="flex items-center gap-2 p-3 bg-sky-50 border border-sky-200 rounded-xl">
              <p className="flex-1 text-xs text-sky-700 break-all font-mono leading-relaxed">{url}</p>
            </div>
          </div>

          <p className="text-xs text-gray-400 leading-relaxed">
            Gửi link này cho tài xế qua Zalo/SMS. Tài xế mở link mỗi ngày để xem danh sách đơn được phân công và xác nhận giao hàng.
          </p>

          <div className="flex gap-2">
            <button onClick={handleCopy}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-xl transition-all hover:scale-[1.02] active:scale-95 ${copied ? 'bg-green-500 text-white' : 'bg-[#0ea5e9] text-white hover:bg-[#0284c7]'}`}>
              {copied ? <><Check size={15} /> Đã sao chép!</> : <><Copy size={15} /> Sao chép link</>}
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer"
              className="px-4 py-2.5 border border-[#e5e7eb] text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-50 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-1.5">
              <ExternalLink size={14} /> Mở thử
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

interface VehicleOption { id: string; brand: string | null; plate: string }
interface WarehouseOption { id: string; name: string }

function DriverFormModal({ driver, onClose, onSave }: {
  driver?: Driver; onClose: () => void; onSave: (d: Driver) => Promise<void>
}) {
  const blank: Driver = { id: String(Date.now()), name: '', phone: '', license_type: 'B2', vehicle_plate: '', rating: 5.0, total_trips: 0, status: 'available', joined_date: '', address: '', notes: '', warehouse_id: null }
  const [form, setForm] = useState<Driver>(driver ?? blank)
  const [saving, setSaving] = useState(false)
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([])
  const set = (k: keyof Driver, v: string | number | null) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([
      supabase.from('vehicles').select('id, brand, plate').eq('status', 'available').order('plate'),
      supabase.from('warehouses').select('id, name').eq('status', 'active').order('name'),
    ]).then(([v, w]) => {
      setVehicles(v.data ?? [])
      setWarehouses(w.data ?? [])
    })
  }, [])

  const handleSubmit = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-base font-bold text-[#1e2a3a]">{driver ? 'Cập nhật tài xế' : 'Thêm tài xế mới'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 grid grid-cols-2 gap-4">
          {([
            ['Họ tên', 'name', 'text'],
            ['Số điện thoại', 'phone', 'text'],
            ['Hạng bằng lái', 'license_type', 'text'],
            ['Ngày vào làm', 'joined_date', 'date'],
            ['Địa chỉ', 'address', 'text'],
          ] as [string, keyof Driver, string][]).map(([label, key, type]) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
              <input type={type} value={form[key] as string} onChange={e => set(key, e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
            </div>
          ))}

          {/* Xe phụ trách — dropdown từ bảng vehicles */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Xe phụ trách</label>
            <select value={form.vehicle_plate} onChange={e => set('vehicle_plate', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9] bg-white">
              <option value="">— Chưa phân công —</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.plate}>
                  {v.brand ? `${v.brand} · ${v.plate}` : v.plate}
                </option>
              ))}
            </select>
            {vehicles.length === 0 && (
              <p className="text-[10px] text-gray-400 mt-1">Chưa có phương tiện nào. Thêm xe trong mục Phương tiện.</p>
            )}
          </div>

          {/* Kho phụ trách */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Kho phụ trách</label>
            <select value={form.warehouse_id ?? ''} onChange={e => set('warehouse_id', e.target.value || null)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9] bg-white">
              <option value="">— Không giới hạn kho —</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            {warehouses.length === 0 && (
              <p className="text-[10px] text-gray-400 mt-1">Chưa có kho nào. Thêm kho trong Cài đặt → Danh mục.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Trạng thái</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]">
              {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ghi chú</label>
            <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9]" />
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-[#e5e7eb]">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
          <button onClick={handleSubmit} disabled={!form.name || saving}
            className="flex-1 py-2 bg-[#0ea5e9] text-white text-sm font-semibold rounded-lg hover:bg-[#0284c7] disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={11} className={i <= Math.round(rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'} />
      ))}
      <span className="text-xs font-semibold text-gray-700 ml-0.5">{rating.toFixed(1)}</span>
    </div>
  )
}

const PAGE_SIZE = 20

export default function TaiXePage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modal, setModal] = useState<Driver | 'new' | null>(null)
  const [linkModal, setLinkModal] = useState<Driver | null>(null)
  const [page, setPage] = useState(1)

  const reload = async () => {
    setLoading(true)
    const list = await loadAllDrivers()
    setDrivers(list)
    setLoading(false)
  }

  useEffect(() => { reload() }, [])

  const filtered = drivers.filter(d => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase()) || d.phone.includes(search)
    const matchStatus = statusFilter === 'all' || d.status === statusFilter
    return matchSearch && matchStatus
  })
  useEffect(() => { setPage(1) }, [search, statusFilter])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleSave = async (d: Driver) => {
    await saveDriverToDB(d)
    await reload()
  }

  const avgRating = drivers.length > 0
    ? (drivers.reduce((s, d) => s + d.rating, 0) / drivers.length).toFixed(1)
    : '—'

  return (
    <div>
      <PageHeader title="Quản lý tài xế" subtitle="Danh sách tài xế, tình trạng và chỉ số hiệu suất">
        <button onClick={() => setModal('new')} className="flex items-center gap-2 px-4 py-2 bg-[#0ea5e9] text-white text-sm font-semibold rounded-lg hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={15} /> Thêm tài xế
        </button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Tổng tài xế', value: drivers.length,                                       icon: <UserCheck size={20} className="text-blue-500" />,   bg: 'bg-blue-50' },
          { label: 'Sẵn sàng',    value: drivers.filter(d => d.status === 'available').length,  icon: <CheckCircle size={20} className="text-green-500" />, bg: 'bg-green-50' },
          { label: 'Đang giao',   value: drivers.filter(d => d.status === 'on_trip').length,    icon: <Truck size={20} className="text-sky-500" />,         bg: 'bg-sky-50' },
          { label: 'Đánh giá TB', value: avgRating + ' ★',                                     icon: <Star size={20} className="text-yellow-500" />,       bg: 'bg-yellow-50' },
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên, số điện thoại..."
              className="flex-1 text-sm bg-transparent outline-none" />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'available', 'on_trip', 'off_duty', 'inactive'] as const).map(s => {
              const LABELS = { all: 'Tất cả', available: 'Sẵn sàng', on_trip: 'Đang giao', off_duty: 'Nghỉ phép', inactive: 'Ngừng HĐ' }
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
              {['Tài xế', 'Liên hệ', 'Bằng lái', 'Xe phụ trách', 'Kho', 'Chuyến đã giao', 'Đánh giá', 'Trạng thái', 'Link giao hàng', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-[#f0f2f5]">
                  {Array.from({ length: 10 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-20" /></td>
                  ))}
                </tr>
              ))
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400">
                  {search || statusFilter !== 'all' ? 'Không tìm thấy tài xế phù hợp.' : 'Chưa có tài xế nào. Import nhân viên với vai trò Tài xế hoặc bấm "Thêm tài xế".'}
                </td>
              </tr>
            ) : paged.map(d => {
              const s = STATUS_MAP[d.status]
              return (
                <tr key={d.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#1e2a3a] rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {d.name.split(' ').pop()?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#1e2a3a]">{d.name}</p>
                        <p className="text-[10px] text-gray-400">{d.address || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <a href={`tel:${d.phone}`} className="flex items-center gap-1 text-xs text-[#0ea5e9] hover:underline">
                      <Phone size={11} />{d.phone || '—'}
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    {d.license_type
                      ? <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded">{d.license_type}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{d.vehicle_plate || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {d.warehouse_name
                      ? <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-full">{d.warehouse_name}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-[#1e2a3a]">{d.total_trips}</td>
                  <td className="px-4 py-3"><StarRating rating={d.rating} /></td>
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium w-fit ${s.className}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
                    </span>
                    {d.notes && <p className="text-[10px] text-gray-400 mt-0.5">{d.notes}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setLinkModal(d)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 border border-sky-200 text-sky-700 text-xs font-semibold rounded-lg hover:bg-sky-100 hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap">
                      <Link2 size={11} /> Link tài xế
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setModal(d)}
                      className="px-3 py-1.5 border border-[#e5e7eb] text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 hover:border-[#0ea5e9] hover:text-[#0ea5e9] transition-colors">
                      Chỉnh sửa
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#e5e7eb]">
            <span className="text-xs text-gray-500">Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length} kết quả</span>
            {Math.ceil(filtered.length / PAGE_SIZE) > 1 && (
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
            )}
          </div>
        )}
      </div>

      {linkModal && <DriverLinkModal driver={linkModal} onClose={() => setLinkModal(null)} />}
      {modal && (
        <DriverFormModal
          driver={modal === 'new' ? undefined : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
