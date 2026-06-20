'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Bell, X, ShoppingCart, Package, Truck, ClipboardList,
  CheckCircle2, Clock, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'

export type NotifType = 'order' | 'inventory' | 'delivery' | 'purchase' | 'system'

export interface Notification {
  id: string
  type: NotifType
  title: string
  message: string
  time: string
  read: boolean
  href?: string
}

// Lưu trạng thái đã đọc / đã xóa theo ID
const STATE_KEY = 'mia_notifs_state_v1'

interface NotifState { read: string[]; dismissed: string[] }

function loadState(): NotifState {
  if (typeof window === 'undefined') return { read: [], dismissed: [] }
  try {
    const raw = localStorage.getItem(STATE_KEY)
    return raw ? JSON.parse(raw) : { read: [], dismissed: [] }
  } catch { return { read: [], dismissed: [] } }
}

function saveState(s: NotifState) {
  localStorage.setItem(STATE_KEY, JSON.stringify(s))
  window.dispatchEvent(new Event('mia:notif-updated'))
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return 'Vừa xong'
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`
  return `${Math.floor(diff / 86400)} ngày trước`
}

const TYPE_META: Record<NotifType, { icon: React.ElementType; bg: string; color: string }> = {
  order:     { icon: ShoppingCart, bg: 'bg-blue-50',   color: 'text-blue-600' },
  inventory: { icon: Package,      bg: 'bg-orange-50', color: 'text-orange-500' },
  delivery:  { icon: Truck,        bg: 'bg-purple-50', color: 'text-purple-600' },
  purchase:  { icon: ClipboardList,bg: 'bg-teal-50',   color: 'text-teal-600' },
  system:    { icon: Bell,         bg: 'bg-gray-50',   color: 'text-gray-500' },
}

interface Props { onClose: () => void }

export default function NotificationPanel({ onClose }: Props) {
  const [notifs, setNotifs]   = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<'all' | 'unread'>('all')
  const panelRef              = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const raw: Omit<Notification, 'read'>[] = await res.json()
      const state = loadState()
      const readSet      = new Set(state.read)
      const dismissedSet = new Set(state.dismissed)

      setNotifs(
        raw
          .filter(n => !dismissedSet.has(n.id))
          .map(n => ({ ...n, read: readSet.has(n.id) }))
      )
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose, refresh])

  const markRead = (id: string) => {
    const state = loadState()
    if (!state.read.includes(id)) {
      saveState({ ...state, read: [...state.read, id] })
    }
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  const markAllRead = () => {
    const state = loadState()
    const allIds = notifs.map(n => n.id)
    const merged = Array.from(new Set([...state.read, ...allIds]))
    saveState({ ...state, read: merged })
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  const remove = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const state = loadState()
    saveState({ ...state, dismissed: [...state.dismissed, id] })
    setNotifs(prev => prev.filter(n => n.id !== id))
  }

  const displayed   = filter === 'unread' ? notifs.filter(n => !n.read) : notifs
  const unreadCount = notifs.filter(n => !n.read).length

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-full mt-1 w-[380px] bg-white border border-[#e5e7eb] rounded-xl shadow-xl z-50 flex flex-col overflow-hidden"
      style={{ maxHeight: '520px' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e5e7eb] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-[#1e2a3a]">Thông báo</span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-semibold bg-[var(--mia-primary)] text-white px-1.5 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="text-[11px] text-[var(--mia-primary)] font-medium hover:opacity-70 transition-opacity"
          >
            Đọc tất cả
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-[#e5e7eb] shrink-0">
        {(['all', 'unread'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 -mb-px
              ${filter === f
                ? 'border-[var(--mia-primary)] text-[var(--mia-primary)]'
                : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {f === 'all' ? 'Tất cả' : `Chưa đọc${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-[var(--mia-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle2 size={32} className="text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">Không có thông báo nào</p>
          </div>
        ) : (
          displayed.map(notif => {
            const meta = TYPE_META[notif.type]
            const Icon = meta.icon
            const inner = (
              <div
                className={`relative flex items-start gap-3 px-4 py-3 border-b border-[#f3f4f6] hover:bg-gray-50 transition-colors group
                  ${!notif.read ? 'bg-sky-50/40' : ''}`}
                onClick={() => markRead(notif.id)}
              >
                {!notif.read && (
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--mia-primary)]" />
                )}
                <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon size={15} className={meta.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-xs leading-snug ${!notif.read ? 'font-semibold text-[#1e2a3a]' : 'font-medium text-gray-700'}`}>
                    {notif.title}
                  </p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-snug line-clamp-2">{notif.message}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Clock size={10} className="text-gray-400" />
                    <span className="text-[10px] text-gray-400">{relativeTime(notif.time)}</span>
                  </div>
                </div>
                <button
                  onClick={e => remove(notif.id, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 shrink-0 mt-0.5"
                >
                  <X size={11} />
                </button>
              </div>
            )

            return notif.href ? (
              <Link key={notif.id} href={notif.href} onClick={onClose}>{inner}</Link>
            ) : (
              <div key={notif.id}>{inner}</div>
            )
          })
        )}
      </div>

      {/* Footer */}
      {displayed.length > 0 && (
        <div className="border-t border-[#e5e7eb] shrink-0">
          <Link
            href="/ban-hang/don-hang-ban"
            onClick={onClose}
            className="flex items-center justify-center gap-1 py-3 text-xs text-[var(--mia-primary)] font-medium hover:opacity-70 transition-opacity"
          >
            Xem tất cả hoạt động <ChevronRight size={13} />
          </Link>
        </div>
      )}
    </div>
  )
}

export function useBellState() {
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const raw: { id: string }[] = await res.json()
      const state      = loadState()
      const readSet    = new Set(state.read)
      const dimSet     = new Set(state.dismissed)
      setCount(raw.filter(n => !readSet.has(n.id) && !dimSet.has(n.id)).length)
    } catch {}
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('mia:notif-updated', refresh)
    // Refresh mỗi 60 giây để cập nhật thông báo mới
    const timer = setInterval(refresh, 60_000)
    return () => {
      window.removeEventListener('mia:notif-updated', refresh)
      clearInterval(timer)
    }
  }, [refresh])

  return count
}
