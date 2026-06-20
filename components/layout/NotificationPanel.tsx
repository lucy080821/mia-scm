'use client'
import { useEffect, useRef, useState } from 'react'
import {
  Bell, X, ShoppingCart, Package, Truck, ClipboardList,
  AlertTriangle, CheckCircle2, Clock, ChevronRight,
} from 'lucide-react'
import Link from 'next/link'
import { generateInventoryNotifs, generateDebtNotifs } from '@/lib/stock-alerts'

export type NotifType = 'order' | 'inventory' | 'delivery' | 'purchase' | 'system'

export interface Notification {
  id: string
  type: NotifType
  title: string
  message: string
  time: string   // ISO
  read: boolean
  href?: string
}

// Bump version to clear stale localStorage when notification schema changes
const STORAGE_KEY = 'mia_notifs_v2'

const STATIC_NOTIFS: Notification[] = [
  {
    id: 'ord-1', type: 'order', read: false,
    title: 'Đơn hàng mới cần xác nhận',
    message: 'SO-240524-018 từ Cty TNHH Minh Phát — 45,200,000 đ',
    time: new Date(Date.now() - 8 * 60_000).toISOString(),
    href: '/ban-hang/don-hang-ban',
  },
  {
    id: 'del-1', type: 'delivery', read: false,
    title: 'Đơn vận chuyển bị trễ',
    message: 'DV-240522-004 — Tài xế Nguyễn Văn Hùng báo trễ 2 giờ',
    time: new Date(Date.now() - 47 * 60_000).toISOString(),
    href: '/logistics/don-van-chuyen',
  },
  {
    id: 'pur-1', type: 'purchase', read: false,
    title: 'Đơn mua hàng chờ duyệt',
    message: 'PO-240524-007 — Công ty CP Dầu nhớt Việt — 128,000,000 đ',
    time: new Date(Date.now() - 2 * 3_600_000).toISOString(),
    href: '/mua-hang/don-mua-hang',
  },
  {
    id: 'ord-2', type: 'order', read: true,
    title: 'Đơn hàng hoàn thành',
    message: 'SO-240521-011 — Cty CP XYZ — đã giao thành công',
    time: new Date(Date.now() - 5 * 3_600_000).toISOString(),
    href: '/ban-hang/don-hang-ban',
  },
  {
    id: 'del-2', type: 'delivery', read: true,
    title: 'Giao hàng thành công',
    message: 'DV-240521-008 — 15 điểm giao — hoàn thành lúc 16:30',
    time: new Date(Date.now() - 8 * 3_600_000).toISOString(),
    href: '/logistics/don-van-chuyen',
  },
]

function buildFresh(): Notification[] {
  return [
    ...(generateInventoryNotifs() as Notification[]),
    ...(generateDebtNotifs() as Notification[]),
    ...STATIC_NOTIFS,
  ]
}

function loadNotifs(): Notification[] {
  if (typeof window === 'undefined') return buildFresh()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : buildFresh()
  } catch { return buildFresh() }
}

function saveNotifs(notifs: Notification[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifs))
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

interface Props {
  onClose: () => void
}

export default function NotificationPanel({ onClose }: Props) {
  const [notifs, setNotifs] = useState<Notification[]>([])
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setNotifs(loadNotifs())
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  const markRead = (id: string) => {
    const next = notifs.map(n => n.id === id ? { ...n, read: true } : n)
    setNotifs(next)
    saveNotifs(next)
  }

  const markAllRead = () => {
    const next = notifs.map(n => ({ ...n, read: true }))
    setNotifs(next)
    saveNotifs(next)
  }

  const remove = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const next = notifs.filter(n => n.id !== id)
    setNotifs(next)
    saveNotifs(next)
  }

  const displayed = filter === 'unread' ? notifs.filter(n => !n.read) : notifs
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
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-[11px] text-[var(--mia-primary)] hover:text-[#0284c7] font-medium transition-colors"
            >
              Đọc tất cả
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-[#e5e7eb] shrink-0">
        {(['all', 'unread'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 -mb-px
              ${filter === f ? 'border-[var(--mia-primary)] text-[var(--mia-primary)]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {f === 'all' ? 'Tất cả' : `Chưa đọc${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="overflow-y-auto flex-1">
        {displayed.length === 0 ? (
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
                {/* Unread dot */}
                {!notif.read && (
                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--mia-primary)]" />
                )}

                {/* Icon */}
                <div className={`w-8 h-8 rounded-lg ${meta.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon size={15} className={meta.color} />
                </div>

                {/* Content */}
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

                {/* Remove button */}
                <button
                  onClick={e => remove(notif.id, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-400 shrink-0 mt-0.5"
                >
                  <X size={11} />
                </button>
              </div>
            )

            return notif.href ? (
              <Link key={notif.id} href={notif.href} onClick={onClose}>
                {inner}
              </Link>
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
            className="flex items-center justify-center gap-1 py-3 text-xs text-[var(--mia-primary)] hover:text-[#0284c7] font-medium transition-colors"
          >
            Xem tất cả hoạt động
            <ChevronRight size={13} />
          </Link>
        </div>
      )}
    </div>
  )
}

export function useBellState() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    const refresh = () => {
      const notifs = loadNotifs()
      setCount(notifs.filter(n => !n.read).length)
    }
    refresh()
    window.addEventListener('mia:notif-updated', refresh)
    return () => window.removeEventListener('mia:notif-updated', refresh)
  }, [])
  return count
}
