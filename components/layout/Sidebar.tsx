'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, ShoppingCart, FileText, Receipt, RotateCcw,
  Warehouse, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
  ClipboardCheck, Package, BarChart3, Truck, CalendarDays, Car,
  UserCheck, PieChart, Settings, Wrench,
  X, ChevronDown, ChevronRight, LogOut,
  DollarSign, TrendingUp, TrendingDown, BarChart2, CreditCard, UserCog,
  FileSpreadsheet, Briefcase, Building2, ClipboardList,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { canAccess } from '@/lib/auth-client'
import { useAuth } from '@/hooks/useAuth'
import { useTenant } from '@/contexts/TenantContext'
import { useBadgeCounts } from '@/hooks/useBadgeCounts'
import { DEFAULT_TENANT } from '@/lib/tenant'

const navConfig = [
  {
    section: null,
    items: [
      { label: 'Tổng quan', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    section: 'BÁN HÀNG',
    items: [
      { label: 'Khách hàng',   href: '/ban-hang/khach-hang',   icon: Users },
      { label: 'Đơn hàng bán', href: '/ban-hang/don-hang-ban', icon: ShoppingCart },
      { label: 'Báo giá',      href: '/ban-hang/bao-gia',      icon: FileText },
      { label: 'Xuất hóa đơn', href: '/ban-hang/hoa-don',      icon: Receipt },
      { label: 'Trả hàng bán', href: '/ban-hang/tra-hang',     icon: RotateCcw },
    ],
  },
  {
    section: 'KHO HÀNG',
    items: [
      { label: 'Tổng quan kho', href: '/kho-hang/tong-quan-kho', icon: Warehouse },
      { label: 'Nhập kho',      href: '/kho-hang/nhap-kho',      icon: ArrowDownToLine },
      { label: 'Xuất kho',      href: '/kho-hang/xuat-kho',      icon: ArrowUpFromLine },
      { label: 'Chuyển kho',    href: '/kho-hang/chuyen-kho',    icon: ArrowLeftRight },
      { label: 'Kiểm kê',       href: '/kho-hang/kiem-ke',       icon: ClipboardCheck },
      { label: 'Sản phẩm',      href: '/kho-hang/san-pham',      icon: Package },
    ],
  },
  {
    section: 'MUA HÀNG',
    items: [
      { label: 'Đơn mua hàng',  href: '/mua-hang/don-mua-hang', icon: ClipboardList },
      { label: 'Nhà cung cấp',  href: '/mua-hang/nha-cung-cap', icon: Building2 },
    ],
  },
  {
    section: 'LOGISTICS',
    items: [
      { label: 'Tổng quan',           href: '/logistics/tong-quan',          icon: BarChart3 },
      { label: 'Đơn vận chuyển',      href: '/logistics/don-van-chuyen',     icon: Truck },
      { label: 'Kế hoạch giao hàng',  href: '/logistics/ke-hoach-giao-hang', icon: CalendarDays },
      { label: 'Phương tiện',         href: '/logistics/phuong-tien',        icon: Car },
      { label: 'Tài xế',              href: '/logistics/tai-xe',             icon: UserCheck },
    ],
  },
  {
    section: 'TÀI CHÍNH',
    items: [
      { label: 'Tổng quan TC',      href: '/tai-chinh/tong-quan',         icon: DollarSign },
      { label: 'Doanh thu',         href: '/tai-chinh/doanh-thu',         icon: TrendingUp },
      { label: 'Chi phí',           href: '/tai-chinh/chi-phi',           icon: TrendingDown },
      { label: 'Lợi nhuận',         href: '/tai-chinh/loi-nhuan',         icon: BarChart2 },
      { label: 'Công nợ',           href: '/tai-chinh/cong-no',           icon: CreditCard },
      { label: 'Chi phí phát sinh', href: '/tai-chinh/chi-phi-phat-sinh', icon: Receipt },
    ],
  },
  {
    section: 'BÁO CÁO & CÀI ĐẶT',
    items: [
      { label: 'Báo cáo',       href: '/bao-cao',                  icon: PieChart },
      { label: 'Xuất dữ liệu', href: '/cai-dat/xuat-du-lieu',    icon: FileSpreadsheet },
      { label: 'Nhân viên',    href: '/cai-dat/nhan-vien',        icon: UserCog },
      { label: 'Nhập liệu',   href: '/cai-dat/nhap-lieu',        icon: ArrowDownToLine },
      { label: 'Danh mục',    href: '/cai-dat/danh-muc',         icon: Settings },
      { label: 'Nghiệp vụ',  href: '/cai-dat/nghiep-vu',        icon: Briefcase },
      { label: 'Hệ thống',   href: '/cai-dat/he-thong',         icon: Wrench },
    ],
  },
]

interface SidebarProps {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

// Map section labels → module keys used in tenant.enabledModules
const SECTION_MODULE: Record<string, string> = {
  'BÁN HÀNG': 'ban-hang',
  'KHO HÀNG': 'kho-hang',
  'MUA HÀNG': 'mua-hang',
  'LOGISTICS': 'logistics',
  'TÀI CHÍNH': 'tai-chinh',
  'BÁO CÁO & CÀI ĐẶT': 'bao-cao',
}

export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [mounted, setMounted] = useState(false)
  const { user, signOut } = useAuth()
  const tenant = useTenant()
  const badgeCounts = useBadgeCounts()

  // mounted guard: server render + first client render must use identical state
  // to avoid hydration mismatch. Only after mount do we use real user/tenant.
  useEffect(() => { setMounted(true) }, [])

  const toggleSection = (section: string) => {
    setCollapsed(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'))

  const handleSignOut = () => {
    signOut()
  }

  // Before mount: match server render exactly (DEFAULT_TENANT + null user = all sections)
  const effectiveUser   = mounted ? user   : null
  const effectiveTenant = mounted ? tenant : DEFAULT_TENANT

  // Filter nav items by role + enabled tenant modules
  const filteredNav = navConfig.map(group => ({
    ...group,
    items: group.items.filter(item =>
      (!effectiveUser || canAccess(effectiveUser.role, item.href))
    ),
  })).filter(group => {
    if (group.items.length === 0) return false
    if (!group.section) return true
    const mod = SECTION_MODULE[group.section]
    if (!mod) return true
    return effectiveTenant.enabledModules.includes(mod)
  })

  const sidebarBg   = effectiveTenant.themeConfig?.sidebarBg   ?? '#1e2a3a'
  const sidebarText = effectiveTenant.themeConfig?.sidebarText ?? '#ffffff'

  // hex + opacity → rgba string
  const c = (hex: string, a: number) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r},${g},${b},${a})`
  }

  const navContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4"
        style={{ borderBottom: `1px solid ${c(sidebarText, 0.1)}` }}>
        {effectiveTenant.logoUrl
          ? <img src={effectiveTenant.logoUrl} alt={effectiveTenant.name} className="w-8 h-8 rounded-lg shrink-0 object-cover" />
          : (
            <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-bold text-sm"
              style={{ backgroundColor: effectiveTenant.primaryColor, color: '#ffffff' }}>
              {effectiveTenant.name.charAt(0)}
            </div>
          )
        }
        <div className="min-w-0">
          <p className="font-bold text-sm leading-none truncate" style={{ color: sidebarText }}>{effectiveTenant.name}</p>
          <p className="text-[10px] leading-tight mt-0.5" style={{ color: c(sidebarText, 0.5) }}>Supply Chain</p>
        </div>
        {mobileOpen && (
          <button onClick={onMobileClose} className="ml-auto lg:hidden transition-opacity hover:opacity-100"
            style={{ color: c(sidebarText, 0.6) }}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5" suppressHydrationWarning>
        {filteredNav.map((group, gi) => (
          <div key={gi}>
            {group.section && (
              <button
                className="w-full flex items-center justify-between px-2 py-2 mt-2 text-[10px] font-semibold uppercase tracking-widest transition-colors"
                style={{ color: c(sidebarText, 0.45) }}
                onClick={() => toggleSection(group.section!)}
              >
                {group.section}
                {collapsed[group.section!] ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              </button>
            )}
            {!collapsed[group.section ?? ''] && group.items.map(item => {
              const active = isActive(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onMobileClose}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150
                    ${active ? 'font-medium' : 'hover:bg-white/10'}`}
                  style={active
                    ? { backgroundColor: effectiveTenant.primaryColor, color: '#ffffff' }
                    : { color: c(sidebarText, 0.75) }}
                >
                  <Icon size={15} style={{ color: active ? '#ffffff' : c(sidebarText, 0.65) }} />
                  <span className="truncate flex-1">{item.label}</span>
                  {!!badgeCounts[item.href] && (
                    <span className="shrink-0 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center leading-none">
                      {badgeCounts[item.href] > 99 ? '99+' : badgeCounts[item.href]}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Sign out */}
      <div className="p-3 space-y-1" style={{ borderTop: `1px solid ${c(sidebarText, 0.1)}` }}>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-white/10 transition-all cursor-pointer"
          style={{ color: c(sidebarText, 0.55) }}
        >
          <LogOut size={14} />
          <span>Đăng xuất</span>
        </button>
        <p className="text-[10px] text-center" style={{ color: c(sidebarText, 0.25) }}>Mia SCM v1.0 © 2025</p>
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden lg:flex flex-col w-[200px] shrink-0 fixed top-0 left-0 h-screen z-30"
        style={{ backgroundColor: sidebarBg, '--sb-text': sidebarText } as React.CSSProperties}>
        {navContent}
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/50" onClick={onMobileClose} />
          <aside className="relative w-[220px] h-full z-50 flex flex-col"
            style={{ backgroundColor: sidebarBg, '--sb-text': sidebarText } as React.CSSProperties}>
            {navContent}
          </aside>
        </div>
      )}
    </>
  )
}
