'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard, Building2, Users, Settings,
  Crown, LogOut, ChevronRight, Bell,
  Activity, CreditCard, ClipboardList,
} from 'lucide-react'
import Link from 'next/link'

const NAV = [
  { href: '/owner/dashboard',     label: 'Tong quan',       icon: LayoutDashboard },
  { href: '/owner/companies',     label: 'Cong ty',          icon: Building2 },
  { href: '/owner/health',        label: 'Health',           icon: Activity },
  { href: '/owner/billing',       label: 'Billing & Plan',   icon: CreditCard },
  { href: '/owner/activity',      label: 'Activity Log',     icon: ClipboardList },
  { href: '/owner/notifications', label: 'Thong bao',        icon: Bell },
  { href: '/owner/accounts',      label: 'Tai khoan owner',  icon: Users },
  { href: '/owner/settings',      label: 'Cai dat',          icon: Settings },
]

const NAV_LABELS: Record<string, string> = {
  '/owner/dashboard':     'Tổng quan',
  '/owner/companies':     'Công ty',
  '/owner/health':        'Health',
  '/owner/billing':       'Billing & Plan',
  '/owner/activity':      'Activity Log',
  '/owner/notifications': 'Thông báo',
  '/owner/accounts':      'Tài khoản owner',
  '/owner/settings':      'Cài đặt',
}

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!user) return
    if (user.role !== 'owner') {
      router.replace('/dashboard')
      return
    }
    setReady(true)
  }, [user, router])

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-amber-400/60 text-sm">Đang tải...</p>
        </div>
      </div>
    )
  }

  const initials = user?.name.split(' ').pop()?.charAt(0).toUpperCase() ?? '?'

  const currentNav = NAV.find(n => pathname === n.href || pathname.startsWith(n.href + '/'))

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[220px] shrink-0 bg-[#0f172a] flex flex-col h-full border-r border-white/5">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-400 rounded-xl flex items-center justify-center shrink-0">
              <Crown size={18} className="text-[#0f172a]" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">Mia Platform</p>
              <p className="text-amber-400/60 text-[10px] mt-0.5">Owner Portal</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map(({ href, label: _label, icon: Icon }) => {
            const label = NAV_LABELS[href] ?? _label
            const active = pathname === href || pathname.startsWith(href + '/')
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group
                  ${active
                    ? 'bg-amber-400 text-[#0f172a]'
                    : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}>
                <Icon size={16} className={active ? 'text-[#0f172a]' : 'text-white/40 group-hover:text-white'} />
                {label}
                {active && <ChevronRight size={13} className="ml-auto text-[#0f172a]/50" />}
              </Link>
            )
          })}
        </nav>

        {/* User + signout */}
        <div className="px-3 pb-4 pt-2 border-t border-white/5 space-y-1">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
            <div className="w-7 h-7 bg-amber-400 rounded-full flex items-center justify-center text-[#0f172a] text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold truncate">{user?.name}</p>
              <p className="text-amber-400/60 text-[10px] truncate">{user?.email}</p>
            </div>
          </div>
          <button onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all">
            <LogOut size={15} />
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-2">
            {currentNav && (() => {
              const Icon = currentNav.icon
              const label = NAV_LABELS[currentNav.href] ?? currentNav.label
              return (
                <div className="flex items-center gap-2 text-[#0f172a]">
                  <Icon size={16} className="text-amber-500" />
                  <span className="text-sm font-semibold">{label}</span>
                </div>
              )
            })()}
          </div>
          <div className="flex items-center gap-3">
            <button className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors relative">
              <Bell size={16} />
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
              <div className="w-7 h-7 bg-amber-400 rounded-full flex items-center justify-center text-[#0f172a] text-xs font-bold">
                {initials}
              </div>
              <span className="text-xs font-semibold text-[#0f172a]">{user?.name}</span>
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">Owner</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-[#f8fafc]">
          {children}
        </main>
      </div>
    </div>
  )
}
