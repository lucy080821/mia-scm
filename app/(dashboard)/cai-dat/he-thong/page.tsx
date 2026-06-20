'use client'
import React, { useState } from 'react'
import {
  Shield, Users, Bell, Link2, Mail,
  Crown, ShoppingBag, Package, Truck, Car,
  RotateCcw, Save, Info, Plus, X, Eye, EyeOff,
  CheckCircle2, XCircle, Send, Zap, Webhook,
  Phone, KeyRound, UserCircle, Pencil, Ban,
  ToggleLeft, ToggleRight, AlertTriangle,
  Building2, MapPin, Globe, Palette,
} from 'lucide-react'
import { DEFAULT_ROLE_PERMISSIONS, type Role, type Permission } from '@/lib/permissions'
import { useTenant, useTenantUpdater } from '@/contexts/TenantContext'
import {
  saveTenantToStorage, type TenantConfig,
  DASHBOARD_WIDGET_DEFS, DEFAULT_DASHBOARD_WIDGETS,
  type DashboardWidget, type ThemeConfig,
} from '@/lib/tenant'
import { useAuth } from '@/hooks/useAuth'

// ── Tab definitions ────────────────────────────────────────────────────────
const TABS = [
  { id: 'company',    label: 'Thông tin công ty',       icon: Building2 },
  { id: 'appearance', label: 'Giao diện',               icon: Palette },
  { id: 'users',      label: 'Tài khoản & Người dùng', icon: Users },
  { id: 'perms',      label: 'Phân quyền',              icon: Shield },
  { id: 'notify',     label: 'Thông báo',               icon: Bell },
  { id: 'integr',     label: 'Tích hợp',                icon: Link2 },
  { id: 'email',      label: 'Email & Zalo',             icon: Mail },
]
// Tab chỉ hiện với platform owner
const PLATFORM_TABS = [
  { id: 'companies', label: 'Công ty khách hàng',      icon: Globe },
]

// ── Module options for tenant config ──────────────────────────────────────
const MODULE_OPTIONS = [
  { key: 'ban-hang',  label: 'Bán hàng' },
  { key: 'kho-hang',  label: 'Kho hàng' },
  { key: 'logistics', label: 'Logistics' },
  { key: 'mua-hang',  label: 'Mua hàng' },
  { key: 'tai-chinh', label: 'Tài chính' },
  { key: 'bao-cao',   label: 'Báo cáo' },
]

// ─── CompanyTab ──────────────────────────────────────────────────────────
function CompanyTab() {
  const tenant = useTenant()
  const setTenantCtx = useTenantUpdater()
  const { user } = useAuth()
  const isPlatformOwner = user?.role === 'owner'

  const [form, setForm] = useState({
    name:           tenant.name,
    address:        tenant.address ?? '',
    phone:          tenant.phone ?? '',
    taxCode:        tenant.taxCode ?? '',
    enabledModules: [...tenant.enabledModules],
    logoUrl:        tenant.logoUrl ?? '',
  })
  const [saved, setSaved] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string>(tenant.logoUrl ?? '')

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const toggleModule = (key: string) => {
    setForm(f => ({
      ...f,
      enabledModules: f.enabledModules.includes(key)
        ? f.enabledModules.filter(m => m !== key)
        : [...f.enabledModules, key],
    }))
    setSaved(false)
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const url = ev.target?.result as string
      setLogoPreview(url)
      set('logoUrl', url)
      setSaved(false)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession()
    const token = session?.access_token

    if (token && tenant.id !== 'default') {
      // Lưu lên Supabase
      await fetch(`/api/tenants/${tenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name:            form.name,
          address:         form.address,
          phone:           form.phone,
          tax_code:        form.taxCode,
          logo_url:        form.logoUrl || null,
          enabled_modules: form.enabledModules,
        }),
      })
    }

    // Cập nhật local state ngay
    const updated: TenantConfig = { ...tenant, ...form }
    saveTenantToStorage(updated)
    setTenantCtx(updated)
    window.dispatchEvent(new Event('mia:tenant-updated'))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* ID công ty */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] px-5 py-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-[#1e2a3a]">ID công ty</h3>
        <span className="text-xs font-mono text-gray-500 select-all">{tenant.id}</span>
      </div>

      {/* Logo + thông tin công ty */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#1e2a3a]">Thông tin & Logo</h3>

        {/* Logo upload */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">Logo công ty</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl border-2 border-dashed border-[#e5e7eb] flex items-center justify-center overflow-hidden shrink-0 bg-gray-50">
              {logoPreview
                ? <img src={logoPreview} alt="logo" className="w-full h-full object-cover" />
                : <Building2 size={24} className="text-gray-300" />
              }
            </div>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-[var(--mia-primary)] border border-[var(--mia-primary)] rounded-lg cursor-pointer hover:bg-sky-50 transition-colors w-fit">
                <Globe size={12} />
                Tải lên ảnh logo
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </label>
              <p className="text-[10px] text-gray-400">PNG, JPG, SVG · Tối đa 2MB · Hiển thị ở sidebar</p>
              {logoPreview && (
                <button onClick={() => { setLogoPreview(''); set('logoUrl', '') }}
                  className="text-[10px] text-red-400 hover:text-red-600 transition-colors">
                  Xóa logo
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tên công ty <span className="text-red-400">*</span></label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
            className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Số điện thoại</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="028 xxxx xxxx"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Mã số thuế</label>
            <input value={form.taxCode} onChange={e => set('taxCode', e.target.value)} placeholder="0301234567"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1"><MapPin size={11} />Địa chỉ</label>
          <input value={form.address} onChange={e => set('address', e.target.value)} placeholder="123 Đường ABC, Quận 1, TP.HCM"
            className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
        </div>
      </div>

      {/* Module — chỉ chủ app mới thấy */}
      {isPlatformOwner && (
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-[#1e2a3a]">Module kích hoạt</h3>
            <p className="text-xs text-gray-400 mt-0.5">Chỉ những module được chọn mới hiển thị trong sidebar</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {MODULE_OPTIONS.map(m => {
              const on = form.enabledModules.includes(m.key)
              return (
                <button key={m.key} onClick={() => toggleModule(m.key)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all hover:scale-[1.02]
                    ${on ? 'border-[var(--mia-primary)] bg-sky-50 text-sky-700' : 'border-[#e5e7eb] bg-white text-gray-500 hover:border-gray-300'}`}
                  style={on ? { borderColor: tenant.primaryColor, color: tenant.primaryColor, backgroundColor: tenant.primaryColor + '15' } : {}}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                    ${on ? 'border-current bg-current' : 'border-gray-300'}`}>
                    {on && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={handleSave}
          className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold rounded-lg hover:scale-[1.02] active:scale-95 transition-all
            ${saved ? 'bg-green-500 text-white' : 'bg-[var(--mia-primary)] text-white hover:opacity-90'}`}>
          <Save size={14} />{saved ? 'Đã lưu!' : 'Lưu thay đổi'}
        </button>
      </div>
    </div>
  )
}

// ─── AppearanceTab ────────────────────────────────────────────────────────

const SIDEBAR_PRESETS = [
  { color: '#1e2a3a', label: 'Xanh đêm' },
  { color: '#0f172a', label: 'Đen đêm' },
  { color: '#1e1e2e', label: 'Tối sâu' },
  { color: '#312e81', label: 'Tím đậm' },
  { color: '#1e3a5f', label: 'Hải quân' },
  { color: '#14532d', label: 'Xanh rừng' },
  { color: '#7c2d12', label: 'Đỏ đất' },
  { color: '#374151', label: 'Than chì' },
]

const FONT_PRESETS: { key: ThemeConfig['fontFamily'] & string; name: string; desc: string }[] = [
  { key: 'inter',          name: 'Inter',          desc: 'Hiện đại · Sạch' },
  { key: 'be-vietnam-pro', name: 'Be Vietnam Pro', desc: 'Việt Nam · Dễ đọc' },
  { key: 'roboto',         name: 'Roboto',         desc: 'Phổ biến · Rõ ràng' },
  { key: 'nunito',         name: 'Nunito',         desc: 'Thân thiện · Tròn' },
]

const GOOGLE_FONT_CSS: Record<string, string> = {
  'inter':          '',
  'be-vietnam-pro': 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap',
  'roboto':         'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap',
  'nunito':         'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap',
}

const FONT_SAMPLE_FAMILY: Record<string, string> = {
  'inter':          "'Inter', sans-serif",
  'be-vietnam-pro': "'Be Vietnam Pro', sans-serif",
  'roboto':         "'Roboto', sans-serif",
  'nunito':         "'Nunito', sans-serif",
}

function AppearanceTab() {
  const tenant = useTenant()
  const setTenantCtx = useTenantUpdater()

  const [primaryColor, setPrimaryColor] = useState(tenant.primaryColor)
  const [sidebarBg, setSidebarBg]       = useState(tenant.themeConfig?.sidebarBg   ?? '#1e2a3a')
  const [sidebarText, setSidebarText]   = useState(tenant.themeConfig?.sidebarText ?? '#ffffff')
  const [accentColor, setAccentColor]   = useState(tenant.themeConfig?.accentColor ?? tenant.primaryColor)
  const [fontFamily, setFontFamily]     = useState<NonNullable<ThemeConfig['fontFamily']>>(tenant.themeConfig?.fontFamily ?? 'inter')
  const [fontSize, setFontSize]         = useState<NonNullable<ThemeConfig['fontSize']>>(tenant.themeConfig?.fontSize ?? 'md')
  const [widgets, setWidgets]           = useState<DashboardWidget[]>(
    tenant.dashboardWidgets ?? DEFAULT_DASHBOARD_WIDGETS
  )
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const toggleWidget = (id: string) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, enabled: !w.enabled } : w))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    const themeConfig: ThemeConfig = { sidebarBg, sidebarText, accentColor, fontFamily, fontSize }
    const updated: TenantConfig = { ...tenant, primaryColor, themeConfig, dashboardWidgets: widgets }

    const { data: { session } } = await (await import('@/lib/supabase')).supabase.auth.getSession()
    const token = session?.access_token

    if (token && tenant.id !== 'default') {
      await fetch(`/api/tenants/${tenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          primary_color:    primaryColor,
          theme_config:     themeConfig,
          dashboard_config: widgets,
        }),
      })
    }

    saveTenantToStorage(updated)
    setTenantCtx(updated)
    window.dispatchEvent(new Event('mia:tenant-updated'))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // Preload Google Font for preview
  const loadPreviewFont = (key: string) => {
    const url = GOOGLE_FONT_CSS[key]
    if (!url || document.getElementById(`preview-font-${key}`)) return
    const link = document.createElement('link')
    link.id = `preview-font-${key}`
    link.rel = 'stylesheet'
    link.href = url
    document.head.appendChild(link)
  }

  return (
    <div className="space-y-5 max-w-2xl">

      {/* ── MÀU SẮC ── */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 space-y-5">
        <h3 className="text-sm font-bold text-[#1e2a3a]">Màu sắc thương hiệu</h3>

        {/* Màu chủ đạo */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">Màu chủ đạo (Primary)</label>
          <div className="flex items-center gap-3">
            <input type="color" value={primaryColor} onChange={e => { setPrimaryColor(e.target.value); setSaved(false) }}
              className="w-10 h-10 rounded-lg border border-[#e5e7eb] cursor-pointer p-0.5 shrink-0" />
            <input value={primaryColor} onChange={e => { setPrimaryColor(e.target.value); setSaved(false) }}
              placeholder="#0ea5e9" maxLength={7}
              className="w-28 h-9 px-3 text-sm font-mono border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            <div className="h-9 px-4 rounded-lg flex items-center text-white text-xs font-semibold"
              style={{ backgroundColor: primaryColor }}>
              Nút bấm · Link
            </div>
          </div>
        </div>

        {/* Màu sidebar */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">Màu sidebar</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {SIDEBAR_PRESETS.map(p => (
              <button key={p.color} onClick={() => { setSidebarBg(p.color); setSaved(false) }}
                title={p.label}
                className={`w-9 h-9 rounded-lg border-2 transition-all hover:scale-110 ${sidebarBg === p.color ? 'border-[var(--mia-primary)] scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: p.color }} />
            ))}
            <div className="flex items-center gap-2 ml-1">
              <input type="color" value={sidebarBg} onChange={e => { setSidebarBg(e.target.value); setSaved(false) }}
                className="w-9 h-9 rounded-lg border border-[#e5e7eb] cursor-pointer p-0.5"
                title="Màu tuỳ chỉnh" />
              <span className="text-xs text-gray-400">Tuỳ chỉnh</span>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: sidebarBg }}>
            <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: primaryColor, color: '#fff' }}>
              {tenant.name.charAt(0)}
            </div>
            <span className="text-xs font-semibold" style={{ color: sidebarText }}>{tenant.name}</span>
            <span className="text-xs ml-2" style={{ color: sidebarText + '80' }}>· Xem trước sidebar</span>
          </div>
        </div>

        {/* Màu chữ sidebar */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">Màu chữ sidebar</label>
          <div className="flex flex-wrap gap-2 mb-3">
            {[
              { color: '#ffffff', label: 'Trắng' },
              { color: '#e2e8f0', label: 'Xám nhạt' },
              { color: '#94a3b8', label: 'Xám xanh' },
              { color: '#fde68a', label: 'Vàng ấm' },
              { color: '#bbf7d0', label: 'Xanh lá nhạt' },
              { color: '#bfdbfe', label: 'Xanh nhạt' },
            ].map(p => (
              <button key={p.color} onClick={() => { setSidebarText(p.color); setSaved(false) }}
                title={p.label}
                className={`w-9 h-9 rounded-lg border-2 transition-all hover:scale-110 ${sidebarText === p.color ? 'border-[var(--mia-primary)] scale-110' : 'border-[#e5e7eb]'}`}
                style={{ backgroundColor: p.color }} />
            ))}
            <div className="flex items-center gap-2 ml-1">
              <input type="color" value={sidebarText} onChange={e => { setSidebarText(e.target.value); setSaved(false) }}
                className="w-9 h-9 rounded-lg border border-[#e5e7eb] cursor-pointer p-0.5"
                title="Màu tuỳ chỉnh" />
              <span className="text-xs text-gray-400">Tuỳ chỉnh</span>
            </div>
          </div>
        </div>

        {/* Màu accent */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">Màu accent (nút bấm phụ)</label>
          <div className="flex items-center gap-3">
            <input type="color" value={accentColor} onChange={e => { setAccentColor(e.target.value); setSaved(false) }}
              className="w-10 h-10 rounded-lg border border-[#e5e7eb] cursor-pointer p-0.5 shrink-0" />
            <input value={accentColor} onChange={e => { setAccentColor(e.target.value); setSaved(false) }}
              placeholder="#0ea5e9" maxLength={7}
              className="w-28 h-9 px-3 text-sm font-mono border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            <button onClick={() => { setAccentColor(primaryColor); setSaved(false) }}
              className="text-xs text-gray-400 hover:text-[var(--mia-primary)] transition-colors">
              Đặt bằng màu chủ đạo
            </button>
          </div>
        </div>
      </div>

      {/* ── FONT CHỮ ── */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 space-y-4">
        <h3 className="text-sm font-bold text-[#1e2a3a]">Font chữ</h3>
        <div className="grid grid-cols-2 gap-3">
          {FONT_PRESETS.map(f => {
            const active = fontFamily === f.key
            return (
              <button key={f.key}
                onClick={() => { setFontFamily(f.key); setSaved(false); loadPreviewFont(f.key) }}
                className={`flex flex-col gap-1.5 p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.02]
                  ${active ? 'border-[var(--mia-primary)] bg-sky-50' : 'border-[#e5e7eb] hover:border-gray-300'}`}>
                <span className="text-xl font-bold text-[#1e2a3a]"
                  style={{ fontFamily: FONT_SAMPLE_FAMILY[f.key] }}>
                  Aa Bb Hệ thống
                </span>
                <span className="text-sm font-semibold text-[#1e2a3a]"
                  style={{ fontFamily: FONT_SAMPLE_FAMILY[f.key] }}>
                  {f.name}
                </span>
                <span className="text-[10px] text-gray-400">{f.desc}</span>
                {active && (
                  <span className="text-[10px] text-[var(--mia-primary)] font-semibold mt-0.5">Đang dùng</span>
                )}
              </button>
            )
          })}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">Cỡ chữ</label>
          <div className="flex gap-2">
            {([['sm', 'Nhỏ (13px)'], ['md', 'Vừa (14px)'], ['lg', 'Lớn (16px)']] as const).map(([key, label]) => (
              <button key={key} onClick={() => { setFontSize(key); setSaved(false) }}
                className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all hover:scale-[1.02]
                  ${fontSize === key ? 'border-[var(--mia-primary)] bg-sky-50 text-[var(--mia-primary)]' : 'border-[#e5e7eb] text-gray-600 hover:border-gray-300'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── DASHBOARD WIDGETS ── */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#1e2a3a]">Cấu hình Dashboard</h3>
            <p className="text-xs text-gray-400 mt-0.5">Chọn những gì hiển thị trên trang tổng quan</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setWidgets(prev => prev.map(w => ({ ...w, enabled: true }))); setSaved(false) }}
              className="text-xs text-[var(--mia-primary)] hover:underline">Bật tất cả</button>
            <span className="text-gray-300">·</span>
            <button onClick={() => { setWidgets(prev => prev.map(w => ({ ...w, enabled: false }))); setSaved(false) }}
              className="text-xs text-gray-400 hover:text-red-400 hover:underline">Tắt tất cả</button>
          </div>
        </div>

        <div className="space-y-1">
          {DASHBOARD_WIDGET_DEFS.map(def => {
            const w = widgets.find(x => x.id === def.id) ?? { id: def.id, enabled: true }
            return (
              <div key={def.id}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all
                  ${w.enabled ? 'border-[#e5e7eb] bg-white' : 'border-dashed border-gray-200 bg-gray-50'}`}>
                <div>
                  <p className={`text-sm font-medium ${w.enabled ? 'text-[#1e2a3a]' : 'text-gray-400'}`}>{def.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{def.desc}</p>
                </div>
                <button type="button" onClick={() => toggleWidget(def.id)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none shrink-0
                    ${w.enabled ? 'bg-[var(--mia-primary)]' : 'bg-gray-200'}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200
                    ${w.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold rounded-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-60
            ${saved ? 'bg-green-500 text-white' : 'bg-[var(--mia-primary)] text-white hover:opacity-90'}`}>
          <Save size={14} />
          {saved ? 'Đã lưu!' : saving ? 'Đang lưu...' : 'Lưu giao diện'}
        </button>
      </div>
    </div>
  )
}

// ── Role data ──────────────────────────────────────────────────────────────
const ROLES: { id: Role; label: string; sub: string; icon: React.ReactNode; count: number }[] = [
  { id: 'admin',     label: 'Quản trị viên',      sub: 'admin · toàn quyền',  icon: <Crown size={22} className="text-yellow-500" />,  count: 2  },
  { id: 'sales',     label: 'Nhân viên bán hàng', sub: 'sales',               icon: <ShoppingBag size={22} className="text-sky-500" />,count: 8  },
  { id: 'warehouse', label: 'Nhân viên kho',       sub: 'warehouse',           icon: <Package size={22} className="text-orange-500" />, count: 5  },
  { id: 'logistics', label: 'Điều phối',           sub: 'logistics',           icon: <Truck size={22} className="text-purple-500" />,  count: 3  },
  { id: 'driver',    label: 'Tài xế',              sub: 'driver · app mobile', icon: <Car size={22} className="text-pink-500" />,      count: 12 },
]

const ROLE_BADGE: Record<string, string> = {
  owner:     'bg-amber-100 text-amber-800',
  admin:     'bg-yellow-100 text-yellow-700',
  sales:     'bg-sky-100 text-sky-700',
  warehouse: 'bg-orange-100 text-orange-700',
  logistics: 'bg-purple-100 text-purple-700',
  driver:    'bg-pink-100 text-pink-700',
}
const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', sales: 'Sales', warehouse: 'Kho', logistics: 'Logistics', driver: 'Tài xế', ketoan: 'Kế toán',
}

// ── Permission matrix ─────────────────────────────────────────────────────
type PermRow = { label: string; desc: string; perms: Permission[] }
type PermGroup = { section: string; emoji: string; rows: PermRow[] }
const PERM_GROUPS: PermGroup[] = [
  { section: 'BÁN HÀNG', emoji: '🛒', rows: [
    { label: 'Xem đơn hàng bán',     desc: 'sales.view',                   perms: ['sales.view'] },
    { label: 'Tạo / sửa đơn hàng',   desc: 'sales.create · sales.edit',    perms: ['sales.create', 'sales.edit'] },
    { label: 'Duyệt / xóa đơn hàng', desc: 'sales.approve · sales.delete', perms: ['sales.approve', 'sales.delete'] },
  ]},
  { section: 'KHO HÀNG', emoji: '📦', rows: [
    { label: 'Xem tồn kho & sản phẩm',    desc: 'inventory.view · product.view',         perms: ['inventory.view', 'product.view'] },
    { label: 'Nhập / xuất kho',            desc: 'inventory.create · inventory.edit',     perms: ['inventory.create', 'inventory.edit'] },
    { label: 'Duyệt phiếu kho & kiểm kê', desc: 'inventory.approve · stocktake.approve', perms: ['inventory.approve', 'stocktake.approve'] },
  ]},
  { section: 'LOGISTICS', emoji: '🚛', rows: [
    { label: 'Xem đơn vận chuyển',       desc: 'delivery.view',          perms: ['delivery.view'] },
    { label: 'Phân tuyến & gán tài xế',  desc: 'delivery.assign',        perms: ['delivery.assign'] },
    { label: 'Cập nhật trạng thái giao', desc: 'delivery.update_status', perms: ['delivery.update_status'] },
  ]},
  { section: 'BÁO CÁO & CÀI ĐẶT', emoji: '🔧', rows: [
    { label: 'Xem & xuất báo cáo', desc: 'report.view · report.export', perms: ['report.view', 'report.export'] },
    { label: 'Quản lý người dùng', desc: 'user.manage',                  perms: ['user.manage'] },
    { label: 'Cài đặt hệ thống',   desc: 'settings.manage',             perms: ['settings.manage'] },
  ]},
]
const NON_ADMIN_ROLES: Role[] = ['sales', 'warehouse', 'logistics', 'driver']

// ── Toggle ─────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={disabled ? undefined : onChange} disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none
        ${checked ? 'bg-[var(--mia-primary)]' : 'bg-gray-200'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:opacity-90'}`}>
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200
        ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
    </button>
  )
}
function rowEnabled(perms: Permission[], rolePerms: Permission[]): boolean {
  return perms.some(p => rolePerms.includes(p))
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: USERS
// ═══════════════════════════════════════════════════════════════════════════

interface UserRecord {
  id: string
  employee_code: string | null
  full_name: string
  email: string
  phone: string | null
  role: string
  status: 'active' | 'inactive'
  created_at: string
  avatar_url: string | null
}

async function apiHeaders() {
  const { supabase } = await import('@/lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token ?? ''}`,
  }
}

function UserFormModal({ user, onClose, onSave, loading }: {
  user?: UserRecord; onClose: () => void
  onSave: (data: Record<string, string>) => Promise<void>
  loading: boolean
}) {
  const isEdit = !!user
  const [form, setForm] = useState({
    employee_code: user?.employee_code ?? '',
    full_name:     user?.full_name ?? '',
    email:         user?.email ?? '',
    phone:         user?.phone ?? '',
    role:          user?.role ?? 'sales',
    status:        user?.status ?? 'active',
  })
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.full_name || !form.email) return
    if (!isEdit && !password) return
    await onSave({ ...form, ...(password ? { password } : {}) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-base font-bold text-[#1e2a3a]">{isEdit ? 'Chỉnh sửa tài khoản' : 'Thêm người dùng mới'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Mã nhân viên</label>
            <input value={form.employee_code} onChange={e => set('employee_code', e.target.value)} placeholder="NV001"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Vai trò</label>
            <select value={form.role} onChange={e => set('role', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]">
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Họ và tên <span className="text-red-400">*</span></label>
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)} placeholder="Nguyễn Văn A"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email <span className="text-red-400">*</span></label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
              disabled={isEdit} placeholder="ten@cty.vn"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] disabled:bg-gray-50 disabled:text-gray-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Số điện thoại</label>
            <input value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} placeholder="0901234567"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              {isEdit ? 'Mật khẩu mới' : <>Mật khẩu <span className="text-red-400">*</span></>}
            </label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder={isEdit ? 'Để trống nếu không đổi' : 'Tối thiểu 6 ký tự'}
                className="w-full h-9 px-3 pr-9 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
              <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-2.5 top-2 text-gray-400">
                {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Trạng thái</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]">
              <option value="active">Đang hoạt động</option>
              <option value="inactive">Tạm khóa</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 border-t border-[#e5e7eb]">
          <button onClick={onClose} className="flex-1 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
          <button onClick={handleSave} disabled={!form.full_name || !form.email || loading}
            className="flex-1 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
            {loading ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo tài khoản'}
          </button>
        </div>
      </div>
    </div>
  )
}

function UsersTab() {
  const [users, setUsers] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [roleFilter, setRoleFilter] = useState('all')
  const [modal, setModal] = useState<UserRecord | 'new' | null>(null)
  const [search, setSearch] = useState('')
  const tenant = useTenant()

  const loadUsers = React.useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const headers = await apiHeaders()
      const res = await fetch('/api/users', { headers })
      if (!res.ok) throw new Error(await res.text())
      setUsers(await res.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Lỗi tải danh sách')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { loadUsers() }, [loadUsers])

  const filtered = users.filter(u => {
    const matchRole = roleFilter === 'all' || u.role === roleFilter
    const q = search.toLowerCase()
    const matchSearch = u.full_name.toLowerCase().includes(q) || u.email.includes(q) || (u.employee_code ?? '').includes(q)
    return matchRole && matchSearch
  })

  const handleSave = async (data: Record<string, string>) => {
    setSaving(true)
    try {
      const headers = await apiHeaders()
      const isEdit = modal !== 'new'
      const url = isEdit ? `/api/users/${(modal as UserRecord).id}` : '/api/users'
      const res = await fetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers,
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Lỗi lưu')
      }
      await loadUsers()
      setModal(null)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Lỗi')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (u: UserRecord) => {
    const newStatus = u.status === 'active' ? 'inactive' : 'active'
    const headers = await apiHeaders()
    await fetch(`/api/users/${u.id}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ status: newStatus }),
    })
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, status: newStatus } : x))
  }

  const AVATAR_BG: Record<string, string> = {
    admin: 'bg-yellow-500', sales: 'bg-sky-500', warehouse: 'bg-orange-500',
    logistics: 'bg-purple-500', driver: 'bg-pink-500',
  }

  return (
    <div className="space-y-4">
      {/* Tenant banner */}
      <div className="bg-white border border-[#e5e7eb] rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ backgroundColor: tenant.primaryColor }}>
          {tenant.name.charAt(0)}
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1e2a3a]">{tenant.name}</p>
          <p className="text-xs text-gray-400">Người dùng mới tạo tự động thuộc công ty này · tenant_id được inject từ session admin</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        {ROLES.map(r => (
          <div key={r.id} className="bg-white border border-[#e5e7eb] rounded-xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center shrink-0">{r.icon}</div>
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-semibold">{r.label}</p>
              <p className="text-lg font-bold text-[#1e2a3a]">{users.filter(u => u.role === r.id).length}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e5e7eb] flex-wrap">
          <div className="flex items-center gap-2 bg-gray-50 border border-[#e5e7eb] rounded-lg px-3 h-9 flex-1 max-w-xs">
            <UserCircle size={14} className="text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên, email, mã NV..."
              className="flex-1 text-sm bg-transparent outline-none" />
          </div>
          <div className="flex gap-1">
            {['all', ...Object.keys(ROLE_LABEL)].map(r => (
              <button key={r} onClick={() => setRoleFilter(r)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${roleFilter === r ? 'bg-[var(--mia-primary)] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {r === 'all' ? 'Tất cả' : ROLE_LABEL[r]}
              </button>
            ))}
          </div>
          <button onClick={() => setModal('new')}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
            <Plus size={14} /> Thêm người dùng
          </button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-gray-400">Đang tải...</div>
        ) : error ? (
          <div className="flex items-center justify-center py-16 text-sm text-red-400">{error}</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-gray-50">
                {['Người dùng', 'Mã NV', 'Liên hệ', 'Vai trò', 'Ngày tạo', 'Trạng thái', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => {
                const initials = u.full_name.split(' ').pop()?.charAt(0).toUpperCase() ?? '?'
                return (
                  <tr key={u.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {u.avatar_url
                          ? <img src={u.avatar_url} className="w-8 h-8 rounded-full object-cover shrink-0" alt="" />
                          : <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${AVATAR_BG[u.role] ?? 'bg-gray-400'}`}>{initials}</div>
                        }
                        <div>
                          <p className="text-xs font-semibold text-[#1e2a3a]">{u.full_name}</p>
                          <p className="text-[10px] text-gray-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">{u.employee_code ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Phone size={10} className="text-gray-300" />{u.phone ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ROLE_BADGE[u.role] ?? 'bg-gray-100 text-gray-600'}`}>{ROLE_LABEL[u.role] ?? u.role}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {new Date(u.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 text-xs font-medium w-fit ${u.status === 'active' ? 'text-green-600' : 'text-red-500'}`}>
                        {u.status === 'active' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                        {u.status === 'active' ? 'Hoạt động' : 'Đã khóa'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setModal(u)} title="Chỉnh sửa"
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => toggleStatus(u)} title={u.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa'}
                          className={`p-1.5 rounded-lg transition-colors ${u.status === 'active' ? 'hover:bg-red-50 text-gray-400 hover:text-red-500' : 'hover:bg-green-50 text-gray-400 hover:text-green-500'}`}>
                          {u.status === 'active' ? <Ban size={13} /> : <CheckCircle2 size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-sm text-gray-400">Không có người dùng nào</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <UserFormModal
          user={modal === 'new' ? undefined : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
          loading={saving}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

interface NotifyRule {
  id: string; label: string; desc: string; emoji: string
  push: boolean; email: boolean; zalo: boolean
}

const INITIAL_NOTIFY: NotifyRule[] = [
  { id: 'new_order',      label: 'Đơn hàng mới',          desc: 'Khi có đơn hàng bán mới được tạo',         emoji: '🛒', push: true,  email: true,  zalo: true  },
  { id: 'order_approved', label: 'Đơn hàng được duyệt',   desc: 'Khi đơn hàng được xác nhận',               emoji: '✅', push: true,  email: false, zalo: true  },
  { id: 'low_stock',      label: 'Tồn kho thấp',          desc: 'Khi tồn kho xuống dưới mức tối thiểu',     emoji: '⚠️', push: true,  email: true,  zalo: true  },
  { id: 'out_of_stock',   label: 'Hết hàng',              desc: 'Khi một sản phẩm hết hàng hoàn toàn',      emoji: '🚨', push: true,  email: true,  zalo: true  },
  { id: 'delivery_late',  label: 'Giao hàng trễ',         desc: 'Khi chuyến giao hàng quá giờ dự kiến',     emoji: '🚛', push: true,  email: false, zalo: true  },
  { id: 'delivery_done',  label: 'Giao hàng thành công',  desc: 'Khi tài xế xác nhận POD',                  emoji: '📦', push: false, email: false, zalo: false },
  { id: 'payment_overdue',label: 'Công nợ quá hạn',       desc: 'Khi khách hàng quá ngày thanh toán',       emoji: '💳', push: true,  email: true,  zalo: false },
  { id: 'qc_failed',      label: 'QC nhập kho thất bại',  desc: 'Khi lô hàng nhập kho không qua kiểm tra',  emoji: '❌', push: true,  email: true,  zalo: true  },
  { id: 'po_approved',    label: 'Đơn mua hàng duyệt',    desc: 'Khi đơn mua hàng được phê duyệt',          emoji: '📋', push: false, email: true,  zalo: false },
  { id: 'vehicle_expiry', label: 'Giấy tờ phương tiện',   desc: 'Phương tiện sắp hết hạn đăng kiểm/bảo hiểm', emoji: '🚗', push: true,  email: true,  zalo: false },
]

function NotifyTab() {
  const [rules, setRules] = useState<NotifyRule[]>(INITIAL_NOTIFY)
  const [quietFrom, setQuietFrom] = useState('22:00')
  const [quietTo, setQuietTo] = useState('07:00')
  const [quietEnabled, setQuietEnabled] = useState(true)
  const [saved, setSaved] = useState(false)

  const toggle = (id: string, channel: 'push' | 'email' | 'zalo') => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, [channel]: !r[channel] } : r))
    setSaved(false)
  }

  const toggleAll = (channel: 'push' | 'email' | 'zalo') => {
    const allOn = rules.every(r => r[channel])
    setRules(prev => prev.map(r => ({ ...r, [channel]: !allOn })))
  }

  return (
    <div className="space-y-4">
      {/* Quiet hours */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#1e2a3a]">Giờ im lặng</h3>
            <p className="text-xs text-gray-400 mt-0.5">Không gửi thông báo push trong khoảng thời gian này</p>
          </div>
          <Toggle checked={quietEnabled} onChange={() => setQuietEnabled(s => !s)} />
        </div>
        {quietEnabled && (
          <div className="flex items-center gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Từ</label>
              <input type="time" value={quietFrom} onChange={e => setQuietFrom(e.target.value)}
                className="h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
            <span className="text-gray-400 mt-5">→</span>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Đến</label>
              <input type="time" value={quietTo} onChange={e => setQuietTo(e.target.value)}
                className="h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
            <p className="text-xs text-gray-400 mt-5">Múi giờ: GMT+7 (Asia/Ho_Chi_Minh)</p>
          </div>
        )}
      </div>

      {/* Matrix */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e5e7eb] flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#1e2a3a]">Cài đặt thông báo theo sự kiện</h3>
          <div className="flex gap-2 text-xs text-gray-400">
            <span>Bật/tắt cột:</span>
            {(['push', 'email', 'zalo'] as const).map(ch => (
              <button key={ch} onClick={() => toggleAll(ch)}
                className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium transition-colors capitalize">
                {ch === 'push' ? '🔔 Push' : ch === 'email' ? '📧 Email' : '💬 Zalo'}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-gray-50">
              <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase w-1/2">Sự kiện</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">🔔 Push</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">📧 Email</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">💬 Zalo</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/50 transition-colors">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span>{r.emoji}</span>
                    <div>
                      <p className="text-sm font-medium text-[#1e2a3a]">{r.label}</p>
                      <p className="text-xs text-gray-400">{r.desc}</p>
                    </div>
                  </div>
                </td>
                {(['push', 'email', 'zalo'] as const).map(ch => (
                  <td key={ch} className="text-center px-4 py-3">
                    <div className="flex justify-center">
                      <Toggle checked={r[ch]} onChange={() => toggle(r.id, ch)} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000) }}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg hover:scale-[1.02] active:scale-95 transition-all
            ${saved ? 'bg-green-500 text-white' : 'bg-[var(--mia-primary)] text-white hover:opacity-90'}`}>
          <Save size={14} />{saved ? 'Đã lưu!' : 'Lưu cài đặt'}
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════════════

interface Integration {
  id: string; name: string; logo: string; desc: string
  status: 'connected' | 'disconnected' | 'error'
  apiKey: string; endpoint?: string; extra?: string
}

const INITIAL_INTEGRATIONS: Integration[] = [
  { id: 'ghn',      name: 'Giao Hàng Nhanh (GHN)', logo: '🟠', desc: 'Đơn vị vận chuyển nội địa — giao hàng toàn quốc',       status: 'connected',    apiKey: 'ghn_live_xxxxxxxxxxx', endpoint: 'https://dev-online-gateway.ghn.vn' },
  { id: 'ghtk',     name: 'GHTK',                   logo: '🔵', desc: 'Giao hàng tiết kiệm — đối tác vận chuyển thứ hai',      status: 'disconnected', apiKey: '', endpoint: '' },
  { id: 'vnpost',   name: 'Vietnam Post',            logo: '🔴', desc: 'Bưu chính Việt Nam — giao vùng xa',                     status: 'disconnected', apiKey: '', endpoint: '' },
  { id: 'momo',     name: 'MoMo',                    logo: '🟣', desc: 'Thanh toán ví điện tử MoMo',                            status: 'connected',    apiKey: 'momo_partner_xxxxxx', extra: 'Partner Code: MOMO123' },
  { id: 'vnpay',    name: 'VNPay',                   logo: '🟡', desc: 'Cổng thanh toán VNPay — QR & thẻ ngân hàng',            status: 'error',        apiKey: 'vnpay_tmn_xxxxx', extra: 'TMN Code: VNPAY01' },
  { id: 'webhook',  name: 'Webhook tùy chỉnh',       logo: '⚡', desc: 'Gửi sự kiện đến hệ thống ngoài qua HTTP POST',         status: 'connected',    apiKey: '', endpoint: 'https://hooks.myapp.vn/mia-scm' },
]

function IntegrationCard({ item, onSave }: { item: Integration; onSave: (i: Integration) => void }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ apiKey: item.apiKey, endpoint: item.endpoint ?? '', extra: item.extra ?? '' })
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)

  const handleTest = () => {
    setTesting(true); setTestResult(null)
    setTimeout(() => { setTesting(false); setTestResult(form.apiKey ? 'ok' : 'fail') }, 1500)
  }

  const handleSave = () => {
    onSave({ ...item, ...form, status: form.apiKey ? 'connected' : 'disconnected' })
    setEditing(false)
  }

  const STATUS_COLOR = { connected: 'text-green-600 bg-green-100', disconnected: 'text-gray-500 bg-gray-100', error: 'text-red-500 bg-red-100' }
  const STATUS_LABEL = { connected: 'Đã kết nối', disconnected: 'Chưa kết nối', error: 'Lỗi kết nối' }

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{item.logo}</span>
          <div>
            <p className="text-sm font-semibold text-[#1e2a3a]">{item.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
          </div>
        </div>
        <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[item.status]}`}>
          {item.status === 'connected' ? <CheckCircle2 size={11} /> : item.status === 'error' ? <AlertTriangle size={11} /> : <XCircle size={11} />}
          {STATUS_LABEL[item.status]}
        </span>
      </div>

      {editing ? (
        <div className="space-y-3 mt-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">API Key / Token</label>
            <div className="relative">
              <input type={showKey ? 'text' : 'password'} value={form.apiKey} onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
                placeholder="Nhập API key..."
                className="w-full h-8 px-3 pr-8 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
              <button type="button" onClick={() => setShowKey(s => !s)} className="absolute right-2 top-1.5 text-gray-400">
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>
          {item.endpoint !== undefined && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Endpoint URL</label>
              <input value={form.endpoint} onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))}
                placeholder="https://..."
                className="w-full h-8 px-3 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
          )}
          {item.extra !== undefined && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Thông tin thêm</label>
              <input value={form.extra} onChange={e => setForm(f => ({ ...f, extra: e.target.value }))}
                placeholder="Partner code, merchant ID..."
                className="w-full h-8 px-3 text-xs border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
          )}
          <div className="flex items-center gap-2">
            <button onClick={handleTest} disabled={testing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">
              <Zap size={11} className={testing ? 'animate-spin' : ''} />
              {testing ? 'Đang test...' : 'Test kết nối'}
            </button>
            {testResult === 'ok' && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 size={11} />Kết nối thành công</span>}
            {testResult === 'fail' && <span className="text-xs text-red-500 flex items-center gap-1"><XCircle size={11} />Kết nối thất bại</span>}
            <div className="ml-auto flex gap-2">
              <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
              <button onClick={handleSave} className="px-3 py-1.5 text-xs text-white bg-[var(--mia-primary)] rounded-lg hover:opacity-90 transition-all hover:scale-[1.02] active:scale-95">Lưu</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          {item.apiKey && (
            <p className="text-xs text-gray-400 font-mono truncate">
              Key: {item.apiKey.slice(0, 8)}{'•'.repeat(12)}
            </p>
          )}
          {item.endpoint && <p className="text-xs text-gray-400 truncate">URL: {item.endpoint}</p>}
          {item.extra && <p className="text-xs text-gray-400">{item.extra}</p>}
          <button onClick={() => setEditing(true)}
            className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-[#e5e7eb] rounded-lg hover:bg-gray-50 hover:border-[var(--mia-primary)] hover:text-[var(--mia-primary)] transition-colors">
            <Pencil size={11} />{item.status === 'disconnected' ? 'Kết nối ngay' : 'Chỉnh sửa'}
          </button>
        </div>
      )}
    </div>
  )
}

function IntegrationsTab() {
  const [integrations, setIntegrations] = useState<Integration[]>(INITIAL_INTEGRATIONS)
  const handleSave = (updated: Integration) => {
    setIntegrations(prev => prev.map(i => i.id === updated.id ? updated : i))
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
        <Webhook size={16} className="text-blue-500 shrink-0 mt-0.5" />
        <div className="text-sm">
          <span className="font-semibold text-blue-700">Tích hợp bên ngoài</span>
          <span className="text-blue-600 ml-1">Nhập API key từ dashboard của từng dịch vụ. Key được mã hóa và lưu trong Supabase Vault.</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map(i => <IntegrationCard key={i.id} item={i} onSave={handleSave} />)}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: EMAIL & ZALO
// ═══════════════════════════════════════════════════════════════════════════

function EmailZaloTab() {
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('noreply@mia-scm.vn')
  const [smtpPass, setSmtpPass] = useState('app_password_here')
  const [smtpFrom, setSmtpFrom] = useState('Mia SCM <noreply@mia-scm.vn>')
  const [showPass, setShowPass] = useState(false)

  const [zaloToken, setZaloToken] = useState('zalo_oa_access_token_xxxxx')
  const [zaloOAId, setZaloOAId] = useState('123456789')
  const [zaloSecret, setZaloSecret] = useState('zalo_secret_xxxxx')
  const [showZaloSecret, setShowZaloSecret] = useState(false)

  const [testEmail, setTestEmail] = useState('')
  const [testZalo, setTestZalo] = useState('')
  const [smtpSaved, setSmtpSaved] = useState(false)
  const [zaloSaved, setZaloSaved] = useState(false)
  const [smtpTesting, setSmtpTesting] = useState(false)
  const [smtpTestResult, setSmtpTestResult] = useState<'ok' | 'fail' | null>(null)
  const [zaloTesting, setZaloTesting] = useState(false)
  const [zaloTestResult, setZaloTestResult] = useState<'ok' | 'fail' | null>(null)

  const testSmtp = () => {
    setSmtpTesting(true); setSmtpTestResult(null)
    setTimeout(() => { setSmtpTesting(false); setSmtpTestResult(smtpHost ? 'ok' : 'fail') }, 1800)
  }
  const testZaloConn = () => {
    setZaloTesting(true); setZaloTestResult(null)
    setTimeout(() => { setZaloTesting(false); setZaloTestResult(zaloToken ? 'ok' : 'fail') }, 1800)
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {/* SMTP */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-sky-100 rounded-lg flex items-center justify-center"><Mail size={16} className="text-sky-600" /></div>
            <div>
              <h3 className="text-sm font-bold text-[#1e2a3a]">Cài đặt Email (SMTP)</h3>
              <p className="text-xs text-gray-400">Dùng để gửi hóa đơn, báo giá, thông báo qua email</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">SMTP Host</label>
                <input value={smtpHost} onChange={e => setSmtpHost(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Port</label>
                <select value={smtpPort} onChange={e => setSmtpPort(e.target.value)}
                  className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]">
                  <option value="587">587 (STARTTLS)</option>
                  <option value="465">465 (SSL)</option>
                  <option value="25">25 (Plain)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Username / Email</label>
              <input value={smtpUser} onChange={e => setSmtpUser(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">App Password</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={smtpPass} onChange={e => setSmtpPass(e.target.value)}
                  className="w-full h-9 px-3 pr-9 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-2.5 top-2 text-gray-400">
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">From (hiển thị người gửi)</label>
              <input value={smtpFrom} onChange={e => setSmtpFrom(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
          </div>

          {/* Test section */}
          <div className="mt-4 pt-4 border-t border-[#e5e7eb]">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Gửi email thử đến</label>
            <div className="flex gap-2">
              <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)} placeholder="test@example.com"
                className="flex-1 h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
              <button onClick={testSmtp} disabled={smtpTesting}
                className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors">
                <Send size={13} className={smtpTesting ? 'animate-pulse' : ''} />
                {smtpTesting ? 'Đang gửi...' : 'Gửi thử'}
              </button>
            </div>
            {smtpTestResult === 'ok' && <p className="text-xs text-green-600 mt-2 flex items-center gap-1"><CheckCircle2 size={11} />Email gửi thành công!</p>}
            {smtpTestResult === 'fail' && <p className="text-xs text-red-500 mt-2 flex items-center gap-1"><XCircle size={11} />Gửi thất bại — kiểm tra lại SMTP config</p>}
          </div>

          <div className="flex justify-end mt-4">
            <button onClick={() => { setSmtpSaved(true); setTimeout(() => setSmtpSaved(false), 2000) }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg hover:scale-[1.02] active:scale-95 transition-all
                ${smtpSaved ? 'bg-green-500 text-white' : 'bg-[var(--mia-primary)] text-white hover:opacity-90'}`}>
              <Save size={13} />{smtpSaved ? 'Đã lưu!' : 'Lưu cài đặt'}
            </button>
          </div>
        </div>
      </div>

      {/* Zalo OA */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="text-base">💬</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#1e2a3a]">Zalo Official Account (OA)</h3>
              <p className="text-xs text-gray-400">Gửi thông báo đơn hàng, giao hàng qua Zalo OA</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">OA ID</label>
              <input value={zaloOAId} onChange={e => setZaloOAId(e.target.value)} placeholder="OA ID từ Zalo Developer"
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Access Token</label>
              <input value={zaloToken} onChange={e => setZaloToken(e.target.value)} placeholder="zalo_oa_access_token_..."
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Secret Key</label>
              <div className="relative">
                <input type={showZaloSecret ? 'text' : 'password'} value={zaloSecret} onChange={e => setZaloSecret(e.target.value)}
                  className="w-full h-9 px-3 pr-9 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                <button type="button" onClick={() => setShowZaloSecret(s => !s)} className="absolute right-2.5 top-2 text-gray-400">
                  {showZaloSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 size={14} className="text-green-600" />
            <div>
              <p className="text-xs font-semibold text-green-700">Zalo OA đang hoạt động</p>
              <p className="text-[10px] text-green-600">Đã kết nối: Mia Distribution OA · 1,240 người theo dõi</p>
            </div>
          </div>

          {/* Test section */}
          <div className="mt-4 pt-4 border-t border-[#e5e7eb]">
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Gửi tin thử đến số điện thoại</label>
            <div className="flex gap-2">
              <input value={testZalo} onChange={e => setTestZalo(e.target.value)} placeholder="0901234567"
                className="flex-1 h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
              <button onClick={testZaloConn} disabled={zaloTesting}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-100 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-200 transition-colors">
                <Send size={13} className={zaloTesting ? 'animate-pulse' : ''} />
                {zaloTesting ? 'Đang gửi...' : 'Gửi thử'}
              </button>
            </div>
            {zaloTestResult === 'ok' && <p className="text-xs text-green-600 mt-2 flex items-center gap-1"><CheckCircle2 size={11} />Tin Zalo gửi thành công!</p>}
            {zaloTestResult === 'fail' && <p className="text-xs text-red-500 mt-2 flex items-center gap-1"><XCircle size={11} />Gửi thất bại — kiểm tra token</p>}
          </div>

          <div className="flex justify-end mt-4">
            <button onClick={() => { setZaloSaved(true); setTimeout(() => setZaloSaved(false), 2000) }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg hover:scale-[1.02] active:scale-95 transition-all
                ${zaloSaved ? 'bg-green-500 text-white' : 'bg-[var(--mia-primary)] text-white hover:opacity-90'}`}>
              <Save size={13} />{zaloSaved ? 'Đã lưu!' : 'Lưu cài đặt'}
            </button>
          </div>
        </div>

        {/* Template preview */}
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
          <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Mẫu tin nhắn Zalo</h4>
          <div className="space-y-2">
            {[
              { label: 'Xác nhận đơn hàng', preview: 'Đơn hàng SO-240601-001 của bạn đã được xác nhận. Giao hàng dự kiến: 03/06/2024.' },
              { label: 'Giao hàng thành công', preview: 'Đơn hàng SO-240601-001 đã giao thành công lúc 14:32. Cảm ơn bạn!' },
              { label: 'Nhắc công nợ', preview: 'Kính nhắc: Hóa đơn HD-240524-001 trị giá 48,500,000đ đã đến hạn thanh toán.' },
            ].map(t => (
              <div key={t.label} className="p-3 bg-blue-50 rounded-lg">
                <p className="text-[10px] font-semibold text-blue-600 uppercase mb-1">{t.label}</p>
                <p className="text-xs text-gray-600">{t.preview}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB: COMPANIES (platform owner only)
// ═══════════════════════════════════════════════════════════════════════════

interface TenantRow {
  id: string; slug: string; name: string
  logo_url: string | null; primary_color: string
  enabled_modules: string[]
  address: string | null; phone: string | null
  tax_code: string | null; is_platform: boolean; created_at: string
}

interface OwnerRow {
  id: string; full_name: string; email: string; role: string
  phone: string | null; status: string; created_at: string
}

const DEFAULT_MODULES = ['ban-hang', 'kho-hang', 'logistics', 'mua-hang', 'tai-chinh', 'bao-cao']

function CompaniesTab() {
  const [companies, setCompanies] = React.useState<TenantRow[]>([])
  const [owners, setOwners] = React.useState<OwnerRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showModal, setShowModal] = React.useState<'company' | 'owner' | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [showPass, setShowPass] = React.useState(false)
  const [form, setForm] = React.useState({
    name: '', slug: '', adminEmail: '', adminPassword: '',
    address: '', phone: '', taxCode: '',
    enabledModules: [...DEFAULT_MODULES],
  })
  const [ownerForm, setOwnerForm] = React.useState({ full_name: '', email: '', password: '' })
  const [showOwnerPass, setShowOwnerPass] = React.useState(false)

  const setF = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const loadData = React.useCallback(async () => {
    setLoading(true)
    try {
      const headers = await apiHeaders()
      const [tenantsRes, usersRes] = await Promise.all([
        fetch('/api/tenants', { headers }),
        fetch('/api/users', { headers }),
      ])
      if (tenantsRes.ok) setCompanies(await tenantsRes.json())
      if (usersRes.ok) setOwners(await usersRes.json())
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { loadData() }, [loadData])

  // Auto-slug from name
  const autoSlug = (name: string) =>
    name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  const handleNameChange = (v: string) => {
    setF('name', v)
    if (!form.slug || form.slug === autoSlug(form.name))
      setF('slug', autoSlug(v))
  }

  const toggleModule = (key: string) => {
    setForm(f => ({
      ...f,
      enabledModules: f.enabledModules.includes(key)
        ? f.enabledModules.filter(m => m !== key)
        : [...f.enabledModules, key],
    }))
  }

  const handleCreateCompany = async () => {
    if (!form.name || !form.slug || !form.adminEmail || !form.adminPassword) return
    setSaving(true)
    try {
      const headers = await apiHeaders()
      const res = await fetch('/api/tenants', {
        method: 'POST', headers,
        body: JSON.stringify({
          name: form.name, slug: form.slug,
          adminEmail: form.adminEmail, adminPassword: form.adminPassword,
          address: form.address || null, phone: form.phone || null,
          taxCode: form.taxCode || null, enabledModules: form.enabledModules,
        }),
      })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? 'Lỗi') }
      await loadData()
      setShowModal(null)
      setForm({ name: '', slug: '', adminEmail: '', adminPassword: '', address: '', phone: '', taxCode: '', enabledModules: [...DEFAULT_MODULES] })
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Lỗi tạo công ty')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateOwner = async () => {
    if (!ownerForm.full_name || !ownerForm.email || !ownerForm.password) return
    setSaving(true)
    try {
      const headers = await apiHeaders()
      const res = await fetch('/api/users', {
        method: 'POST', headers,
        body: JSON.stringify({
          full_name: ownerForm.full_name,
          email: ownerForm.email,
          password: ownerForm.password,
          role: 'owner',
          status: 'active',
        }),
      })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? 'Lỗi') }
      await loadData()
      setShowModal(null)
      setOwnerForm({ full_name: '', email: '', password: '' })
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Lỗi tạo tài khoản owner')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* ── SECTION: Công ty khách hàng ── */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#1e2a3a]">Công ty khách hàng</h3>
          <p className="text-xs text-gray-400 mt-0.5">{companies.filter(c => !c.is_platform).length} công ty đang sử dụng Mia SCM</p>
        </div>
        <button onClick={() => setShowModal('company')}
          className="flex items-center gap-1.5 px-3 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={14} /> Tạo công ty mới
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Đang tải...</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-gray-50">
                {['Công ty', 'Slug', 'Module', 'Ngày tạo', 'Liên hệ'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {companies.filter(c => !c.is_platform).map(c => (
                <tr key={c.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ backgroundColor: c.primary_color }}>
                        {c.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#1e2a3a]">{c.name}</p>
                        {c.address && <p className="text-[10px] text-gray-400 truncate max-w-[180px]">{c.address}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">{c.slug}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700">
                      {c.enabled_modules?.length ?? 0} module
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">{new Date(c.created_at).toLocaleDateString('vi-VN')}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">{c.phone ?? '—'}</td>
                </tr>
              ))}
              {companies.filter(c => !c.is_platform).length === 0 && (
                <tr><td colSpan={5} className="text-center py-12 text-sm text-gray-400">Chưa có công ty khách hàng nào</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ── SECTION: Tài khoản Owner ── */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h3 className="text-sm font-bold text-[#1e2a3a]">Tài khoản Owner</h3>
          <p className="text-xs text-gray-400 mt-0.5">Những người có quyền quản lý toàn bộ khách hàng</p>
        </div>
        <button onClick={() => setShowModal('owner')}
          className="flex items-center gap-1.5 px-3 py-2 border border-[var(--mia-primary)] text-[var(--mia-primary)] text-sm font-semibold rounded-lg hover:bg-sky-50 hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={14} /> Thêm owner
        </button>
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-gray-50">
              {['Họ tên', 'Email', 'Ngày tạo', 'Trạng thái'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {owners.filter(o => o.role === 'owner').map(o => (
              <tr key={o.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                      {o.full_name.split(' ').pop()?.charAt(0) ?? '?'}
                    </div>
                    <span className="text-sm font-medium text-[#1e2a3a]">{o.full_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">{o.email}</td>
                <td className="px-4 py-3 text-xs text-gray-400">{new Date(o.created_at).toLocaleDateString('vi-VN')}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${o.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {o.status === 'active' ? 'Hoạt động' : 'Đã khóa'}
                  </span>
                </td>
              </tr>
            ))}
            {owners.filter(o => o.role === 'owner').length === 0 && !loading && (
              <tr><td colSpan={4} className="text-center py-8 text-sm text-gray-400">Chưa có tài khoản owner</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal: Tạo công ty */}
      {showModal === 'company' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
              <h2 className="text-base font-bold text-[#1e2a3a]">Tạo công ty mới</h2>
              <button onClick={() => setShowModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tên công ty <span className="text-red-400">*</span></label>
                  <input value={form.name} onChange={e => handleNameChange(e.target.value)} placeholder="Công ty TNHH ABC"
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Slug (URL) <span className="text-red-400">*</span></label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 shrink-0">mia-scm.vn/</span>
                    <input value={form.slug} onChange={e => setF('slug', e.target.value)} placeholder="cong-ty-abc"
                      className="flex-1 h-9 px-3 text-sm font-mono border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email admin <span className="text-red-400">*</span></label>
                  <input type="email" value={form.adminEmail} onChange={e => setF('adminEmail', e.target.value)} placeholder="admin@cty-abc.vn"
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Mật khẩu admin <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <input type={showPass ? 'text' : 'password'} value={form.adminPassword}
                      onChange={e => setF('adminPassword', e.target.value)} placeholder="Tối thiểu 6 ký tự"
                      className="w-full h-9 px-3 pr-9 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                    <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-2.5 top-2 text-gray-400">
                      {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Số điện thoại</label>
                  <input value={form.phone} onChange={e => setF('phone', e.target.value)} placeholder="028 xxxx xxxx"
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Mã số thuế</label>
                  <input value={form.taxCode} onChange={e => setF('taxCode', e.target.value)} placeholder="0301234567"
                    className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-2">Module kích hoạt</label>
                  <div className="grid grid-cols-3 gap-2">
                    {MODULE_OPTIONS.map(m => {
                      const on = form.enabledModules.includes(m.key)
                      return (
                        <button key={m.key} type="button" onClick={() => toggleModule(m.key)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all
                            ${on ? 'border-[var(--mia-primary)] bg-sky-50 text-sky-700' : 'border-[#e5e7eb] text-gray-500 hover:border-gray-300'}`}>
                          <div className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0
                            ${on ? 'border-sky-600 bg-sky-600' : 'border-gray-300'}`}>
                            {on && <svg width="7" height="7" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </div>
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-2 px-6 py-4 border-t border-[#e5e7eb]">
              <button onClick={() => setShowModal(null)} className="flex-1 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
              <button onClick={handleCreateCompany}
                disabled={!form.name || !form.slug || !form.adminEmail || !form.adminPassword || saving}
                className="flex-1 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
                {saving ? 'Đang tạo...' : 'Tạo công ty'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Thêm owner */}
      {showModal === 'owner' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
              <div>
                <h2 className="text-base font-bold text-[#1e2a3a]">Thêm tài khoản Owner</h2>
                <p className="text-xs text-gray-400 mt-0.5">Owner có quyền quản lý toàn bộ công ty khách hàng</p>
              </div>
              <button onClick={() => setShowModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Họ và tên <span className="text-red-400">*</span></label>
                <input value={ownerForm.full_name} onChange={e => setOwnerForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Nguyễn Văn A"
                  className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email <span className="text-red-400">*</span></label>
                <input type="email" value={ownerForm.email} onChange={e => setOwnerForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="owner@mia-scm.vn"
                  className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Mật khẩu <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input type={showOwnerPass ? 'text' : 'password'} value={ownerForm.password}
                    onChange={e => setOwnerForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Tối thiểu 6 ký tự"
                    className="w-full h-9 px-3 pr-9 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                  <button type="button" onClick={() => setShowOwnerPass(s => !s)} className="absolute right-2.5 top-2 text-gray-400">
                    {showOwnerPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex gap-2">
                <Crown size={13} className="text-yellow-500 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-700">Tài khoản này sẽ thuộc tenant platform và có thể xem / quản lý tất cả công ty khách hàng.</p>
              </div>
            </div>
            <div className="flex gap-2 px-6 py-4 border-t border-[#e5e7eb]">
              <button onClick={() => setShowModal(null)} className="flex-1 py-2 text-sm text-gray-600 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
              <button onClick={handleCreateOwner}
                disabled={!ownerForm.full_name || !ownerForm.email || !ownerForm.password || saving}
                className="flex-1 py-2 bg-yellow-500 text-white text-sm font-semibold rounded-lg hover:bg-yellow-600 disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
                {saving ? 'Đang tạo...' : 'Tạo tài khoản owner'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

export default function HeThongPage() {
  const { user } = useAuth()
  const isPlatformOwner = user?.role === 'owner'
  const allTabs = isPlatformOwner ? [...TABS, ...PLATFORM_TABS] : TABS

  const [tab, setTab] = useState('company')
  const [saved, setSaved] = useState(false)

  const [rolePerms, setRolePerms] = useState<Record<Role, Permission[]>>(() => ({
    owner:     [],
    admin:     [],
    sales:     [...DEFAULT_ROLE_PERMISSIONS.sales],
    warehouse: [...DEFAULT_ROLE_PERMISSIONS.warehouse],
    logistics: [...DEFAULT_ROLE_PERMISSIONS.logistics],
    driver:    [...DEFAULT_ROLE_PERMISSIONS.driver],
    ketoan:    [...DEFAULT_ROLE_PERMISSIONS.ketoan],
  }))

  const toggle = (role: Role, perms: Permission[]) => {
    setRolePerms(prev => {
      const current = [...prev[role]]
      const hasAll = perms.every(p => current.includes(p))
      if (hasAll) return { ...prev, [role]: current.filter(p => !perms.includes(p)) }
      return { ...prev, [role]: Array.from(new Set([...current, ...perms])) }
    })
    setSaved(false)
  }

  const handleReset = () => {
    setRolePerms({
      owner: [], admin: [], sales: [...DEFAULT_ROLE_PERMISSIONS.sales],
      warehouse: [...DEFAULT_ROLE_PERMISSIONS.warehouse],
      logistics: [...DEFAULT_ROLE_PERMISSIONS.logistics],
      driver: [...DEFAULT_ROLE_PERMISSIONS.driver],
      ketoan: [...DEFAULT_ROLE_PERMISSIONS.ketoan],
    })
    setSaved(false)
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5]">
      <div className="bg-white border-b border-[#e5e7eb] px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a]">Cài đặt hệ thống</h1>
          <p className="text-xs text-gray-500 mt-0.5">Quản lý người dùng, phân quyền và tích hợp</p>
        </div>
        {tab === 'perms' && (
          <div className="flex items-center gap-2">
            <button onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 bg-white border border-[#e5e7eb] rounded-lg hover:bg-gray-50 hover:scale-[1.02] active:scale-95 transition-all">
              <RotateCcw size={14} />Khôi phục mặc định
            </button>
            <button onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2500) }}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg hover:scale-[1.02] active:scale-95 transition-all
                ${saved ? 'bg-green-500 text-white' : 'bg-[var(--mia-primary)] text-white hover:opacity-90'}`}>
              <Save size={14} />{saved ? 'Đã lưu!' : 'Lưu thay đổi'}
            </button>
          </div>
        )}
      </div>

      <div className="px-6 py-5">
        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-[#e5e7eb] rounded-xl p-1 mb-5 w-fit flex-wrap">
          {allTabs.map(t => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${active ? 'bg-[var(--mia-primary)] text-white shadow-sm' : 'text-gray-500 hover:text-[#1e2a3a] hover:bg-gray-50'}`}>
                <Icon size={15} />{t.label}
              </button>
            )
          })}
        </div>

        {tab === 'company' && <CompanyTab />}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'users' && <UsersTab />}

        {tab === 'perms' && (
          <div className="space-y-5">
            <div className="grid grid-cols-5 gap-3">
              {ROLES.map(r => (
                <div key={r.id} className="bg-white border-2 border-[var(--mia-primary)] rounded-xl p-4 flex flex-col gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center">{r.icon}</div>
                  <div>
                    <p className="text-sm font-semibold text-[#1e2a3a]">{r.label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{r.sub}</p>
                  </div>
                  <p className="text-xs text-gray-500"><span className="font-bold text-[#1e2a3a] text-base">{r.count}</span> người dùng</p>
                </div>
              ))}
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3">
              <Info size={16} className="text-yellow-500 shrink-0 mt-0.5" />
              <div className="text-sm">
                <span className="font-semibold text-yellow-700">Ma trận phân quyền</span>
                <span className="text-yellow-600 ml-1">Tick vào ô để bật/tắt quyền cho từng vai trò. Quyền của <strong>Quản trị viên</strong> luôn bật. Nhấn "Lưu thay đổi" để áp dụng.</span>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#e5e7eb]">
                <h2 className="text-sm font-bold text-[#1e2a3a]">Ma trận quyền theo vai trò</h2>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#e5e7eb] bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase w-1/2">Quyền hạn</th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-yellow-600 uppercase"><span className="flex items-center justify-center gap-1"><Crown size={12} />Admin</span></th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-sky-600 uppercase"><span className="flex items-center justify-center gap-1"><ShoppingBag size={12} />Sales</span></th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-orange-600 uppercase"><span className="flex items-center justify-center gap-1"><Package size={12} />Kho</span></th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-purple-600 uppercase"><span className="flex items-center justify-center gap-1"><Truck size={12} />Logistics</span></th>
                    <th className="text-center px-3 py-3 text-xs font-semibold text-pink-600 uppercase"><span className="flex items-center justify-center gap-1"><Car size={12} />Tài xế</span></th>
                  </tr>
                </thead>
                <tbody>
                  {PERM_GROUPS.map(group => (
                    <React.Fragment key={group.section}>
                      <tr className="bg-gray-50/70">
                        <td colSpan={6} className="px-5 py-2.5">
                          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{group.emoji} {group.section}</span>
                        </td>
                      </tr>
                      {group.rows.map((row, ri) => (
                        <tr key={row.desc} className={`border-t border-[#f0f2f5] hover:bg-gray-50/50 transition-colors ${ri === group.rows.length - 1 ? 'border-b border-[#e5e7eb]' : ''}`}>
                          <td className="px-5 py-3">
                            <p className="text-sm font-medium text-[#1e2a3a]">{row.label}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{row.desc}</p>
                          </td>
                          <td className="text-center px-3 py-3">
                            <div className="flex justify-center">
                              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                              </div>
                            </div>
                          </td>
                          {NON_ADMIN_ROLES.map(role => (
                            <td key={role} className="text-center px-3 py-3">
                              <div className="flex justify-center">
                                <Toggle checked={rowEnabled(row.perms, rolePerms[role])} onChange={() => toggle(role, row.perms)} />
                              </div>
                            </td>
                          ))}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'notify' && <NotifyTab />}
        {tab === 'integr' && <IntegrationsTab />}
        {tab === 'email' && <EmailZaloTab />}
        {tab === 'companies' && isPlatformOwner && <CompaniesTab />}
      </div>
    </div>
  )
}
