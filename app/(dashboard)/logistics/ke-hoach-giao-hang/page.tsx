'use client'
import { useState, useEffect } from 'react'
import { CalendarDays, Truck, MapPin, Package, Plus, Zap, ChevronDown, ChevronUp, X, CheckCircle2, Navigation, NavigationOff, Loader2 } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { formatVND } from '@/lib/utils'
import { useDriverTracking } from '@/hooks/useDriverTracking'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'
import { useOrdersRealtime } from '@/hooks/useOrdersRealtime'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'

// ─── Types ────────────────────────────────────────────────────────────────────
interface DeliveryStop {
  order_id: string; customer: string; address: string
  cod: number; weight_kg: number; priority: 'high' | 'normal'
  time_window?: string
}
interface RouteGroup {
  id: string; date: string; route_name: string
  vehicle_plate: string; driver_name: string; driver_phone: string
  stops: DeliveryStop[]; total_km: number; total_cod: number
  status: 'planned' | 'dispatched' | 'completed'
  ai_optimized: boolean
}

const INIT_UNASSIGNED: { id: string; customer: string; address: string; cod: number; weight_kg: number; priority: 'high' | 'normal'; date_needed: string }[] = []
type UnassignedOrder = typeof INIT_UNASSIGNED[number]

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  planned:    { label: 'Đã lập kế hoạch', className: 'bg-blue-100 text-blue-700' },
  dispatched: { label: 'Đã xuất phát',    className: 'bg-sky-100 text-sky-700' },
  completed:  { label: 'Hoàn thành',      className: 'bg-green-100 text-green-700' },
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
  const [form, setForm] = useState({
    route_name: '',
    date: today,
    vehicle_plate: '',
    total_km: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [vehicles, setVehicles] = useState<{ plate: string; type: string; driver: string; phone: string }[]>([])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    supabase.from('vehicles')
      .select('plate, type, drivers(name, phone)')
      .eq('tenant_id', tenantId)
      .in('status', ['available', 'on_trip'])
      .order('plate')
      .limit(50)
      .then(({ data }) => {
        setVehicles((data ?? []).map((v: any) => {
          const d = Array.isArray(v.drivers) ? v.drivers[0] : v.drivers
          return { plate: v.plate, type: v.type ?? '—', driver: d?.name ?? '—', phone: d?.phone ?? '' }
        }))
      })
  }, [tenantId])

  const selectedVehicle = vehicles.find(v => v.plate === form.vehicle_plate)

  const set = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.route_name.trim()) e.route_name = 'Nhập tên tuyến đường'
    if (!form.date) e.date = 'Chọn ngày giao'
    if (!form.vehicle_plate) e.vehicle_plate = 'Chọn xe'
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
      driver_name: v.driver,
      driver_phone: v.phone,
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
          <p className="text-sm font-bold text-[#1e2a3a]">Tạo kế hoạch giao hàng</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Route name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Tên tuyến đường <span className="text-red-500">*</span></label>
            <input value={form.route_name} onChange={e => set('route_name', e.target.value)}
              placeholder="VD: HN → Bắc Ninh → Bắc Giang"
              className={`w-full h-9 px-3 text-sm rounded-lg border outline-none transition-colors focus:border-[var(--mia-primary)] focus:ring-1 focus:ring-[var(--mia-primary)] ${errors.route_name ? 'border-red-400' : 'border-[#e5e7eb]'}`} />
            {errors.route_name && <p className="text-[10px] text-red-500 mt-0.5">{errors.route_name}</p>}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Ngày giao <span className="text-red-500">*</span></label>
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
              className={`w-full h-9 px-3 text-sm rounded-lg border outline-none transition-colors focus:border-[var(--mia-primary)] focus:ring-1 focus:ring-[var(--mia-primary)] ${errors.date ? 'border-red-400' : 'border-[#e5e7eb]'}`} />
            {errors.date && <p className="text-[10px] text-red-500 mt-0.5">{errors.date}</p>}
          </div>

          {/* Vehicle select */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Xe & Tài xế <span className="text-red-500">*</span></label>
            <select value={form.vehicle_plate} onChange={e => set('vehicle_plate', e.target.value)}
              className={`w-full h-9 px-3 text-sm rounded-lg border outline-none transition-colors focus:border-[var(--mia-primary)] focus:ring-1 focus:ring-[var(--mia-primary)] bg-white ${errors.vehicle_plate ? 'border-red-400' : 'border-[#e5e7eb]'}`}>
              <option value="">-- Chọn xe --</option>
              {vehicles.map(v => (
                <option key={v.plate} value={v.plate}>{v.plate} · {v.type} · {v.driver}</option>
              ))}
            </select>
            {errors.vehicle_plate && <p className="text-[10px] text-red-500 mt-0.5">{errors.vehicle_plate}</p>}
            {selectedVehicle && (
              <p className="text-[10px] text-gray-400 mt-1">SĐT tài xế: {selectedVehicle.phone}</p>
            )}
          </div>

          {/* KM estimate */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Quãng đường ước tính (km)</label>
            <input type="number" min="0" value={form.total_km} onChange={e => set('total_km', e.target.value)}
              placeholder="VD: 150"
              className="w-full h-9 px-3 text-sm rounded-lg border border-[#e5e7eb] outline-none transition-colors focus:border-[var(--mia-primary)] focus:ring-1 focus:ring-[var(--mia-primary)]" />
          </div>

          <p className="text-[10px] text-gray-400">Sau khi tạo, bạn có thể thêm điểm giao từ mục "Chưa phân tuyến" bên phải.</p>
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
          <div>
            <p className="text-sm font-bold text-[#1e2a3a]">Thêm vào tuyến</p>
            <p className="text-xs text-gray-500 mt-0.5">{order.id} · {order.customer}</p>
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

  return (
    <div className={`bg-white rounded-xl border ${route.status === 'dispatched' ? 'border-sky-300' : 'border-[#e5e7eb]'} overflow-hidden`}>
      {/* Header */}
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

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <span className="flex items-center gap-1"><MapPin size={11} />{route.total_km} km</span>
          <span className="flex items-center gap-1"><Package size={11} />{route.stops.length} điểm</span>
          <span className="font-semibold text-[#1e2a3a]">COD: {formatVND(route.total_cod)}</span>
        </div>

        {/* Stops preview / expand */}
        <div className="flex items-center justify-between mt-3">
          <button onClick={() => setExpanded(v => !v)} className="flex items-center gap-1 text-xs text-[var(--mia-primary)] font-medium hover:text-[#0284c7] transition-colors">
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {expanded ? 'Thu gọn' : `Xem ${route.stops.length} điểm giao`}
          </button>
          {route.status === 'planned' && (
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
          <DriverTrackingButton route={route} />
        )}
      </div>

      {/* Stop list (expandable) */}
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function KeHoachGiaoHangPage() {
  const { id: tenantId } = useTenant()
  const today = new Date().toISOString().slice(0, 10)
  const [routes, setRoutes]         = useState<RouteGroup[]>([])
  const [unassigned, setUnassigned] = useState<UnassignedOrder[]>([])
  const [availableVehicles, setAvailableVehicles] = useState<{ plate: string; type: string; driver: string; status: string }[]>([])
  const [loading, setLoading]       = useState(true)
  const [addModal, setAddModal]     = useState<UnassignedOrder | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [dateFilter, setDateFilter] = useState('')
  const [showAI, setShowAI]         = useState(true)
  const [aiText, setAiText]         = useState('')
  const [aiLoading, setAiLoading]   = useState(false)

  const loadAll = async () => {
    if (!tenantId) return
    const [{ data: deliveries }, { data: pickedOrders }, { data: vehiclesData }] = await Promise.all([
      supabase
        .from('deliveries')
        .select(`id, code, route, planned_date, distance_km, status,
          sales_order:sales_orders(id, code, final_amount, customer:customers(name, address)),
          vehicle:vehicles(plate, type),
          driver:drivers(name, phone)`)
        .eq('tenant_id', tenantId)
        .order('planned_date'),
      supabase
        .from('sales_orders')
        .select(`id, code, final_amount, delivery_date, customer:customers(name, address)`)
        .eq('tenant_id', tenantId)
        .eq('status', 'picked')
        .order('delivery_date'),
      supabase
        .from('vehicles')
        .select(`plate, type, status, drivers(name)`)
        .eq('tenant_id', tenantId)
        .neq('status', 'inactive')
        .order('plate'),
    ])

    setRoutes((deliveries ?? []).map((d: any) => ({
      id: d.id,
      date: d.planned_date ? d.planned_date.slice(0, 10) : today,
      route_name: d.route || d.code,
      vehicle_plate: d.vehicle?.plate ?? '—',
      driver_name: d.driver?.name ?? '—',
      driver_phone: d.driver?.phone ?? '',
      stops: d.sales_order ? [{
        order_id: d.sales_order.id,
        customer: d.sales_order.customer?.name ?? '—',
        address: d.sales_order.customer?.address ?? '',
        cod: Number(d.sales_order.final_amount ?? 0),
        weight_kg: 0,
        priority: 'normal' as const,
      }] : [],
      total_km: Number(d.distance_km ?? 0),
      total_cod: Number(d.sales_order?.final_amount ?? 0),
      status: d.status === 'delivering' ? 'dispatched' : d.status === 'delivered' ? 'completed' : 'planned',
      ai_optimized: false,
    })))

    setUnassigned((pickedOrders ?? []).map((o: any) => ({
      id: o.code,
      customer: o.customer?.name ?? '—',
      address: o.customer?.address ?? '',
      cod: Number(o.final_amount ?? 0),
      weight_kg: 0,
      priority: 'normal' as const,
      date_needed: o.delivery_date ?? today,
    })))

    setAvailableVehicles((vehiclesData ?? []).map((v: any) => ({
      plate: v.plate,
      type: v.type ?? '—',
      driver: v.drivers?.name ?? 'Chưa phân tài xế',
      status: v.status,
    })))

    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!tenantId) return; loadAll() }, [tenantId])
  useEffect(() => {
    if (!loading && unassigned.length > 0) fetchAiRoute(unassigned)
  }, [loading])
  useOrdersRealtime(loadAll)
  useAutoRefresh(loadAll, 15_000)

  const filteredRoutes = routes.filter(r => !dateFilter || r.date === dateFilter)
  const dates = [...new Set(routes.map(r => r.date))].sort()

  const handleDispatch = async (id: string) => {
    setRoutes(prev => prev.map(r => r.id === id ? { ...r, status: 'dispatched' } : r))

    const { data: delivery } = await supabase
      .from('deliveries')
      .select('vehicle_id, driver_id, sales_order_id')
      .eq('id', id)
      .single()

    if (!delivery) return

    const tasks: PromiseLike<any>[] = [
      supabase.from('deliveries').update({ status: 'delivering' }).eq('id', id),
    ]
    if (delivery.sales_order_id)
      tasks.push(supabase.from('sales_orders').update({ status: 'delivering' }).eq('id', delivery.sales_order_id))
    if (delivery.vehicle_id)
      tasks.push(supabase.from('vehicles').update({ status: 'on_trip' }).eq('id', delivery.vehicle_id))
    if (delivery.driver_id)
      tasks.push(supabase.from('drivers').update({ status: 'on_trip' }).eq('id', delivery.driver_id))

    await Promise.all(tasks)
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

  const handleAddToRoute = (orderId: string, routeId: string) => {
    const order = unassigned.find(o => o.id === orderId)
    if (!order) return
    setRoutes(prev => prev.map(r => {
      if (r.id !== routeId) return r
      const newStop: DeliveryStop = {
        order_id: order.id,
        customer: order.customer,
        address: order.address,
        cod: order.cod,
        weight_kg: order.weight_kg,
        priority: order.priority,
      }
      return { ...r, stops: [...r.stops, newStop], total_cod: r.total_cod + order.cod }
    }))
    setUnassigned(prev => prev.filter(o => o.id !== orderId))
  }

  const totalCOD = filteredRoutes.reduce((s, r) => s + r.total_cod, 0)
  const totalKm = filteredRoutes.reduce((s, r) => s + r.total_km, 0)
  const dispatched = filteredRoutes.filter(r => r.status === 'dispatched').length

  return (
    <div>
      <PageHeader title="Kế hoạch giao hàng" subtitle="Lập tuyến, tối ưu lộ trình và điều phối xe">
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={15} /> Tạo kế hoạch
        </button>
      </PageHeader>

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
          {/* Date tabs */}
          <div className="flex gap-2">
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

        {/* Right panel: unassigned orders */}
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
                      <p className="text-xs font-semibold text-[#1e2a3a]">{o.id}</p>
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
                    v.status === 'available' ? 'bg-green-100 text-green-700' :
                    v.status === 'on_trip'   ? 'bg-blue-100 text-blue-700' :
                    v.status === 'maintenance' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-500'
                  }`}>
                    {v.status === 'available' ? 'Rảnh' : v.status === 'on_trip' ? 'Đang chạy' : v.status === 'maintenance' ? 'Bảo trì' : v.status}
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
