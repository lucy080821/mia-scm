'use client'
import { useState, useRef, useEffect } from 'react'
import { X, Camera, Lock, User, Eye, EyeOff, Check, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface ProfileModalProps {
  user: { id: string; name: string; email: string; role: string; initials: string; avatarUrl?: string } | null
  onClose: () => void
  initialTab?: 'info' | 'password'
}

export default function ProfileModal({ user, onClose, initialTab = 'info' }: ProfileModalProps) {
  const avatarKey = user?.id ? `mia_avatar_${user.id}` : null
  const [tab, setTab] = useState<'info' | 'password'>(initialTab)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    typeof window !== 'undefined' && avatarKey ? localStorage.getItem(avatarKey) : null
  )
  const [fullName, setFullName] = useState(user?.name ?? '')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [infoError, setInfoError] = useState('')

  const [oldPass, setOldPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showOld, setShowOld] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [passError, setPassError] = useState('')

  const fileRef = useRef<HTMLInputElement>(null)

  // Load profile từ API (supabaseAdmin, bypass RLS)
  useEffect(() => {
    if (!user?.email) return
    fetch(`/api/me?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(data => {
        if (data?.full_name) setFullName(data.full_name)
        if (data?.phone) setPhone(data.phone ?? '')
      })
  }, [user?.email])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      setAvatarPreview(dataUrl)
      if (avatarKey) localStorage.setItem(avatarKey, dataUrl)
      window.dispatchEvent(new Event('mia:avatar-updated'))
    }
    reader.readAsDataURL(file)
  }

  const handleSaveInfo = async () => {
    setInfoError('')
    if (!fullName.trim()) {
      setInfoError('Vui lòng nhập họ và tên.')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user?.email, full_name: fullName.trim(), phone: phone.trim() || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Lưu thất bại')

      window.dispatchEvent(new CustomEvent('mia:profile-updated'))
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err: any) {
      setInfoError(err.message ?? 'Lưu thất bại, thử lại.')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    setPassError('')
    if (!oldPass || !newPass || !confirmPass) {
      setPassError('Vui lòng điền đầy đủ thông tin.')
      return
    }
    if (newPass.length < 6) {
      setPassError('Mật khẩu mới phải có ít nhất 6 ký tự.')
      return
    }
    if (newPass !== confirmPass) {
      setPassError('Mật khẩu xác nhận không khớp.')
      return
    }
    setSaving(true)
    try {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: user?.email ?? '',
        password: oldPass,
      })
      if (signInErr) {
        setPassError('Mật khẩu hiện tại không đúng.')
        return
      }
      const { error } = await supabase.auth.updateUser({ password: newPass })
      if (error) throw error
      setSaved(true)
      setOldPass(''); setNewPass(''); setConfirmPass('')
      setTimeout(() => setSaved(false), 2500)
    } catch (err: any) {
      setPassError(err.message ?? 'Đổi mật khẩu thất bại, thử lại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
          <h2 className="text-base font-bold text-[#1e2a3a]">Tài khoản của tôi</h2>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center pt-6 pb-4 bg-gray-50 border-b border-[#e5e7eb]">
          <div className="relative group">
            <div className="w-20 h-20 rounded-full bg-[var(--mia-primary)] flex items-center justify-center text-white text-2xl font-bold overflow-hidden">
              {avatarPreview
                ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                : (user?.initials ?? '?')}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              title="Đổi ảnh đại diện"
            >
              <Camera size={18} className="text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <p className="mt-2 text-sm font-semibold text-[#1e2a3a]">{fullName || user?.name}</p>
          <p className="text-xs text-gray-400">{user?.email}</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#e5e7eb]">
          {([['info', 'Thông tin', User], ['password', 'Mật khẩu', Lock]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => { setTab(key); setSaved(false); setInfoError(''); setPassError('') }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px
                ${tab === key ? 'border-[var(--mia-primary)] text-[var(--mia-primary)]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="px-6 py-5 space-y-4">
          {tab === 'info' ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Họ và tên</label>
                <input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#1e2a3a] outline-none focus:border-[var(--mia-primary)] focus:ring-1 focus:ring-[var(--mia-primary)]/20 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email</label>
                <input
                  value={user?.email ?? ''}
                  disabled
                  className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-gray-400 bg-gray-50 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Số điện thoại</label>
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Nhập số điện thoại"
                  className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#1e2a3a] outline-none focus:border-[var(--mia-primary)] focus:ring-1 focus:ring-[var(--mia-primary)]/20 transition"
                />
              </div>
              {infoError && (
                <div className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle size={12} /> {infoError}
                </div>
              )}
            </>
          ) : (
            <>
              {([
                ['Mật khẩu hiện tại', oldPass, setOldPass, showOld, setShowOld],
                ['Mật khẩu mới', newPass, setNewPass, showNew, setShowNew],
                ['Xác nhận mật khẩu mới', confirmPass, setConfirmPass, showConfirm, setShowConfirm],
              ] as const).map(([label, val, setVal, show, setShow]) => (
                <div key={label}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
                  <div className="relative">
                    <input
                      type={show ? 'text' : 'password'}
                      value={val}
                      onChange={e => setVal(e.target.value)}
                      className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 pr-9 text-sm text-[#1e2a3a] outline-none focus:border-[var(--mia-primary)] focus:ring-1 focus:ring-[var(--mia-primary)]/20 transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((v: boolean) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {show ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              ))}
              {passError && (
                <div className="flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle size={12} /> {passError}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={tab === 'info' ? handleSaveInfo : handleChangePassword}
            disabled={saving}
            className="px-5 py-2 text-sm font-medium text-white bg-[var(--mia-primary)] hover:opacity-90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saved
              ? <><Check size={14} /> Đã lưu</>
              : saving
              ? 'Đang lưu...'
              : 'Lưu thay đổi'}
          </button>
        </div>
      </div>
    </div>
  )
}
