'use client'
import { useState } from 'react'
import {
  Download, ShoppingCart, Warehouse, Truck, ClipboardList, DollarSign,
  FileSpreadsheet, Loader2, CheckCircle2, Circle, Sparkles, Calendar,
  BarChart3, Package, Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useTenant } from '@/contexts/TenantContext'

type Mod = 'ban-hang' | 'kho-hang' | 'logistics' | 'mua-hang' | 'tai-chinh'

const MODULES: {
  key: Mod; label: string; desc: string; icon: React.ElementType
  color: string; bg: string; sheets: string[]; rows?: string
}[] = [
  {
    key: 'ban-hang', label: 'Bán hàng', icon: ShoppingCart,
    color: 'text-emerald-600', bg: 'bg-emerald-50',
    desc: 'Đơn hàng, chi tiết sản phẩm, danh sách khách hàng',
    sheets: ['Đơn hàng bán', 'Chi tiết đơn hàng', 'Khách hàng'],
  },
  {
    key: 'kho-hang', label: 'Kho hàng', icon: Warehouse,
    color: 'text-amber-600', bg: 'bg-amber-50',
    desc: 'Tồn kho hiện tại, sản phẩm, phiếu nhập và xuất kho',
    sheets: ['Tồn kho', 'Sản phẩm', 'Nhập kho', 'Xuất kho'],
  },
  {
    key: 'logistics', label: 'Logistics', icon: Truck,
    color: 'text-blue-600', bg: 'bg-blue-50',
    desc: 'Đơn vận chuyển, phương tiện, tài xế',
    sheets: ['Đơn vận chuyển', 'Phương tiện', 'Tài xế'],
  },
  {
    key: 'mua-hang', label: 'Mua hàng', icon: ClipboardList,
    color: 'text-violet-600', bg: 'bg-violet-50',
    desc: 'Đơn đặt mua hàng và danh sách nhà cung cấp',
    sheets: ['Đơn mua hàng', 'Nhà cung cấp'],
  },
  {
    key: 'tai-chinh', label: 'Tài chính', icon: DollarSign,
    color: 'text-rose-600', bg: 'bg-rose-50',
    desc: 'Doanh thu, chi phí phát sinh, công nợ KH & NCC',
    sheets: ['Doanh thu', 'Chi phí phát sinh', 'Công nợ KH', 'Công nợ NCC'],
  },
]

const TOTAL_SHEETS = MODULES.reduce((s, m) => s + m.sheets.length, 0)

function defaultFrom() {
  const d = new Date(); d.setMonth(d.getMonth() - 3)
  return d.toISOString().slice(0, 10)
}

export default function XuatDuLieuPage() {
  const { user } = useAuth()
  const tenant   = useTenant()
  const isAdmin  = user?.role === 'admin'

  const [selected, setSelected] = useState<Set<Mod>>(new Set(MODULES.map(m => m.key)))
  const [from, setFrom]         = useState(defaultFrom)
  const [to, setTo]             = useState(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading]   = useState<string | null>(null)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState('')

  const toggle = (key: Mod) => setSelected(prev => {
    const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s
  })
  const allChecked = selected.size === MODULES.length
  const selectedSheets = MODULES.filter(m => selected.has(m.key)).reduce((s, m) => s + m.sheets.length, 0)

  const quickDate = (months: number) => {
    const now = new Date()
    setTo(now.toISOString().slice(0, 10))
    if (months === 0) { setFrom(`${now.getFullYear()}-01-01`); return }
    const f = new Date(now); f.setMonth(f.getMonth() - months)
    setFrom(f.toISOString().slice(0, 10))
  }

  const doExport = async (target: 'all' | Mod) => {
    setError(''); setDone('')
    if (!from || !to || from > to) { setError('Khoảng thời gian không hợp lệ.'); return }

    setLoading(target)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setError('Phiên đăng nhập hết hạn.'); return }

      const apiModule = target === 'all' ? 'all' : target
      const res = await fetch(`/api/export?module=${apiModule}&from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error ?? `Lỗi ${res.status}`) }

      const blob        = await res.blob()
      const label       = target === 'all' ? 'ToanBo' : MODULES.find(m => m.key === target)?.label.replace(' ', '') ?? target
      const companySlug = (tenant.name ?? 'MiaSCM').replace(/\s+/g, '_')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${companySlug}_${label}_${from}_${to}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
      setDone(target === 'all' ? 'Xuất toàn bộ thành công!' : `Đã xuất module ${MODULES.find(m => m.key === target)?.label}`)
      setTimeout(() => setDone(''), 3000)
    } catch (e: any) {
      setError(e.message ?? 'Xuất file thất bại.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">

      {/* ── Hero ── */}
      <div className="relative bg-gradient-to-br from-[#1e2a3a] to-[#1a3a5c] rounded-2xl p-6 overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-[var(--mia-primary)]/10 pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-[var(--mia-primary)]/20 border border-[var(--mia-primary)]/30 flex items-center justify-center">
              <FileSpreadsheet size={22} className="text-[var(--mia-primary)]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Xuất dữ liệu</h1>
              <p className="text-xs text-[var(--mia-primary)] font-medium mt-0.5">Báo cáo & Phân tích</p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="relative grid grid-cols-3 sm:grid-cols-4 gap-3">
          {[
            { label: 'Module',        val: String(MODULES.length),     icon: BarChart3,      color: 'text-[var(--mia-primary)]' },
            { label: 'Sheet dữ liệu', val: String(TOTAL_SHEETS),       icon: FileSpreadsheet, color: 'text-emerald-400' },
            { label: 'Định dạng',     val: '.xlsx',                    icon: Download,       color: 'text-amber-400' },
            { label: 'Đang chọn',     val: `${selectedSheets} sheet`,  icon: Sparkles,       color: 'text-violet-400' },
          ].map(s => (
            <div key={s.label} className="bg-white/8 border border-white/10 rounded-xl px-4 py-3">
              <s.icon size={14} className={`${s.color} mb-1.5`} />
              <p className={`text-base font-bold text-white`}>{s.val}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Date picker ── */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={15} className="text-[var(--mia-primary)]" />
          <h2 className="text-sm font-semibold text-[#1e2a3a]">Khoảng thời gian dữ liệu</h2>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Từ ngày</label>
            <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)}
              className="border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#1e2a3a] outline-none focus:border-[var(--mia-primary)] focus:ring-2 focus:ring-[var(--mia-primary)]/10 transition" />
          </div>
          <div className="text-gray-300 pb-2">→</div>
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Đến ngày</label>
            <input type="date" value={to} min={from} max={new Date().toISOString().slice(0, 10)} onChange={e => setTo(e.target.value)}
              className="border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#1e2a3a] outline-none focus:border-[var(--mia-primary)] focus:ring-2 focus:ring-[var(--mia-primary)]/10 transition" />
          </div>
          <div className="flex gap-1.5 flex-wrap pb-0.5">
            {[
              { label: '1 tháng', m: 1 }, { label: '3 tháng', m: 3 },
              { label: '6 tháng', m: 6 }, { label: 'Năm nay', m: 0 },
            ].map(q => (
              <button key={q.label} onClick={() => quickDate(q.m)}
                className="text-xs px-3 py-2 bg-gray-50 border border-[#e5e7eb] rounded-lg text-gray-600 hover:bg-[var(--mia-primary)]/5 hover:border-[var(--mia-primary)] hover:text-[var(--mia-primary)] transition-all font-medium">
                {q.label}
              </button>
            ))}
          </div>
        </div>
        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <span className="text-base">⚠️</span> {error}
          </div>
        )}
        {done && (
          <div className="mt-3 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
            <CheckCircle2 size={15} /> {done}
          </div>
        )}
      </div>

      {/* ── Module grid ── */}
      <div>
        {isAdmin && (
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#1e2a3a]">Chọn module xuất</h2>
              <p className="text-xs text-gray-400 mt-0.5">Click vào card để chọn / bỏ chọn</p>
            </div>
            <button onClick={() => setSelected(allChecked ? new Set() : new Set(MODULES.map(m => m.key)))}
              className="text-xs text-[var(--mia-primary)] hover:underline font-medium flex items-center gap-1">
              {allChecked ? <CheckCircle2 size={13} /> : <Circle size={13} />}
              {allChecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map(mod => {
            const Icon    = mod.icon
            const checked = selected.has(mod.key)
            const busy    = loading === mod.key

            return (
              <div key={mod.key}
                onClick={() => isAdmin && toggle(mod.key)}
                className={`relative bg-white rounded-xl border-2 transition-all duration-200 overflow-hidden
                  ${isAdmin ? 'cursor-pointer' : ''}
                  ${checked && isAdmin
                    ? 'border-[var(--mia-primary)] shadow-md shadow-[#0ea5e9]/10'
                    : 'border-[#e5e7eb] hover:border-gray-300 hover:shadow-sm'
                  }`}
              >
                {/* Selected indicator bar */}
                {checked && isAdmin && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#0ea5e9] to-[#1e2a3a]" />
                )}

                <div className="p-5">
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${mod.bg} flex items-center justify-center`}>
                        <Icon size={18} className={mod.color} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#1e2a3a]">{mod.label}</p>
                        <p className="text-[10px] text-gray-400">{mod.sheets.length} sheet</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 transition-all
                        ${checked ? 'bg-[var(--mia-primary)] border-[var(--mia-primary)]' : 'border-gray-300'}`}>
                        {checked && <span className="text-white text-[10px] font-bold">✓</span>}
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">{mod.desc}</p>

                  {/* Sheet tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {mod.sheets.map(s => (
                      <span key={s} className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${mod.bg} ${mod.color}`}>
                        {s}
                      </span>
                    ))}
                  </div>

                  {/* Export button */}
                  <button
                    onClick={e => { e.stopPropagation(); doExport(mod.key) }}
                    disabled={!!loading}
                    className={`w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg border transition-all
                      ${checked && isAdmin
                        ? `${mod.color} border-current hover:bg-current hover:text-white`
                        : 'text-gray-500 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      } disabled:opacity-50`}
                  >
                    {busy
                      ? <><Loader2 size={12} className="animate-spin" /> Đang xuất...</>
                      : <><Download size={12} /> Xuất module này</>}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Admin bulk export ── */}
      {isAdmin && (
        <div className="relative bg-gradient-to-r from-[#1e2a3a] to-[#1a3a5c] rounded-2xl p-6 overflow-hidden">
          <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-[var(--mia-primary)]/10 pointer-events-none" />
          <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--mia-primary)]/20 border border-[var(--mia-primary)]/30 flex items-center justify-center shrink-0">
                <Download size={20} className="text-[var(--mia-primary)]" />
              </div>
              <div>
                <p className="text-base font-bold text-white">Xuất toàn bộ hệ thống</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  1 file Excel duy nhất · {TOTAL_SHEETS} sheet · Tất cả module · Font Times New Roman
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {MODULES.map(m => {
                    const Icon = m.icon
                    return (
                      <div key={m.key} title={m.label}
                        className="w-6 h-6 rounded-lg bg-white/10 flex items-center justify-center">
                        <Icon size={11} className="text-gray-300" />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <button onClick={() => doExport('all')} disabled={!!loading}
              className="relative shrink-0 flex items-center gap-2 px-6 py-3 bg-[var(--mia-primary)] hover:opacity-90 text-white text-sm font-bold rounded-xl transition-all hover:shadow-lg hover:shadow-[#0ea5e9]/30 disabled:opacity-60 active:scale-95">
              {loading === 'all'
                ? <><Loader2 size={16} className="animate-spin" /> Đang xuất...</>
                : <><Download size={16} /> Xuất toàn bộ</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
