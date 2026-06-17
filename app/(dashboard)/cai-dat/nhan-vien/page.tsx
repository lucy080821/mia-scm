'use client'
import { useState, useEffect, useCallback } from 'react'
import { UserPlus, Pencil, Ban, CheckCircle, Search, X, Eye, EyeOff, AlertCircle, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ROLE_LABEL } from '@/lib/auth-client'

interface Employee {
  id: string
  email: string
  full_name: string | null
  phone: string | null
  role: string | null
  status: string | null
  employee_code: string | null
  created_at: string | null
}

const ROLES = [
  { value: 'sales',     label: 'Nhân viên bán hàng' },
  { value: 'warehouse', label: 'Nhân viên kho' },
  { value: 'logistics', label: 'Điều phối logistics' },
  { value: 'driver',    label: 'Tài xế' },
  { value: 'ketoan',    label: 'Kế toán' },
]

const ROLE_BADGE: Record<string, string> = {
  admin:     'bg-yellow-100 text-yellow-700',
  sales:     'bg-sky-100 text-sky-700',
  warehouse: 'bg-orange-100 text-orange-700',
  logistics: 'bg-purple-100 text-purple-700',
  driver:    'bg-pink-100 text-pink-700',
  ketoan:    'bg-green-100 text-green-700',
}

const PAGE_SIZE = 20

interface ModalState {
  open: boolean
  mode: 'add' | 'edit'
  employee?: Employee
}

async function getHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session?.access_token ?? ''}`,
  }
}

export default function NhanVienPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<ModalState>({ open: false, mode: 'add' })

  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formRole, setFormRole] = useState('sales')
  const [formCode, setFormCode] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formSuccess, setFormSuccess] = useState('')

  const loadEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await getHeaders()
      const res = await fetch('/api/users', { headers })
      if (!res.ok) throw new Error(await res.text())
      const data: Employee[] = await res.json()
      setEmployees(data.filter(u => u.role !== 'admin'))
    } catch {
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadEmployees() }, [loadEmployees])

  const openAdd = () => {
    setFormName(''); setFormEmail(''); setFormPhone('')
    setFormRole('sales'); setFormCode(''); setFormPassword('')
    setFormError(''); setFormSuccess(''); setShowPassword(false)
    setModal({ open: true, mode: 'add' })
  }

  const openEdit = (emp: Employee) => {
    setFormName(emp.full_name ?? '')
    setFormEmail(emp.email ?? '')
    setFormPhone(emp.phone ?? '')
    setFormRole(emp.role ?? 'sales')
    setFormCode(emp.employee_code ?? '')
    setFormPassword('')
    setFormError(''); setFormSuccess(''); setShowPassword(false)
    setModal({ open: true, mode: 'edit', employee: emp })
  }

  const closeModal = () => setModal({ open: false, mode: 'add' })

  const handleSave = async () => {
    setFormError('')
    setFormSuccess('')
    if (!formName.trim()) { setFormError('Vui lòng nhập họ và tên.'); return }
    if (!formEmail.trim()) { setFormError('Vui lòng nhập email.'); return }
    if (modal.mode === 'add' && !formPassword) { setFormError('Vui lòng nhập mật khẩu.'); return }
    if (modal.mode === 'add' && formPassword.length < 6) { setFormError('Mật khẩu phải ít nhất 6 ký tự.'); return }

    setSaving(true)
    try {
      const headers = await getHeaders()
      if (modal.mode === 'add') {
        const res = await fetch('/api/users', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            full_name: formName.trim(),
            email: formEmail.trim(),
            password: formPassword,
            phone: formPhone.trim() || null,
            role: formRole,
            employee_code: formCode.trim() || null,
          }),
        })
        if (!res.ok) {
          const body = await res.json()
          throw new Error(body.error ?? 'Lỗi tạo tài khoản')
        }
        setFormSuccess('Đã tạo tài khoản thành công!')
      } else {
        const res = await fetch(`/api/users/${modal.employee!.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            full_name: formName.trim(),
            phone: formPhone.trim() || null,
            role: formRole,
            employee_code: formCode.trim() || null,
            ...(formPassword ? { password: formPassword } : {}),
          }),
        })
        if (!res.ok) {
          const body = await res.json()
          throw new Error(body.error ?? 'Lỗi cập nhật')
        }
        setFormSuccess('Đã cập nhật thành công!')
      }
      await loadEmployees()
      setTimeout(closeModal, 1500)
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Có lỗi xảy ra, vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  const toggleStatus = async (emp: Employee) => {
    const newStatus = emp.status === 'active' ? 'inactive' : 'active'
    const headers = await getHeaders()
    await fetch(`/api/users/${emp.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: newStatus }),
    })
    await loadEmployees()
  }

  const filtered = employees.filter(e =>
    (e.full_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (e.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (e.employee_code ?? '').toLowerCase().includes(search.toLowerCase())
  )
  useEffect(() => { setPage(1) }, [search])
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a]">Quản lý nhân viên</h1>
          <p className="text-sm text-gray-500 mt-0.5">Thêm và quản lý tài khoản nhân viên trong hệ thống</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 bg-[#0ea5e9] hover:bg-[#0284c7] text-white text-sm font-semibold rounded-xl transition-all hover:scale-[1.02] active:scale-95"
        >
          <UserPlus size={16} /> Thêm nhân viên
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">
        <div className="p-4 border-b border-[#e5e7eb]">
          <div className="relative max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Tìm theo tên, email, mã NV..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[#0ea5e9] transition"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-gray-50">
                {['Nhân viên', 'Mã NV', 'Email', 'Số điện thoại', 'Vai trò', 'Trạng thái', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e7eb]">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    {search ? 'Không tìm thấy nhân viên phù hợp.' : 'Chưa có nhân viên nào. Bấm "Thêm nhân viên" để bắt đầu.'}
                  </td>
                </tr>
              ) : paged.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#0ea5e9] flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {(emp.full_name ?? emp.email ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-[#1e2a3a]">{emp.full_name ?? '—'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-600">{emp.employee_code ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{emp.email}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{emp.phone ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[emp.role ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                      {ROLE_LABEL[emp.role ?? ''] ?? emp.role ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${emp.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {emp.status === 'active' ? 'Hoạt động' : 'Đã khóa'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(emp)} title="Chỉnh sửa"
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[#0ea5e9] transition-colors">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => toggleStatus(emp)} title={emp.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa'}
                        className={`p-1.5 rounded-lg hover:bg-gray-100 transition-colors ${emp.status === 'active' ? 'text-gray-400 hover:text-red-500' : 'text-gray-400 hover:text-green-600'}`}>
                        {emp.status === 'active' ? <Ban size={14} /> : <CheckCircle size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#e5e7eb]">
            <span className="text-xs text-gray-500">Hiển thị {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} / {filtered.length} nhân viên</span>
            {Math.ceil(filtered.length / PAGE_SIZE) > 1 && (
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
                  className="h-7 px-2 rounded-lg border border-[#e5e7eb] text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors">‹</button>
                {Array.from({ length: Math.ceil(filtered.length / PAGE_SIZE) }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`h-7 w-7 flex items-center justify-center rounded-lg text-xs transition-colors ${n === page ? 'bg-[#0ea5e9] text-white font-semibold' : 'border border-[#e5e7eb] text-gray-600 hover:bg-gray-50'}`}>
                    {n}
                  </button>
                ))}
                <button onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE >= filtered.length}
                  className="h-7 px-2 rounded-lg border border-[#e5e7eb] text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors">›</button>
              </div>
            )}
          </div>
        )}
      </div>

      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeModal}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#e5e7eb]">
              <h2 className="text-base font-bold text-[#1e2a3a]">
                {modal.mode === 'add' ? 'Thêm nhân viên mới' : 'Chỉnh sửa nhân viên'}
              </h2>
              <button onClick={closeModal} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                  <AlertCircle size={14} className="shrink-0" /> {formError}
                </div>
              )}
              {formSuccess && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                  <Check size={14} className="shrink-0" /> {formSuccess}
                </div>
              )}

              {[
                { label: 'Họ và tên *', value: formName, set: setFormName, placeholder: 'Nguyễn Văn A' },
                { label: 'Email *', value: formEmail, set: setFormEmail, placeholder: 'nv@company.vn', type: 'email', disabled: modal.mode === 'edit' },
                { label: 'Số điện thoại', value: formPhone, set: setFormPhone, placeholder: '0912 345 678' },
                { label: 'Mã nhân viên', value: formCode, set: setFormCode, placeholder: 'NV001' },
              ].map(({ label, value, set, placeholder, type, disabled }) => (
                <div key={label}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
                  <input
                    type={type ?? 'text'}
                    value={value}
                    onChange={e => set(e.target.value)}
                    placeholder={placeholder}
                    disabled={disabled}
                    className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#1e2a3a] outline-none focus:border-[#0ea5e9] focus:ring-1 focus:ring-[#0ea5e9]/20 transition disabled:bg-gray-50 disabled:text-gray-400"
                  />
                </div>
              ))}

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Vai trò *</label>
                <select
                  value={formRole}
                  onChange={e => setFormRole(e.target.value)}
                  className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm text-[#1e2a3a] outline-none focus:border-[#0ea5e9] transition bg-white"
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                  {modal.mode === 'edit' ? 'Mật khẩu mới (để trống nếu không đổi)' : <>Mật khẩu <span className="text-red-400">*</span></>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formPassword}
                    onChange={e => setFormPassword(e.target.value)}
                    placeholder={modal.mode === 'edit' ? 'Để trống nếu không đổi' : 'Tối thiểu 6 ký tự'}
                    className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 pr-9 text-sm text-[#1e2a3a] outline-none focus:border-[#0ea5e9] focus:ring-1 focus:ring-[#0ea5e9]/20 transition"
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {modal.mode === 'add' && <p className="text-[11px] text-gray-400 mt-1">Nhân viên có thể đổi mật khẩu sau khi đăng nhập.</p>}
              </div>
            </div>

            <div className="flex justify-end gap-2 px-6 pb-5">
              <button onClick={closeModal}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Hủy
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 text-sm font-medium text-white bg-[#0ea5e9] hover:bg-[#0284c7] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving ? 'Đang lưu...' : modal.mode === 'add' ? 'Tạo tài khoản' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
