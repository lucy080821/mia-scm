'use client'
import { useState, useEffect } from 'react'
import { Plus, Search, Car, Wrench, CheckCircle, AlertTriangle, X, Fuel, Shield, Truck } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'

interface Vehicle {
  id: string; plate: string; brand: string; type: string
  capacity_kg: number; fuel_level: number
  insurance_expiry: string; registration_expiry: string
  status: 'available' | 'on_trip' | 'maintenance' | 'inactive'
  last_trip: string; total_trips: number; notes: string
  warehouse_id: string | null; warehouse_name?: string
}

const VEHICLE_TYPES: { value: string; label: string }[] = [
  { value: 'truck_3t',   label: 'Xe tải 3 tấn' },
  { value: 'truck_5t',   label: 'Xe tải 5 tấn' },
  { value: 'truck_10t',  label: 'Xe tải 10 tấn' },
  { value: 'van',        label: 'Xe van' },
  { value: 'motorbike',  label: 'Xe máy' },
  { value: 'other',      label: 'Khác' },
]

const VEHICLE_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  VEHICLE_TYPES.map(t => [t.value, t.label])
)

const STATUS_MAP: Record<string, { label: string; className: string; dot: string }> = {
  available:   { label: 'Rảnh',             className: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  on_trip:     { label: 'Đang chạy',        className: 'bg-sky-100 text-sky-700',      dot: 'bg-sky-500' },
  maintenance: { label: 'Bảo dưỡng',       className: 'bg-yellow-100 text-yellow-700', dot: 'bg-yellow-500' },
  inactive:    { label: 'Ngừng hoạt động', className: 'bg-red-100 text-red-700',       dot: 'bg-red-500' },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToVehicle(r: any): Vehicle {
  const wh = Array.isArray(r.warehouse) ? r.warehouse[0] : r.warehouse
  return {
    id:                  r.id,
    plate:               r.plate ?? '',
    brand:               r.brand ?? '',
    type:                r.type ?? '',
    capacity_kg:         r.capacity_kg ?? 0,
    fuel_level:          r.fuel_level ?? 100,
    insurance_expiry:    r.insurance_expiry ?? '',
    registration_expiry: r.registration_expiry ?? '',
    status:              r.status ?? 'available',
    last_trip:           r.last_trip ?? '',
    total_trips:         r.total_trips ?? 0,
    notes:               r.notes ?? '',
    warehouse_id:        r.warehouse_id ?? null,
    warehouse_name:      wh?.name ?? undefined,
  }
}

async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession()
  return { Authorization: `Bearer ${session?.access_token ?? ''}`, 'Content-Type': 'application/json' }
}

async function fetchVehicles(): Promise<Vehicle[]> {
  const headers = await getAuthHeader()
  const res = await fetch('/api/vehicles', { headers })
  if (!res.ok) return []
  const data = await res.json()
  return (data ?? []).map(rowToVehicle)
}

async function saveVehicleToDB(v: Vehicle, isNew: boolean): Promise<{ id: string | null; error?: string }> {
  const headers = await getAuthHeader()
  const payload = {
    plate:            v.plate,
    brand:            v.brand || null,
    type:             v.type || null,
    capacity_kg:      v.capacity_kg || null,
    fuel_level:       v.fuel_level,
    insurance_expiry: v.insurance_expiry || null,
    status:           v.status,
    warehouse_id:     v.warehouse_id || null,
  }

  const parseError = async (res: Response): Promise<string> => {
    try {
      const body = await res.json()
      return body.error || JSON.stringify(body)
    } catch {
      return await res.text().catch(() => `HTTP ${res.status}`)
    }
  }

  if (isNew) {
    const res = await fetch('/api/vehicles', { method: 'POST', headers, body: JSON.stringify(payload) })
    if (!res.ok) return { id: null, error: await parseError(res) }
    const data = await res.json()
    return { id: data.id }
  } else {
    const res = await fetch(`/api/vehicles/${v.id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
    if (!res.ok) return { id: v.id, error: await parseError(res) }
    return { id: v.id }
  }
}

function VehicleFormModal({ vehicle, onClose, onSave }: {
  vehicle?: Vehicle; onClose: () => void
  onSave: (v: Vehicle, isNew: boolean) => Promise<string | undefined>
}) {
  const { id: tenantId } = useTenant()
  const blank: Vehicle = { id: '', plate: '', brand: '', type: 'truck_3t', capacity_kg: 3000, fuel_level: 100, insurance_expiry: '', registration_expiry: '', status: 'available', last_trip: '', total_trips: 0, notes: '', warehouse_id: null }
  const [form, setForm] = useState<Vehicle>(vehicle ?? blank)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([])
  const isNew = !vehicle
  const set = (k: keyof Vehicle, v: string | number | null) => setForm(f => ({ ...f, [k]: v }))

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    supabase.from('warehouses').select('id, name').eq('status', 'active').eq('tenant_id', tenantId).order('name')
      .then(({ data }) => setWarehouses(data ?? []))
  }, [tenantId])

  const handleSubmit = async () => {
    if (!form.plate.trim()) return
    setSaving(true)
    setSaveError('')
    const err = await onSave(form, isNew)
    setSaving(false)
    if (err) { setSaveError(err); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-base font-bold text-[#1e2a3a]">{vehicle ? 'Cập nhật xe' : 'Thêm xe mới'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 grid grid-cols-2 gap-4">
          {([
            ['Biển số xe', 'plate', 'text'],
            ['Hãng xe', 'brand', 'text'],
            ['Tải trọng (kg)', 'capacity_kg', 'number'],
            ['Nhiên liệu (%)', 'fuel_level', 'number'],
            ['Hạn bảo hiểm', 'insurance_expiry', 'date'],
            ['Hạn đăng kiểm', 'registration_expiry', 'date'],
          ] as [string, keyof Vehicle, string][]).map(([label, key, type]) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
              <input type={type} value={form[key] as string | number} onChange={e => set(key, type === 'number' ? +e.target.value : e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Loại xe</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]">
              {VEHICLE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Trạng thái</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]">
              {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Kho phụ trách</label>
            <select value={form.warehouse_id ?? ''} onChange={e => set('warehouse_id', e.target.value || null)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] bg-white">
              <option value="">— Không giới hạn kho —</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ghi chú</label>
            <input type="text" value={form.notes} onChange={e => set('notes', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
        </div>
        {saveError && (
          <div className="mx-6 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{saveError}</div>
        )}
        <div className="flex gap-2 px-6 py-4 border-t border-[#e5e7eb]">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
          <button onClick={handleSubmit} disabled={!form.plate.trim() || saving}
            className="flex-1 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}

const PAGE_SIZE = 20

export default function PhuongTienPage() {
  const { id: tenantId } = useTenant()
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [modal, setModal] = useState<Vehicle | 'new' | null>(null)
  const [page, setPage] = useState(1)

  const reload = async () => {
    setLoading(true)
    const list = await fetchVehicles()
    setVehicles(list)
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!tenantId) return; reload() }, [tenantId])

  const filtered = vehicles.filter(v => {
    const typeLabel = (VEHICLE_TYPE_LABEL[v.type] ?? v.type).toLowerCase()
    const matchSearch = v.plate.includes(search) || v.brand.toLowerCase().includes(search.toLowerCase()) || typeLabel.includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || v.status === statusFilter
    return matchSearch && matchStatus
  })
  useEffect(() => { setPage(1) }, [search, statusFilter])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const today = new Date()
  const expiringSoon = vehicles.filter(v => {
    if (!v.insurance_expiry && !v.registration_expiry) return false
    const days30 = new Date(today.getTime() + 30 * 86400000)
    return (v.insurance_expiry && new Date(v.insurance_expiry) < days30) ||
           (v.registration_expiry && new Date(v.registration_expiry) < days30)
  })

  const handleSave = async (v: Vehicle, isNew: boolean): Promise<string | undefined> => {
    const result = await saveVehicleToDB(v, isNew)
    if (result.error) return result.error
    await reload()
    return undefined
  }

  return (
    <div>
      <PageHeader title="Quản lý phương tiện" subtitle="Theo dõi đội xe, tình trạng và lịch bảo dưỡng">
        <button onClick={() => setModal('new')} className="flex items-center gap-2 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={15} /> Thêm xe
        </button>
      </PageHeader>

      {expiringSoon.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-5 flex items-start gap-3">
          <AlertTriangle size={16} className="text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-800">Cảnh báo giấy tờ sắp hết hạn</p>
            <p className="text-xs text-orange-600 mt-0.5">
              {expiringSoon.map(v => v.plate).join(', ')} có bảo hiểm hoặc đăng kiểm hết hạn trong 30 ngày tới.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Tổng xe',   value: vehicles.length,                                         icon: <Truck size={20} className="text-blue-500" />,        bg: 'bg-blue-50' },
          { label: 'Đang chạy', value: vehicles.filter(v => v.status === 'on_trip').length,     icon: <Car size={20} className="text-sky-500" />,           bg: 'bg-sky-50' },
          { label: 'Đang rảnh', value: vehicles.filter(v => v.status === 'available').length,   icon: <CheckCircle size={20} className="text-green-500" />, bg: 'bg-green-50' },
          { label: 'Bảo dưỡng', value: vehicles.filter(v => v.status === 'maintenance').length, icon: <Wrench size={20} className="text-yellow-500" />,     bg: 'bg-yellow-50' },
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
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm biển số, hãng xe..."
              className="flex-1 text-sm bg-transparent outline-none" />
          </div>
          <div className="flex gap-1.5">
            {['all', 'available', 'on_trip', 'maintenance', 'inactive'].map(s => {
              const LABELS: Record<string, string> = { all: 'Tất cả', available: 'Rảnh', on_trip: 'Đang chạy', maintenance: 'Bảo dưỡng', inactive: 'Ngừng HĐ' }
              return (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-[var(--mia-primary)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {LABELS[s]}
                </button>
              )
            })}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border border-[#e5e7eb] rounded-xl p-4 space-y-3">
                <div className="h-4 bg-gray-100 rounded animate-pulse w-32" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-24" />
                <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
              </div>
            ))}
          </div>
        ) : paged.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            {search || statusFilter !== 'all' ? 'Không tìm thấy xe phù hợp.' : 'Chưa có phương tiện nào. Bấm "Thêm xe" để bắt đầu.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {paged.map(v => {
              const s = STATUS_MAP[v.status]
              const insWarn = v.insurance_expiry && new Date(v.insurance_expiry) < new Date(today.getTime() + 30 * 86400000)
              const regWarn = v.registration_expiry && new Date(v.registration_expiry) < new Date(today.getTime() + 30 * 86400000)

              return (
                <div key={v.id} className={`border rounded-xl p-4 hover:shadow-sm transition-shadow ${v.status === 'maintenance' ? 'border-yellow-300 bg-yellow-50/30' : v.status === 'inactive' ? 'border-red-200 bg-red-50/20' : 'border-[#e5e7eb] bg-white'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 bg-[#1e2a3a] rounded-xl flex items-center justify-center">
                        <Truck size={16} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#1e2a3a]">{v.plate}</p>
                        <p className="text-xs text-gray-400">{v.brand}{v.brand && v.type ? ' · ' : ''}{VEHICLE_TYPE_LABEL[v.type] ?? v.type}</p>
                      </div>
                    </div>
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}
                    </span>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500 flex items-center gap-1"><Fuel size={11} />Nhiên liệu</span>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${v.fuel_level < 25 ? 'bg-red-500' : v.fuel_level < 50 ? 'bg-orange-400' : 'bg-green-500'}`} style={{ width: `${v.fuel_level}%` }} />
                        </div>
                        <span className="font-medium text-[#1e2a3a]">{v.fuel_level}%</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500 flex items-center gap-1"><Shield size={11} />Bảo hiểm</span>
                      <span className={`font-medium ${insWarn ? 'text-red-500' : 'text-gray-700'}`}>{v.insurance_expiry ? formatDate(v.insurance_expiry) : '—'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Đăng kiểm</span>
                      <span className={`font-medium ${regWarn ? 'text-red-500' : 'text-gray-700'}`}>{v.registration_expiry ? formatDate(v.registration_expiry) : '—'}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Tổng chuyến</span>
                      <span className="font-medium text-[#1e2a3a]">{v.total_trips} chuyến</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">Kho phụ trách</span>
                      {v.warehouse_name
                        ? <span className="font-medium text-indigo-700">{v.warehouse_name}</span>
                        : <span className="text-gray-300">—</span>}
                    </div>
                  </div>

                  {v.notes && <p className="text-xs text-yellow-700 bg-yellow-100 rounded-lg px-2 py-1 mb-3">{v.notes}</p>}

                  <button onClick={() => setModal(v)} className="w-full py-1.5 border border-[#e5e7eb] text-xs font-medium text-gray-600 rounded-lg hover:bg-gray-50 hover:border-[var(--mia-primary)] hover:text-[var(--mia-primary)] transition-colors">
                    Chỉnh sửa thông tin
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {!loading && Math.ceil(filtered.length / PAGE_SIZE) > 1 && (
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

      {modal && (
        <VehicleFormModal
          vehicle={modal === 'new' ? undefined : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}
