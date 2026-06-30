'use client'
import { useState, useEffect, useCallback } from 'react'
import { CalendarDays, Truck, MapPin, Package, Plus, Zap, ChevronDown, ChevronUp, X, CheckCircle2, Navigation, NavigationOff, Loader2, AlertCircle } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { formatVND } from '@/lib/utils'
import { useDriverTracking } from '@/hooks/useDriverTracking'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'
import { useOrdersRealtime } from '@/hooks/useOrdersRealtime'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'
import WorkflowBanner from '@/components/workflow/WorkflowBanner'

// ─── Types ────────────────────────────────────────────────────────────────────
interface DeliveryStop {
  order_id: string      // sales_order UUID
  order_code: string    // display code e.g. SO-260622-001
  customer: string
  address: string
  cod: number
  weight_kg: number
  priority: 'high' | 'normal'
  time_window?: string
  delivery_id?: string  // UUID once saved to DB
}

interface RouteGroup {
  id: string            // 'r'+timestamp for local routes, UUID for DB-backed
  date: string
  route_name: string
  vehicle_plate: string
  vehicle_id?: string
  driver_name: string
  driver_phone: string
  driver_id?: string
  stops: DeliveryStop[]
  total_km: number
  total_cod: number
  status: 'planned' | 'dispatched' | 'completed'
  ai_optimized: boolean
}

interface UnassignedOrder {
  id: string            // sales_order UUID
  code: string          // display code
  customer: string
  address: string
  cod: number
  weight_kg: number
  priority: 'high' | 'normal'
  date_needed: string
}

interface VehicleOption {
  id: string
  plate: string
  type: string
  driver_id: string | null
  driver_name: string
  driver_phone: string
}

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  planned:    { label: 'Đã lập kế hoạch', className: 'bg-blue-100 text-blue-700' },
  dispatched: { label: 'Đã xuất phát',    className: 'bg-sky-100 text-sky-700' },
  completed:  { label: 'Hoàn thành',      className: 'bg-green-100 text-green-700' },
}

function mapDeliveryStatus(s: string): 'planned' | 'dispatched' | 'completed' {
  if (s === 'delivering') return 'dispatched'
  if (s === 'delivered')  return 'completed'
  return 'planned'
}

// ─── Create Route Modal ───────────────────────────────────────────────────────
function CreateRouteModal({
  onSave,
  onClose,
}: {
  onSave: (route: RouteGroup) => void
  onClose: () => void
}) {
  const { id: tenantId } = useTenant()
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ route_name: '', date: today, vehicle_id: '', total_km: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])

  useEffect(() => {
    if (!tenantId) return
    // vehicles không có driver_id — join ngược từ drivers.vehicle_id
    Promise.all([
      supabase.from('vehicles').select('id, plate, type').eq('tenant_id', tenantId).neq('status', 'inactive').order('plate').limit(50),
      supabase.from('drivers').select('id, name, phone, vehicle_id').eq('tenant_id', tenantId),
    ]).then(([vehRes, drvRes]) => {
      const driverByVehicle: Record<string, any> = {}
      ;(drvRes.data ?? []).forEach((d: any) => { if (d.vehicle_id) driverByVehicle[d.vehicle_id] = d })
      setVehicles((vehRes.data ?? []).map((v: any) => ({
        id: v.id,
        plate: v.plate,
        type: v.type ?? '—',
        driver_id: driverByVehicle[v.id]?.id ?? null,
        driver_name: driverByVehicle[v.id]?.name ?? 'Chưa có tài xế',
        driver_phone: driverByVehicle[v.id]?.phone ?? '',
      })))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  const selectedVehicle = vehicles.find(v => v.id === form.vehicle_id)

  const set = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.route_name.trim()) e.route_name = 'Nhập tên tuyến đường'
    if (!form.date) e.date = 'Chọn ngày giao'
    if (!form.vehicle_id) e.vehicle_id = 'Chọn xe'
    return e
  }

  const handleSave = () => {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    const v = selectedVehicle!
    const newRoute: RouteGroup = {
      id: 'r' + Date.now(),
      date: form.date,
      route_name: form.route_name.trim(),
      vehicle_plate: v.plate,
      vehicle_id: v.id,
      driver_name: v.driver_name,
      driver_phone: v.driver_phone,
      driver_id: v.driver_id ?? undefined,
      stops: [],
      total_km: Number(form.total_km) || 0,
      total_cod: 0,
      status: 'planned',
      ai_optimized: false,
    }
    onSave(newRoute)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
          <p className="text-sm font-bold text-[#1e2a3a]">Tạo kế hoạch giao hàng</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Tên tuyến đường <span className="text-red-500">*</span></label>
            <input value={form.route_name} onChange={e => set('route_name', e.target.value)}
              placeholder="VD: HN → Bắc Ninh → Bắc Giang"
              className={`w-full h-9 px-3 text-sm rounded-lg border outline-none transition-colors focus:border-[var(--mia-primary)] focus:ring-1 focus:ring-[var(--mia-primary)] ${errors.route_name ? 'border-red-400' : 'border-[#e5e7eb]'}`} />
            {errors.route_name && <p className="text-[10px] text-red-500 mt-0.5">{errors.route_name}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Ngày giao <span className="text-red-500">*</span></label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
              className={`w-full h-9 px-3 text-sm rounded-lg border outline-none transition-colors focus:border-[var(--mia-primary)] focus:ring-1 focus:ring-[var(--mia-primary)] ${errors.date ? 'border-red-400' : 'border-[#e5e7eb]'}`} />
            {errors.date && <p className="text-[10px] text-red-500 mt-0.5">{errors.date}</p>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Xe & Tài xế <span className="text-red-500">*</span></label>
            <select value={form.vehicle_id} onChange={e => set('vehicle_id', e.target.value)}
              className={`w-full h-9 px-3 text-sm rounded-lg border outline-none transition-colors focus:border-[var(--mia-primary)] focus:ring-1 focus:ring-[var(--mia-primary)] bg-white ${errors.vehicle_id ? 'border-red-400' : 'border-[#e5e7eb]'}`}>
              <option value="">-- Chọn xe --</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.plate} · {v.type} · {v.driver_name}</option>
              ))}
            </select>
            {errors.vehicle_id && <p className="text-[10px] text-red-500 mt-0.5">{errors.vehicle_id}</p>}
            {selectedVehicle && (
              <p className="text-[10px] text-gray-400 mt-1">SĐT tài xế: {selectedVehicle.driver_phone || '—'}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Quãng đường ước tính (km)</label>
            <input type="number" min="0" value={form.total_km} onChange={e => set('total_km', e.target.value)}
              placeholder="VD: 150"
              className="w-full h-9 px-3 text-sm rounded-lg border border-[#e5e7eb] outline-none transition-colors focus:border-[var(--mia-primary)] focus:ring-1 focus:ring-[var(--mia-primary)]" />
          </div>

          <p className="text-[10px] text-gray-400">Sau khi tạo, thêm đơn từ "Chưa phân tuyến" để kế hoạch được lưu vào hệ thống.</p>
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-[#e5e7eb] text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            Hủy
          </button>
          <button onClick={handleSave}
            className="flex-1 h-10 rounded-xl bg-[var(--mia-primary)] text-white text-sm font-semibold hover:opacity-90 hover:scale-[1.01] active:scale-95 transition-all">
            Tạo kế hoạch
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Add to Route Modal ───────────────────────────────────────────────────────
function AddToRouteModal({
  order,
  routes,
  onAdd,
  onClose,
}: {
  order: UnassignedOrder
  routes: RouteGroup[]
  onAdd: (orderId: string, routeId: string) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const eligible = routes.filter(r => r.status !== 'completed')

  const handleConfirm = () => {
    if (!selected) return
    onAdd(order.id, selected)
    setDone(true)
    setTimeout(onClose, 900)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
          <div>
            <p className="text-sm font-bold text-[#1e2a3a]">Thêm vào tuyến</p>
            <p className="text-xs text-gray-500 mt-0.5">{order.code} · {order.customer}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>

        {done ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <CheckCircle2 size={40} className="text-green-500" />
            <p className="text-sm font-semibold text-green-700">Đã thêm vào tuyến!</p>
          </div>
        ) : (
          <>
            <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
              {eligible.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Không có tuyến nào khả dụng</p>
              )}
              {eligible.map(r => (
                <button key={r.id} onClick={() => setSelected(r.id)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                    selected === r.id
                      ? 'border-[var(--mia-primary)] bg-sky-50'
                      : 'border-[#e5e7eb] hover:border-gray-300 hover:bg-gray-50'
                  }`}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-[#1e2a3a]">{r.route_name}</p>
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selected === r.id ? 'border-[var(--mia-primary)] bg-[var(--mia-primary)]' : 'border-gray-300'}`}>
                      {selected === r.id && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">{r.vehicle_plate} · {r.driver_name} · {r.stops.length} điểm</p>
                  <p className="text-[10px] text-gray-400">{new Date(r.date).toLocaleDateString('vi-VN', { day:'2-digit', month:'2-digit' })}</p>
                </button>
              ))}
            </div>
            <div className="px-4 pb-4">
              <button onClick={handleConfirm} disabled={!selected}
                className="w-full py-2.5 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-xl hover:opacity-90 hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100">
                Xác nhận thêm
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Live Location Display (manager side) ────────────────────────────────────
function LiveLocationDisplay({ driverName }: { driverName: string }) {
  const { id: tenantId } = useTenant()
  const [loc, setLoc] = useState<{ lat: number; lng: number; speedKmh: number | null; updatedAt: string } | null>(null)

  useEffect(() => {
    if (!driverName || driverName === '—' || !tenantId) return

    const load = async () => {
      const { data } = await supabase
        .from('driver_locations')
        .select('lat, lng, speed_kmh, updated_at')
        .eq('driver_name', driverName)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      setLoc(data ? { lat: data.lat, lng: data.lng, speedKmh: data.speed_kmh, updatedAt: data.updated_at } : null)
    }

    load()
    const ch = supabase
      .channel(`loc-${driverName}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'driver_locations' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [driverName, tenantId])

  if (!loc) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-gray-400 px-1">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
        Tài xế chưa chia sẻ vị trí GPS
      </div>
    )
  }

  return (
    <a
      href={`https://maps.google.com/?q=${loc.lat},${loc.lng}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 hover:bg-green-100 px-3 py-2 transition-colors"
    >
      <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
      <Navigation size={10} className="text-green-600 shrink-0" />
      <span className="text-[10px] font-semibold text-green-700">
        {loc.speedKmh !== null ? `${loc.speedKmh} km/h` : 'Đỗ xe'}
      </span>
      <span className="text-[10px] text-green-600">
        {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
      </span>
      <span className="text-[10px] text-gray-400 ml-auto whitespace-nowrap">
        {new Date(loc.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </a>
  )
}

// ─── Driver Tracking Button ───────────────────────────────────────────────────
function DriverTrackingButton({ route }: { route: RouteGroup }) {
  const { id: tenantId } = useTenant()
  const { active, lat, lng, speedKmh, accuracy, error, start, stop } = useDriverTracking(
    route.driver_name,
    route.vehicle_plate,
    route.id,
    route.route_name,
    tenantId,
  )
  const [starting, setStarting] = useState(false)

  const handleStart = () => {
    setStarting(true)
    start()
    setTimeout(() => setStarting(false), 3000)
  }

  if (active) {
    return (
      <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold text-green-700">Đang chia sẻ vị trí</span>
          </div>
          <button
            onClick={stop}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors">
            <NavigationOff size={11} /> Dừng
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-white rounded-lg p-1.5">
            <p className="text-[10px] text-gray-400">Tốc độ</p>
            <p className="text-xs font-bold text-[#1e2a3a]">{speedKmh !== null ? speedKmh + ' km/h' : '—'}</p>
          </div>
          <div className="bg-white rounded-lg p-1.5">
            <p className="text-[10px] text-gray-400">Độ chính xác</p>
            <p className="text-xs font-bold text-[#1e2a3a]">{accuracy !== null ? accuracy + ' m' : '—'}</p>
          </div>
          <div className="bg-white rounded-lg p-1.5">
            <p className="text-[10px] text-gray-400">Tọa độ</p>
            <p className="text-xs font-bold text-[#1e2a3a] truncate">
              {lat !== null ? lat.toFixed(4) + ', ' + lng!.toFixed(4) : '—'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-3">
      {error && (
        <p className="text-xs text-red-500 mb-1.5 flex items-center gap-1">⚠ {error}</p>
      )}
      <button
        onClick={handleStart}
        disabled={starting}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-[#1e2a3a] text-white text-xs font-semibold hover:bg-[#1a3a5c] hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-60">
        {starting
          ? <><Loader2 size={13} className="animate-spin" /> Đang lấy vị trí...</>
          : <><Navigation size={13} /> Bắt đầu chia sẻ vị trí</>}
      </button>
    </div>
  )
}

// ─── Route Card ───────────────────────────────────────────────────────────────
function RouteCard({ route, onDispatch }: { route: RouteGroup; onDispatch: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const s = STATUS_MAP[route.status]
  const isLocal = route.id.startsWith('r')
  const canDispatch = route.status === 'planned' && route.stops.length > 0

  return (
    <div className={`bg-white rounded-xl border ${route.status === 'dispatched' ? 'border-sky-300' : 'border-[#e5e7eb]'} overflow-hidden`}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 bg-[#1e2a3a] rounded-xl flex items-center justify-center shrink-0">
              <Truck size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-[#1e2a3a] truncate">{route.route_name}</h3>
                {route.ai_optimized && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-semibold rounded-full">
                    <Zap size={9} /> AI tối ưu
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{route.vehicle_plate} · {route.driver_name} · {route.driver_phone}</p>
            </div>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${s.className}`}>{s.label}</span>
        </div>

        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><MapPin size={11} />{route.total_km} km</span>
          <span className="flex items-center gap-1"><Package size={11} />{route.stops.length} điểm</span>
          <span className="font-semibold text-[#1e2a3a]">COD: {formatVND(route.total_cod)}</span>
        </div>

        {isLocal && route.stops.length === 0 && (
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5">
            <AlertCircle size={11} />
            Thêm đơn vào tuyến này để lưu vào hệ thống
          </div>
        )}

        <div className="flex items-center justify-between mt-3">
          <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1 text-xs text-[var(--mia-primary)] font-medium hover:text-[#0284c7] transition-colors">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? 'Thu gọn' : `Xem ${route.stops.length} điểm giao`}
          </button>
          {canDispatch && (
            <button onClick={() => onDispatch(route.id)}
              className="px-3 py-1.5 bg-[var(--mia-primary)] text-white text-xs font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
              Điều xe xuất phát
            </button>
          )}
          {route.status === 'dispatched' && (
            <span className="flex items-center gap-1 text-xs text-sky-600 font-semibold">
              <Truck size={12} /> Đang trên đường
            </span>
          )}
        </div>

        {route.status === 'dispatched' && (
          <>
            <LiveLocationDisplay driverName={route.driver_name} />
            <DriverTrackingButton route={route} />
          </>
        )}
      </div>

      {expanded && (
        <div className="border-t border-[#e5e7eb] bg-gray-50">
          {route.stops.map((stop, i) => (
            <div key={stop.order_id} className="flex items-start gap-3 px-4 py-3 border-b border-[#f0f2f5] last:border-0">
              <div className="flex flex-col items-center shrink-0 mt-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${stop.priority === 'high' ? 'bg-red-500' : 'bg-[var(--mia-primary)]'}`}>
                  {i + 1}
                </div>
                {i < route.stops.length - 1 && <div className="w-px h-4 bg-gray-300 mt-1" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#1e2a3a] truncate">{stop.customer}</p>
                  {stop.time_window && <span className="text-[10px] text-gray-400 shrink-0">{stop.time_window}</span>}
                </div>
                <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                  <MapPin size={9} />{stop.address}
                </p>
                <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
                  <span className="text-gray-400">{stop.order_code}</span>
                  <span>COD: <strong className="text-[#1e2a3a]">{formatVND(stop.cod)}</strong></span>
                  <span>{stop.weight_kg} kg</span>
                  {stop.priority === 'high' && <span className="text-red-500 font-semibold">Ưu tiên cao</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Driver View ─────────────────────────────────────────────────────────────
const FAIL_REASONS_DV = ['Khách vắng mặt', 'Sai địa chỉ', 'Khách từ chối nhận', 'Hàng bị hư hỏng', 'Khác']

function DriverView({ userId }: { userId: string }) {
  useTenant() // đảm bảo tenant context được load, CSS var --mia-primary được set
  const [pending, setPending]       = useState<any[]>([])  // chưa giao
  const [delivered, setDelivered]   = useState<any[]>([])  // đã giao hôm nay
  const [loading, setLoading]       = useState(true)
  const [confirmId, setConfirmId]   = useState<string | null>(null)
  const [failId, setFailId]         = useState<string | null>(null)
  const [failReason, setFailReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const selectFields = `id, code, status, cod_collected, driver_id, vehicle_id,
    sales_order:sales_orders(
      code, final_amount,
      customer:customers(name, address, phone),
      items:sales_order_items(quantity, product:products(name, unit))
    )`

  const load = async () => {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0)

    // vehicles không có cột driver_id — dùng drivers.vehicle_id là nguồn sự thật
    const { data: driverRecord } = await supabase
      .from('drivers').select('vehicle_id').eq('id', userId).maybeSingle()
    const vehicleId = driverRecord?.vehicle_id ?? null

    // Query deliveries theo driver_id HOẶC vehicle_id (bắt cả trường hợp dispatch chỉ lưu vehicle_id)
    const buildFilter = (q: any) => {
      if (vehicleId) return q.or(`driver_id.eq.${userId},vehicle_id.eq.${vehicleId}`)
      return q.eq('driver_id', userId)
    }

    const [pendingRes, deliveredRes] = await Promise.all([
      buildFilter(supabase.from('deliveries').select(selectFields))
        .in('status', ['pending', 'assigned', 'delivering'])
        .order('planned_date'),
      buildFilter(supabase.from('deliveries').select(selectFields))
        .eq('status', 'delivered')
        .gte('actual_date', todayStart.toISOString())
        .order('actual_date', { ascending: false }),
    ])

    // Dedup (phòng trường hợp trùng từ 2 điều kiện)
    const dedup = (arr: any[]) => arr.filter((d, i, a) => a.findIndex(x => x.id === d.id) === i)
    setPending(dedup(pendingRes.data ?? []))
    setDelivered(dedup(deliveredRes.data ?? []))
    setLoading(false)
  }
  useEffect(() => {
    if (!userId) return
    load()
    const channel = supabase
      .channel(`driver-view-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  const handleConfirm = async () => {
    if (!confirmId) return
    setSubmitting(true)
    const d = pending.find(x => x.id === confirmId)
    const codAmount = Number((d?.sales_order as any)?.final_amount ?? 0)
    const token = await getToken()
    await fetch(`/api/deliveries/${confirmId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'delivered', cod_collected: codAmount }),
    })
    setConfirmId(null); setSubmitting(false)
  }

  const handleFail = async () => {
    if (!failId || !failReason) return
    setSubmitting(true)
    const token = await getToken()
    await fetch(`/api/deliveries/${failId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'failed' }),
    })
    setFailId(null); setFailReason(''); setSubmitting(false)
  }

  const totalCodCollected = delivered.reduce((s, d) => s + Number(d.cod_collected ?? 0), 0)
  const totalCodPending   = pending.reduce((s, d) => s + Number((d.sales_order as any)?.final_amount ?? 0), 0)

  if (loading) return <div className="p-10 text-center text-gray-400 text-sm">Đang tải đơn giao hàng...</div>

  return (
    <div>
      <PageHeader title="Kế hoạch giao hàng" subtitle="Đơn hàng được phân công cho bạn hôm nay" />

      {/* COD summary */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-xs text-green-600 font-medium mb-1">COD đã thu</p>
          <p className="text-xl font-bold text-green-700">{formatVND(totalCodCollected)}</p>
          <p className="text-[10px] text-green-500 mt-0.5">{delivered.length} đơn hoàn thành</p>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="text-xs text-orange-600 font-medium mb-1">COD còn phải thu</p>
          <p className="text-xl font-bold text-orange-700">{formatVND(totalCodPending)}</p>
          <p className="text-[10px] text-orange-500 mt-0.5">{pending.length} đơn chưa giao</p>
        </div>
      </div>

      {/* Pending deliveries */}
      {pending.length === 0 && delivered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#e5e7eb] p-16 text-center">
          <CheckCircle2 size={40} className="mx-auto text-green-400 mb-3" />
          <p className="text-base font-semibold text-gray-600">Không có đơn giao hàng nào hôm nay</p>
          <p className="text-sm text-gray-400 mt-1">Liên hệ điều phối nếu bạn đã được phân công</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((d, idx) => {
            const so = d.sales_order as any
            const customer = so?.customer
            const items: any[] = so?.items ?? []
            const cod = Number(so?.final_amount ?? 0)
            return (
              <div key={d.id} className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[var(--mia-primary)]">Điểm {idx + 1}</span>
                      <span className="text-xs text-gray-400">{d.code}</span>
                    </div>
                    <p className="text-base font-bold text-[#1e2a3a] mt-0.5">{customer?.name ?? '—'}</p>
                    {customer?.address && <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><MapPin size={10} />{customer.address}</p>}
                    {customer?.phone  && <a href={`tel:${customer.phone}`} className="text-xs text-blue-600 mt-1 block">{customer.phone}</a>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-400">COD</p>
                    <p className="text-base font-bold text-green-700">{formatVND(cod)}</p>
                  </div>
                </div>

                {items.length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-0.5">
                    {items.map((it, i) => (
                      <p key={i} className="text-xs text-gray-600">{it.quantity} {it.product?.unit} {it.product?.name}</p>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setConfirmId(d.id)}
                    className="flex-1 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 transition-all active:scale-95">
                    <CheckCircle2 size={14} className="inline mr-1.5" />Đã giao · {formatVND(cod)}
                  </button>
                  <button onClick={() => setFailId(d.id)}
                    className="px-4 py-2.5 bg-red-50 text-red-600 text-sm font-semibold rounded-xl border border-red-200 hover:bg-red-100 transition-all active:scale-95">
                    Thất bại
                  </button>
                </div>
              </div>
            )
          })}

          {/* Delivered today */}
          {delivered.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Đã giao hôm nay</p>
              {delivered.map(d => {
                const so = d.sales_order as any
                return (
                  <div key={d.id} className="bg-gray-50 rounded-xl border border-[#e5e7eb] px-4 py-3 flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-700">{so?.customer?.name ?? '—'}</p>
                      <p className="text-[10px] text-gray-400">{d.code}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-green-700">+{formatVND(Number(d.cod_collected ?? 0))}</p>
                      <span className="text-[10px] text-green-600">✓ Đã thu</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Confirm modal — không cần nhập COD, tự lấy từ đơn hàng */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-[#1e2a3a] mb-2">Xác nhận đã giao?</h3>
            {(() => {
              const d = pending.find(x => x.id === confirmId)
              const cod = Number((d?.sales_order as any)?.final_amount ?? 0)
              return (
                <div className="bg-green-50 rounded-xl p-4 mb-4 text-center">
                  <p className="text-xs text-green-600 mb-1">COD thu được</p>
                  <p className="text-2xl font-bold text-green-700">{formatVND(cod)}</p>
                </div>
              )
            })()}
            <div className="flex gap-2">
              <button onClick={() => setConfirmId(null)} className="flex-1 py-2 text-sm border border-[#e5e7eb] rounded-lg hover:bg-gray-50">Hủy</button>
              <button onClick={handleConfirm} disabled={submitting}
                className="flex-1 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50">
                {submitting ? 'Đang lưu...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fail modal */}
      {failId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="text-base font-bold text-[#1e2a3a] mb-4">Báo giao thất bại</h3>
            <div className="space-y-2 mb-4">
              {FAIL_REASONS_DV.map(r => (
                <label key={r} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer ${failReason === r ? 'border-red-300 bg-red-50' : 'border-[#e5e7eb]'}`}>
                  <input type="radio" name="failreason" value={r} checked={failReason === r} onChange={() => setFailReason(r)} className="accent-red-500" />
                  <span className="text-sm text-gray-700">{r}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setFailId(null); setFailReason('') }} className="flex-1 py-2 text-sm border border-[#e5e7eb] rounded-lg hover:bg-gray-50">Hủy</button>
              <button onClick={handleFail} disabled={!failReason || submitting}
                className="flex-1 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40">
                {submitting ? 'Đang lưu...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KeHoachGiaoHangPage() {
  const { id: tenantId } = useTenant()
  const today = new Date().toISOString().slice(0, 10)
  const [currentRole, setCurrentRole] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentRole(session?.user?.user_metadata?.role ?? null)
      setCurrentUserId(session?.user?.id ?? null)
    })
  }, [])
  const [routes, setRoutes]         = useState<RouteGroup[]>([])
  const [unassigned, setUnassigned] = useState<UnassignedOrder[]>([])
  const [orphanedDelivering, setOrphanedDelivering] = useState<{ id: string; code: string; customer: string }[]>([])
  const [fixingOrphan, setFixingOrphan] = useState<string | null>(null)
  const [orphanError, setOrphanError]   = useState<string | null>(null)
  const [availableVehicles, setAvailableVehicles] = useState<{ plate: string; type: string; driver: string; status: string }[]>([])
  const [loading, setLoading]       = useState(true)
  const [addModal, setAddModal]     = useState<UnassignedOrder | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [dateFilter, setDateFilter] = useState('')
  const [showAI, setShowAI]         = useState(true)
  const [aiText, setAiText]         = useState('')
  const [aiLoading, setAiLoading]   = useState(false)

  const loadAll = useCallback(async () => {
    if (!tenantId) return
    const [{ data: deliveries }, { data: pickedOrders }, { data: vehiclesData }, { data: driversData }, { data: deliveringOrders }] = await Promise.all([
      supabase
        .from('deliveries')
        .select(`id, code, route, planned_date, distance_km, status, vehicle_id, driver_id,
          sales_order:sales_orders(id, code, final_amount, customer:customers(name, address)),
          vehicle:vehicles(plate, type),
          driver:drivers(name, phone)`)
        .eq('tenant_id', tenantId)
        .order('planned_date'),
      supabase
        .from('sales_orders')
        .select(`id, code, final_amount, delivery_date, customer:customers(name, address)`)
        .eq('tenant_id', tenantId)
        .in('status', ['picked', 'pending_ship'])
        .order('delivery_date'),
      // vehicles không có driver_id — fetch riêng và match qua drivers.vehicle_id
      supabase
        .from('vehicles')
        .select(`id, plate, type, status`)
        .eq('tenant_id', tenantId)
        .neq('status', 'inactive')
        .order('plate'),
      supabase.from('drivers').select('id, name, vehicle_id').eq('tenant_id', tenantId),
      // Đơn đang giao nhưng chưa đi qua module logistics (không có delivery record)
      supabase
        .from('sales_orders')
        .select(`id, code, customer:customers(name)`)
        .eq('tenant_id', tenantId)
        .eq('status', 'delivering')
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    // Group deliveries by route name (multi-stop support)
    const routeMap = new Map<string, RouteGroup>()
    for (const d of deliveries ?? []) {
      const groupKey = d.route || d.id
      if (!routeMap.has(groupKey)) {
        routeMap.set(groupKey, {
          id: d.id,
          date: d.planned_date ? d.planned_date.slice(0, 10) : today,
          route_name: d.route || d.code,
          vehicle_plate: (d.vehicle as any)?.plate ?? '—',
          vehicle_id: d.vehicle_id ?? undefined,
          driver_name: (d.driver as any)?.name ?? '—',
          driver_phone: (d.driver as any)?.phone ?? '',
          driver_id: d.driver_id ?? undefined,
          stops: [],
          total_km: Number(d.distance_km ?? 0),
          total_cod: 0,
          status: mapDeliveryStatus(d.status),
          ai_optimized: false,
        })
      }
      const group = routeMap.get(groupKey)!
      const so = d.sales_order as any
      if (so) {
        group.stops.push({
          order_id: so.id,
          order_code: so.code ?? '',
          customer: so.customer?.name ?? '—',
          address: so.customer?.address ?? '',
          cod: Number(so.final_amount ?? 0),
          weight_kg: 0,
          priority: 'normal',
          delivery_id: d.id,
        })
        group.total_cod += Number(so.final_amount ?? 0)
      }
    }

    setRoutes(prev => {
      // Preserve local routes (no DB backing yet) that aren't in DB
      const localRoutes = prev.filter(r => r.id.startsWith('r') && r.stops.length === 0)
      return [...Array.from(routeMap.values()), ...localRoutes]
    })

    // Đơn được coi là "đã phân" chỉ khi delivery có tài xế hoặc xe → tránh delivery rỗng chặn đơn
    const assignedOrderIds = new Set<string>()
    for (const group of routeMap.values()) {
      if (group.driver_id || group.vehicle_id) {
        for (const stop of group.stops) assignedOrderIds.add(stop.order_id)
      }
    }

    setUnassigned((pickedOrders ?? [])
      .filter((o: any) => !assignedOrderIds.has(o.id))
      .map((o: any) => ({
        id: o.id,
        code: o.code,
        customer: o.customer?.name ?? '—',
        address: o.customer?.address ?? '',
        cod: Number(o.final_amount ?? 0),
        weight_kg: 0,
        priority: 'normal' as const,
        date_needed: o.delivery_date ?? today,
      })))

    // Đơn "delivering" nhưng không có delivery record → cần cảnh báo
    const ordersWithDelivery = new Set(
      (deliveries ?? []).map((d: any) => (d.sales_order as any)?.id).filter(Boolean)
    )
    setOrphanedDelivering((deliveringOrders ?? [])
      .filter((o: any) => !ordersWithDelivery.has(o.id))
      .map((o: any) => ({
        id: o.id,
        code: o.code ?? '',
        customer: (o.customer as any)?.name ?? '—',
      }))
    )

    const driverByVehicle2: Record<string, string> = {}
    ;(driversData ?? []).forEach((d: any) => { if (d.vehicle_id) driverByVehicle2[d.vehicle_id] = d.name })
    setAvailableVehicles((vehiclesData ?? []).map((v: any) => ({
      plate: v.plate,
      type: v.type ?? '—',
      driver: driverByVehicle2[v.id] ?? 'Chưa phân tài xế',
      status: v.status,
    })))

    setLoading(false)
  }, [tenantId, today])

  useEffect(() => { if (!tenantId) return; loadAll() }, [tenantId, loadAll])
  useEffect(() => {
    if (!loading && unassigned.length > 0) fetchAiRoute(unassigned)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])
  useOrdersRealtime(loadAll)
  useAutoRefresh(loadAll, 15_000)

  const fixOrphan = async (orderId: string, orderCode: string) => {
    setFixingOrphan(orderId)
    setOrphanError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''

      // Kiểm tra đã có delivery chưa — dùng tenant_id filter tường minh tránh RLS edge case
      const { data: existingRows, error: checkErr } = await supabase
        .from('deliveries')
        .select('id, status')
        .eq('sales_order_id', orderId)
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)

      if (checkErr) throw new Error(`Lỗi kiểm tra: ${checkErr.message}`)
      const existing = existingRows?.[0] ?? null

      if (existing?.id) {
        // Delivery đã tồn tại — đẩy lên delivering nếu chưa
        if (existing.status !== 'delivering' && existing.status !== 'delivered') {
          const patchRes = await fetch(`/api/deliveries/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status: 'delivering' }),
          })
          if (!patchRes.ok) {
            const err = await patchRes.json().catch(() => ({}))
            throw new Error(err.error ?? `Cập nhật thất bại (${patchRes.status})`)
          }
        }
      } else {
        // Chưa có → tạo mới
        const today = new Date()
        const prefix = `DV-${today.getFullYear().toString().slice(2)}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`
        const { count: dvCount } = await supabase.from('deliveries').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
        const code = `${prefix}-${String((dvCount ?? 0) + 1).padStart(3, '0')}`
        const postRes = await fetch('/api/deliveries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            code,
            sales_order_id: orderId,
            status: 'delivering',
            planned_date: today.toISOString(),
            carrier_type: 'own',
          }),
        })
        if (!postRes.ok) {
          const err = await postRes.json().catch(() => ({}))
          throw new Error(err.error ?? `Tạo bản ghi thất bại (${postRes.status})`)
        }
      }

      // Xóa filter ngày để tuyến mới (hôm nay) luôn hiển thị
      setDateFilter('')
      await loadAll()
    } catch (e: any) {
      setOrphanError(e?.message ?? 'Lỗi không xác định')
    } finally {
      setFixingOrphan(null)
    }
  }

  // Route "dispatched" luôn hiện dù có filter ngày (tránh ẩn đơn đang giao)
  const filteredRoutes = routes.filter(r => !dateFilter || r.date === dateFilter || r.status === 'dispatched')
  const dates = [...new Set(routes.map(r => r.date))].sort()

  const handleDispatch = async (routeId: string) => {
    const route = routes.find(r => r.id === routeId)
    if (!route) return

    const deliveryIds = route.stops.map(s => s.delivery_id).filter(Boolean) as string[]
    if (deliveryIds.length === 0) return

    setRoutes(prev => prev.map(r => r.id === routeId ? { ...r, status: 'dispatched' } : r))

    // Re-fetch driver_id mới nhất từ bảng drivers tại thời điểm dispatch (tránh stale state khi vừa tái gán xe)
    let currentDriverId = route.driver_id ?? null
    if (route.vehicle_id) {
      const { data: drv } = await supabase.from('drivers').select('id').eq('vehicle_id', route.vehicle_id).maybeSingle()
      if (drv?.id) currentDriverId = drv.id
    }

    const results = await Promise.all(deliveryIds.map(id =>
      fetch(`/api/deliveries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'delivering',
          driver_id: currentDriverId,
          vehicle_id: route.vehicle_id ?? null,
        }),
      })
    ))

    if (results.some(r => !r.ok)) return
  }

  const fetchAiRoute = async (orders: UnassignedOrder[]) => {
    if (orders.length === 0) return
    setAiLoading(true)
    setAiText('')
    try {
      const res = await fetch('/api/ai/delivery-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unassigned: orders,
          vehicles: availableVehicles.map(v => ({
            plate: v.plate, type: v.type, driver: v.driver, capacity_kg: 1000,
          })),
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      let text = data.summary ?? ''
      if (data.priority_orders?.length) {
        text += ` Ưu tiên cao: <strong>${data.priority_orders.map((o: any) => `${o.customer} (${o.reason})`).join(', ')}</strong>.`
      }
      if (data.total_km_saved > 0) {
        text += ` Tiết kiệm ước tính: <strong>~${data.total_km_saved} km</strong>.`
      }
      setAiText(text)
    } catch {
      setAiText(`Có <strong>${orders.length} đơn chưa phân tuyến</strong>. Nhấn "Áp dụng" để gán tự động hoặc tạo tuyến thủ công.`)
    } finally {
      setAiLoading(false)
    }
  }

  const handleOptimize = () => {
    setRoutes(prev => prev.map(r => ({ ...r, ai_optimized: true })))
    setShowAI(false)
  }

  const handleCreateRoute = (newRoute: RouteGroup) => {
    setRoutes(prev => [...prev, newRoute])
    setDateFilter(newRoute.date)
  }

  const handleAddToRoute = async (orderId: string, routeId: string) => {
    const order = unassigned.find(o => o.id === orderId)
    const route = routes.find(r => r.id === routeId)
    if (!order || !route) return

    // Optimistic update immediately
    const newStop: DeliveryStop = {
      order_id: order.id,
      order_code: order.code,
      customer: order.customer,
      address: order.address,
      cod: order.cod,
      weight_kg: order.weight_kg,
      priority: order.priority,
    }
    setRoutes(prev => prev.map(r =>
      r.id !== routeId ? r : { ...r, stops: [...r.stops, newStop], total_cod: r.total_cod + order.cod }
    ))
    setUnassigned(prev => prev.filter(o => o.id !== orderId))

    // Save to DB
    if (!route.vehicle_id) return

    const now = new Date()
    const plannedDate = route.date ? new Date(route.date + 'T00:00:00').toISOString() : now.toISOString()

    // Kiểm tra delivery cũ (không có driver/vehicle) → cập nhật thay vì tạo mới
    const { data: existingDeliveries } = await supabase
      .from('deliveries')
      .select('id')
      .eq('sales_order_id', order.id)
      .is('driver_id', null)
      .limit(1)

    let deliveryId: string

    if (existingDeliveries && existingDeliveries.length > 0) {
      deliveryId = existingDeliveries[0].id
      await fetch(`/api/deliveries/${deliveryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_id: route.vehicle_id,
          driver_id: route.driver_id ?? null,
          route: route.route_name,
          planned_date: plannedDate,
        }),
      })
    } else {
      const prefix = `DV-${now.getFullYear().toString().slice(2)}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`
      const { count: dvCount } = await supabase
        .from('deliveries')
        .select('id', { count: 'exact', head: true })
        .like('code', `${prefix}-%`)
      const code = `${prefix}-${String((dvCount ?? 0) + 1).padStart(3, '0')}`

      const res = await fetch('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          sales_order_id: order.id,
          vehicle_id: route.vehicle_id,
          driver_id: route.driver_id ?? null,
          planned_date: plannedDate,
          route: route.route_name,
          carrier_type: 'own',
          status: 'pending',
        }),
      })

      if (!res.ok) return
      const json = await res.json()
      deliveryId = json.id
    }

    // Chuyển SO sang pending_ship để logistics biết đơn đã có kế hoạch giao
    await supabase.from('sales_orders').update({ status: 'pending_ship' }).eq('id', order.id)

    // Attach delivery_id to the stop so dispatch works
    setRoutes(prev => prev.map(r => {
      if (r.id !== routeId) return r
      return {
        ...r,
        stops: r.stops.map(s =>
          s.order_id === order.id && !s.delivery_id ? { ...s, delivery_id: deliveryId } : s
        ),
      }
    }))
  }

  const totalCOD = filteredRoutes.reduce((s, r) => s + r.total_cod, 0)
  const totalKm = filteredRoutes.reduce((s, r) => s + r.total_km, 0)
  const dispatched = filteredRoutes.filter(r => r.status === 'dispatched').length

  // Driver mode: chỉ thấy đơn của mình
  if (currentRole === 'driver' && currentUserId) {
    return <DriverView userId={currentUserId} />
  }

  return (
    <div>
      <PageHeader title="Kế hoạch giao hàng" subtitle="Lập tuyến, tối ưu lộ trình và điều phối xe">
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={15} /> Tạo kế hoạch
        </button>
      </PageHeader>

      <WorkflowBanner
        count={unassigned.length}
        label="đơn đã soạn xong, chưa có tuyến giao"
        hint="Kéo xuống → chọn đơn → thêm vào tuyến"
      />

      {showCreate && (
        <CreateRouteModal onSave={handleCreateRoute} onClose={() => setShowCreate(false)} />
      )}

      {addModal && (
        <AddToRouteModal
          order={addModal}
          routes={routes}
          onAdd={handleAddToRoute}
          onClose={() => setAddModal(null)}
        />
      )}

      {/* Cảnh báo đơn đang giao không có kế hoạch */}
      {orphanedDelivering.length > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-xl p-4 mb-5 flex items-start gap-3">
          <AlertCircle size={18} className="text-orange-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-bold text-orange-800">
              {orphanedDelivering.length} đơn hàng đang giao chưa có kế hoạch vận chuyển
            </p>
            <p className="text-xs text-orange-600 mt-1">
              Các đơn này ở trạng thái "Đang giao" nhưng chưa có bản ghi logistics.
              Nhấn <strong>Tạo bản ghi giao hàng</strong> để hệ thống theo dõi được — driver xác nhận hoàn thành bình thường.
            </p>
            {orphanError && (
              <p className="mt-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                Lỗi: {orphanError}
              </p>
            )}
            <div className="flex flex-col gap-2 mt-3">
              {orphanedDelivering.map(o => (
                <div key={o.id} className="flex items-center justify-between bg-orange-100 rounded-lg px-3 py-2">
                  <span className="text-xs font-semibold text-orange-800">{o.code} · {o.customer}</span>
                  <button
                    onClick={() => fixOrphan(o.id, o.code)}
                    disabled={!!fixingOrphan}
                    className="ml-3 shrink-0 px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-50 flex items-center gap-1"
                  >
                    {fixingOrphan === o.id ? <><Loader2 size={11} className="animate-spin" /> Đang xử lý...</> : 'Tạo bản ghi giao hàng'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AI Suggestion */}
      {showAI && unassigned.length > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🤖</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-blue-800">Gợi ý tối ưu tuyến đường</p>
              <p className="text-xs text-blue-600 mt-1">
                {aiLoading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Đang phân tích {unassigned.length} đơn chưa phân tuyến...
                  </span>
                ) : aiText ? (
                  <span dangerouslySetInnerHTML={{ __html: aiText }} />
                ) : (
                  `Có ${unassigned.length} đơn chưa phân tuyến. Nhấn "Phân tích AI" để nhận gợi ý.`
                )}
              </p>
              <div className="flex gap-2 mt-3">
                {!aiLoading && !aiText && (
                  <button onClick={() => fetchAiRoute(unassigned)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-all hover:scale-[1.02] active:scale-95">
                    <Zap size={12} /> Phân tích AI
                  </button>
                )}
                {aiText && (
                  <button onClick={handleOptimize}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-all hover:scale-[1.02] active:scale-95">
                    <Zap size={12} /> Áp dụng gợi ý AI
                  </button>
                )}
                <button onClick={() => setShowAI(false)}
                  className="px-3 py-1.5 text-xs text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition-colors">
                  Bỏ qua
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Tuyến hôm nay',   value: filteredRoutes.length,  icon: <CalendarDays size={20} className="text-blue-500" />, bg: 'bg-blue-50' },
          { label: 'Đã xuất phát',    value: dispatched,             icon: <Truck size={20} className="text-sky-500" />, bg: 'bg-sky-50' },
          { label: 'Tổng km',         value: `${totalKm} km`,        icon: <MapPin size={20} className="text-purple-500" />, bg: 'bg-purple-50' },
          { label: 'Tổng COD',        value: formatVND(totalCOD),    icon: <Package size={20} className="text-green-500" />, bg: 'bg-green-50' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-[#e5e7eb] p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center shrink-0`}>{k.icon}</div>
            <div>
              <p className="text-xs text-gray-500">{k.label}</p>
              <p className="text-lg font-bold text-[#1e2a3a] whitespace-nowrap">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Route list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setDateFilter('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${!dateFilter ? 'bg-[var(--mia-primary)] text-white' : 'bg-white border border-[#e5e7eb] text-gray-600 hover:bg-gray-50'}`}>
              Tất cả
            </button>
            {dates.map(d => (
              <button key={d} onClick={() => setDateFilter(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dateFilter === d ? 'bg-[var(--mia-primary)] text-white' : 'bg-white border border-[#e5e7eb] text-gray-600 hover:bg-gray-50'}`}>
                {new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </button>
            ))}
          </div>

          {loading
            ? <div className="bg-white rounded-xl border border-[#e5e7eb] p-10 text-center text-gray-400 text-sm">Đang tải kế hoạch...</div>
            : filteredRoutes.length === 0
              ? <div className="bg-white rounded-xl border border-[#e5e7eb] p-10 text-center text-gray-400 text-sm">Không có tuyến nào trong ngày này</div>
              : filteredRoutes.map(r => <RouteCard key={r.id} route={r} onDispatch={handleDispatch} />)
          }
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e5e7eb] flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1e2a3a]">Chưa phân tuyến</h3>
              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full">
                {unassigned.length} đơn
              </span>
            </div>
            {unassigned.length === 0 ? (
              <div className="p-6 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
                <CheckCircle2 size={28} className="text-green-400" />
                Tất cả đơn đã được phân tuyến
              </div>
            ) : (
              <div className="divide-y divide-[#f0f2f5]">
                {unassigned.map(o => (
                  <div key={o.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-[#1e2a3a]">{o.code}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{o.customer}</p>
                        <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5"><MapPin size={9} />{o.address}</p>
                      </div>
                      {o.priority === 'high' && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-[10px] font-bold rounded shrink-0">Gấp</span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-[10px] text-gray-500 space-y-0.5">
                        <p>COD: <strong className="text-[#1e2a3a]">{formatVND(o.cod)}</strong></p>
                        <p>Giao trước: {new Date(o.date_needed).toLocaleDateString('vi-VN')}</p>
                      </div>
                      <button onClick={() => setAddModal(o)}
                        className="px-2.5 py-1 bg-[var(--mia-primary)] text-white text-[10px] font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
                        Thêm vào tuyến
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Vehicle availability */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#e5e7eb]">
              <h3 className="text-sm font-bold text-[#1e2a3a]">Xe trống hôm nay</h3>
            </div>
            <div className="divide-y divide-[#f0f2f5]">
              {availableVehicles.length === 0 ? (
                <p className="p-4 text-xs text-gray-400 text-center">Không có xe nào</p>
              ) : availableVehicles.map(v => (
                <div key={v.plate} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold text-[#1e2a3a]">{v.plate}</p>
                    <p className="text-[10px] text-gray-400">{v.type} · {v.driver}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    v.status === 'available'   ? 'bg-green-100 text-green-700' :
                    v.status === 'on_trip'     ? 'bg-blue-100 text-blue-700' :
                    v.status === 'maintenance' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {v.status === 'available' ? 'Rảnh' : v.status === 'on_trip' ? 'Đang giao' : v.status === 'maintenance' ? 'Bảo trì' : v.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
