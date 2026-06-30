'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Search, Truck, CheckCircle, Clock, AlertTriangle, X, MapPin, Camera, PenLine, Banknote, Copy, Check, RefreshCw, Timer, TrendingUp, Package, Navigation } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import ExportButton from '@/components/ui/ExportButton'
import { formatVND, formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'
import { useOrdersRealtime } from '@/hooks/useOrdersRealtime'
import { useAutoRefresh } from '@/hooks/useAutoRefresh'


// ─── Types ────────────────────────────────────────────────────────────────────
interface Delivery {
  id: string; code: string; orderId: string; orderCode: string; customer: string; route: string
  planned_date: string; distance_km: number; freight_cost: number
  carrier_type: 'own' | 'ghn' | 'ghtk'
  vehicle_id: string | null; driver_id: string | null
  vehicle_plate: string; driver_name: string
  status: 'pending' | 'assigned' | 'picking' | 'delivering' | 'delivered' | 'delayed' | 'failed'
  fail_reason?: string
  cod_amount: number; cod_collected: number
  warehouse_id: string | null
}

const INITIAL_DELIVERIES: Delivery[] = []

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending:    { label: 'Chờ phân xe',   className: 'bg-gray-100 text-gray-600' },
  assigned:   { label: 'Đã phân xe',    className: 'bg-blue-100 text-blue-700' },
  picking:    { label: 'Đang lấy hàng', className: 'bg-purple-100 text-purple-700' },
  delivering: { label: 'Đang giao',     className: 'bg-sky-100 text-sky-700' },
  delivered:  { label: 'Đã giao',       className: 'bg-green-100 text-green-700' },
  delayed:    { label: 'Giao trễ',      className: 'bg-red-100 text-red-700' },
  failed:     { label: 'Giao thất bại', className: 'bg-red-100 text-red-700' },
}

// xe/tài xế không gán kho → đi được mọi nơi
// xe/tài xế gán kho X → CHỈ nhận đơn từ kho X
function matchWarehouse(entityWarehouseId: string | null, filterWarehouseId: string | null): boolean {
  if (!entityWarehouseId) return true   // xe/tài xế không gán kho → đi được mọi nơi
  if (!filterWarehouseId) return true   // không biết kho của đơn → không thể lọc, show tất cả
  return entityWarehouseId === filterWarehouseId
}

async function selfHealOnTrip(
  vehicles: any[], drivers: any[]
): Promise<{ vehicles: any[]; drivers: any[] }> {
  const onTripVIds = vehicles.filter(x => x.status === 'on_trip').map(x => x.id as string)
  const onTripDIds = drivers.filter(x => x.status === 'on_trip').map(x => x.id as string)

  const [activeV, activeD] = await Promise.all([
    onTripVIds.length > 0
      ? supabase.from('deliveries').select('vehicle_id').in('vehicle_id', onTripVIds).in('status', ['pending', 'assigned', 'delivering'])
      : Promise.resolve({ data: [] as any[] }),
    onTripDIds.length > 0
      ? supabase.from('deliveries').select('driver_id').in('driver_id', onTripDIds).in('status', ['pending', 'assigned', 'delivering'])
      : Promise.resolve({ data: [] as any[] }),
  ])

  const activeVSet = new Set((activeV.data ?? []).map((x: any) => x.vehicle_id))
  const activeDSet = new Set((activeD.data ?? []).map((x: any) => x.driver_id))
  const staleVIds  = onTripVIds.filter(id => !activeVSet.has(id))
  const staleDIds  = onTripDIds.filter(id => !activeDSet.has(id))

  if (staleVIds.length > 0) supabase.from('vehicles').update({ status: 'available' }).in('id', staleVIds).then(() => {})
  if (staleDIds.length > 0) supabase.from('drivers').update({ status: 'available' }).in('id', staleDIds).then(() => {})

  return {
    vehicles: vehicles.map(x => staleVIds.includes(x.id) ? { ...x, status: 'available' } : x),
    drivers:  drivers.map(x => staleDIds.includes(x.id) ? { ...x, status: 'available' } : x),
  }
}

// ─── Assign Modal ─────────────────────────────────────────────────────────────
function AssignModal({ delivery, onClose, onAssign }: {
  delivery: Delivery; onClose: () => void
  onAssign: (id: string, vehicle_id: string, driver_id: string, route: string) => void
}) {
  const { id: tenantId } = useTenant()
  const [vehicleId, setVehicleId] = useState(delivery.vehicle_id ?? '')
  const [driverId, setDriverId] = useState(delivery.driver_id ?? '')
  const [route, setRoute] = useState(delivery.route ?? '')
  const [availVehicles, setAvailVehicles] = useState<{ id: string; plate: string; type: string; capacity_kg: number; status: string; warehouse_id: string | null }[]>([])
  const [availDrivers, setAvailDrivers] = useState<{ id: string; name: string; phone: string; rating: number; status: string; warehouse_id: string | null }[]>([])
  const [loadingOpts, setLoadingOpts] = useState(true)

  useEffect(() => {
    ;(async () => {
      // Ưu tiên warehouse_id từ delivery; nếu không có → tra từ stock_issue của đơn hàng
      let wid = delivery.warehouse_id
      if (!wid && delivery.orderId) {
        const { data: issue } = await supabase
          .from('stock_issues').select('warehouse_id')
          .eq('sales_order_id', delivery.orderId).maybeSingle()
        wid = issue?.warehouse_id ?? null
      }

      const [v, d] = await Promise.all([
        supabase.from('vehicles').select('id, plate, type, capacity_kg, status, warehouse_id').eq('tenant_id', tenantId).in('status', ['available', 'on_trip']).order('plate'),
        supabase.from('drivers').select('id, name, phone, rating, status, warehouse_id').eq('tenant_id', tenantId).in('status', ['available', 'on_trip']).order('name'),
      ])

      let filtered = await selfHealOnTrip(
        ((v.data ?? []) as any).filter((x: any) => matchWarehouse(x.warehouse_id, wid)),
        ((d.data ?? []) as any).filter((x: any) => matchWarehouse(x.warehouse_id, wid)),
      )
      setAvailVehicles(filtered.vehicles)
      setAvailDrivers(filtered.drivers)
      setLoadingOpts(false)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery.id])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Phân tuyến giao hàng</h2>
            <p className="text-xs text-gray-500 mt-0.5">{delivery.code} · {delivery.customer}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tuyến đường</label>
            <div className="relative">
              <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--mia-primary)]" />
              <input
                type="text"
                value={route}
                onChange={e => setRoute(e.target.value)}
                placeholder="VD: TP.HCM → Bình Dương"
                className="w-full pl-8 pr-3 py-2.5 text-sm border border-[#e5e7eb] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]/30 focus:border-[var(--mia-primary)]"
              />
            </div>
            {delivery.distance_km || delivery.freight_cost ? (
              <p className="text-xs text-gray-400 mt-1">{delivery.distance_km} km · Phí: {formatVND(delivery.freight_cost)}</p>
            ) : null}
          </div>

          {loadingOpts ? (
            <div className="text-center py-6 text-sm text-gray-400">Đang tải danh sách xe và tài xế...</div>
          ) : (<>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Chọn xe *</label>
            <div className="space-y-2">
              {availVehicles.map(v => (
                <label key={v.id} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${vehicleId === v.id ? 'border-[var(--mia-primary)] bg-blue-50' : 'border-[#e5e7eb] hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    <input type="radio" name="vehicle" value={v.id} checked={vehicleId === v.id} onChange={() => setVehicleId(v.id)} className="accent-[#0ea5e9]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1e2a3a]">{v.plate}</p>
                      <p className="text-xs text-gray-400">{v.type}</p>
                    </div>
                    {v.status === 'on_trip' && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">Đang chạy</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500">{(v.capacity_kg / 1000).toFixed(0)} tấn</span>
                </label>
              ))}
              {availVehicles.length === 0 && <p className="text-sm text-gray-400 text-center py-2">Không có xe khả dụng</p>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Chọn tài xế *</label>
            <div className="space-y-2">
              {availDrivers.map(d => (
                <label key={d.id} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${driverId === d.id ? 'border-[var(--mia-primary)] bg-blue-50' : 'border-[#e5e7eb] hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-3">
                    <input type="radio" name="driver" value={d.id} checked={driverId === d.id} onChange={() => setDriverId(d.id)} className="accent-[#0ea5e9]" />
                    <div>
                      <p className="text-sm font-semibold text-[#1e2a3a]">{d.name}</p>
                      <p className="text-xs text-gray-400">{d.phone}</p>
                    </div>
                    {d.status === 'on_trip' && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">Đang chạy</span>
                    )}
                  </div>
                  <span className="text-xs text-yellow-600 font-medium">★ {d.rating}</span>
                </label>
              ))}
            </div>
          </div>
          </>)}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-[#e5e7eb]">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
          <button
            disabled={!vehicleId || !driverId || loadingOpts}
            onClick={() => { onAssign(delivery.id, vehicleId, driverId, route); onClose() }}
            className="flex-1 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
            Xác nhận phân xe
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── POD Modal (Proof of Delivery) ────────────────────────────────────────────
function PODModal({ delivery, onClose, onConfirm, onFail }: {
  delivery: Delivery; onClose: () => void
  onConfirm: (id: string, cod: number) => void
  onFail: (id: string, reason: string) => void
}) {
  const [tab, setTab]           = useState<'success' | 'fail'>('success')
  const [cod, setCod]           = useState(delivery.cod_amount)
  const [failReason, setFailReason] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [sigUrl, setSigUrl]     = useState<string | null>(null)
  const [showSigPad, setShowSigPad] = useState(false)

  const fileRef   = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const lastPt    = useRef<{ x: number; y: number } | null>(null)

  const canConfirm = !!photoUrl && !!sigUrl

  const getCanvasPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ) => {
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width  / rect.width
    const scaleY = canvas.height / rect.height
    const src = 'touches' in e ? e.touches[0] : (e as React.MouseEvent)
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY }
  }

  const onSigStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    drawing.current = true
    lastPt.current  = getCanvasPos(e, canvasRef.current!)
  }
  const onSigMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !canvasRef.current || !lastPt.current) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')!
    const pt  = getCanvasPos(e, canvasRef.current)
    ctx.beginPath()
    ctx.moveTo(lastPt.current.x, lastPt.current.y)
    ctx.lineTo(pt.x, pt.y)
    ctx.strokeStyle = '#1e2a3a'
    ctx.lineWidth   = 2.5
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.stroke()
    lastPt.current = pt
  }
  const onSigEnd = () => { drawing.current = false; lastPt.current = null }

  const clearSig = () => {
    const c = canvasRef.current
    if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
  }
  const saveSig = () => {
    const c = canvasRef.current
    if (!c) return
    setSigUrl(c.toDataURL('image/png'))
    setShowSigPad(false)
  }

  const FAIL_REASONS = ['Khách vắng nhà', 'Khách từ chối nhận', 'Sai địa chỉ', 'Hàng hỏng', 'Khác']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb] sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Xác nhận giao hàng</h2>
            <p className="text-xs text-gray-500 mt-0.5">{delivery.code} · {delivery.customer}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4">
          <div className="flex rounded-xl overflow-hidden border border-[#e5e7eb]">
            <button onClick={() => setTab('success')}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === 'success' ? 'bg-green-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              Giao thành công
            </button>
            <button onClick={() => setTab('fail')}
              className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === 'fail' ? 'bg-red-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}>
              Giao thất bại
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {tab === 'success' ? (
            <>
              {/* ── Ảnh + Chữ ký ── */}
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = ev => setPhotoUrl(ev.target?.result as string)
                  reader.readAsDataURL(file)
                  e.target.value = ''
                }} />

              <div className="grid grid-cols-2 gap-3">
                {/* Camera box */}
                <button type="button" onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl overflow-hidden transition-all text-left ${photoUrl ? 'border-green-400' : 'border-[#e5e7eb] hover:border-[var(--mia-primary)]'}`}>
                  {photoUrl ? (
                    <div className="relative">
                      <img src={photoUrl} alt="Ảnh giao hàng" className="w-full h-24 object-cover" />
                      <div className="absolute bottom-0 inset-x-0 bg-green-600/80 text-white text-[10px] font-semibold text-center py-1">
                        ✓ Đã chụp · Bấm để đổi
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 flex flex-col items-center gap-2 text-gray-400">
                      <Camera size={22} />
                      <span className="text-xs text-center">Ảnh giao hàng <span className="text-red-400">*</span></span>
                    </div>
                  )}
                </button>

                {/* Signature box */}
                <button type="button" onClick={() => { setShowSigPad(s => !s) }}
                  className={`border-2 border-dashed rounded-xl overflow-hidden transition-all text-left ${sigUrl ? 'border-green-400' : 'border-[#e5e7eb] hover:border-[var(--mia-primary)]'}`}>
                  {sigUrl ? (
                    <div className="relative">
                      <img src={sigUrl} alt="Chữ ký" className="w-full h-24 object-contain bg-gray-50 p-1" />
                      <div className="absolute bottom-0 inset-x-0 bg-green-600/80 text-white text-[10px] font-semibold text-center py-1">
                        ✓ Đã ký · Bấm để ký lại
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 flex flex-col items-center gap-2 text-gray-400">
                      <PenLine size={22} />
                      <span className="text-xs text-center">Chữ ký người nhận <span className="text-red-400">*</span></span>
                    </div>
                  )}
                </button>
              </div>

              {/* Signature pad (inline, mở khi cần) */}
              {showSigPad && (
                <div className="border border-[#e5e7eb] rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-[#e5e7eb]">
                    <span className="text-xs font-semibold text-gray-600">Ký tên người nhận hàng</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={clearSig}
                        className="text-xs text-gray-500 hover:text-red-500 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                        Xóa
                      </button>
                      <button type="button" onClick={saveSig}
                        className="text-xs font-semibold text-white bg-[var(--mia-primary)] px-3 py-1 rounded hover:opacity-90 transition-opacity">
                        Lưu chữ ký
                      </button>
                    </div>
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={400} height={160}
                    className="w-full bg-white cursor-crosshair"
                    style={{ touchAction: 'none', display: 'block' }}
                    onMouseDown={onSigStart} onMouseMove={onSigMove} onMouseUp={onSigEnd} onMouseLeave={onSigEnd}
                    onTouchStart={onSigStart} onTouchMove={onSigMove} onTouchEnd={onSigEnd}
                  />
                  <p className="text-[10px] text-gray-400 text-center py-1.5 bg-gray-50">
                    Vẽ chữ ký của người nhận hàng, sau đó bấm <strong>Lưu chữ ký</strong>
                  </p>
                </div>
              )}

              {/* COD */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  <Banknote size={12} className="inline mr-1" />Thu COD
                </label>
                <div className="flex items-center gap-2">
                  <input type="number" value={cod} onChange={e => setCod(+e.target.value)}
                    className="flex-1 h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                  <span className="text-xs text-gray-400 shrink-0">đ</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Giá trị COD đơn: {formatVND(delivery.cod_amount)}</p>
              </div>

              {/* Checklist trạng thái */}
              <div className="flex gap-3 text-xs">
                <span className={`flex items-center gap-1 ${photoUrl ? 'text-green-600' : 'text-gray-400'}`}>
                  {photoUrl ? <CheckCircle size={13} /> : <Camera size={13} />} Ảnh giao hàng
                </span>
                <span className={`flex items-center gap-1 ${sigUrl ? 'text-green-600' : 'text-gray-400'}`}>
                  {sigUrl ? <CheckCircle size={13} /> : <PenLine size={13} />} Chữ ký
                </span>
              </div>

              <button disabled={!canConfirm} onClick={() => { onConfirm(delivery.id, cod); onClose() }}
                className="w-full py-3 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-95">
                <CheckCircle size={15} className="inline mr-2" />Xác nhận đã giao
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-2">Lý do thất bại *</label>
                <div className="space-y-2">
                  {FAIL_REASONS.map(r => (
                    <label key={r} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors ${failReason === r ? 'border-red-300 bg-red-50' : 'border-[#e5e7eb] hover:bg-gray-50'}`}>
                      <input type="radio" name="failreason" value={r} checked={failReason === r} onChange={() => setFailReason(r)} className="accent-red-500" />
                      <span className="text-sm text-gray-700">{r}</span>
                    </label>
                  ))}
                </div>
              </div>
              <button disabled={!failReason} onClick={() => { onFail(delivery.id, failReason); onClose() }}
                className="w-full py-2.5 bg-red-500 text-white text-sm font-semibold rounded-xl hover:bg-red-600 disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
                Xác nhận giao thất bại
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sales Order Assign Modal ────────────────────────────────────────────────
function SalesOrderAssignModal({ order, onClose, onDone }: {
  order: PickedSO; onClose: () => void; onDone: () => void
}) {
  const { id: tenantId } = useTenant()
  const [vehicleId, setVehicleId] = useState('')
  const [driverId, setDriverId] = useState('')
  const [vehicles, setVehicles] = useState<{ id: string; plate: string; type: string; capacity_kg: number; status: string }[]>([])
  const [drivers, setDrivers]   = useState<{ id: string; name: string; phone: string; rating: number; status: string }[]>([])
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)
  const [warehouseName, setWarehouseName] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      // Tìm kho xuất hàng từ phiếu xuất kho của đơn này
      const { data: issue } = await supabase
        .from('stock_issues')
        .select('warehouse_id, warehouse:warehouses(name)')
        .eq('sales_order_id', order.id)
        .maybeSingle()
      const wid: string | null = issue?.warehouse_id ?? null
      const wname: string | null = (Array.isArray(issue?.warehouse) ? issue.warehouse[0]?.name : (issue?.warehouse as any)?.name) ?? null
      setWarehouseId(wid)
      setWarehouseName(wname)

      const [v, d] = await Promise.all([
        supabase.from('vehicles').select('id, plate, type, capacity_kg, status, warehouse_id').eq('tenant_id', tenantId).in('status', ['available', 'on_trip']).order('plate'),
        supabase.from('drivers').select('id, name, phone, rating, status, warehouse_id').eq('tenant_id', tenantId).in('status', ['available', 'on_trip']).order('name'),
      ])
      const healed = await selfHealOnTrip(
        ((v.data ?? []) as any).filter((x: any) => matchWarehouse(x.warehouse_id, wid)),
        ((d.data ?? []) as any).filter((x: any) => matchWarehouse(x.warehouse_id, wid)),
      )
      setVehicles(healed.vehicles)
      setDrivers(healed.drivers)
      setLoading(false)
    }
    load()
  }, [order.id])

  const handleConfirm = async () => {
    if (!vehicleId || !driverId) return
    setSaving(true)

    // Kiểm tra delivery đã tồn tại chưa → update thay vì insert mới (tránh duplicate)
    const { data: existing } = await supabase
      .from('deliveries')
      .select('id')
      .eq('sales_order_id', order.id)
      .maybeSingle()

    if (existing) {
      await fetch(`/api/deliveries/${existing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicle_id: vehicleId, driver_id: driverId, status: 'assigned' }),
      })
    } else {
      const today = new Date()
      const prefix = `DV-${today.getFullYear().toString().slice(2)}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`
      const { count: dvCount } = await supabase.from('deliveries').select('id', { count: 'exact', head: true }).like('code', `${prefix}-%`)
      const code = `${prefix}-${String((dvCount ?? 0) + 1).padStart(3, '0')}`
      // Dùng API route (supabaseAdmin) để bypass RLS khi INSERT
      await fetch('/api/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          sales_order_id: order.id,
          vehicle_id: vehicleId,
          driver_id: driverId,
          planned_date: order.delivery_date ? new Date(order.delivery_date).toISOString() : new Date().toISOString(),
          carrier_type: 'own',
          status: 'pending',
          warehouse_id: warehouseId,
        }),
      })
    }

    await Promise.all([
      fetch(`/api/sales-orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending_ship' }),
      }),
      supabase.from('vehicles').update({ status: 'on_trip' }).eq('id', vehicleId),
      supabase.from('drivers').update({ status: 'on_trip' }).eq('id', driverId),
    ])
    setSaving(false)
    onDone()
    onClose()
  }

  const selectedVehicle = vehicles.find(v => v.id === vehicleId)
  const selectedDriver  = drivers.find(d => d.id === driverId)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Phân xe giao hàng</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-gray-500">{order.code} · {order.customer}</p>
              {warehouseName && (
                <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded-full">Kho: {warehouseName}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-sm text-gray-400">Đang tải danh sách xe và tài xế...</div>
          ) : (<>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Chọn xe *</label>
              {vehicles.length === 0
                ? <p className="text-sm text-gray-400 text-center py-3 bg-gray-50 rounded-xl">Không có xe khả dụng</p>
                : <div className="space-y-2 max-h-48 overflow-y-auto">
                    {vehicles.map(v => (
                      <label key={v.id} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${vehicleId === v.id ? 'border-[var(--mia-primary)] bg-blue-50' : 'border-[#e5e7eb] hover:bg-gray-50'}`}>
                        <div className="flex items-center gap-3">
                          <input type="radio" name="so-vehicle" value={v.id} checked={vehicleId === v.id} onChange={() => setVehicleId(v.id)} className="accent-[#0ea5e9]" />
                          <div>
                            <p className="text-sm font-semibold text-[#1e2a3a]">{v.plate}</p>
                            <p className="text-xs text-gray-400">{v.type}</p>
                          </div>
                          {v.status === 'on_trip' && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">Đang chạy</span>
                          )}
                        </div>
                        <span className="text-xs text-gray-500">{((v.capacity_kg ?? 0) / 1000).toFixed(0)} tấn</span>
                      </label>
                    ))}
                  </div>
              }
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Chọn tài xế *</label>
              {drivers.length === 0
                ? <p className="text-sm text-gray-400 text-center py-3 bg-gray-50 rounded-xl">Không có tài xế khả dụng</p>
                : <div className="space-y-2 max-h-48 overflow-y-auto">
                    {drivers.map(d => (
                      <label key={d.id} className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${driverId === d.id ? 'border-[var(--mia-primary)] bg-blue-50' : 'border-[#e5e7eb] hover:bg-gray-50'}`}>
                        <div className="flex items-center gap-3">
                          <input type="radio" name="so-driver" value={d.id} checked={driverId === d.id} onChange={() => setDriverId(d.id)} className="accent-[#0ea5e9]" />
                          <div>
                            <p className="text-sm font-semibold text-[#1e2a3a]">{d.name}</p>
                            <p className="text-xs text-gray-400">{d.phone}</p>
                          </div>
                          {d.status === 'on_trip' && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">Đang chạy</span>
                          )}
                        </div>
                        <span className="text-xs text-yellow-600 font-medium">★ {d.rating ?? '—'}</span>
                      </label>
                    ))}
                  </div>
              }
            </div>

            {selectedVehicle && selectedDriver && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-xs text-green-700 space-y-1">
                <p className="font-semibold">Xác nhận phân công:</p>
                <p>🚛 {selectedVehicle.plate} · {selectedVehicle.type}</p>
                <p>👤 {selectedDriver.name} · {selectedDriver.phone}</p>
              </div>
            )}
          </>)}
        </div>

        <div className="flex gap-2 px-6 py-4 border-t border-[#e5e7eb]">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
          <button onClick={handleConfirm} disabled={!vehicleId || !driverId || saving || loading}
            className="flex-1 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
            {saving ? 'Đang lưu...' : 'Xác nhận phân xe'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Picked Orders Panel ──────────────────────────────────────────────────────
interface PickedSO {
  id: string; code: string; customer: string; delivery_date: string
  status: 'picked' | 'pending_ship'
  items: { name: string; quantity: number; unit: string }[]
}

interface PendingShipGroup {
  vehicleId: string | null
  driverId: string | null
  vehiclePlate: string
  driverName: string
  deliveryIds: string[]
  orderIds: string[]
  orderCodes: string[]
}

function PickedOrdersPanel() {
  const { id: tenantId } = useTenant()
  const [pickedOrders, setPickedOrders]     = useState<PickedSO[]>([])
  const [dispatchGroups, setDispatchGroups] = useState<PendingShipGroup[]>([])
  const [assignTarget, setAssignTarget]     = useState<PickedSO | null>(null)
  const [dispatching, setDispatching]       = useState<string | null>(null) // vehicleId+driverId key

  const load = async () => {
    const { data: soData } = await supabase
      .from('sales_orders')
      .select(`id, code, status, delivery_date,
        customer:customers(name),
        items:sales_order_items(quantity, product:products(name, unit))`)
      .eq('tenant_id', tenantId)
      .in('status', ['picked', 'pending_ship'])
      .order('created_at')

    const allOrders = (soData ?? []).map((o: any) => ({
      id: o.id, code: o.code, status: o.status,
      customer: o.customer?.name ?? '—',
      delivery_date: o.delivery_date ?? '',
      items: (o.items ?? []).map((it: any) => ({
        name: it.product?.name ?? '—', quantity: it.quantity, unit: it.product?.unit ?? '',
      })),
    }))

    setPickedOrders(allOrders.filter((o: PickedSO) => o.status === 'picked'))

    // Nhóm pending_ship theo tài xế+xe
    const pendingShipIds = allOrders.filter((o: PickedSO) => o.status === 'pending_ship').map((o: PickedSO) => o.id)
    if (pendingShipIds.length > 0) {
      const { data: deliveries } = await supabase
        .from('deliveries')
        .select(`id, sales_order_id, vehicle_id, driver_id,
          vehicle:vehicles(plate), driver:drivers(name)`)
        .in('sales_order_id', pendingShipIds)
        .in('status', ['pending', 'assigned'])

      const groupMap = new Map<string, PendingShipGroup>()
      for (const d of deliveries ?? []) {
        const key = `${d.vehicle_id ?? 'none'}__${d.driver_id ?? 'none'}`
        const so = allOrders.find((o: PickedSO) => o.id === d.sales_order_id)
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            vehicleId: d.vehicle_id ?? null,
            driverId: d.driver_id ?? null,
            vehiclePlate: (Array.isArray(d.vehicle) ? d.vehicle[0] : d.vehicle)?.plate ?? '—',
            driverName: (Array.isArray(d.driver) ? d.driver[0] : d.driver)?.name ?? '—',
            deliveryIds: [], orderIds: [], orderCodes: [],
          })
        }
        const g = groupMap.get(key)!
        g.deliveryIds.push(d.id)
        g.orderIds.push(d.sales_order_id)
        if (so) g.orderCodes.push(so.code)
      }
      setDispatchGroups(Array.from(groupMap.values()))
    } else {
      setDispatchGroups([])
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!tenantId) return; load() }, [tenantId])
  useOrdersRealtime(load)

  // Dispatch cả nhóm xe+tài xế cùng lúc
  const dispatchGroup = async (group: PendingShipGroup) => {
    const key = `${group.vehicleId}__${group.driverId}`
    setDispatching(key)
    await Promise.all(
      group.deliveryIds.map(id =>
        fetch(`/api/deliveries/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'delivering',
            vehicle_id: group.vehicleId ?? null,
            driver_id:  group.driverId  ?? null,
          }),
        })
      )
    )
    setDispatching(null)
    load()
  }

  if (pickedOrders.length === 0 && dispatchGroups.length === 0) return null

  return (
    <>
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Package size={15} className="text-sky-600" />
          <h3 className="text-sm font-bold text-sky-800">
            Đơn hàng sẵn sàng vận chuyển ({pickedOrders.length + dispatchGroups.reduce((s, g) => s + g.orderIds.length, 0)})
          </h3>
          <span className="flex items-center gap-1 text-[10px] text-sky-500 ml-1">
            <span className="w-1.5 h-1.5 bg-sky-400 rounded-full animate-pulse" />Tự động cập nhật
          </span>
        </div>

        {/* Chờ phân xe — từng đơn */}
        {pickedOrders.map(o => (
          <div key={o.id} className="bg-white rounded-xl border border-sky-100 px-4 py-3 flex items-center justify-between gap-4 mb-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="shrink-0">
                <span className="text-xs font-bold text-[var(--mia-primary)]">{o.code}</span>
                <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">Chờ phân xe</span>
              </div>
              <span className="text-xs font-medium text-[#1e2a3a] truncate">{o.customer}</span>
            </div>
            <button onClick={() => setAssignTarget(o)}
              className="shrink-0 px-3 py-1.5 bg-[var(--mia-primary)] text-white text-xs font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap">
              Phân xe giao hàng
            </button>
          </div>
        ))}

        {/* Đã phân xe — nhóm theo tài xế+xe */}
        {dispatchGroups.map(group => {
          const key = `${group.vehicleId}__${group.driverId}`
          return (
            <div key={key} className="bg-white rounded-xl border border-green-200 px-4 py-3 mb-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-green-700">🚛 {group.vehiclePlate}</span>
                    <span className="text-xs text-gray-500">· {group.driverName}</span>
                    <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-semibold rounded-full">
                      {group.orderIds.length} đơn
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400">{group.orderCodes.join(' · ')}</p>
                </div>
                <button
                  onClick={() => dispatchGroup(group)}
                  disabled={dispatching === key}
                  className="shrink-0 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap">
                  {dispatching === key ? '...' : 'Điều xe xuất phát'}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {assignTarget && (
        <SalesOrderAssignModal
          order={assignTarget}
          onClose={() => setAssignTarget(null)}
          onDone={() => { setAssignTarget(null); load() }}
        />
      )}
    </>
  )
}

// ─── Live Delivering Panel ─────────────────────────────────────────────────────
interface LiveOrder {
  id: string; code: string; orderCode: string; customer: string; codAmount: number
}
interface LiveGroup {
  key: string
  vehiclePlate: string; vehicleType: string; vehicleCapacity: number
  driverName: string; driverPhone: string; driverRating: number | null
  route: string
  gps: { lat: number; lng: number; speedKmh: number | null; updatedAt: string } | null
  orders: LiveOrder[]
}

function LiveDeliveringPanel({ tenantId, onOpenPOD, onOpenAssign }: {
  tenantId: string
  onOpenPOD: (id: string) => void
  onOpenAssign: (id: string) => void
}) {
  const [groups, setGroups] = useState<LiveGroup[]>([])

  const load = useCallback(async () => {
    if (!tenantId) return
    const [{ data: dvs }, { data: locs }] = await Promise.all([
      supabase
        .from('deliveries')
        .select(`id, code, route, vehicle_id, driver_id,
          sales_order:sales_orders(code, final_amount, customer:customers(name)),
          vehicle:vehicles(plate, type, capacity_kg),
          driver:drivers(name, phone, rating)`)
        .eq('tenant_id', tenantId)
        .eq('status', 'delivering')
        .order('created_at', { ascending: false }),
      supabase.from('driver_locations')
        .select('driver_name, lat, lng, speed_kmh, updated_at')
        .eq('tenant_id', tenantId),
    ])

    const locMap = new Map((locs ?? []).map((l: any) => [l.driver_name, l]))
    const groupMap = new Map<string, LiveGroup>()

    for (const d of dvs ?? []) {
      const dName   = (d.driver as any)?.name ?? ''
      const key     = `${d.vehicle_id ?? 'none'}__${d.driver_id ?? 'none'}`
      if (!groupMap.has(key)) {
        const loc = locMap.get(dName)
        groupMap.set(key, {
          key,
          vehiclePlate:   (d.vehicle as any)?.plate ?? '',
          vehicleType:    (d.vehicle as any)?.type ?? '',
          vehicleCapacity: Number((d.vehicle as any)?.capacity_kg ?? 0),
          driverName:     dName,
          driverPhone:    (d.driver as any)?.phone ?? '',
          driverRating:   (d.driver as any)?.rating ?? null,
          route:          d.route ?? '',
          gps: loc ? { lat: loc.lat, lng: loc.lng, speedKmh: loc.speed_kmh, updatedAt: loc.updated_at } : null,
          orders: [],
        })
      }
      groupMap.get(key)!.orders.push({
        id: d.id, code: d.code,
        orderCode: (d.sales_order as any)?.code ?? '',
        customer:  (d.sales_order as any)?.customer?.name ?? '—',
        codAmount: Number((d.sales_order as any)?.final_amount ?? 0),
      })
    }

    setGroups(Array.from(groupMap.values()))
  }, [tenantId])

  useEffect(() => {
    if (!tenantId) return
    load()
    const ch = supabase
      .channel(`live-dvt-${tenantId}`)
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'driver_locations' }, () => load())
      .on('postgres_changes' as any, { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [tenantId, load])

  if (groups.length === 0) return null

  const totalOrders = groups.reduce((s, g) => s + g.orders.length, 0)

  return (
    <div className="mb-5 space-y-1">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
        <h3 className="text-sm font-bold text-[#1e2a3a]">
          Đang giao hàng · {groups.length} chuyến · {totalOrders} đơn
        </h3>
        <span className="text-[10px] text-sky-500">· Cập nhật tự động</span>
      </div>

      {groups.map(group => (
        <div key={group.key} className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden shadow-sm">

          {/* ── Header: xe + tài xế + GPS ── */}
          <div className="bg-[#1e2a3a] px-4 py-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
              <Truck size={19} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              {/* Xe */}
              <div className="flex items-center gap-2 flex-wrap">
                {group.vehiclePlate
                  ? <span className="text-sm font-bold text-white">{group.vehiclePlate}</span>
                  : <span className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/30 border border-orange-400/50 text-orange-300 text-[10px] font-semibold rounded-full">
                      <AlertTriangle size={9} />Chưa gán xe
                    </span>
                }
                {group.vehicleType && (
                  <span className="px-1.5 py-0.5 bg-white/15 text-white/80 text-[10px] rounded-full">{group.vehicleType}</span>
                )}
                {group.vehicleCapacity > 0 && (
                  <span className="text-[10px] text-white/50">{(group.vehicleCapacity / 1000).toFixed(1)} tấn</span>
                )}
                <span className="ml-auto shrink-0 px-2 py-0.5 bg-sky-500/70 text-white text-[10px] font-bold rounded-full">
                  {group.orders.length} đơn
                </span>
              </div>
              {/* Tài xế */}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {group.driverName
                  ? <span className="text-xs text-white/80">{group.driverName}</span>
                  : <span className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/30 border border-orange-400/50 text-orange-300 text-[10px] font-semibold rounded-full">
                      <AlertTriangle size={9} />Chưa có tài xế
                    </span>
                }
                {group.driverPhone && (
                  <a href={`tel:${group.driverPhone}`}
                    className="text-[10px] text-sky-300 hover:text-sky-200 transition-colors">
                    {group.driverPhone}
                  </a>
                )}
                {group.driverRating !== null && (
                  <span className="text-[10px] text-yellow-300 font-semibold">★ {group.driverRating}</span>
                )}
              </div>
            </div>

            {/* GPS */}
            {group.gps ? (
              <a
                href={`https://maps.google.com/?q=${group.gps.lat},${group.gps.lng}`}
                target="_blank" rel="noopener noreferrer"
                className="shrink-0 flex flex-col items-end gap-0.5 hover:opacity-80 transition-opacity"
              >
                <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/25 border border-green-400/40 text-green-300 text-[10px] font-semibold rounded-full">
                  <span className="w-1 h-1 bg-green-400 rounded-full animate-pulse" />GPS Live
                </span>
                <span className="text-[10px] text-white/60 mt-0.5">
                  {group.gps.speedKmh !== null ? `${group.gps.speedKmh} km/h` : 'Đỗ xe'}
                </span>
                <span className="text-[9px] text-white/40">
                  {new Date(group.gps.updatedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </a>
            ) : (
              <div className="shrink-0 flex flex-col items-end gap-0.5">
                <span className="px-2 py-0.5 bg-white/10 text-white/35 text-[10px] rounded-full">Không có GPS</span>
              </div>
            )}
          </div>

          {/* Tuyến đường */}
          {group.route && (
            <div className="px-4 py-1.5 bg-sky-50 border-b border-sky-100 flex items-center gap-1.5 text-[10px] text-sky-700 font-medium">
              <MapPin size={9} className="shrink-0" />{group.route}
            </div>
          )}

          {/* Danh sách đơn */}
          <div className="divide-y divide-[#f5f7fa]">
            {group.orders.map((order, idx) => (
              <div key={order.id} className="flex items-center justify-between px-4 py-2.5 gap-3 hover:bg-gray-50/60 transition-colors">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-5 h-5 shrink-0 rounded-full bg-[#1e2a3a]/10 text-[#1e2a3a] text-[10px] font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-[var(--mia-primary)]">{order.code}</span>
                      {order.orderCode && <span className="text-[9px] text-gray-400">{order.orderCode}</span>}
                    </div>
                    <p className="text-xs font-medium text-[#1e2a3a] truncate">{order.customer}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {order.codAmount > 0 && (
                    <span className="text-[10px] font-semibold text-green-700 whitespace-nowrap">{formatVND(order.codAmount)}</span>
                  )}
                  {(!group.vehiclePlate || !group.driverName) && (
                    <button
                      onClick={() => onOpenAssign(order.id)}
                      className="px-2.5 py-1 bg-orange-500 text-white text-[10px] font-semibold rounded-lg hover:bg-orange-600 hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap">
                      Gán xe
                    </button>
                  )}
                  <button
                    onClick={() => onOpenPOD(order.id)}
                    className="px-2.5 py-1 bg-green-600 text-white text-[10px] font-semibold rounded-lg hover:bg-green-700 hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap">
                    POD
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DonVanChuyenPage() {
  const { id: tenantId } = useTenant()
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [assignModal, setAssignModal] = useState<Delivery | null>(null)
  const [podModal, setPodModal] = useState<Delivery | null>(null)
  const [currentRole, setCurrentRole]   = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [driverVehicleId, setDriverVehicleId] = useState<string | null>(null)

  const loadDeliveries = async (role?: string | null, userId?: string | null, vehicleId?: string | null) => {
    if (!tenantId) return
    const r = role  ?? currentRole
    const u = userId ?? currentUserId
    const v = vehicleId ?? driverVehicleId

    let q = supabase
      .from('deliveries')
      .select(`id, code, route, planned_date, distance_km, freight_cost, carrier_type, status, warehouse_id, driver_id, vehicle_id,
        sales_order:sales_orders(id, code, final_amount, customer:customers(name)),
        vehicle:vehicles(id, plate, type, capacity_kg),
        driver:drivers(id, name, phone, rating)`)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(500)

    // Driver: chỉ thấy đơn của mình (theo driver_id hoặc vehicle_id)
    if (r === 'driver' && u) {
      q = v ? (q as any).or(`driver_id.eq.${u},vehicle_id.eq.${v}`) : q.eq('driver_id', u)
    }

    const { data } = await q
    setDeliveries((data ?? []).map((d: any) => ({
      id: d.id, code: d.code,
      orderId: d.sales_order?.id ?? '',
      orderCode: d.sales_order?.code ?? '',
      customer: d.sales_order?.customer?.name ?? '—',
      route: d.route ?? '',
      planned_date: d.planned_date ?? '',
      distance_km: Number(d.distance_km ?? 0),
      freight_cost: Number(d.freight_cost ?? 0),
      carrier_type: (d.carrier_type ?? 'own') as 'own' | 'ghn' | 'ghtk',
      vehicle_id: d.vehicle?.id ?? d.vehicle_id ?? null,
      driver_id: d.driver?.id ?? d.driver_id ?? null,
      vehicle_plate: d.vehicle?.plate ?? '',
      driver_name: d.driver?.name ?? '',
      status: d.status as Delivery['status'],
      cod_amount: Number(d.sales_order?.final_amount ?? 0),
      cod_collected: 0,
      warehouse_id: d.warehouse_id ?? null,
    })))
    setLoading(false)
  }

  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (cancelled) return
      const userId = session?.user?.id ?? null
      // Đọc role từ DB thay vì user_metadata để tránh race condition với useAuth
      let role: string | null = session?.user?.user_metadata?.role ?? null
      if (userId) {
        const { data: profile } = await supabase.from('users').select('role').eq('id', userId).maybeSingle()
        if (profile?.role) role = profile.role
      }
      if (cancelled) return
      setCurrentRole(role)
      setCurrentUserId(userId)
      let vehicleId: string | null = null
      if (role === 'driver' && userId) {
        const { data } = await supabase.from('drivers').select('vehicle_id').eq('id', userId).maybeSingle()
        vehicleId = data?.vehicle_id ?? null
        setDriverVehicleId(vehicleId)
      }
      if (!cancelled) loadDeliveries(role, userId, vehicleId)
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  useOrdersRealtime(() => loadDeliveries(), ['sales_orders', 'deliveries'])
  useAutoRefresh(() => loadDeliveries(), 5_000)

  const filtered = deliveries.filter(d => {
    const matchSearch = d.code.includes(search) || d.customer.toLowerCase().includes(search.toLowerCase()) || d.route.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || d.status === statusFilter
    return matchSearch && matchStatus
  })

  const handleAssign = async (id: string, vehicle_id: string, driver_id: string, route: string) => {
    const current = deliveries.find(d => d.id === id)
    // Nếu đơn đang giao thì chỉ cập nhật xe/tài xế, không đổi status về assigned
    const body = current?.status === 'delivering'
      ? { vehicle_id, driver_id, route }
      : { vehicle_id, driver_id, route, status: 'assigned' }
    await fetch(`/api/deliveries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    loadDeliveries()
  }

  const patchDelivery = (id: string, body: object) =>
    fetch(`/api/deliveries/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  const handleConfirmDelivery = async (id: string, cod: number) => {
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, status: 'delivered' } : d))
    await patchDelivery(id, { status: 'delivered', cod_collected: cod })
  }

  const handleFailDelivery = async (id: string, reason: string) => {
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, status: 'failed' } : d))
    await patchDelivery(id, { status: 'failed', fail_reason: reason })
  }

  const handleStartDelivery = async (id: string) => {
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, status: 'delivering' } : d))
    await patchDelivery(id, { status: 'delivering' })
  }

  const isDriver = currentRole === 'driver'

  return (
    <div>
      <PageHeader
        title="Đơn vận chuyển"
        subtitle={isDriver ? 'Lịch sử các chuyến giao hàng của bạn' : 'Phân tuyến xe, theo dõi và xác nhận giao hàng'}>
        <button onClick={() => loadDeliveries()}
          className="flex items-center gap-2 px-3 py-2 border border-[#e5e7eb] text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 hover:scale-[1.02] active:scale-95 transition-all">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Làm mới
        </button>
        {!isDriver && <ExportButton module="logistics" />}
        {!isDriver && (
          <button className="flex items-center gap-2 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
            <Plus size={15} /> Tạo đơn vận chuyển
          </button>
        )}
      </PageHeader>

      {!isDriver && <PickedOrdersPanel />}

      {!isDriver && (
        <LiveDeliveringPanel
          tenantId={tenantId}
          onOpenPOD={id => {
            const d = deliveries.find(x => x.id === id)
            if (d) setPodModal(d)
          }}
          onOpenAssign={id => {
            const d = deliveries.find(x => x.id === id)
            if (d) setAssignModal(d)
          }}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Chờ phân xe',  value: deliveries.filter(d => d.status === 'pending').length,    icon: <Clock size={20} className="text-gray-500" />, bg: 'bg-gray-50' },
          { label: 'Đang giao',    value: deliveries.filter(d => d.status === 'delivering').length,  icon: <Truck size={20} className="text-sky-500" />, bg: 'bg-sky-50' },
          { label: 'Đã giao',      value: deliveries.filter(d => d.status === 'delivered').length,   icon: <CheckCircle size={20} className="text-green-500" />, bg: 'bg-green-50' },
          { label: 'Thất bại',     value: deliveries.filter(d => d.status === 'failed').length,      icon: <AlertTriangle size={20} className="text-red-500" />, bg: 'bg-red-50' },
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
        <div className="p-4 border-b border-[#e5e7eb] flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-gray-50 border border-[#e5e7eb] rounded-lg px-3 h-9 max-w-xs flex-1">
            <Search size={14} className="text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm mã, khách hàng, tuyến đường..."
              className="flex-1 text-sm bg-transparent outline-none" />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['all', 'pending', 'assigned', 'delivering', 'delivered', 'failed'].map(s => {
              const LABELS: Record<string, string> = { all: 'Tất cả', pending: 'Chờ phân xe', assigned: 'Đã phân', delivering: 'Đang giao', delivered: 'Đã giao', failed: 'Thất bại' }
              return (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-[var(--mia-primary)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {LABELS[s]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-gray-50">
                {['Mã đơn', 'Khách hàng', 'Tuyến đường', 'Xe / Tài xế', 'Ngày giao', 'COD', 'Trạng thái', 'Hành động'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} className="text-center py-10 text-sm text-gray-400">Đang tải dữ liệu...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-sm text-gray-400">Chưa có đơn vận chuyển nào</td></tr>
              )}
              {filtered.map(d => {
                const s = STATUS_MAP[d.status]
                return (
                  <tr key={d.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-[var(--mia-primary)]">{d.code}</p>
                      {d.orderCode && <p className="text-[10px] text-gray-400">{d.orderCode}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-[#1e2a3a] max-w-[140px] truncate">{d.customer}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs text-gray-600">
                        <MapPin size={11} className="text-gray-400 shrink-0" />
                        {d.route}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{d.distance_km} km</p>
                    </td>
                    <td className="px-4 py-3">
                      {d.vehicle_plate ? (
                        <div>
                          <p className="text-xs font-medium text-[#1e2a3a]">{d.vehicle_plate}</p>
                          <p className="text-[10px] text-gray-400">{d.driver_name}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">Chưa phân</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{formatDate(d.planned_date)}</td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-semibold text-[#1e2a3a]">{formatVND(d.cod_amount)}</p>
                      {d.cod_collected > 0 && (
                        <p className="text-[10px] text-green-600">Đã thu: {formatVND(d.cod_collected)}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${s.className}`}>{s.label}</span>
                      {d.fail_reason && <p className="text-[10px] text-red-500 mt-0.5">{d.fail_reason}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5">
                        {d.status === 'pending' && (
                          <button onClick={() => setAssignModal(d)}
                            className="px-3 py-1.5 bg-[var(--mia-primary)] text-white text-xs font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap">
                            Phân tuyến
                          </button>
                        )}
                        {d.status === 'assigned' && (
                          <>
                            <button onClick={() => handleStartDelivery(d.id)}
                              className="px-3 py-1.5 bg-sky-500 text-white text-xs font-semibold rounded-lg hover:bg-sky-600 hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap">
                              Bắt đầu giao
                            </button>
                            <button onClick={() => setAssignModal(d)}
                              className="px-3 py-1.5 border border-[#e5e7eb] text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap">
                              Đổi xe
                            </button>
                          </>
                        )}
                        {d.status === 'delivering' && (
                          <>
                            {!d.vehicle_plate ? (
                              <button onClick={() => setAssignModal(d)}
                                className="px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-lg hover:bg-orange-600 hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap">
                                Gán xe/tài xế
                              </button>
                            ) : (
                              <button onClick={() => setAssignModal(d)}
                                className="px-3 py-1.5 border border-[#e5e7eb] text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap">
                                Đổi xe
                              </button>
                            )}
                            <button onClick={() => setPodModal(d)}
                              className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap">
                              Xác nhận POD
                            </button>
                          </>
                        )}
                        {d.status === 'failed' && (
                          <>
                            <button onClick={() => setAssignModal(d)}
                              className="px-3 py-1.5 bg-orange-500 text-white text-xs font-semibold rounded-lg hover:bg-orange-600 hover:scale-[1.02] active:scale-95 transition-all whitespace-nowrap">
                              Giao lại
                            </button>
                            <span className="text-xs text-gray-400 whitespace-nowrap">Thất bại</span>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {assignModal && <AssignModal delivery={assignModal} onClose={() => setAssignModal(null)} onAssign={handleAssign} />}
      {podModal && <PODModal delivery={podModal} onClose={() => setPodModal(null)} onConfirm={handleConfirmDelivery} onFail={handleFailDelivery} />}
    </div>
  )
}
