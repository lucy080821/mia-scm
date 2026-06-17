'use client'
import React, { useEffect, useState, useCallback } from 'react'
import {
  Building2, Plus, Search, X, Eye, EyeOff, Package,
  Truck, ShoppingCart, DollarSign, Activity, RefreshCw,
  CheckCircle2, Clock, Globe, Phone, FileText, Pencil,
} from 'lucide-react'

const MODULE_OPTIONS = [
  { key: 'ban-hang',  label: 'Bán hàng',   icon: ShoppingCart },
  { key: 'kho-hang',  label: 'Kho hàng',   icon: Package },
  { key: 'logistics', label: 'Logistics',  icon: Truck },
  { key: 'mua-hang',  label: 'Mua hàng',   icon: Package },
  { key: 'tai-chinh', label: 'Tài chính',  icon: DollarSign },
  { key: 'bao-cao',   label: 'Báo cáo',    icon: Activity },
]
const DEFAULT_MODULES = MODULE_OPTIONS.map(m => m.key)

interface Tenant {
  id: string; slug: string; name: string
  primary_color: string; enabled_modules: string[]
  address: string | null; phone: string | null
  tax_code: string | null; is_platform: boolean; created_at: string
}

async function getToken() {
  const { supabase } = await import('@/lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

function ModuleBadge({ mod }: { mod: string }) {
  const opt = MODULE_OPTIONS.find(m => m.key === mod)
  if (!opt) return null
  const Icon = opt.icon
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-100 rounded-full text-[10px] font-medium">
      <Icon size={9} /> {opt.label}
    </span>
  )
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [selected, setSelected] = useState<Tenant | null>(null)
  const [form, setForm] = useState({
    name: '', slug: '', adminEmail: '', adminPassword: '',
    address: '', phone: '', taxCode: '',
    enabledModules: [...DEFAULT_MODULES],
    primaryColor: '#0ea5e9',
  })

  const setF = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const autoSlug = (name: string) =>
    name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const handleNameChange = (v: string) => {
    setF('name', v)
    if (!form.slug || form.slug === autoSlug(form.name)) setF('slug', autoSlug(v))
  }

  const toggleModule = (key: string) =>
    setForm(f => ({
      ...f,
      enabledModules: f.enabledModules.includes(key)
        ? f.enabledModules.filter(m => m !== key)
        : [...f.enabledModules, key],
    }))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/tenants', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setCompanies(await res.json())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!form.name || !form.slug || !form.adminEmail || !form.adminPassword) return
    setSaving(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name, slug: form.slug,
          adminEmail: form.adminEmail, adminPassword: form.adminPassword,
          address: form.address || null, phone: form.phone || null,
          taxCode: form.taxCode || null,
          enabledModules: form.enabledModules,
          primaryColor: form.primaryColor,
        }),
      })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? 'Lỗi') }
      await load()
      setShowModal(false)
      setForm({ name: '', slug: '', adminEmail: '', adminPassword: '', address: '', phone: '', taxCode: '', enabledModules: [...DEFAULT_MODULES], primaryColor: '#0ea5e9' })
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Lỗi tạo công ty')
    } finally { setSaving(false) }
  }

  const clients = companies.filter(c => !c.is_platform)
  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.slug.includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0f172a]">Công ty khách hàng</h1>
          <p className="text-sm text-gray-400 mt-0.5">{clients.length} công ty đang sử dụng Mia SCM</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-400 text-[#0f172a] text-sm font-bold rounded-xl hover:bg-amber-300 hover:scale-[1.02] active:scale-95 transition-all shadow-sm shadow-amber-200">
            <Plus size={15} /> Tạo công ty mới
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 h-10 max-w-xs shadow-sm">
        <Search size={14} className="text-gray-400 shrink-0" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Tìm theo tên, slug..."
          className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400" />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 h-40 animate-pulse">
              <div className="flex gap-3 mb-4">
                <div className="w-10 h-10 bg-gray-100 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                  <div className="h-2 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[...Array(3)].map((_, j) => <div key={j} className="h-5 w-16 bg-gray-100 rounded-full" />)}
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 py-20 text-center shadow-sm">
          <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Building2 size={24} className="text-amber-300" />
          </div>
          <p className="text-sm font-medium text-gray-400">{search ? 'Không tìm thấy kết quả' : 'Chưa có công ty nào'}</p>
          {!search && (
            <button onClick={() => setShowModal(true)}
              className="mt-4 px-4 py-2 bg-amber-400 text-[#0f172a] text-sm font-semibold rounded-xl hover:bg-amber-300 transition-all">
              Tạo công ty đầu tiên
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(c => (
            <div key={c.id}
              className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all group cursor-pointer"
              onClick={() => setSelected(c)}>
              {/* Top row */}
              <div className="flex items-start gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-base font-bold shrink-0 shadow-sm"
                  style={{ backgroundColor: c.primary_color || '#0ea5e9' }}>
                  {c.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[#0f172a] truncate group-hover:text-amber-600 transition-colors">{c.name}</p>
                  <p className="text-[11px] text-gray-400 font-mono mt-0.5">/{c.slug}</p>
                </div>
                <div className="w-2 h-2 bg-emerald-400 rounded-full mt-1.5 shrink-0" />
              </div>

              {/* Modules */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {(c.enabled_modules ?? []).map(m => <ModuleBadge key={m} mod={m} />)}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-[10px] text-gray-400 pt-3 border-t border-gray-50">
                <span className="flex items-center gap-1"><Clock size={10} />{new Date(c.created_at).toLocaleDateString('vi-VN')}</span>
                {c.phone && <span className="flex items-center gap-1"><Phone size={10} />{c.phone}</span>}
                <span className="flex items-center gap-1 text-amber-500">
                  <CheckCircle2 size={10} /> Đang hoạt động
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selected && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setSelected(null)}>
          <div className="flex-1 bg-black/30 backdrop-blur-sm" />
          <div className="w-full max-w-md bg-white shadow-2xl flex flex-col h-full overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
                  style={{ backgroundColor: selected.primary_color || '#0ea5e9' }}>
                  {selected.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#0f172a]">{selected.name}</h2>
                  <p className="text-xs text-gray-400 font-mono">/{selected.slug}</p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-5">
              {/* Status */}
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-100 rounded-xl">
                <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                <p className="text-xs font-semibold text-emerald-700">Đang hoạt động</p>
                <span className="ml-auto text-[10px] text-emerald-600">Tham gia {new Date(selected.created_at).toLocaleDateString('vi-VN')}</span>
              </div>
              {/* Details */}
              <div className="space-y-3">
                {selected.address && (
                  <div className="flex gap-3">
                    <Globe size={14} className="text-gray-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-600">{selected.address}</p>
                  </div>
                )}
                {selected.phone && (
                  <div className="flex gap-3">
                    <Phone size={14} className="text-gray-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-600">{selected.phone}</p>
                  </div>
                )}
                {selected.tax_code && (
                  <div className="flex gap-3">
                    <FileText size={14} className="text-gray-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-600">MST: {selected.tax_code}</p>
                  </div>
                )}
              </div>
              {/* Modules */}
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase mb-2">Module kích hoạt ({selected.enabled_modules?.length ?? 0}/{MODULE_OPTIONS.length})</p>
                <div className="grid grid-cols-3 gap-2">
                  {MODULE_OPTIONS.map(m => {
                    const active = selected.enabled_modules?.includes(m.key)
                    const Icon = m.icon
                    return (
                      <div key={m.key}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium
                          ${active ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-100 bg-gray-50 text-gray-300'}`}>
                        <Icon size={16} />
                        {m.label}
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* Color */}
              <div className="flex items-center gap-3">
                <p className="text-xs font-bold text-gray-400 uppercase">Màu chủ đạo</p>
                <div className="w-6 h-6 rounded-lg border border-gray-200" style={{ backgroundColor: selected.primary_color }} />
                <p className="text-xs font-mono text-gray-500">{selected.primary_color}</p>
              </div>
            </div>
            <div className="px-6 pb-6">
              <button className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                <Pencil size={13} /> Chỉnh sửa công ty
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-400 rounded-xl flex items-center justify-center">
                  <Building2 size={16} className="text-[#0f172a]" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#0f172a]">Tạo công ty mới</h2>
                  <p className="text-xs text-gray-400">Điền thông tin và chọn module triển khai</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-5">
              {/* Basic info */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Thông tin công ty</p>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tên công ty <span className="text-red-400">*</span></label>
                  <input value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder="Công ty TNHH ABC"
                    className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Slug (URL định danh) <span className="text-red-400">*</span></label>
                  <div className="flex items-center h-9 border border-gray-200 rounded-xl overflow-hidden focus-within:border-amber-400 transition-colors">
                    <span className="px-3 text-xs text-gray-400 bg-gray-50 h-full flex items-center border-r border-gray-200 shrink-0">mia-scm.vn/</span>
                    <input value={form.slug} onChange={e => setF('slug', e.target.value)} placeholder="cong-ty-abc"
                      className="flex-1 px-3 text-sm font-mono outline-none bg-white" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Số điện thoại</label>
                    <input value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="028 xxxx xxxx"
                      className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Mã số thuế</label>
                    <input value={form.taxCode} onChange={e => setF('taxCode', e.target.value)} placeholder="0301234567"
                      className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Địa chỉ</label>
                  <input value={form.address} onChange={e => setF('address', e.target.value)} placeholder="123 Đường ABC, Quận 1, TP.HCM"
                    className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 transition-colors" />
                </div>
                <div className="flex items-center gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Màu chủ đạo</label>
                    <input type="color" value={form.primaryColor} onChange={e => setF('primaryColor', e.target.value)}
                      className="w-10 h-9 rounded-xl border border-gray-200 cursor-pointer p-0.5" />
                  </div>
                  <div className="flex-1 mt-5">
                    <div className="h-9 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-sm"
                      style={{ backgroundColor: form.primaryColor }}>
                      Xem trước màu
                    </div>
                  </div>
                </div>
              </div>

              {/* Admin account */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Tài khoản admin</p>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email admin <span className="text-red-400">*</span></label>
                  <input type="email" value={form.adminEmail} onChange={e => setF('adminEmail', e.target.value)} placeholder="admin@cty-abc.vn"
                    className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Mật khẩu admin <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} value={form.adminPassword} onChange={e => setF('adminPassword', e.target.value)}
                      placeholder="Tối thiểu 6 ký tự"
                      className="w-full h-9 px-3 pr-9 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 transition-colors" />
                    <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-2.5 top-2 text-gray-400">
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Modules */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Module kích hoạt</p>
                  <div className="flex gap-2">
                    <button onClick={() => setForm(f => ({ ...f, enabledModules: DEFAULT_MODULES }))}
                      className="text-[10px] text-amber-600 hover:text-amber-700 font-semibold transition-colors">Chọn tất cả</button>
                    <span className="text-gray-300">·</span>
                    <button onClick={() => setForm(f => ({ ...f, enabledModules: [] }))}
                      className="text-[10px] text-gray-400 hover:text-gray-600 font-semibold transition-colors">Bỏ tất cả</button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {MODULE_OPTIONS.map(m => {
                    const on = form.enabledModules.includes(m.key)
                    const Icon = m.icon
                    return (
                      <button key={m.key} type="button" onClick={() => toggleModule(m.key)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all hover:scale-[1.02]
                          ${on ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'}`}>
                        <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                          ${on ? 'border-amber-500 bg-amber-500' : 'border-gray-300'}`}>
                          {on && <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <Icon size={12} />
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
                Hủy
              </button>
              <button onClick={handleCreate}
                disabled={!form.name || !form.slug || !form.adminEmail || !form.adminPassword || saving}
                className="flex-1 py-2.5 bg-amber-400 text-[#0f172a] text-sm font-bold rounded-xl hover:bg-amber-300 disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
                {saving ? 'Đang tạo...' : 'Tạo công ty'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
