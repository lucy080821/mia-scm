'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, EyeOff, CheckCircle2, AlertCircle, KeyRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    const code = searchParams.get('code')

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          setError('Link đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu lại.')
        } else {
          setReady(true)
        }
        setChecking(false)
      })
      return
    }

    // Fallback: hash-based recovery
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
        setChecking(false)
      }
    })

    // If no code and no hash event after short delay, show error
    const timer = setTimeout(() => {
      if (!ready) {
        setError('Link đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu lại.')
        setChecking(false)
      }
    }, 2000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Mật khẩu nhập lại không khớp'); return }
    if (password.length < 6) { setError('Mật khẩu tối thiểu 6 ký tự'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setTimeout(() => router.push('/login'), 2500)
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-[#1e2a3a] rounded-2xl flex items-center justify-center mx-auto mb-3">
            <KeyRound size={22} className="text-white" />
          </div>
          <p className="text-xs text-gray-400">Mia SCM</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#e5e7eb] shadow-sm p-8">
          {checking && (
            <div className="text-center py-6">
              <span className="w-8 h-8 border-2 border-[#0ea5e9]/30 border-t-[#0ea5e9] rounded-full animate-spin inline-block" />
              <p className="text-sm text-gray-400 mt-3">Đang xác thực link...</p>
            </div>
          )}

          {!checking && success && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={32} className="text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[#1e2a3a]">Đặt lại thành công!</h2>
                <p className="text-gray-400 text-sm mt-2">Đang chuyển về trang đăng nhập...</p>
              </div>
            </div>
          )}

          {!checking && !success && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-[#1e2a3a]">Đặt lại mật khẩu</h2>
                <p className="text-gray-400 text-xs mt-1">Nhập mật khẩu mới cho tài khoản</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  <AlertCircle size={15} className="shrink-0" /> {error}
                </div>
              )}

              {ready && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-[#1e2a3a] mb-2">Mật khẩu mới</label>
                    <div className="relative">
                      <input
                        type={showPwd ? 'text' : 'password'}
                        placeholder="Tối thiểu 6 ký tự"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoFocus
                        className="w-full px-4 py-3 pr-11 border-2 border-[#e5e7eb] rounded-xl text-sm text-[#1e2a3a] placeholder-gray-300 focus:outline-none focus:border-[#0ea5e9] focus:ring-2 focus:ring-[#0ea5e9]/20 transition-all"
                      />
                      <button type="button" onClick={() => setShowPwd(v => !v)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                        {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#1e2a3a] mb-2">Nhập lại mật khẩu</label>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-[#e5e7eb] rounded-xl text-sm text-[#1e2a3a] placeholder-gray-300 focus:outline-none focus:border-[#0ea5e9] focus:ring-2 focus:ring-[#0ea5e9]/20 transition-all"
                    />
                  </div>

                  <button type="submit" disabled={loading || !password || !confirm}
                    className="w-full bg-[#0ea5e9] hover:bg-[#0284c7] text-white font-bold py-3.5 px-4 rounded-xl transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100">
                    {loading
                      ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Đang lưu...</>
                      : 'Đặt lại mật khẩu'}
                  </button>
                </>
              )}

              {!ready && !error && (
                <div className="text-center py-4">
                  <a href="/login" className="text-sm text-[#0ea5e9] hover:underline">← Quay lại đăng nhập</a>
                </div>
              )}

              {!ready && error && (
                <div className="text-center pt-2">
                  <a href="/login" className="text-sm text-[#0ea5e9] hover:underline">← Quay lại đăng nhập</a>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
