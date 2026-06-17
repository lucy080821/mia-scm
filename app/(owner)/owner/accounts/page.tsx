'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { Crown, Plus, X, Eye, EyeOff, CheckCircle2, XCircle, RefreshCw, Shield } from 'lucide-react'

interface OwnerUser {
  id: string; full_name: string; email: string
  phone: string | null; role: string; status: string; created_at: string
}

async function getToken() {
  const { supabase } = await import('@/lib/supabase')
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

export default function AccountsPage() {
  const [owners, setOwners] = useState<OwnerUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [form, setForm] = useState({ full_name: '', email: '', password: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/users', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const all: OwnerUser[] = await res.json()
        setOwners(all.filter(u => u.role === 'owner'))
      }
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!form.full_name || !form.email || !form.password) return
    setSaving(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, role: 'owner', status: 'active' }),
      })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? 'Lỗi') }
      await load()
      setShowModal(false)
      setForm({ full_name: '', email: '', password: '' })
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Lỗi')
    } finally { setSaving(false) }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#0f172a]">Tài khoản Owner</h1>
          <p className="text-sm text-gray-400 mt-0.5">{owners.length} tài khoản có quyền quản lý toàn bộ platform</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-400 text-[#0f172a] text-sm font-bold rounded-xl hover:bg-amber-300 hover:scale-[1.02] active:scale-95 transition-all shadow-sm shadow-amber-200">
            <Plus size={15} /> Thêm owner
          </button>
        </div>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
        <Shield size={15} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          Tài khoản <strong>Owner</strong> có quyền truy cập toàn bộ platform: tạo/quản lý công ty, xem tất cả dữ liệu, và thêm owner mới. Hãy cẩn thận khi cấp quyền này.
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              {['Người dùng', 'Email', 'Ngày tạo', 'Trạng thái'].map(h => (
                <th key={h} className="text-left px-5 py-3.5 text-xs font-bold text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="py-16 text-center">
                <div className="w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto" />
              </td></tr>
            ) : owners.length === 0 ? (
              <tr><td colSpan={4} className="py-16 text-center">
                <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Crown size={20} className="text-amber-300" />
                </div>
                <p className="text-sm text-gray-400">Chưa có tài khoản owner nào</p>
              </td></tr>
            ) : owners.map(o => (
              <tr key={o.id} className="border-b border-gray-50 hover:bg-amber-50/30 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-amber-400 rounded-xl flex items-center justify-center text-[#0f172a] text-sm font-bold shrink-0">
                      {o.full_name.split(' ').pop()?.charAt(0).toUpperCase() ?? '?'}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#0f172a]">{o.full_name}</p>
                      <span className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold mt-0.5">
                        <Crown size={9} /> Owner
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm text-gray-500">{o.email}</td>
                <td className="px-5 py-4 text-sm text-gray-400">
                  {new Date(o.created_at).toLocaleDateString('vi-VN')}
                </td>
                <td className="px-5 py-4">
                  <span className={`flex items-center gap-1.5 text-xs font-semibold w-fit px-2.5 py-1 rounded-full
                    ${o.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-500'}`}>
                    {o.status === 'active' ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
                    {o.status === 'active' ? 'Hoạt động' : 'Đã khóa'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-400 rounded-xl flex items-center justify-center">
                  <Crown size={16} className="text-[#0f172a]" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#0f172a]">Thêm tài khoản Owner</h2>
                  <p className="text-xs text-gray-400">Tài khoản này có toàn quyền platform</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Họ và tên <span className="text-red-400">*</span></label>
                <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  placeholder="Nguyễn Văn A"
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email <span className="text-red-400">*</span></label>
                <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="owner@mia-scm.vn"
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Mật khẩu <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="Tối thiểu 6 ký tự"
                    className="w-full h-9 px-3 pr-9 text-sm border border-gray-200 rounded-xl outline-none focus:border-amber-400 transition-colors" />
                  <button type="button" onClick={() => setShowPass(s => !s)} className="absolute right-2.5 top-2 text-gray-400">
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">Hủy</button>
              <button onClick={handleCreate}
                disabled={!form.full_name || !form.email || !form.password || saving}
                className="flex-1 py-2.5 bg-amber-400 text-[#0f172a] text-sm font-bold rounded-xl hover:bg-amber-300 disabled:opacity-40 transition-all hover:scale-[1.02] active:scale-95">
                {saving ? 'Đang tạo...' : 'Tạo tài khoản'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
