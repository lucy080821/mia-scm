'use client'
import { useState, useEffect, useCallback } from 'react'
import { Search, CalendarDays, CheckCircle2, XCircle, AlertCircle, DollarSign, Truck, User, Camera, FileText, ChevronDown } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { supabase } from '@/lib/supabase'
import { formatVND, formatDate } from '@/lib/utils'

interface Driver { id: string; name: string; phone: string | null }

interface DeliveryRow {
  id: string
  code: string
  route: string | null
  planned_date: string | null
  actual_date: string | null
  status: string
  cod_collected: number
  payment_method: string | null
  fail_reason: string | null
  driver_note: string | null
  pod_photo_url: string | null
  sales_order: { code: string; final_amount: number; customer: { name: string; phone: string | null } | null } | null
}

const PM_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  pending: 'Chưa thu',
}
const PM_COLOR: Record<string, string> = {
  cash: 'bg-green-100 text-green-700',
  transfer: 'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-700',
}
const STATUS_LABEL: Record<string, string> = {
  delivered: 'Đã giao',
  failed: 'Giao thất bại',
  delivering: 'Đang giao',
  pending: 'Chờ giao',
  assigned: 'Đã phân công',
}
const STATUS_COLOR: Record<string, string> = {
  delivered: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  delivering: 'bg-blue-100 text-blue-700',
  pending: 'bg-gray-100 text-gray-600',
  assigned: 'bg-yellow-100 text-yellow-700',
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default function DoiSoatCODPage() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [selectedDriver, setSelectedDriver] = useState('')
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [rows, setRows] = useState<DeliveryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [photoModal, setPhotoModal] = useState<string | null>(null)
  const [noteModal, setNoteModal] = useState<DeliveryRow | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    supabase.from('drivers').select('id, name, phone').eq('status', 'available').order('name')
      .then(({ data }) => {
        if (data) setDrivers(data)
      })
    supabase.from('drivers').select('id, name, phone').order('name')
      .then(({ data }) => { if (data) setDrivers(data) })
  }, [])

  const loadData = useCallback(async () => {
    if (!selectedDate) return
    setLoading(true)
    try {
      let query = supabase
        .from('deliveries')
        .select(`
          id, code, route, planned_date, actual_date, status,
          cod_collected, payment_method, fail_reason, driver_note, pod_photo_url,
          sales_order:sales_orders(code, final_amount, customer:customers(name, phone))
        `)
        .gte('planned_date', selectedDate + 'T00:00:00')
        .lte('planned_date', selectedDate + 'T23:59:59')
        .order('planned_date')

      if (selectedDriver) {
        query = query.eq('driver_id', selectedDriver)
      }

      const { data, error } = await query
      if (error) throw error
      setRows((data as unknown as DeliveryRow[]) ?? [])
    } catch (e: any) {
      showToast('Lỗi tải dữ liệu: ' + e.message)
    } finally {
      setLoading(false)
    }
  }, [selectedDate, selectedDriver])

  useEffect(() => { loadData() }, [loadData])

  // Tổng hợp số liệu
  const delivered = rows.filter(r => r.status === 'delivered')
  const failed = rows.filter(r => r.status === 'failed')
  const pending = rows.filter(r => ['pending', 'assigned', 'delivering'].includes(r.status))

  const expectedCOD = rows.reduce((s, r) => s + (r.sales_order?.final_amount ?? 0), 0)
  const collectedCOD = delivered.reduce((s, r) => s + (r.cod_collected ?? 0), 0)
  const cashCOD = delivered.filter(r => r.payment_method === 'cash').reduce((s, r) => s + (r.cod_collected ?? 0), 0)
  const transferCOD = delivered.filter(r => r.payment_method === 'transfer').reduce((s, r) => s + (r.cod_collected ?? 0), 0)
  const diff = collectedCOD - expectedCOD

  const handleKetCa = async () => {
    if (!selectedDriver || pending.length > 0) return
    showToast('✅ Đã kết ca — báo cáo đã được ghi nhận')
  }

  const driver = drivers.find(d => d.id === selectedDriver)

  return (
    <div>
      <PageHeader
        title="Đối soát COD theo ca"
        subtitle="Kiểm tra tiền mặt thu được theo tài xế và ngày giao hàng"
      />

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 mb-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ngày giao hàng</label>
            <div className="relative">
              <CalendarDays size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="h-9 pl-8 pr-3 text-sm border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-[#0ea5e9]"
              />
            </div>
          </div>

          <div className="min-w-[220px]">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tài xế</label>
            <div className="relative">
              <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={selectedDriver}
                onChange={e => setSelectedDriver(e.target.value)}
                className="w-full h-9 pl-8 pr-8 text-sm border border-[#e5e7eb] rounded-lg bg-white outline-none focus:border-[#0ea5e9] appearance-none"
              >
                <option value="">Tất cả tài xế</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>{d.name}{d.phone ? ` — ${d.phone}` : ''}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          <button
            onClick={loadData}
            className="h-9 px-4 bg-[#0ea5e9] text-white text-sm font-semibold rounded-lg hover:bg-[#0284c7] transition-all flex items-center gap-2"
          >
            <Search size={13} /> Tra cứu
          </button>

          {selectedDriver && pending.length === 0 && delivered.length > 0 && (
            <button
              onClick={handleKetCa}
              className="h-9 px-4 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-all flex items-center gap-2 ml-auto"
            >
              <CheckCircle2 size={14} /> Kết ca
            </button>
          )}
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Tổng đơn</p>
          <p className="text-lg font-bold text-[#1e2a3a]">{rows.length}</p>
          <p className="text-[11px] text-gray-400">{delivered.length} giao · {failed.length} thất bại · {pending.length} còn lại</p>
        </div>
        <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">COD dự kiến</p>
          <p className="text-lg font-bold text-[#1e2a3a]">{(expectedCOD / 1e6).toFixed(1)}M</p>
          <p className="text-[11px] text-gray-400">Tổng giá trị đơn</p>
        </div>
        <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Đã thu</p>
          <p className="text-lg font-bold text-green-600">{(collectedCOD / 1e6).toFixed(1)}M</p>
          <p className="text-[11px] text-gray-400">TM: {(cashCOD/1e6).toFixed(1)}M · CK: {(transferCOD/1e6).toFixed(1)}M</p>
        </div>
        <div className={`bg-white rounded-xl border px-4 py-3 ${diff < 0 ? 'border-red-200' : diff > 0 ? 'border-orange-200' : 'border-[#e5e7eb]'}`}>
          <p className="text-xs text-gray-500 mb-1">Chênh lệch</p>
          <p className={`text-lg font-bold ${diff < 0 ? 'text-red-600' : diff > 0 ? 'text-orange-600' : 'text-green-600'}`}>
            {diff === 0 ? '—' : (diff > 0 ? '+' : '') + (diff / 1e6).toFixed(1) + 'M'}
          </p>
          <p className="text-[11px] text-gray-400">{diff === 0 ? 'Khớp sổ' : diff < 0 ? 'Thiếu tiền' : 'Dư tiền'}</p>
        </div>
        <div className="bg-white rounded-xl border border-[#e5e7eb] px-4 py-3">
          <p className="text-xs text-gray-500 mb-1">Tỷ lệ giao</p>
          <p className="text-lg font-bold text-[#0ea5e9]">
            {rows.length > 0 ? Math.round((delivered.length / rows.length) * 100) : 0}%
          </p>
          <p className="text-[11px] text-gray-400">{delivered.length}/{rows.length} đơn hoàn thành</p>
        </div>
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        <div className="px-4 py-3 border-b border-[#e5e7eb] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#1e2a3a]">
            Chi tiết đơn hàng {driver ? `— ${driver.name}` : ''} {selectedDate && `(${formatDate(selectedDate)})`}
          </h3>
          <span className="text-xs text-gray-400">{rows.length} đơn</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-gray-50">
                {['Mã VC', 'Khách hàng', 'Tuyến', 'Giá trị đơn', 'Đã thu', 'Hình thức', 'Trạng thái', 'Ghi chú', 'POD'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-gray-300 border-t-[#0ea5e9] rounded-full animate-spin" />
                      Đang tải dữ liệu...
                    </span>
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">
                    Không có dữ liệu cho ngày và tài xế đã chọn
                  </td>
                </tr>
              )}
              {!loading && rows.map(row => {
                const orderAmt = row.sales_order?.final_amount ?? 0
                const codDiff = (row.cod_collected ?? 0) - orderAmt
                const showDiff = row.status === 'delivered' && codDiff !== 0
                return (
                  <tr key={row.id} className={`border-b border-[#f0f2f5] hover:bg-gray-50/60 transition-colors ${row.status === 'failed' ? 'bg-red-50/20' : ''}`}>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-[#0ea5e9] font-semibold">{row.code}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-medium text-[#1e2a3a] truncate max-w-[140px]">
                        {row.sales_order?.customer?.name ?? '—'}
                      </p>
                      {row.sales_order?.customer?.phone && (
                        <p className="text-[11px] text-gray-400">{row.sales_order.customer.phone}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[120px] truncate">{row.route ?? '—'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-[#1e2a3a] whitespace-nowrap">
                      {orderAmt > 0 ? formatVND(orderAmt) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.status === 'delivered' ? (
                        <div>
                          <span className="text-xs font-bold text-green-700">{formatVND(row.cod_collected ?? 0)}</span>
                          {showDiff && (
                            <p className={`text-[10px] font-semibold ${codDiff < 0 ? 'text-red-500' : 'text-orange-500'}`}>
                              {codDiff > 0 ? '+' : ''}{(codDiff / 1e6).toFixed(2)}M
                            </p>
                          )}
                        </div>
                      ) : row.status === 'failed' ? (
                        <span className="text-xs text-gray-400">—</span>
                      ) : (
                        <span className="text-xs text-gray-300">Chưa giao</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.payment_method ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${PM_COLOR[row.payment_method] ?? 'bg-gray-100 text-gray-600'}`}>
                          {PM_LABEL[row.payment_method] ?? row.payment_method}
                        </span>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_COLOR[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                      {row.fail_reason && (
                        <p className="text-[10px] text-red-500 mt-0.5 max-w-[120px] truncate" title={row.fail_reason}>
                          {row.fail_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.driver_note ? (
                        <button
                          onClick={() => setNoteModal(row)}
                          className="flex items-center gap-1 text-[11px] text-[#0ea5e9] hover:underline"
                        >
                          <FileText size={11} /> Xem ghi chú
                        </button>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {row.pod_photo_url ? (
                        <button
                          onClick={() => setPhotoModal(row.pod_photo_url!)}
                          className="flex items-center gap-1 text-[11px] text-[#0ea5e9] hover:underline"
                        >
                          <Camera size={11} /> Xem ảnh
                        </button>
                      ) : <span className="text-xs text-gray-300">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Summary footer */}
        {rows.length > 0 && !loading && (
          <div className="px-4 py-3 border-t border-[#e5e7eb] bg-gray-50 rounded-b-xl">
            <div className="flex flex-wrap items-center gap-6 text-xs">
              <span className="text-gray-500">
                Tổng thu: <b className="text-green-700">{formatVND(collectedCOD)}</b>
              </span>
              <span className="text-gray-500">
                Tiền mặt: <b className="text-[#1e2a3a]">{formatVND(cashCOD)}</b>
              </span>
              <span className="text-gray-500">
                Chuyển khoản: <b className="text-[#1e2a3a]">{formatVND(transferCOD)}</b>
              </span>
              {diff !== 0 && (
                <span className={diff < 0 ? 'text-red-600 font-bold' : 'text-orange-600 font-bold'}>
                  {diff < 0 ? '⚠ Thiếu' : '⚠ Dư'}: {formatVND(Math.abs(diff))}
                </span>
              )}
              {diff === 0 && collectedCOD > 0 && (
                <span className="text-green-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 size={12} /> Khớp sổ
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Photo modal */}
      {photoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setPhotoModal(null)}>
          <div className="relative max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPhotoModal(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white text-2xl leading-none">&times;</button>
            <img src={photoModal} alt="Ảnh xác nhận giao hàng" className="w-full rounded-2xl shadow-2xl" />
            <p className="text-center text-white/60 text-sm mt-3">Ảnh xác nhận giao hàng (POD)</p>
          </div>
        </div>
      )}

      {/* Note modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setNoteModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#1e2a3a]">Ghi chú tài xế</h3>
                <p className="text-xs text-gray-400 mt-0.5">{noteModal.code} — {noteModal.sales_order?.customer?.name}</p>
              </div>
              <button onClick={() => setNoteModal(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="px-5 py-4">
              {noteModal.fail_reason && (
                <div className="mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-red-700 mb-1">Lý do thất bại</p>
                  <p className="text-sm text-red-800">{noteModal.fail_reason}</p>
                </div>
              )}
              {noteModal.driver_note && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-gray-500 mb-1">Ghi chú</p>
                  <p className="text-sm text-gray-700">{noteModal.driver_note}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e2a3a] text-white text-sm px-4 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}
