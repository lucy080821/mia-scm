'use client'
import { useEffect, useState } from 'react'
import { Truck, UserCheck, Car, CheckCircle, AlertTriangle, Clock, TrendingUp, MapPin } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import KpiCard from '@/components/ui/KpiCard'
import AiSuggestionBox from '@/components/ui/AiSuggestionBox'
import Badge from '@/components/ui/Badge'
import DeliveryMap from '@/components/maps/DeliveryMap'
import DriverTrackingMap from '@/components/maps/DriverTrackingMap'
import { formatVND, formatDate } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'

interface RecentDelivery {
  code: string; customer: string; driver: string; vehicle: string
  route: string; planned_date: string; freight_cost: number; status: string
}
interface PlanRow {
  driver: string; vehicle: string; orders: number; routes: string; date: string; status: string
}
interface DriverStat {
  name: string; trips: number; rating: number | null
}
interface MapStop {
  lat: number; lng: number; label: string; status: 'delivered' | 'delivering' | 'pending'
}

export default function LogisticsOverviewPage() {
  const { id: tenantId } = useTenant()
  const [kpi, setKpi] = useState({ total: 0, delivering: 0, completed: 0, delayed: 0, vehicles: 0, vehiclesActive: 0, freightCost: 0 })
  const [recentDeliveries, setRecentDeliveries] = useState<RecentDelivery[]>([])
  const [deliveryPlan, setDeliveryPlan] = useState<PlanRow[]>([])
  const [topDrivers, setTopDrivers] = useState<DriverStat[]>([])
  const [onTimePct, setOnTimePct] = useState(0)
  const [mapStops, setMapStops] = useState<MapStop[]>([])
  const [loading, setLoading] = useState(true)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tenantId) return
    const load = async () => {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1)
      const tomorrowStr = tomorrow.toISOString().slice(0, 10)

      const [
        { data: allDeliveries },
        { data: vehicleData },
        { data: driverData },
      ] = await Promise.all([
        supabase.from('deliveries')
          .select(`id, code, route, planned_date, freight_cost, status,
            sales_order:sales_orders(id, customer:customers(name, address)),
            vehicle:vehicles(plate, type),
            driver:drivers(name, total_trips, rating)`)
          .eq('tenant_id', tenantId)
          .gte('created_at', monthStart)
          .order('created_at', { ascending: false })
          .limit(100),
        supabase.from('vehicles').select('status').eq('tenant_id', tenantId).neq('status', 'inactive'),
        supabase.from('drivers').select('name, total_trips, rating').eq('tenant_id', tenantId).neq('status', 'inactive').order('total_trips', { ascending: false }).limit(5),
      ])

      const deliveries = allDeliveries ?? []

      // KPI
      const delivering = deliveries.filter(d => d.status === 'delivering').length
      const completed  = deliveries.filter(d => d.status === 'delivered').length
      const delayed    = deliveries.filter(d => d.status === 'delayed' || d.status === 'failed').length
      const freightCost = deliveries.reduce((s, d) => s + Number(d.freight_cost ?? 0), 0)
      const vTotal = (vehicleData ?? []).length
      const vActive = (vehicleData ?? []).filter(v => v.status === 'on_trip').length

      setKpi({ total: deliveries.length, delivering, completed, delayed, vehicles: vTotal, vehiclesActive: vActive, freightCost })

      // On-time %
      const done = completed + delayed
      setOnTimePct(done > 0 ? Math.round((completed / done) * 100) : 0)

      // Recent deliveries (top 8)
      setRecentDeliveries(deliveries.slice(0, 8).map((d: any) => ({
        code: d.code,
        customer: d.sales_order?.customer?.name ?? '—',
        driver: d.driver?.name ?? '—',
        vehicle: d.vehicle?.plate ?? '—',
        route: d.route ?? '—',
        planned_date: d.planned_date ?? '',
        freight_cost: Number(d.freight_cost ?? 0),
        status: d.status,
      })))

      // Delivery plan tomorrow
      const tomorrow_plan = deliveries.filter((d: any) =>
        d.planned_date && d.planned_date.slice(0, 10) === tomorrowStr
      )
      const grouped: Record<string, { driver: string; vehicle: string; routes: string[]; date: string; status: string; count: number }> = {}
      tomorrow_plan.forEach((d: any) => {
        const key = d.driver?.name ?? 'Chưa phân'
        if (!grouped[key]) grouped[key] = { driver: key, vehicle: d.vehicle?.plate ?? '—', routes: [], date: d.planned_date ?? tomorrowStr, status: d.status, count: 0 }
        grouped[key].count++
        if (d.route && !grouped[key].routes.includes(d.route)) grouped[key].routes.push(d.route)
      })
      setDeliveryPlan(Object.values(grouped).map(g => ({
        driver: g.driver, vehicle: g.vehicle, orders: g.count,
        routes: g.routes.join(', ') || '—', date: g.date, status: g.status,
      })))

      // Top drivers
      setTopDrivers((driverData ?? []).map((d: any) => ({
        name: d.name, trips: d.total_trips ?? 0, rating: d.rating,
      })))

      // Map stops from delivering orders
      const delivering_orders = deliveries.filter((d: any) => d.status === 'delivering').slice(0, 10)
      setMapStops(delivering_orders.map((d: any) => ({
        lat: 10.7769 + (Math.random() - 0.5) * 0.5,
        lng: 106.7009 + (Math.random() - 0.5) * 0.5,
        label: `${d.sales_order?.customer?.name ?? d.code} — ${d.driver?.name ?? ''}`,
        status: 'delivering' as const,
      })))

      setLoading(false)
    }
    load()
  }, [tenantId])

  return (
    <div>
      <PageHeader title="Tổng quan Logistics" subtitle="Theo dõi vận chuyển và giao hàng" />

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-5">
        <KpiCard icon={<Truck size={18} className="text-blue-600" />}       label="Đơn vận chuyển"  value={loading ? '…' : kpi.total}         sub="Tháng này"           iconBg="bg-blue-100" />
        <KpiCard icon={<Clock size={18} className="text-yellow-600" />}     label="Đang giao"        value={loading ? '…' : kpi.delivering}    sub="Trên đường"          iconBg="bg-yellow-100" subColor="orange" />
        <KpiCard icon={<CheckCircle size={18} className="text-green-600" />} label="Hoàn thành"      value={loading ? '…' : kpi.completed}     sub="Tháng này"           iconBg="bg-green-100" subColor="green" />
        <KpiCard icon={<AlertTriangle size={18} className="text-red-500" />} label="Trễ / Thất bại"  value={loading ? '…' : kpi.delayed}       sub="Cần xử lý"           iconBg="bg-red-100" subColor="red" />
        <KpiCard icon={<Car size={18} className="text-sky-600" />}          label="Xe đang chạy"     value={loading ? '…' : `${kpi.vehiclesActive}/${kpi.vehicles}`} sub="Phương tiện" iconBg="bg-sky-100" />
        <KpiCard icon={<UserCheck size={18} className="text-purple-600" />} label="Chi phí VT"       value={loading ? '…' : formatVND(kpi.freightCost)} sub="Tháng này"  iconBg="bg-purple-100" />
      </div>

      {/* Real-time driver tracking */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-[#1e2a3a]">Theo dõi tài xế thời gian thực</h2>
            <p className="text-xs text-gray-500 mt-0.5">Vị trí cập nhật liên tục khi tài xế bật chia sẻ GPS</p>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-green-600 font-semibold bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live
          </span>
        </div>
        <DriverTrackingMap height="320px" tenantId={tenantId} />
      </div>

      {/* AI suggestion */}
      {!loading && kpi.delivering > 0 && (
        <div className="mb-5">
          <AiSuggestionBox
            title={`AI Gợi ý — Có ${kpi.delivering} đơn đang giao hàng`}
            content={`Hiện có <strong>${kpi.delivering} đơn</strong> đang trên đường giao. Tỉ lệ đúng hạn hiện tại <strong>${onTimePct}%</strong>. ${kpi.delayed > 0 ? `<strong>${kpi.delayed} đơn</strong> bị trễ hoặc thất bại — cần liên hệ tài xế để xử lý.` : 'Mọi đơn đang tiến triển đúng kế hoạch.'}`}
            actionLabel="Xem đơn đang giao"
            onAction={() => window.location.href = '/logistics/don-van-chuyen'}
          />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Left: tables */}
        <div className="xl:col-span-2 space-y-4">
          {/* Recent deliveries */}
          <div className="bg-white rounded-xl border border-[#e5e7eb]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
              <h2 className="text-sm font-semibold text-[#1e2a3a]">Đơn vận chuyển mới nhất</h2>
              <a href="/logistics/don-van-chuyen" className="text-xs text-[var(--mia-primary)] hover:underline">Xem tất cả →</a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e5e7eb] bg-gray-50">
                    {['Mã DV', 'Khách hàng', 'Tài xế', 'Tuyến đường', 'Ngày giao', 'Phí VT', 'TT'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-gray-400">Đang tải...</td></tr>
                  ) : recentDeliveries.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-xs text-gray-400">Chưa có đơn vận chuyển nào</td></tr>
                  ) : recentDeliveries.map(d => (
                    <tr key={d.code} className="border-b border-[#e5e7eb] last:border-0 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-xs font-medium text-[var(--mia-primary)]">{d.code}</td>
                      <td className="px-4 py-3 text-xs text-gray-700 max-w-[120px] truncate">{d.customer}</td>
                      <td className="px-4 py-3 text-xs text-gray-700">{d.driver}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate">{d.route}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{d.planned_date ? formatDate(d.planned_date) : '—'}</td>
                      <td className="px-4 py-3 text-xs font-medium text-[#1e2a3a] whitespace-nowrap">{formatVND(d.freight_cost)}</td>
                      <td className="px-4 py-3"><Badge status={d.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Delivery plan */}
          <div className="bg-white rounded-xl border border-[#e5e7eb]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb]">
              <h2 className="text-sm font-semibold text-[#1e2a3a]">Kế hoạch giao hàng ngày mai</h2>
              <a href="/logistics/ke-hoach-giao-hang" className="text-xs text-[var(--mia-primary)] hover:underline">Chi tiết →</a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e5e7eb] bg-gray-50">
                    {['Tài xế', 'Phương tiện', 'Số đơn', 'Tuyến', 'Ngày', 'TT'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-gray-400">Đang tải...</td></tr>
                  ) : deliveryPlan.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-6 text-center text-xs text-gray-400">Chưa có kế hoạch cho ngày mai</td></tr>
                  ) : deliveryPlan.map((p, i) => (
                    <tr key={i} className="border-b border-[#e5e7eb] last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 text-xs font-medium text-[#1e2a3a]">{p.driver}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 font-mono">{p.vehicle}</td>
                      <td className="px-4 py-3 text-xs font-bold text-[var(--mia-primary)]">{p.orders}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[140px] truncate">{p.routes}</td>
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{p.date ? formatDate(p.date) : '—'}</td>
                      <td className="px-4 py-3"><Badge status={p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Delivery performance */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
            <h2 className="text-sm font-semibold text-[#1e2a3a] mb-4">Hiệu suất giao hàng</h2>
            <div className="flex items-center justify-center mb-4">
              <div className="relative w-28 h-28">
                <svg className="w-28 h-28 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#f0f2f5" strokeWidth="3" />
                  <circle cx="18" cy="18" r="15" fill="none" stroke="#10b981" strokeWidth="3"
                    strokeDasharray={`${onTimePct} ${100 - onTimePct}`} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-[#1e2a3a]">{onTimePct}%</span>
                  <span className="text-[10px] text-gray-400">Đúng hạn</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Hoàn thành', value: kpi.completed, color: 'bg-green-500' },
                { label: 'Đang giao',  value: kpi.delivering, color: 'bg-blue-400' },
                { label: 'Trễ/Thất bại', value: kpi.delayed, color: 'bg-red-400' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${s.color} shrink-0`} />
                  <span className="text-xs text-gray-500 flex-1">{s.label}</span>
                  <span className="text-xs font-semibold text-[#1e2a3a]">{loading ? '…' : s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top drivers */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-[#1e2a3a]">Top tài xế</h2>
              <a href="/logistics/tai-xe" className="text-xs text-[var(--mia-primary)] hover:underline">Xem tất cả →</a>
            </div>
            {loading ? (
              <p className="text-xs text-gray-400 text-center py-3">Đang tải...</p>
            ) : topDrivers.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">Chưa có dữ liệu tài xế</p>
            ) : (
              <div className="space-y-3">
                {topDrivers.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-500 shrink-0">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#1e2a3a] truncate">{d.name}</p>
                      <p className="text-[10px] text-gray-400">{d.trips} chuyến</p>
                    </div>
                    {d.rating != null && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <span className="text-yellow-400 text-xs">★</span>
                        <span className="text-xs font-semibold text-gray-700">{d.rating}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live map */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={14} className="text-[var(--mia-primary)]" />
              <h2 className="text-sm font-semibold text-[#1e2a3a]">Bản đồ vận chuyển</h2>
              <span className="ml-auto flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Live
              </span>
            </div>
            <DeliveryMap
              height="200px"
              stops={mapStops.length > 0 ? mapStops : [
                { lat: 10.7769, lng: 106.7009, label: 'TP. Hồ Chí Minh', status: 'delivered' },
              ]}
            />
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
              {[
                { color: 'bg-green-500', label: 'Đã giao' },
                { color: 'bg-[var(--mia-primary)]', label: 'Đang giao' },
                { color: 'bg-yellow-500', label: 'Chờ giao' },
              ].map(l => (
                <span key={l.label} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${l.color}`} />
                  {l.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
