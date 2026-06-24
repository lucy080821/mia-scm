'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { decodeDriverToken } from '@/lib/delivery-token'
import type { StopConfirmation } from '@/app/api/delivery-confirm/route'
import {
  MapPin, Package, Banknote, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, Truck, Clock, AlertTriangle, RefreshCw,
  Phone, Camera, X, ImageIcon,
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

// Upload ảnh POD lên server
async function uploadPOD(file: File, deliveryId: string): Promise<string | null> {
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('deliveryId', deliveryId)
    const res = await fetch('/api/upload-pod', { method: 'POST', body: formData })
    if (!res.ok) return null
    const data = await res.json()
    return data.url ?? null
  } catch {
    return null
  }
}

// ─── Photo Capture Component ──────────────────────────────────────────────────
function PhotoCapture({ value, onChange }: {
  value: File | null
  onChange: (f: File | null) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const handleFile = (f: File | null) => {
    onChange(f)
    if (f) {
      const url = URL.createObjectURL(f)
      setPreview(url)
    } else {
      setPreview(null)
    }
  }

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ảnh xác nhận giao (tùy chọn)</label>
      {preview ? (
        <div className="relative">
          <img src={preview} alt="POD" className="w-full h-36 object-cover rounded-xl border border-[#e5e7eb]" />
          <button type="button" onClick={() => handleFile(null)}
            className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/50 text-white rounded-full flex items-center justify-center">
            <X size={12} />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="w-full h-24 border-2 border-dashed border-[#e5e7eb] rounded-xl flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:border-[#0ea5e9] hover:text-[#0ea5e9] transition-colors active:scale-[0.98]">
          <Camera size={22} />
          <span className="text-xs font-medium">Chụp hoặc chọn ảnh</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" capture="environment"
        className="hidden" onChange={e => handleFile(e.target.files?.[0] ?? null)} />
    </div>
  )
}

// ─── Stop Card ────────────────────────────────────────────────────────────────
interface StopData {
  id: string; seq: number; customer: string; address: string; phone: string | null
  items: string; cod: number; deliveryCode?: string; status?: string; codCollected?: number; actualDate?: string | null
}

function StopCard({ stop, seq, confirm, onConfirm }: {
  stop: StopData
  seq: number
  confirm?: StopConfirmation
  onConfirm: (stopId: string, data: Omit<StopConfirmation, 'stopId'>) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(!confirm)
  const [mode, setMode] = useState<'idle' | 'delivered' | 'failed'>('idle')
  const [arrivedAt, setArrivedAt] = useState<string | null>(null)
  const [cod, setCod] = useState(stop.cod)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'pending'>('cash')
  const [failReason, setFailReason] = useState('')
  const [driverNote, setDriverNote] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const isDone = !!confirm

  const handleSetMode = (m: 'delivered' | 'failed') => {
    if (!arrivedAt) setArrivedAt(new Date().toISOString())
    setMode(m)
  }

  const handleSubmit = async () => {
    if (mode === 'failed' && !failReason) return
    setSaving(true)
    try {
      let podPhotoUrl: string | undefined
      if (photo && mode === 'delivered') {
        const url = await uploadPOD(photo, stop.id)
        if (url) podPhotoUrl = url
      }
      await onConfirm(stop.id, {
        result: mode as 'delivered' | 'failed',
        cod: mode === 'delivered' ? cod : 0,
        paymentMethod: mode === 'delivered' ? paymentMethod : undefined,
        failReason: mode === 'failed' ? failReason : undefined,
        driverNote: driverNote || undefined,
        podPhotoUrl,
        arrivedAt: arrivedAt ?? new Date().toISOString(),
        confirmedAt: new Date().toISOString(),
      })
      setExpanded(false)
    } finally {
      setSaving(false)
    }
  }

  const statusBg = isDone
    ? confirm!.result === 'delivered' ? 'border-green-300 bg-green-50' : 'border-red-200 bg-red-50'
    : 'border-[#e5e7eb] bg-white'

  return (
    <div className={`rounded-2xl border-2 transition-colors overflow-hidden ${statusBg}`}>
      <button className="w-full flex items-center gap-3 px-4 py-3.5" onClick={() => setExpanded(v => !v)}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0
          ${isDone ? confirm!.result === 'delivered' ? 'bg-green-500 text-white' : 'bg-red-400 text-white' : 'bg-gray-200 text-gray-600'}`}>
          {isDone ? confirm!.result === 'delivered' ? <CheckCircle2 size={18} /> : <XCircle size={18} /> : seq}
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-bold text-[#1e2a3a] truncate">{stop.customer}</p>
          <p className="text-xs text-gray-500 truncate">{stop.address || '—'}</p>
          {stop.deliveryCode && <p className="text-[10px] text-gray-400">{stop.deliveryCode}</p>}
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
            {/* Địa chỉ */}
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <MapPin size={15} className="text-[#0ea5e9] mt-0.5 shrink-0" />
              <span>{stop.address || 'Địa chỉ theo đơn hàng'}</span>
            </div>

            {/* SĐT khách + nút gọi */}
            {stop.phone && (
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-green-500 shrink-0" />
                <a href={`tel:${stop.phone}`}
                  className="text-sm font-semibold text-green-600 underline underline-offset-2">
                  {stop.phone}
                </a>
                <span className="text-[10px] text-gray-400">nhấn để gọi</span>
              </div>
            )}

            {/* Hàng hóa */}
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <Package size={15} className="text-orange-400 mt-0.5 shrink-0" />
              <span>{stop.items}</span>
            </div>

            {/* COD */}
            <div className="flex items-center gap-2 text-sm font-semibold text-[#1e2a3a]">
              <Banknote size={15} className="text-green-500 shrink-0" />
              <span>Thu COD: {formatVND(stop.cod)}</span>
            </div>
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
                </p>
              ) : (
                <p className="text-red-600 font-medium">✗ {confirm!.failReason}</p>
              )}
              {confirm!.podPhotoUrl && (
                <a href={confirm!.podPhotoUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-green-600 mt-1.5 hover:underline">
                  <ImageIcon size={11} /> Xem ảnh xác nhận
                </a>
              )}
              <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                <Clock size={9} /> Lúc {formatTime(confirm!.confirmedAt)}
                {diffMinutes(confirm!.arrivedAt, confirm!.confirmedAt) > 0 && ` · Xử lý ${diffMinutes(confirm!.arrivedAt, confirm!.confirmedAt)} phút`}
              </p>
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
                  {/* COD có thể sửa */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">
                      Số tiền thu thực tế (đ)
                      <span className="ml-1 font-normal text-gray-400">— có thể chỉnh sửa</span>
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={cod}
                      onChange={e => setCod(Number(e.target.value))}
                      className="w-full h-10 px-3 text-sm border border-[#e5e7eb] rounded-xl bg-white text-gray-700 outline-none focus:border-green-400"
                    />
                    {cod !== stop.cod && (
                      <p className="text-[11px] text-orange-500 mt-0.5">
                        Dự kiến: {formatVND(stop.cod)} · Chênh: {formatVND(cod - stop.cod)}
                      </p>
                    )}
                  </div>

                  {/* Hình thức thanh toán */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-2">Hình thức thanh toán</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([{ key: 'cash', label: '💵 Tiền mặt' }, { key: 'transfer', label: '🏦 Chuyển khoản' }, { key: 'pending', label: '⏳ Chưa thu' }] as const).map(opt => (
                        <button key={opt.key} type="button" onClick={() => setPaymentMethod(opt.key)}
                          className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${paymentMethod === opt.key ? 'border-green-400 bg-green-50 text-green-700' : 'border-[#e5e7eb] text-gray-600 hover:bg-gray-50'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ảnh POD */}
                  <PhotoCapture value={photo} onChange={setPhoto} />

                  {/* Ghi chú */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Ghi chú (tùy chọn)</label>
                    <input type="text" value={driverNote} onChange={e => setDriverNote(e.target.value)}
                      placeholder="Ghi chú thêm..."
                      className="w-full h-10 px-3 text-sm border border-[#e5e7eb] rounded-xl outline-none focus:border-green-400" />
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => setMode('idle')} className="flex-1 py-2.5 border border-[#e5e7eb] rounded-xl text-sm text-gray-600 hover:bg-gray-50 active:scale-95 transition-all">Quay lại</button>
                    <button onClick={handleSubmit} disabled={saving}
                      className="flex-1 py-2.5 bg-green-500 text-white text-sm font-semibold rounded-xl hover:bg-green-600 disabled:opacity-50 active:scale-95 transition-all">
                      {saving ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Đang lưu...
                        </span>
                      ) : 'Xác nhận'}
                    </button>
                  </div>
                </div>
              )}

              {mode === 'failed' && (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1.5">
                    {FAIL_REASONS.map(r => (
                      <label key={r} className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-colors ${failReason === r ? 'border-red-300 bg-red-50' : 'border-[#e5e7eb] hover:bg-gray-50'}`}>
                        <input type="radio" name="fail" value={r} checked={failReason === r} onChange={() => setFailReason(r)} className="accent-red-500" />
                        <span className="text-sm text-gray-700">{r}</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Ghi chú thêm (tùy chọn)</label>
                    <input type="text" value={driverNote} onChange={e => setDriverNote(e.target.value)}
                      placeholder="Chi tiết thêm..."
                      className="w-full h-10 px-3 text-sm border border-[#e5e7eb] rounded-xl outline-none focus:border-red-300" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setMode('idle')} className="flex-1 py-2.5 border border-[#e5e7eb] rounded-xl text-sm text-gray-600 hover:bg-gray-50 active:scale-95 transition-all">Quay lại</button>
                    <button onClick={handleSubmit} disabled={saving || !failReason}
                      className="flex-1 py-2.5 bg-red-400 text-white text-sm font-semibold rounded-xl hover:bg-red-500 disabled:opacity-40 active:scale-95 transition-all">
                      {saving ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Đang lưu...
                        </span>
                      ) : 'Xác nhận'}
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

// ─── Kết ca summary ───────────────────────────────────────────────────────────
function KetCaSummary({ confirmations, stops }: { confirmations: StopConfirmation[]; stops: StopData[] }) {
  const delivered = confirmations.filter(c => c.result === 'delivered')
  const failed = confirmations.filter(c => c.result === 'failed')
  const totalCod = delivered.reduce((s, c) => s + (c.cod ?? 0), 0)
  const cashCod = delivered.filter(c => c.paymentMethod === 'cash').reduce((s, c) => s + (c.cod ?? 0), 0)
  const transferCod = delivered.filter(c => c.paymentMethod === 'transfer').reduce((s, c) => s + (c.cod ?? 0), 0)
  const expectedCod = stops.reduce((s, st) => s + st.cod, 0)
  const diff = totalCod - expectedCod

  return (
    <div className="mx-4 mb-6 bg-[#1e2a3a] rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-400" />
          <span className="text-sm font-bold text-white">Tổng kết ca giao hàng</span>
        </div>
        <p className="text-[11px] text-white/50 mt-0.5">{new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-white/10 rounded-xl py-2">
            <p className="text-lg font-bold text-white">{delivered.length}</p>
            <p className="text-[10px] text-green-400 font-semibold">Đã giao</p>
          </div>
          <div className="bg-white/10 rounded-xl py-2">
            <p className="text-lg font-bold text-white">{failed.length}</p>
            <p className="text-[10px] text-red-400 font-semibold">Thất bại</p>
          </div>
          <div className="bg-white/10 rounded-xl py-2">
            <p className="text-lg font-bold text-white">{stops.length}</p>
            <p className="text-[10px] text-white/50 font-semibold">Tổng đơn</p>
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-3 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-white/60">COD dự kiến</span>
            <span className="text-white font-semibold">{formatVND(expectedCod)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/60">Đã thu thực tế</span>
            <span className="text-green-400 font-bold">{formatVND(totalCod)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/60">💵 Tiền mặt</span>
            <span className="text-white/80">{formatVND(cashCod)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-white/60">🏦 Chuyển khoản</span>
            <span className="text-white/80">{formatVND(transferCod)}</span>
          </div>
          {diff !== 0 && (
            <div className={`flex justify-between text-xs border-t border-white/10 pt-2 ${diff < 0 ? 'text-red-400' : 'text-orange-400'}`}>
              <span>{diff < 0 ? '⚠ Thiếu' : '⚠ Dư'}</span>
              <span className="font-bold">{formatVND(Math.abs(diff))}</span>
            </div>
          )}
          {diff === 0 && totalCod > 0 && (
            <div className="flex justify-between text-xs border-t border-white/10 pt-2 text-green-400">
              <span>✓ Khớp sổ</span>
              <span className="font-bold">—</span>
            </div>
          )}
        </div>

        <p className="text-[11px] text-white/40 text-center">Nộp tiền mặt cho quản lý sau khi kết ca</p>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PermanentDriverPage() {
  const { token } = useParams<{ token: string }>()
  const [driverInfo, setDriverInfo] = useState<{ driver: string; vehicle: string; stops: StopData[] } | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [confirmations, setConfirmations] = useState<StopConfirmation[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [driverId, setDriverId] = useState('')

  const loadPlan = async (id: string) => {
    const res = await fetch(`/api/driver-plan/driver/${id}`)
    if (!res.ok) { setInvalid(true); return }
    const data = await res.json()
    setDriverInfo(data)

    // Restore confirmations từ DB (các đơn đã có status delivered/failed)
    const dbConfirmed: StopConfirmation[] = (data.stops ?? [])
      .filter((s: any) => s.status === 'delivered' || s.status === 'failed')
      .map((s: any) => ({
        stopId: s.id,
        result: s.status as 'delivered' | 'failed',
        cod: s.codCollected ?? 0,
        arrivedAt: s.actualDate ?? new Date().toISOString(),
        confirmedAt: s.actualDate ?? new Date().toISOString(),
      }))

    setConfirmations(prev => {
      const merged = [...dbConfirmed]
      for (const p of prev) {
        if (!merged.find(c => c.stopId === p.stopId)) merged.push(p)
      }
      return merged
    })
  }

  useEffect(() => {
    const p = decodeDriverToken(token)
    if (!p) { setInvalid(true); return }
    setDriverId(p.driverId)
    loadPlan(p.driverId)
  }, [token])

  const handleRefresh = async () => {
    if (!driverId) return
    setRefreshing(true)
    await loadPlan(driverId)
    setRefreshing(false)
  }

  const handleConfirm = async (stopId: string, data: Omit<StopConfirmation, 'stopId'>) => {
    const res = await fetch('/api/delivery-confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, stopId, ...data }),
    })
    if (res.ok) {
      setConfirmations(prev => [...prev.filter(c => c.stopId !== stopId), { stopId, ...data }])
    }
    if (driverId) loadPlan(driverId)
  }

  if (invalid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <AlertTriangle size={48} className="text-red-400 mx-auto mb-3" />
          <h1 className="text-lg font-bold text-[#1e2a3a]">Link không hợp lệ</h1>
          <p className="text-sm text-gray-500 mt-1">Liên hệ điều phối để lấy link.</p>
        </div>
      </div>
    )
  }

  if (!driverInfo) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const { stops, driver, vehicle } = driverInfo
  const doneCount = confirmations.length
  const totalCount = stops.length
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0
  const totalCod = confirmations.filter(c => c.result === 'delivered').reduce((s, c) => s + (c.cod ?? 0), 0)
  const allDone = totalCount > 0 && doneCount >= totalCount

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      {/* Header */}
      <div className="bg-[#1e2a3a] text-white px-4 pt-10 pb-5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Truck size={18} className="text-[#0ea5e9]" />
            <span className="text-xs text-white/60 font-medium">Kế hoạch giao hàng hôm nay</span>
          </div>
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1 text-xs text-white/60 hover:text-white transition-colors">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Cập nhật
          </button>
        </div>
        <h1 className="text-lg font-bold">{driver}</h1>
        <p className="text-sm text-white/70 mt-0.5">{vehicle}</p>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/10">
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wider">Tiến độ</p>
            <p className="text-sm font-semibold">{doneCount}/{totalCount} điểm</p>
          </div>
          <div>
            <p className="text-[10px] text-white/50 uppercase tracking-wider">COD đã thu</p>
            <p className="text-sm font-semibold">{formatVND(totalCod)}</p>
          </div>
          <div className="ml-auto">
            <p className="text-[10px] text-white/50 uppercase tracking-wider">Ngày</p>
            <p className="text-sm font-semibold">{new Date().toLocaleDateString('vi-VN')}</p>
          </div>
        </div>
        <div className="mt-3 h-1.5 bg-white/20 rounded-full overflow-hidden">
          <div className="h-full bg-[#0ea5e9] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="py-4 space-y-3">
        {totalCount === 0 ? (
          <div className="text-center py-12 px-4">
            <CheckCircle2 size={40} className="text-green-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-600">Không có đơn giao hôm nay</p>
            <p className="text-xs text-gray-400 mt-1">Nhấn "Cập nhật" để kiểm tra lại</p>
          </div>
        ) : (
          <>
            {/* Stop cards */}
            <div className="px-4 space-y-3">
              {!allDone && (
                <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                  <Clock size={13} />
                  <span>Thứ tự chỉ là gợi ý — bạn có thể giao theo thứ tự thuận tiện nhất</span>
                </div>
              )}
              {stops.map((stop, i) => (
                <StopCard
                  key={stop.id}
                  stop={stop}
                  seq={i + 1}
                  confirm={confirmations.find(c => c.stopId === stop.id)}
                  onConfirm={handleConfirm}
                />
              ))}
            </div>

            {/* Kết ca khi tất cả xong */}
            {allDone && (
              <KetCaSummary confirmations={confirmations} stops={stops} />
            )}
          </>
        )}
      </div>
      <div className="h-6" />
    </div>
  )
}
