'use client'
import { useEffect, useState, use } from 'react'
import { decodeToken, type TokenPayload, type DeliveryStop } from '@/lib/delivery-token'
import type { StopConfirmation } from '@/app/api/delivery-confirm/route'
import {
  MapPin, Package, Banknote, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Truck, Clock, Share2, AlertTriangle, Timer,
} from 'lucide-react'

const FAIL_REASONS = ['Khách vắng nhà', 'Khách từ chối nhận', 'Sai địa chỉ', 'Hàng bị hỏng', 'Khác']

function formatVND(n: number) {
  return new Intl.NumberFormat('vi-VN').format(n) + ' đ'
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function diffMinutes(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000)
}

function fmtDuration(minutes: number) {
  if (minutes < 60) return `${minutes} phút`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`
}

// ─── Trip Stats (hiển thị khi hoàn thành) ────────────────────────────────────
function TripStats({ confirmations, payload }: { confirmations: StopConfirmation[], payload: TokenPayload }) {
  const sorted = [...confirmations].sort((a, b) =>
    new Date(a.confirmedAt).getTime() - new Date(b.confirmedAt).getTime()
  )

  const delivered = confirmations.filter(c => c.result === 'delivered')
  const failed = confirmations.filter(c => c.result === 'failed')
  const totalCod = delivered.reduce((s, c) => s + (c.cod ?? 0), 0)

  // Tổng thời gian: từ arrivedAt điểm đầu → confirmedAt điểm cuối
  const tripStart = sorted[0]?.arrivedAt
  const tripEnd = sorted[sorted.length - 1]?.confirmedAt
  const totalMinutes = tripStart && tripEnd ? diffMinutes(tripStart, tripEnd) : null

  // Thời gian di chuyển giữa các điểm: từ confirmedAt[i] đến arrivedAt[i+1]
  const travelSegments: { from: string; to: string; minutes: number }[] = []
  for (let i = 0; i < sorted.length - 1; i++) {
    const fromConfirm = sorted[i].confirmedAt
    const toArrive = sorted[i + 1].arrivedAt
    const mins = diffMinutes(fromConfirm, toArrive)
    if (mins >= 0) {
      const stopA = payload.stops.find(s => s.id === sorted[i].stopId)
      const stopB = payload.stops.find(s => s.id === sorted[i + 1].stopId)
      travelSegments.push({
        from: stopA?.customer ?? sorted[i].stopId,
        to: stopB?.customer ?? sorted[i + 1].stopId,
        minutes: mins,
      })
    }
  }

  const avgTravel = travelSegments.length > 0
    ? Math.round(travelSegments.reduce((s, t) => s + t.minutes, 0) / travelSegments.length)
    : null

  // Thời gian tại mỗi điểm (arrivedAt → confirmedAt)
  const stopDurations = sorted.map(c => {
    const stop = payload.stops.find(s => s.id === c.stopId)
    const mins = diffMinutes(c.arrivedAt, c.confirmedAt)
    return { customer: stop?.customer ?? c.stopId, confirmedAt: c.confirmedAt, mins, result: c.result }
  })

  return (
    <div className="mx-4 mt-4 space-y-3">
      {/* Banner hoàn thành */}
      <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 size={28} className="text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-bold text-green-800">Hoàn thành chuyến giao!</p>
            <p className="text-xs text-green-600 mt-0.5">
              {delivered.length} đã giao · {failed.length} thất bại · Thu COD: {formatVND(totalCod)}
              {totalMinutes != null && ` · Tổng ${fmtDuration(totalMinutes)}`}
            </p>
          </div>
        </div>
      </div>

      {/* Thống kê thời gian */}
      <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#f0f2f5] flex items-center gap-2">
          <Timer size={15} className="text-[#0ea5e9]" />
          <p className="text-sm font-bold text-[#1e2a3a]">Thống kê thời gian</p>
        </div>

        {/* Tổng quan */}
        <div className="grid grid-cols-3 divide-x divide-[#f0f2f5] border-b border-[#f0f2f5]">
          {[
            { label: 'Tổng chuyến', value: totalMinutes != null ? fmtDuration(totalMinutes) : '—' },
            { label: 'TB di chuyển', value: avgTravel != null ? fmtDuration(avgTravel) : '—' },
            { label: 'Điểm đã giao', value: `${delivered.length}/${sorted.length}` },
          ].map(s => (
            <div key={s.label} className="px-3 py-2.5 text-center">
              <p className="text-base font-bold text-[#1e2a3a]">{s.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Timeline từng điểm */}
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Chi tiết từng điểm</p>
          <div className="space-y-0">
            {stopDurations.map((s, i) => (
              <div key={i}>
                <div className="flex items-center gap-3 py-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0
                    ${s.result === 'delivered' ? 'bg-green-100' : 'bg-red-100'}`}>
                    {s.result === 'delivered'
                      ? <CheckCircle2 size={13} className="text-green-600" />
                      : <XCircle size={13} className="text-red-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#1e2a3a] truncate">{s.customer}</p>
                    <p className="text-[10px] text-gray-400">
                      Giao lúc {formatTime(s.confirmedAt)}
                      {s.mins > 0 && ` · Xử lý ${s.mins} phút`}
                    </p>
                  </div>
                </div>
                {/* Di chuyển đến điểm tiếp theo */}
                {travelSegments[i] && (
                  <div className="flex items-center gap-3 py-1 ml-3">
                    <div className="w-px h-4 bg-gray-200 mx-2.5" />
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                      <Truck size={10} />
                      Di chuyển: <span className="font-semibold text-gray-500">{fmtDuration(travelSegments[i].minutes)}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Nút chia sẻ */}
      <ShareButton confirmations={confirmations} payload={payload} totalMinutes={totalMinutes} />
      <div className="h-4" />
    </div>
  )
}

function ShareButton({ confirmations, payload, totalMinutes }: {
  confirmations: StopConfirmation[]
  payload: TokenPayload
  totalMinutes: number | null
}) {
  const [copied, setCopied] = useState(false)
  const delivered = confirmations.filter(c => c.result === 'delivered')
  const failed = confirmations.filter(c => c.result === 'failed')
  const totalCod = delivered.reduce((s, c) => s + (c.cod ?? 0), 0)

  const handleShare = () => {
    const sorted = [...confirmations].sort((a, b) =>
      new Date(a.confirmedAt).getTime() - new Date(b.confirmedAt).getTime()
    )
    let text = `✅ Báo cáo giao hàng ${payload.code}\n`
    text += `Tài xế: ${payload.driver} — ${payload.vehicle}\n`
    text += `Tuyến: ${payload.route}\n\n`
    sorted.forEach((c, i) => {
      const stop = payload.stops.find(s => s.id === c.stopId)
      const icon = c.result === 'delivered' ? '✓' : '✗'
      text += `${icon} Điểm ${i + 1}: ${stop?.customer ?? c.stopId}\n`
      text += `   Lúc: ${formatTime(c.confirmedAt)}`
      if (c.result === 'delivered') {
        const pmLabel = c.paymentMethod === 'cash' ? 'TM' : c.paymentMethod === 'transfer' ? 'CK' : 'Chưa thu'
        text += ` | Thu: ${formatVND(c.cod ?? 0)} (${pmLabel})`
      }
      else text += ` | Lý do: ${c.failReason}`
      text += '\n'
    })
    text += `\nTổng COD: ${formatVND(totalCod)}`
    if (totalMinutes) text += ` | Thời gian: ${fmtDuration(totalMinutes)}`
    text += `\n${new Date().toLocaleString('vi-VN')}`

    if (navigator.share) {
      navigator.share({ text })
    } else {
      navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  return (
    <button onClick={handleShare}
      className="w-full flex items-center justify-center gap-2 py-3 bg-green-500 text-white text-sm font-semibold rounded-2xl hover:bg-green-600 active:scale-95 transition-all">
      <Share2 size={15} />
      {copied ? 'Đã sao chép báo cáo!' : 'Gửi báo cáo cho điều phối'}
    </button>
  )
}

// ─── Stop Card ────────────────────────────────────────────────────────────────
function StopCard({
  stop, seq, confirm, onConfirm,
}: {
  stop: DeliveryStop
  seq: number
  confirm?: StopConfirmation
  onConfirm: (stopId: string, data: Omit<StopConfirmation, 'stopId'>) => void
}) {
  const [expanded, setExpanded] = useState(!confirm)
  const [mode, setMode] = useState<'idle' | 'delivered' | 'failed'>('idle')
  const [arrivedAt, setArrivedAt] = useState<string | null>(null)
  const [cod, setCod] = useState(stop.cod)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'pending'>('cash')
  const [failReason, setFailReason] = useState('')
  const [driverNote, setDriverNote] = useState('')
  const [saving, setSaving] = useState(false)

  const isDone = !!confirm

  const handleSetMode = (m: 'delivered' | 'failed') => {
    if (!arrivedAt) setArrivedAt(new Date().toISOString())
    setMode(m)
  }

  const handleSubmit = async () => {
    if (mode === 'failed' && !failReason) return
    setSaving(true)
    await onConfirm(stop.id, {
      result: mode as 'delivered' | 'failed',
      cod: mode === 'delivered' ? cod : 0,
      paymentMethod: mode === 'delivered' ? paymentMethod : undefined,
      failReason: mode === 'failed' ? failReason : undefined,
      driverNote: driverNote || undefined,
      arrivedAt: arrivedAt ?? new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
    })
    setSaving(false)
    setExpanded(false)
  }

  const statusBg = isDone
    ? confirm!.result === 'delivered' ? 'border-green-300 bg-green-50' : 'border-red-200 bg-red-50'
    : 'border-[#e5e7eb] bg-white'

  return (
    <div className={`rounded-2xl border-2 transition-colors overflow-hidden ${statusBg}`}>
      <button className="w-full flex items-center gap-3 px-4 py-3.5" onClick={() => setExpanded(v => !v)}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0
          ${isDone
            ? confirm!.result === 'delivered' ? 'bg-green-500 text-white' : 'bg-red-400 text-white'
            : 'bg-gray-200 text-gray-600'}`}>
          {isDone
            ? confirm!.result === 'delivered' ? <CheckCircle2 size={18} /> : <XCircle size={18} />
            : seq}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-bold text-[#1e2a3a] truncate">{stop.customer}</p>
          <p className="text-xs text-gray-500 truncate">{stop.address}</p>
        </div>
        {isDone ? (
          <div className="text-right shrink-0">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full block
              ${confirm!.result === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
              {confirm!.result === 'delivered' ? 'Đã giao' : 'Thất bại'}
            </span>
            <span className="text-[10px] text-gray-400 mt-0.5 block">{formatTime(confirm!.confirmedAt)}</span>
          </div>
        ) : (
          expanded ? <ChevronUp size={16} className="text-gray-400 shrink-0" /> : <ChevronDown size={16} className="text-gray-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-[#e5e7eb]">
          <div className="pt-3 space-y-2">
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <MapPin size={15} className="text-[#0ea5e9] mt-0.5 shrink-0" />
              <span>{stop.address || 'Địa chỉ theo đơn hàng'}</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <Package size={15} className="text-orange-400 mt-0.5 shrink-0" />
              <span>{stop.items}</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1e2a3a]">
              <Banknote size={15} className="text-green-500 shrink-0" />
              <span>Thu COD: {formatVND(stop.cod)}</span>
            </div>
            {stop.note && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2 text-xs text-yellow-700">
                📝 {stop.note}
              </div>
            )}
          </div>

          {isDone ? (
            <div className={`rounded-xl p-3 text-sm ${confirm!.result === 'delivered' ? 'bg-green-100' : 'bg-red-50'}`}>
              {confirm!.result === 'delivered' ? (
                <p className="text-green-700 font-medium">
                  ✓ Đã giao — Thu: {formatVND(confirm!.cod ?? 0)}
                  {confirm!.paymentMethod && (
                    <span className="ml-1.5 text-xs font-normal text-green-600">
                      ({confirm!.paymentMethod === 'cash' ? 'Tiền mặt' : confirm!.paymentMethod === 'transfer' ? 'Chuyển khoản' : 'Chưa thu'})
                    </span>
                  )}
                  {confirm!.driverNote && <span className="block text-xs mt-0.5 font-normal">{confirm!.driverNote}</span>}
                </p>
              ) : (
                <p className="text-red-600 font-medium">
                  ✗ {confirm!.failReason}
                  {confirm!.driverNote && <span className="block text-xs mt-0.5 font-normal">{confirm!.driverNote}</span>}
                </p>
              )}
              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
                <span className="flex items-center gap-1">
                  <Clock size={9} /> Giao lúc {formatTime(confirm!.confirmedAt)}
                </span>
                {diffMinutes(confirm!.arrivedAt, confirm!.confirmedAt) > 0 && (
                  <span className="flex items-center gap-1">
                    <Timer size={9} /> Xử lý {diffMinutes(confirm!.arrivedAt, confirm!.confirmedAt)} phút
                  </span>
                )}
              </div>
            </div>
          ) : (
            <>
              {mode === 'idle' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button onClick={() => handleSetMode('delivered')}
                    className="py-3 bg-green-500 text-white text-sm font-semibold rounded-xl hover:bg-green-600 active:scale-95 transition-all flex items-center justify-center gap-1.5">
                    <CheckCircle2 size={16} /> Đã giao
                  </button>
                  <button onClick={() => handleSetMode('failed')}
                    className="py-3 bg-red-400 text-white text-sm font-semibold rounded-xl hover:bg-red-500 active:scale-95 transition-all flex items-center justify-center gap-1.5">
                    <XCircle size={16} /> Thất bại
                  </button>
                </div>
              )}

              {mode === 'delivered' && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Số tiền thu (đ)</label>
                    <input type="number" value={cod} readOnly
                      className="w-full h-10 px-3 text-sm border border-[#e5e7eb] rounded-xl bg-gray-50 text-gray-700 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-2">Trạng thái thanh toán</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { key: 'cash',     label: '💵 Tiền mặt' },
                        { key: 'transfer', label: '🏦 CK ngân hàng' },
                        { key: 'pending',  label: '⏳ Chưa thu' },
                      ] as const).map(opt => (
                        <button key={opt.key} type="button"
                          onClick={() => setPaymentMethod(opt.key)}
                          className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
                            paymentMethod === opt.key
                              ? 'border-green-400 bg-green-50 text-green-700'
                              : 'border-[#e5e7eb] text-gray-600 hover:bg-gray-50'
                          }`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Ghi chú (tuỳ chọn)</label>
                    <input type="text" value={driverNote} onChange={e => setDriverNote(e.target.value)}
                      placeholder="Ghi chú thêm..."
                      className="w-full h-10 px-3 text-sm border border-[#e5e7eb] rounded-xl outline-none focus:border-green-400" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setMode('idle')} className="flex-1 py-2.5 border border-[#e5e7eb] rounded-xl text-sm text-gray-600 hover:bg-gray-50">Quay lại</button>
                    <button onClick={handleSubmit} disabled={saving}
                      className="flex-1 py-2.5 bg-green-500 text-white text-sm font-semibold rounded-xl hover:bg-green-600 disabled:opacity-50 active:scale-95 transition-all">
                      {saving ? 'Đang lưu...' : 'Xác nhận'}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'failed' && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    {FAIL_REASONS.map(r => (
                      <label key={r} className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors
                        ${failReason === r ? 'border-red-300 bg-red-50' : 'border-[#e5e7eb] hover:bg-gray-50'}`}>
                        <input type="radio" name="fail" value={r} checked={failReason === r} onChange={() => setFailReason(r)} className="accent-red-500" />
                        <span className="text-sm text-gray-700">{r}</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Ghi chú thêm</label>
                    <input type="text" value={driverNote} onChange={e => setDriverNote(e.target.value)}
                      placeholder="Chi tiết lý do..."
                      className="w-full h-10 px-3 text-sm border border-[#e5e7eb] rounded-xl outline-none focus:border-red-300" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setMode('idle')} className="flex-1 py-2.5 border border-[#e5e7eb] rounded-xl text-sm text-gray-600 hover:bg-gray-50">Quay lại</button>
                    <button onClick={handleSubmit} disabled={saving || !failReason}
                      className="flex-1 py-2.5 bg-red-400 text-white text-sm font-semibold rounded-xl hover:bg-red-500 disabled:opacity-40 active:scale-95 transition-all">
                      {saving ? 'Đang lưu...' : 'Xác nhận'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DriverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [payload, setPayload] = useState<TokenPayload | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [confirmations, setConfirmations] = useState<StopConfirmation[]>([])

  useEffect(() => {
    const p = decodeToken(token)
    if (!p) { setInvalid(true); return }
    // Lưu token để fallback page có thể dẫn tài xế quay lại
    try { localStorage.setItem('mia_driver_last_token', `/giao-hang/${token}`) } catch { /* ignore */ }

    fetch(`/api/driver-plan/${p.deliveryId}`)
      .then(r => r.ok ? r.json() : null)
      .then(plan => {
        const stops = plan?.stops ?? p.stops
        setPayload({ ...p, stops, driver: plan?.driver || p.driver, vehicle: plan?.vehicle || p.vehicle })

        // Restore confirmations từ DB status (không phụ thuộc in-memory store)
        const dbConfirmed: StopConfirmation[] = (stops ?? [])
          .filter((s: any) => s.status === 'delivered' || s.status === 'failed')
          .map((s: any) => ({
            stopId: s.id,
            result: s.status as 'delivered' | 'failed',
            cod: s.codCollected ?? 0,
            arrivedAt: s.actualDate ?? new Date().toISOString(),
            confirmedAt: s.actualDate ?? new Date().toISOString(),
          }))
        if (dbConfirmed.length > 0) setConfirmations(dbConfirmed)
      })
      .catch(() => setPayload(p))
  }, [token])

  const handleConfirm = async (stopId: string, data: Omit<StopConfirmation, 'stopId'>) => {
    const res = await fetch('/api/delivery-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, stopId, ...data }),
    })
    const json = await res.json()
    if (!res.ok) {
      alert('Lỗi xác nhận: ' + (json.error ?? 'Không rõ lỗi. Vui lòng thử lại.'))
      return
    }
    setConfirmations(prev => [...prev.filter(c => c.stopId !== stopId), { stopId, ...data }])
  }

  const allDone = payload && confirmations.length >= payload.stops.length

  if (invalid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <AlertTriangle size={48} className="text-red-400 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-[#1e2a3a]">Link không hợp lệ</h1>
          <p className="text-sm text-gray-500 mt-1">Link đã hết hạn hoặc không đúng. Liên hệ điều phối để lấy link mới.</p>
        </div>
      </div>
    )
  }

  if (!payload) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const doneCount = confirmations.length
  const totalCount = payload.stops.length
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* Header */}
      <div className="bg-[#1e2a3a] text-white px-4 pt-10 pb-5">
        <div className="flex items-center gap-2 mb-1">
          <Truck size={18} className="text-[#0ea5e9]" />
          <span className="text-xs text-white/60 font-medium">Chuyến giao hàng</span>
        </div>
        <h1 className="text-lg font-bold">{payload.code}</h1>
        <p className="text-sm text-white/70 mt-0.5">{payload.route}</p>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/10">
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wider">Tài xế</p>
            <p className="text-sm font-semibold">{payload.driver}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wider">Xe</p>
            <p className="text-sm font-semibold">{payload.vehicle}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[10px] text-white/50 uppercase tracking-wider">Tiến độ</p>
            <p className="text-sm font-semibold">{doneCount}/{totalCount} điểm</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-[#0ea5e9] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* All done: stats panel */}
      {allDone ? (
        <TripStats confirmations={confirmations} payload={payload} />
      ) : (
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
            <Clock size={13} />
            <span>Thứ tự bên dưới chỉ là gợi ý — bạn có thể giao theo thứ tự thuận tiện nhất</span>
          </div>
          {payload.stops.map((stop, i) => (
            <StopCard
              key={stop.id}
              stop={stop}
              seq={i + 1}
              confirm={confirmations.find(c => c.stopId === stop.id)}
              onConfirm={handleConfirm}
            />
          ))}
        </div>
      )}

      <div className="h-8" />
    </div>
  )
}
