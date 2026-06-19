'use client'
import { useEffect, useState } from 'react'
import { Bell, Send, AlertTriangle, Trash2, Building2, Globe } from 'lucide-react'

interface SentNotification {
  id: string
  title: string
  message: string
  target: string
  targetLabel: string
  sentAt: string
}

interface Tenant {
  id: string
  name: string
  is_platform: boolean
}

const STORAGE_KEY = 'mia_owner_notifications'

async function getToken() {
  const { supabase } = await import('@/lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

function relativeTimeVi(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return 'Vừa xong'
  if (mins < 60) return `${mins} phút trước`
  if (hours < 24) return `${hours} giờ trước`
  return `${days} ngày trước`
}

export default function NotificationsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loadingTenants, setLoadingTenants] = useState(true)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [target, setTarget] = useState('all')
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState('')
  const [sent, setSent] = useState<SentNotification[]>([])

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSent(JSON.parse(raw))
    } catch { /* ignore */ }
  }, [])

  // Load tenants
  useEffect(() => {
    ;(async () => {
      try {
        const token = await getToken()
        const res = await fetch('/api/tenants', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) {
          const data: Tenant[] = await res.json()
          setTenants(data.filter(t => !t.is_platform))
        }
      } finally {
        setLoadingTenants(false)
      }
    })()
  }, [])

  const handleSend = () => {
    if (!title.trim()) { setFormError('Vui lòng nhập tiêu đề'); return }
    if (!message.trim()) { setFormError('Vui lòng nhập nội dung'); return }
    setFormError('')
    setSending(true)

    const targetLabel = target === 'all'
      ? 'Tất cả công ty'
      : (tenants.find(t => t.id === target)?.name ?? target)

    const notification: SentNotification = {
      id: Date.now().toString(),
      title: title.trim(),
      message: message.trim(),
      target,
      targetLabel,
      sentAt: new Date().toISOString(),
    }

    const updated = [notification, ...sent]
    setSent(updated)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) } catch { /* ignore */ }

    setTitle('')
    setMessage('')
    setTarget('all')
    setSending(false)
  }

  const handleDelete = (id: string) => {
    const updated = sent.filter(n => n.id !== id)
    setSent(updated)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)) } catch { /* ignore */ }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0f172a]">Thông báo hệ thống</h1>
        <p className="text-sm text-gray-400 mt-0.5">Gửi thông báo tới các công ty đang sử dụng Mia SCM</p>
      </div>

      {/* Notice banner */}
      <div className="flex items-start gap-3 px-4 py-3.5 bg-yellow-50 border border-yellow-200 rounded-xl">
        <AlertTriangle size={15} className="text-yellow-600 shrink-0 mt-0.5" />
        <p className="text-sm text-yellow-800">
          <span className="font-bold">Tính năng thông báo thực đang được phát triển.</span>
          {' '}Hiện tại chỉ lưu cục bộ, chưa gửi tới công ty.
        </p>
      </div>

      {/* Compose form */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Bell size={15} className="text-amber-500" />
          <h2 className="text-sm font-bold text-[#0f172a]">Soạn thông báo</h2>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Tiêu đề <span className="text-red-400">*</span></label>
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); setFormError('') }}
            placeholder="Ví dụ: Bảo trì hệ thống lúc 23:00..."
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Nội dung <span className="text-red-400">*</span></label>
          <textarea
            value={message}
            onChange={e => { setMessage(e.target.value); setFormError('') }}
            rows={4}
            placeholder="Nhập nội dung thông báo chi tiết..."
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 transition-colors resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Gửi tới</label>
          <select
            value={target}
            onChange={e => setTarget(e.target.value)}
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 transition-colors bg-white"
          >
            <option value="all">Tất cả công ty</option>
            {loadingTenants ? (
              <option disabled>Đang tải...</option>
            ) : (
              tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))
            )}
          </select>
        </div>

        {formError && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</p>
        )}

        <button
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-2 px-5 py-2.5 bg-amber-400 text-[#0f172a] text-sm font-bold rounded-xl hover:bg-amber-300 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-95"
        >
          <Send size={14} />
          {sending ? 'Đang gửi...' : 'Gửi thông báo'}
        </button>
      </div>

      {/* Sent history */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Bell size={15} className="text-amber-500" />
            <h2 className="text-sm font-bold text-[#0f172a]">Lịch sử đã gửi</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full ml-1">{sent.length}</span>
          </div>
          {sent.length > 0 && (
            <button
              onClick={() => { setSent([]); localStorage.removeItem(STORAGE_KEY) }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
            >
              Xóa tất cả
            </button>
          )}
        </div>

        {sent.length === 0 ? (
          <div className="py-16 text-center">
            <Bell size={32} className="text-amber-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Chưa có thông báo nào được gửi</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {sent.map(n => (
              <div key={n.id} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50/60 transition-colors group">
                <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <Bell size={14} className="text-amber-600" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-[#0f172a]">{n.title}</p>
                    <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                      n.target === 'all'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-sky-100 text-sky-700'
                    }`}>
                      {n.target === 'all'
                        ? <><Globe size={9} /> Tất cả</>
                        : <><Building2 size={9} /> {n.targetLabel}</>
                      }
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{n.message}</p>
                  <p className="text-[10px] text-gray-400 mt-1.5">{relativeTimeVi(n.sentAt)}</p>
                </div>

                <button
                  onClick={() => handleDelete(n.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
