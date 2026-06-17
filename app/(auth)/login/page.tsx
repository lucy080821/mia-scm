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
      <div className="hidden lg:flex flex-1 relative flex-col" style={{ background: '#0b1623' }}>

        {/* Dot grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(14,165,233,0.07) 1px, transparent 0)',
          backgroundSize: '36px 36px',
        }} />

        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse 70% 60% at 50% 58%, rgba(14,165,233,0.09) 0%, transparent 70%)',
        }} />

        {/* Logo — absolute để luôn hiện góc trên trái */}
        <div style={{ position: 'absolute', top: 24, left: 32, zIndex: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mia-logo.png" alt="Mia SCM" style={{ width: 44, height: 44, objectFit: 'contain' }} />
          <div>
            <p style={{ color: '#fff', fontWeight: 700, fontSize: 17, lineHeight: 1 }}>Mia SCM</p>
            <p style={{ color: 'rgba(255,255,255,0.38)', fontSize: 10.5, marginTop: 3 }}>Supply Chain Management</p>
          </div>
        </div>

        {/* Main content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6"
          style={{ paddingTop: 8, paddingBottom: 24 }}>
          <p className="text-xs font-semibold uppercase tracking-[3px] mb-4"
            style={{ color: 'rgba(14,165,233,0.75)', letterSpacing: '0.2em' }}>Nền tảng quản lý</p>
          <h1 className="text-white font-bold text-center leading-tight mb-10"
            style={{ fontSize: 'clamp(20px,2.4vw,30px)' }}>
            Chuỗi cung ứng thông minh<br />
            <span style={{ color: '#0ea5e9' }}>cho doanh nghiệp Việt</span>
          </h1>

          {/* Layout: card trên → SVG → 2 card dưới (tất cả trong luồng, không absolute âm) */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 400 }}>

            {/* Kho hàng — trên đỉnh tam giác */}
            <div style={{ textAlign: 'center', paddingBottom: 12 }}>
              <div style={{ width: 54, height: 54, borderRadius: 16, background: 'rgba(14,165,233,0.13)', border: '1px solid rgba(14,165,233,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                <Package size={24} color="#0ea5e9" />
              </div>
              <p style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Kho hàng AI</p>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, lineHeight: 1.7, marginTop: 3 }}>
                Tồn kho thời gian thực · EOQ · ABC<br />Cảnh báo hạn sử dụng
              </p>
            </div>

            {/* SVG tam giác — 400×220, đỉnh trên (200,0) đỉnh BL (60,210) đỉnh BR (340,210) */}
            <svg width="400" height="220" viewBox="0 0 400 220" style={{ display: 'block', flexShrink: 0 }}>
              <defs>
                <filter id="gv" x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur stdDeviation="5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <filter id="ge" x="-40%" y="-40%" width="180%" height="180%">
                  <feGaussianBlur stdDeviation="2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
                </filter>
                <linearGradient id="gl" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#0ea5e9"/><stop offset="100%" stopColor="#10b981"/>
                </linearGradient>
                <linearGradient id="gr" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#0ea5e9"/><stop offset="100%" stopColor="#f59e0b"/>
                </linearGradient>
                <linearGradient id="gb" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981"/><stop offset="100%" stopColor="#f59e0b"/>
                </linearGradient>
              </defs>
              {/* Fill */}
              <polygon points="200,6 60,210 340,210" fill="rgba(14,165,233,0.04)"/>
              {/* Edges */}
              <line x1="200" y1="6" x2="60"  y2="210" stroke="url(#gl)" strokeWidth="1.5" filter="url(#ge)"/>
              <line x1="200" y1="6" x2="340" y2="210" stroke="url(#gr)" strokeWidth="1.5" filter="url(#ge)"/>
              <line x1="60"  y1="210" x2="340" y2="210" stroke="url(#gb)" strokeWidth="1.5" filter="url(#ge)"/>
              {/* Centroid (200,142) */}
              <line x1="200" y1="142" x2="200" y2="6"   stroke="rgba(14,165,233,0.14)" strokeWidth="1" strokeDasharray="5,7"/>
              <line x1="200" y1="142" x2="60"  y2="210" stroke="rgba(16,185,129,0.14)" strokeWidth="1" strokeDasharray="5,7"/>
              <line x1="200" y1="142" x2="340" y2="210" stroke="rgba(245,158,11,0.14)"  strokeWidth="1" strokeDasharray="5,7"/>
              <circle cx="200" cy="142" r="3" fill="rgba(255,255,255,0.3)"/>
              <circle cx="200" cy="142" r="9" fill="rgba(255,255,255,0.04)"/>
              {/* Vertex top */}
              <circle cx="200" cy="6" r="14" fill="rgba(14,165,233,0.12)"/>
              <circle cx="200" cy="6" r="5.5" fill="#0ea5e9" filter="url(#gv)"/>
              {/* Vertex BL */}
              <circle cx="60"  cy="210" r="14" fill="rgba(16,185,129,0.12)"/>
              <circle cx="60"  cy="210" r="5.5" fill="#10b981" filter="url(#gv)"/>
              {/* Vertex BR */}
              <circle cx="340" cy="210" r="14" fill="rgba(245,158,11,0.12)"/>
              <circle cx="340" cy="210" r="5.5" fill="#f59e0b" filter="url(#gv)"/>
            </svg>

            {/* Bán hàng + Logistics — hàng dưới */}
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', paddingTop: 12, gap: 8 }}>

              {/* Bán hàng */}
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ width: 54, height: 54, borderRadius: 16, background: 'rgba(16,185,129,0.13)', border: '1px solid rgba(16,185,129,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                  <ShoppingCart size={24} color="#10b981" />
                </div>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Bán hàng</p>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, lineHeight: 1.7, marginTop: 3 }}>
                  Đơn hàng · Báo giá<br />Công nợ · AI parse
                </p>
              </div>

              {/* Logistics */}
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{ width: 54, height: 54, borderRadius: 16, background: 'rgba(245,158,11,0.13)', border: '1px solid rgba(245,158,11,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                  <Truck size={24} color="#f59e0b" />
                </div>
                <p style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Logistics</p>
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 10, lineHeight: 1.7, marginTop: 3 }}>
                  Giao hàng · COD<br />Tracking · Tài xế
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="relative z-10 flex gap-12 px-10 py-7"
          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          {[['500+', 'Nhà phân phối'], ['99.9%', 'Uptime'], ['24/7', 'Hỗ trợ']].map(([num, label]) => (
            <div key={label}>
              <p className="text-white font-bold text-xl">{num}</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.38)' }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────────── */}
      <div className="w-full lg:w-[460px] flex flex-col items-center justify-center p-8 bg-[#f0f2f5] min-h-screen">

        {/* Logo — luôn hiển thị trên mobile, ẩn trên desktop (đã có ở hero) */}
        <div className="flex lg:hidden items-center gap-3 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mia-logo.png" alt="Mia SCM" style={{ width: 52, height: 52, objectFit: 'contain' }} />
          <div>
            <p className="font-bold text-[#1e2a3a] text-xl leading-none">Mia SCM</p>
            <p className="text-gray-400 text-xs mt-1">Supply Chain Management</p>
          </div>
        </div>

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
