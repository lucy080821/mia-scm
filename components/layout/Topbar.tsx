'use client'
import { Bell, Search, Menu, ChevronDown, LogOut, UserCircle, UserCog, KeyRound } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_LABEL } from '@/lib/auth-client'
import ProfileModal from './ProfileModal'
import NotificationPanel, { useBellState } from './NotificationPanel'

interface TopbarProps {
  onMenuClick?: () => void
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const [searchVal, setSearchVal] = useState('')
  const [dropOpen, setDropOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [profileTab, setProfileTab] = useState<'info' | 'password'>('info')
  const { user, signOut } = useAuth()
  const dropRef = useRef<HTMLDivElement>(null)
  const notifRef = useRef<HTMLDivElement>(null)
  const unreadCount = useBellState()

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const openProfile = (tab: 'info' | 'password') => {
    setDropOpen(false)
    setProfileTab(tab)
    setProfileOpen(true)
  }

  return (
    <>
      <header className="h-[52px] bg-white border-b border-[#e5e7eb] flex items-center px-4 gap-4 sticky top-0 z-20">
        {/* Mobile menu toggle */}
        <button
          onClick={onMenuClick}
          className="lg:hidden w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Menu size={18} />
        </button>

        {/* Search */}
        <div className="flex-1 max-w-sm hidden md:flex items-center gap-2 bg-gray-50 border border-[#e5e7eb] rounded-lg px-3 h-8">
          <Search size={13} className="text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Tìm kiếm..."
            value={searchVal}
            onChange={e => setSearchVal(e.target.value)}
            className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400"
          />
        </div>

        <div className="flex-1" />

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setNotifOpen(v => !v); setDropOpen(false) }}
            className={`relative w-8 h-8 flex items-center justify-center rounded-lg transition-colors
              ${notifOpen ? 'bg-gray-100 text-[#1e2a3a]' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-[14px] bg-red-500 rounded-full flex items-center justify-center">
                <span className="text-[9px] font-bold text-white leading-none px-0.5">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              </span>
            )}
          </button>
          {notifOpen && <NotificationPanel onClose={() => setNotifOpen(false)} />}
        </div>

        {/* User dropdown */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setDropOpen(v => !v)}
            className="flex items-center gap-2 hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[var(--mia-primary)] flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden">
              {user?.avatarUrl
                ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                : (user?.initials ?? <UserCircle size={14} />)}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-medium text-[#1e2a3a] leading-none truncate max-w-[100px]">
                {user?.name ?? '...'}
              </p>
              <p className="text-[10px] text-gray-400 leading-tight">
                {user ? ROLE_LABEL[user.role] ?? user.role : ''}
              </p>
            </div>
            <ChevronDown size={13} className={`text-gray-400 transition-transform ${dropOpen ? 'rotate-180' : ''}`} />
          </button>

          {dropOpen && (
            <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-[#e5e7eb] rounded-xl shadow-lg py-1 z-50">
              {/* User info header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e5e7eb]">
                <div className="w-9 h-9 rounded-full bg-[var(--mia-primary)] flex items-center justify-center text-white text-sm font-bold shrink-0 overflow-hidden">
                  {user?.avatarUrl
                    ? <img src={user.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                    : (user?.initials ?? '?')}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#1e2a3a] truncate">{user?.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{user?.email}</p>
                  <span className="inline-block text-[10px] text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded-full mt-0.5">
                    {user ? ROLE_LABEL[user.role] ?? user.role : ''}
                  </span>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <button
                  onClick={() => openProfile('info')}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <UserCog size={14} className="text-gray-400" />
                  Thông tin cá nhân
                </button>
                <button
                  onClick={() => openProfile('password')}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <KeyRound size={14} className="text-gray-400" />
                  Đổi mật khẩu
                </button>
              </div>

              <div className="border-t border-[#e5e7eb] py-1">
                <button
                  onClick={() => { setDropOpen(false); signOut() }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={14} />
                  Đăng xuất
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {profileOpen && user && (
        <ProfileModal
          user={user}
          initialTab={profileTab}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </>
  )
}
