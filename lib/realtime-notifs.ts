import type { Notification } from '@/components/layout/NotificationPanel'

const STORAGE_KEY = 'mia_notifs_v2'

export function pushNotification(notif: Omit<Notification, 'id' | 'time' | 'read'>) {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const existing: Notification[] = raw ? JSON.parse(raw) : []
    const newNotif: Notification = {
      ...notif,
      id: `rt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      time: new Date().toISOString(),
      read: false,
    }
    const next = [newNotif, ...existing].slice(0, 50)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new Event('mia:notif-updated'))
  } catch {}
}
