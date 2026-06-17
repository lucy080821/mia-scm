'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Package, Truck, ShoppingCart, ArrowRight, AlertCircle, CheckCircle2, ChevronLeft } from 'lucide-react'
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
      {/* ── Hero left ── */}
      <div className="flex-1 bg-gradient-to-br from-[#1e2a3a] to-[#1a3a5c] flex flex-col justify-between p-8 lg:p-12">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="Mia SCM" className="w-10 h-10 rounded-xl" />
          <div>
            <p className="text-white font-bold text-xl leading-none">Mia SCM</p>
            <p className="text-white/50 text-xs">Supply Chain Management</p>
          </div>
        </div>

        <div className="max-w-md">
          <h1 className="text-3xl lg:text-4xl font-bold text-white leading-tight mb-4">
            Quản lý chuỗi cung ứng thông minh cho doanh nghiệp Việt
          </h1>
          <p className="text-white/60 text-base leading-relaxed mb-8">
            Tối ưu kho hàng, giao hàng nhanh chóng và quản lý bán hàng hiệu quả với sức mạnh của AI.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            {[
              { icon: Package, label: 'Kho hàng AI', desc: 'Dự báo tồn kho thông minh' },
              { icon: Truck, label: 'Giao hàng tối ưu', desc: 'Lập tuyến tự động' },
              { icon: ShoppingCart, label: 'Bán hàng thông minh', desc: 'Phân tích khách hàng' },
            ].map(({ icon: Icon, label, desc }) => (
              <div key={label} className="flex items-start gap-3 bg-white/10 rounded-xl p-3 flex-1">
                <div className="w-8 h-8 bg-[#0ea5e9]/20 rounded-lg flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-[#0ea5e9]" />
                </div>
                <div>
                  <p className="text-white text-sm font-medium leading-none">{label}</p>
                  <p className="text-white/50 text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-8">
          {[['500+', 'Nhà phân phối'], ['99.9%', 'Uptime'], ['24/7', 'Hỗ trợ']].map(([num, label]) => (
            <div key={label}>
              <p className="text-2xl font-bold text-white">{num}</p>
              <p className="text-white/50 text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="w-full lg:w-[460px] flex items-center justify-center p-8 bg-[#f0f2f5]">
        <div className="w-full max-w-sm">

          {/* ── Đăng nhập ── */}
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

          {/* ── Quên mật khẩu ── */}
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

          {/* ── Đã gửi email ── */}
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
