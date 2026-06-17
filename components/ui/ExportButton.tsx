'use client'
import { useState, useRef, useEffect } from 'react'
import { Download, Calendar, Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'

type ExportModule = 'ban-hang' | 'kho-hang' | 'logistics' | 'mua-hang' | 'tai-chinh' | 'all'

const MODULE_LABEL: Record<ExportModule, string> = {
  'ban-hang':  'Bán hàng',
  'kho-hang':  'Kho hàng',
  'logistics': 'Logistics',
  'mua-hang':  'Mua hàng',
  'tai-chinh': 'Tài chính',
  'all':       'Toàn bộ',
}

interface Props {
  module: ExportModule
  label?: string
}

function defaultFrom() {
  const d = new Date()
  d.setMonth(d.getMonth() - 3)
  return d.toISOString().slice(0, 10)
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10)
}

export default function ExportButton({ module, label }: Props) {
  const tenant = useTenant()
  const [open, setOpen]       = useState(false)
  const [from, setFrom]       = useState(defaultFrom)
  const [to, setTo]           = useState(defaultTo)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  // Đóng khi click ngoài
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleExport = async () => {
    setError('')
    if (!from || !to) { setError('Vui lòng chọn khoảng thời gian.'); return }
    if (from > to)    { setError('Ngày bắt đầu phải trước ngày kết thúc.'); return }

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) { setError('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại.'); return }

      const url = `/api/export?module=${module}&from=${from}&to=${to}`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `Lỗi ${res.status}`)
      }

      const blob  = await res.blob()
      const companySlug = (tenant.name ?? 'MiaSCM').replace(/\s+/g, '_')
      const fname = `${companySlug}_${MODULE_LABEL[module].replace(' ', '')}_${from}_${to}.xlsx`
      const a     = document.createElement('a')
      a.href      = URL.createObjectURL(blob)
      a.download  = fname
      a.click()
      URL.revokeObjectURL(a.href)
      setOpen(false)
    } catch (e: any) {
      setError(e.message ?? 'Xuất file thất bại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-white border border-[#e5e7eb] rounded-lg hover:bg-gray-50 hover:border-[#0ea5e9] hover:text-[#0ea5e9] transition-all"
      >
        <Download size={13} />
        {label ?? 'Xuất Excel'}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl border border-[#e5e7eb] shadow-xl p-4 w-72">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-[#0ea5e9]" />
              <span className="text-xs font-semibold text-[#1e2a3a]">
                Xuất {MODULE_LABEL[module]}
              </span>
            </div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Từ ngày
              </label>
              <input
                type="date"
                value={from}
                max={to}
                onChange={e => setFrom(e.target.value)}
                className="w-full text-xs border border-[#e5e7eb] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#0ea5e9]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Đến ngày
              </label>
              <input
                type="date"
                value={to}
                min={from}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setTo(e.target.value)}
                className="w-full text-xs border border-[#e5e7eb] rounded-lg px-2.5 py-1.5 outline-none focus:border-[#0ea5e9]"
              />
            </div>

            {error && (
              <p className="text-[11px] text-red-500">{error}</p>
            )}

            <button
              onClick={handleExport}
              disabled={loading}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-white bg-[#0ea5e9] hover:bg-[#0284c7] rounded-lg transition-colors disabled:opacity-60"
            >
              {loading
                ? <><Loader2 size={13} className="animate-spin" /> Đang xuất...</>
                : <><Download size={13} /> Xuất Excel (.xlsx)</>}
            </button>

            <p className="text-[10px] text-gray-400 text-center">
              Dữ liệu trong khoảng thời gian đã chọn
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
