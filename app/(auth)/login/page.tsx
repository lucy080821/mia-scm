'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, ArrowRight, AlertCircle, CheckCircle2, ChevronLeft, Package, Truck, ShoppingCart } from 'lucide-react'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'forgot' | 'sent'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')
    try {
      const { error, data } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      const profileRes = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      })
      const profile = profileRes.ok ? await profileRes.json() : null
      const role = profile?.role ?? data.user?.user_metadata?.role ?? 'admin'
      router.push(role === 'owner' ? '/owner/dashboard' : '/dashboard')
      router.refresh()
    } catch {
      setError('Email hoặc mật khẩu không đúng.')
      setLoading(false)
    }
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetEmail.trim()) return
    setResetLoading(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetLoading(false)
    if (error) {
      setError('Không thể gửi email. Vui lòng kiểm tra lại địa chỉ.')
    } else {
      setMode('sent')
    }
  }

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* ── Hero left ─────────────────────────────────────────── */}
      <div className="flex-1 relative flex flex-col overflow-hidden" style={{ background: '#0b1623' }}>

        {/* Dot grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(14,165,233,0.07) 1px, transparent 0)',
          backgroundSize: '36px 36px',
        }} />

        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 70% 60% at 50% 55%, rgba(14,165,233,0.08) 0%, transparent 70%)',
        }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3 px-8 py-7">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white text-sm"
            style={{ background: 'linear-gradient(135deg,#0ea5e9,#0284c7)' }}>M</div>
          <div>
            <p className="text-white font-bold text-lg leading-none">Mia SCM</p>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Supply Chain Management</p>
          </div>
        </div>

        {/* Main content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-4">
          <p className="text-xs font-semibold uppercase tracking-[3px] mb-3"
            style={{ color: 'rgba(14,165,233,0.7)' }}>Nền tảng quản lý</p>
          <h1 className="text-white font-bold text-center leading-tight mb-14"
            style={{ fontSize: 'clamp(22px,2.5vw,30px)' }}>
            Chuỗi cung ứng thông minh<br />
            <span style={{ color: '#0ea5e9' }}>cho doanh nghiệp Việt</span>
          </h1>

          {/* Triangle */}
          <div className="relative" style={{ width: 360, height: 340 }}>

            {/* SVG layer */}
            <svg width="360" height="340" viewBox="0 0 360 340"
              className="absolute inset-0" style={{ overflow: 'visible' }}>
              <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <filter id="glow-sm" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
                <linearGradient id="g-top-bl" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
                <linearGradient id="g-top-br" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0ea5e9" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
                <linearGradient id="g-bottom" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
              </defs>

              {/* Triangle fill */}
              <polygon points="180,24 28,306 332,306"
                fill="rgba(14,165,233,0.04)" stroke="none" />

              {/* Edges */}
              <line x1="180" y1="24" x2="28" y2="306"
                stroke="url(#g-top-bl)" strokeWidth="1.5" filter="url(#glow-sm)" />
              <line x1="180" y1="24" x2="332" y2="306"
                stroke="url(#g-top-br)" strokeWidth="1.5" filter="url(#glow-sm)" />
              <line x1="28" y1="306" x2="332" y2="306"
                stroke="url(#g-bottom)" strokeWidth="1.5" filter="url(#glow-sm)" />

              {/* Dashed center lines */}
              <line x1="180" y1="212" x2="180" y2="24"
                stroke="rgba(14,165,233,0.18)" strokeWidth="1" strokeDasharray="5,5" />
              <line x1="180" y1="212" x2="28" y2="306"
                stroke="rgba(16,185,129,0.18)" strokeWidth="1" strokeDasharray="5,5" />
              <line x1="180" y1="212" x2="332" y2="306"
                stroke="rgba(245,158,11,0.18)" strokeWidth="1" strokeDasharray="5,5" />

              {/* Center node */}
              <circle cx="180" cy="212" r="3" fill="rgba(255,255,255,0.25)" />
              <circle cx="180" cy="212" r="8" fill="rgba(255,255,255,0.04)" />

              {/* Vertex — top (Kho hàng) */}
              <circle cx="180" cy="24" r="14" fill="rgba(14,165,233,0.12)" />
              <circle cx="180" cy="24" r="6" fill="#0ea5e9" filter="url(#glow)" />

              {/* Vertex — bottom-left (Bán hàng) */}
              <circle cx="28" cy="306" r="14" fill="rgba(16,185,129,0.12)" />
              <circle cx="28" cy="306" r="6" fill="#10b981" filter="url(#glow)" />

              {/* Vertex — bottom-right (Logistics) */}
              <circle cx="332" cy="306" r="14" fill="rgba(245,158,11,0.12)" />
              <circle cx="332" cy="306" r="6" fill="#f59e0b" filter="url(#glow)" />
            </svg>

            {/* ── Card: Kho hàng — top center ── */}
            <div className="absolute flex flex-col items-center text-center"
              style={{ top: -80, left: '50%', transform: 'translateX(-50%)', width: 144 }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2.5"
                style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.35)' }}>
                <Package size={22} color="#0ea5e9" />
              </div>
              <p className="text-white font-bold text-sm leading-tight">Kho hàng AI</p>
              <p className="text-[10px] leading-snug mt-1" style={{ color: 'rgba(255,255,255,0.38)' }}>
                Tồn kho · EOQ · ABC<br />Cảnh báo HSD
              </p>
            </div>

            {/* ── Card: Bán hàng — bottom-left ── */}
            <div className="absolute flex flex-col items-center text-center"
              style={{ bottom: -16, left: -64, width: 136 }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2.5"
                style={{ background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)' }}>
                <ShoppingCart size={22} color="#10b981" />
              </div>
              <p className="text-white font-bold text-sm leading-tight">Bán hàng</p>
              <p className="text-[10px] leading-snug mt-1" style={{ color: 'rgba(255,255,255,0.38)' }}>
                Đơn hàng · Báo giá<br />Công nợ · AI parse
              </p>
            </div>

            {/* ── Card: Logistics — bottom-right ── */}
            <div className="absolute flex flex-col items-center text-center"
              style={{ bottom: -16, right: -64, width: 136 }}>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-2.5"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)' }}>
                <Truck size={22} color="#f59e0b" />
              </div>
              <p className="text-white font-bold text-sm leading-tight">Logistics</p>
              <p className="text-[10px] leading-snug mt-1" style={{ color: 'rgba(255,255,255,0.38)' }}>
                Giao hàng · COD<br />Tracking · Tài xế
              </p>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="relative z-10 flex gap-10 px-8 py-6"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {[['500+', 'Nhà phân phối'], ['99.9%', 'Uptime'], ['24/7', 'Hỗ trợ']].map(([num, label]) => (
            <div key={label}>
              <p className="text-white font-bold text-xl">{num}</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────────── */}
      <div className="w-full lg:w-[460px] flex items-center justify-center p-8 bg-[#f0f2f5]">
        <div className="w-full max-w-sm">

          {/* Đăng nhập */}
          {mode === 'login' && (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-8 space-y-5">
              <div className="text-center mb-2">
                <h2 className="text-xl font-bold text-[#1e2a3a]">Đăng nhập</h2>
                <p className="text-gray-400 text-xs mt-1">Nhập email và mật khẩu của bạn</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  <AlertCircle size={15} className="shrink-0" /> {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-[#1e2a3a] mb-2">Email</label>
                <input
                  type="email"
                  placeholder="email@company.vn"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                  className="w-full px-4 py-3 border-2 border-[#e5e7eb] rounded-xl text-sm text-[#1e2a3a] placeholder-gray-300 focus:outline-none focus:border-[#0ea5e9] focus:ring-2 focus:ring-[#0ea5e9]/20 transition-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-semibold text-[#1e2a3a]">Mật khẩu</label>
                  <button type="button" onClick={() => { setError(''); setResetEmail(email); setMode('forgot') }}
                    className="text-xs text-[#0ea5e9] hover:underline">
                    Quên mật khẩu?
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPwd ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-3 pr-11 border-2 border-[#e5e7eb] rounded-xl text-sm text-[#1e2a3a] placeholder-gray-300 focus:outline-none focus:border-[#0ea5e9] focus:ring-2 focus:ring-[#0ea5e9]/20 transition-all"
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading || !email.trim() || !password}
                className="w-full bg-[#0ea5e9] hover:bg-[#0284c7] text-white font-bold py-3.5 px-4 rounded-xl transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                {loading
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Đang đăng nhập...</>
                  : <>Đăng nhập <ArrowRight size={16} /></>}
              </button>
            </form>
          )}

          {/* Quên mật khẩu */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-8 space-y-5">
              <div>
                <button type="button" onClick={() => { setError(''); setMode('login') }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1e2a3a] transition-colors mb-4">
                  <ChevronLeft size={14} /> Quay lại đăng nhập
                </button>
                <h2 className="text-xl font-bold text-[#1e2a3a]">Quên mật khẩu</h2>
                <p className="text-gray-400 text-xs mt-1">Nhập email để nhận link đặt lại mật khẩu</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  <AlertCircle size={15} className="shrink-0" /> {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-[#1e2a3a] mb-2">Email tài khoản</label>
                <input
                  type="email"
                  placeholder="email@company.vn"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  autoFocus
                  className="w-full px-4 py-3 border-2 border-[#e5e7eb] rounded-xl text-sm text-[#1e2a3a] placeholder-gray-300 focus:outline-none focus:border-[#0ea5e9] focus:ring-2 focus:ring-[#0ea5e9]/20 transition-all"
                />
              </div>

              <button type="submit" disabled={resetLoading || !resetEmail.trim()}
                className="w-full bg-[#0ea5e9] hover:bg-[#0284c7] text-white font-bold py-3.5 px-4 rounded-xl transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                {resetLoading
                  ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Đang gửi...</>
                  : <>Gửi link đặt lại <ArrowRight size={16} /></>}
              </button>
            </form>
          )}

          {/* Đã gửi email */}
          {mode === 'sent' && (
            <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-8 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#1e2a3a]">Kiểm tra email</h2>
                <p className="text-gray-500 text-sm mt-2">
                  Đã gửi link đặt lại mật khẩu đến <br />
                  <span className="font-semibold text-[#1e2a3a]">{resetEmail}</span>
                </p>
                <p className="text-gray-400 text-xs mt-3">
                  Không thấy email? Kiểm tra thư mục spam hoặc thử lại sau vài phút.
                </p>
              </div>
              <button type="button" onClick={() => { setError(''); setMode('forgot') }}
                className="text-sm text-[#0ea5e9] hover:underline">
                Gửi lại email
              </button>
              <div className="pt-2">
                <button type="button" onClick={() => { setError(''); setMode('login') }}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-[#1e2a3a] transition-colors mx-auto">
                  <ChevronLeft size={14} /> Quay lại đăng nhập
                </button>
              </div>
            </div>
          )}

          <p className="mt-5 text-center text-xs text-gray-400">
            Chưa có tài khoản?{' '}
            <a href="#" className="text-[#0ea5e9] hover:underline font-medium">Liên hệ dùng thử miễn phí</a>
          </p>
        </div>
      </div>
    </div>
  )
}
