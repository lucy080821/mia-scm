'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import { Plus, Search, X, Trash2, Upload, Download, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import ExportButton from '@/components/ui/ExportButton'

interface Expense {
  id: string; code: string; date: string; category: string
  description: string; amount: number; note: string; createdBy: string
}

interface ImportRow {
  rowNum: number
  date: string
  category: string
  categoryLabel: string
  description: string
  amount: number
  note: string
  errors: string[]
  valid: boolean
}

const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  salary: 'Lương & Phụ cấp', warehouse_rent: 'Thuê kho',
  fuel: 'Nhiên liệu', maintenance: 'Bảo trì xe', other: 'Chi phí khác',
}

const CAT_VN_TO_KEY: Record<string, string> = {
  'lương & phụ cấp': 'salary', 'lương và phụ cấp': 'salary',
  'lương phụ cấp': 'salary', 'lương': 'salary',
  'thuê kho': 'warehouse_rent',
  'nhiên liệu': 'fuel',
  'bảo trì xe': 'maintenance',
  'chi phí khác': 'other', 'khác': 'other',
  'salary': 'salary', 'warehouse_rent': 'warehouse_rent',
  'fuel': 'fuel', 'maintenance': 'maintenance', 'other': 'other',
}

const fmtVND  = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + ' đ'
const fmtDate = (d: string) => {
  try { return new Intl.DateTimeFormat('vi-VN').format(new Date(d)) } catch { return d }
}

const BUILTIN_CATEGORIES = Object.entries(EXPENSE_CATEGORY_LABEL).map(([v, l]) => ({ value: v, label: l }))
const CUSTOM_CATS_KEY = 'mia_expense_custom_cats'

interface FormState {
  date: string; category: string; description: string; amount: string; note: string
}
const emptyForm = (defaultCat: string): FormState => ({
  date: new Date().toISOString().slice(0,10), category: defaultCat,
  description: '', amount: '', note: '',
})

function parseExcelDate(val: any): string | null {
  if (!val) return null
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null
    return val.toISOString().slice(0, 10)
  }
  const s = String(val).trim()
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const n = Number(s)
  if (!isNaN(n) && n > 20000) {
    const d = new Date((n - 25569) * 86400 * 1000)
    return d.toISOString().slice(0, 10)
  }
  return null
}

export default function ChiPhiPhatSinhPage() {
  const [expenses, setExpenses]     = useState<Expense[]>([])
  const [customCats, setCustomCats] = useState<string[]>([])
  const [showForm, setShowForm]     = useState(false)
  const [form, setForm]             = useState<FormState>(emptyForm('salary'))
  const [errors, setErrors]         = useState<Partial<FormState>>({})
  const [search, setSearch]         = useState('')
  const [catFil, setCatFil]         = useState('Tất cả')
  const [toast,  setToast]          = useState('')
  const [addingCat, setAddingCat]       = useState(false)
  const [newCatInput, setNewCatInput]   = useState('')
  const [newCatError, setNewCatError]   = useState('')

  // Import state
  const [showImport, setShowImport] = useState(false)
  const [importRows, setImportRows] = useState<ImportRow[]>([])
  const [importing, setImporting]   = useState(false)
  const [dragOver, setDragOver]     = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(CUSTOM_CATS_KEY) ?? '[]')
      if (Array.isArray(stored)) setCustomCats(stored)
    } catch {}
    fetch('/api/expenses').then(r => r.ok ? r.json() : []).then((data: any[]) => {
      setExpenses(data.map(e => ({
        id: e.id, code: e.code, date: e.expense_date,
        category: e.category, description: e.description,
        amount: e.amount, note: e.note ?? '', createdBy: '—',
      })))
    })
  }, [])

  const allCategories = useMemo(() => [
    ...BUILTIN_CATEGORIES,
    ...customCats.map(c => ({ value: c, label: c })),
  ], [customCats])

  const getCatLabel = (value: string) =>
    allCategories.find(c => c.value === value)?.label ?? value

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const openForm = () => {
    setShowForm(true)
    setForm(emptyForm(allCategories[0]?.value ?? 'salary'))
    setErrors({})
    setAddingCat(false)
    setNewCatInput('')
    setNewCatError('')
  }

  const handleSelectCategory = (val: string) => {
    if (val === '__new__') { setAddingCat(true); setNewCatInput(''); setNewCatError('') }
    else { setAddingCat(false); setForm(f => ({ ...f, category: val })) }
  }

  const confirmNewCat = () => {
    const trimmed = newCatInput.trim()
    if (!trimmed) { setNewCatError('Nhập tên loại chi phí'); return }
    if (allCategories.some(c => c.label.toLowerCase() === trimmed.toLowerCase())) {
      setNewCatError('Loại này đã tồn tại'); return
    }
    const next = [...customCats, trimmed]
    setCustomCats(next)
    localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(next))
    setForm(f => ({ ...f, category: trimmed }))
    setAddingCat(false); setNewCatInput(''); setNewCatError('')
  }

  const cancelNewCat = () => { setAddingCat(false); setNewCatInput(''); setNewCatError('') }

  const deleteCustomCat = (name: string) => {
    const next = customCats.filter(c => c !== name)
    setCustomCats(next)
    localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(next))
    if (form.category === name) setForm(f => ({ ...f, category: allCategories[0]?.value ?? 'salary' }))
  }

  const filtered = useMemo(() =>
    expenses.filter(e => {
      if (catFil !== 'Tất cả' && e.category !== catFil) return false
      if (search && !e.description.toLowerCase().includes(search.toLowerCase()) &&
          !e.code.toLowerCase().includes(search.toLowerCase())) return false
      return true
    }), [expenses, catFil, search])

  const total = filtered.reduce((s, e) => s + e.amount, 0)

  const validate = (): boolean => {
    const errs: Partial<FormState> = {}
    if (!form.date)        errs.date = 'Chọn ngày'
    if (!form.description.trim()) errs.description = 'Nhập mô tả'
    if (!form.amount || isNaN(Number(form.amount.replace(/\D/g,''))) || Number(form.amount.replace(/\D/g,'')) <= 0)
      errs.amount = 'Nhập số tiền hợp lệ'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSave = async () => {
    if (addingCat) { confirmNewCat(); return }
    if (!validate()) return
    const amt = Number(form.amount.replace(/\D/g,''))
    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: form.category, description: form.description.trim(),
          amount: amt, expense_date: form.date, note: form.note.trim(),
        }),
      })
      if (res.ok) {
        const saved = await res.json()
        setExpenses(prev => [{
          id: saved.id, code: saved.code, date: form.date,
          category: form.category, description: form.description.trim(),
          amount: amt, note: form.note.trim(), createdBy: 'Admin',
        }, ...prev])
        setShowForm(false)
        setForm(emptyForm(allCategories[0]?.value ?? 'salary'))
        setErrors({})
        showToast('Đã lưu chi phí phát sinh')
      } else {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        showToast(`Lỗi: ${err.error}`)
      }
    } catch { showToast('Lỗi kết nối — không thể lưu') }
  }

  const handleDelete = async (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id))
    await fetch('/api/expenses', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    showToast('Đã xóa phiếu chi phí')
  }

  const totalByCategory = useMemo(() =>
    allCategories.map(c => ({
      ...c,
      total: expenses.filter(e => e.category === c.value).reduce((s, e) => s + e.amount, 0),
    })).filter(c => c.total > 0).sort((a,b) => b.total - a.total)
  , [expenses, allCategories])

  // ── Import ────────────────────────────────────────────────────
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new()
    const data = [
      ['Ngày', 'Loại chi phí', 'Mô tả', 'Số tiền (đ)', 'Ghi chú'],
      ['15/06/2026', 'Lương & Phụ cấp', 'Lương nhân viên kho tháng 6', 45000000, ''],
      ['15/06/2026', 'Thuê kho', 'Thuê kho tháng 6', 20000000, 'Kho HCM'],
      ['01/06/2026', 'Nhiên liệu', 'Xăng xe giao hàng', 5000000, ''],
      ['01/06/2026', 'Bảo trì xe', 'Sửa xe tải 16C-12345', 3500000, ''],
      ['01/06/2026', 'Chi phí khác', 'Văn phòng phẩm', 800000, 'Mua mực in'],
    ]
    const ws = XLSX.utils.aoa_to_sheet(data)
    ws['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 42 }, { wch: 16 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, ws, 'Chi phí phát sinh')
    XLSX.writeFile(wb, 'mau_chi_phi_phat_sinh.xlsx')
  }

  const parseFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result as ArrayBuffer, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
        const dataRows = raw.slice(1).filter(row => row.some((c: any) => c !== '' && c !== null && c !== undefined))

        const parsed: ImportRow[] = dataRows.map((row, i) => {
          const [col0, col1, col2, col3, col4] = row
          const errs: string[] = []

          const date = parseExcelDate(col0)
          if (!date) errs.push('Ngày không hợp lệ (dùng DD/MM/YYYY)')

          const catRaw = String(col1 ?? '').trim()
          const catKey = CAT_VN_TO_KEY[catRaw.toLowerCase()]
          if (!catKey) errs.push(`Loại không hợp lệ: "${catRaw}"`)

          const desc = String(col2 ?? '').trim()
          if (!desc) errs.push('Mô tả trống')

          const amtRaw = typeof col3 === 'number'
            ? col3
            : Number(String(col3 ?? '').replace(/[^\d]/g, ''))
          if (isNaN(amtRaw) || amtRaw <= 0) errs.push('Số tiền không hợp lệ')

          const note = String(col4 ?? '').trim()
          const catLabel = catKey ? (EXPENSE_CATEGORY_LABEL[catKey] ?? catKey) : catRaw

          return {
            rowNum: i + 2,
            date: date ?? '',
            category: catKey ?? catRaw,
            categoryLabel: catLabel,
            description: desc,
            amount: isNaN(amtRaw) ? 0 : amtRaw,
            note,
            errors: errs,
            valid: errs.length === 0,
          }
        })
        setImportRows(parsed)
      } catch {
        showToast('Không thể đọc file — hãy dùng file .xlsx đúng định dạng')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parseFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) parseFile(file)
  }

  const closeImport = () => { setShowImport(false); setImportRows([]) }

  const reloadExpenses = () =>
    fetch('/api/expenses').then(r => r.ok ? r.json() : []).then((data: any[]) => {
      setExpenses(data.map(e => ({
        id: e.id, code: e.code, date: e.expense_date,
        category: e.category, description: e.description,
        amount: e.amount, note: e.note ?? '', createdBy: '—',
      })))
    })

  const submitImport = async () => {
    const valid = importRows.filter(r => r.valid)
    if (!valid.length) return
    setImporting(true)
    try {
      const res = await fetch('/api/expenses/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: valid.map(r => ({
            expense_date: r.date, category: r.category,
            description: r.description, amount: r.amount, note: r.note || null,
          })),
        }),
      })
      if (res.ok) {
        const result = await res.json()
        showToast(`Đã nhập ${result.inserted} chi phí thành công`)
        closeImport()
        reloadExpenses()
      } else {
        const err = await res.json()
        showToast(`Lỗi: ${err.error}`)
      }
    } catch { showToast('Lỗi kết nối') }
    finally { setImporting(false) }
  }

  const validCount = importRows.filter(r => r.valid).length
  const errorCount = importRows.filter(r => !r.valid).length

  return (
    <div className="p-5 bg-[#f0f2f5] min-h-screen">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-[#1e2a3a]">Chi phí phát sinh</h1>
          <p className="text-sm text-gray-500 mt-0.5">Nhập tay các chi phí ngoài hệ thống (lương, thuê kho, nhiên liệu…)</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportButton module="tai-chinh" />
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 border border-[var(--mia-primary)] text-[var(--mia-primary)] text-sm font-medium rounded-lg hover:bg-sky-50 transition-colors">
            <Upload size={15}/> Nhập hàng loạt
          </button>
          <button onClick={openForm}
            className="flex items-center gap-2 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-medium rounded-lg hover:bg-sky-600 transition-colors">
            <Plus size={16}/> Thêm chi phí
          </button>
        </div>
      </div>

      {/* Category breakdown */}
      <div className="flex gap-3 mb-5 flex-wrap">
        {totalByCategory.map(c => (
          <div key={c.value} className="bg-white rounded-xl border border-[#e5e7eb] p-4 shadow-sm min-w-[160px]">
            <div className="text-xs font-semibold text-gray-500 uppercase mb-1.5">{c.label}</div>
            <div className="text-lg font-bold text-[#1e2a3a]">{fmtVND(c.total)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-4 shadow-sm mb-4 flex gap-3 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm kiếm..."
            className="pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-sky-400 w-48"/>
        </div>
        <select value={catFil} onChange={e => setCatFil(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400">
          <option value="Tất cả">Tất cả loại</option>
          {allCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <div className="ml-auto text-sm text-gray-500 flex items-center">
          Tổng lọc: <span className="ml-1 font-bold text-[#1e2a3a]">{fmtVND(total)}</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {['Mã phiếu','Ngày','Loại chi phí','Mô tả','Số tiền','Ghi chú','Người nhập',''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-sky-600">{e.code}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDate(e.date)}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
                      {getCatLabel(e.category)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 max-w-xs">{e.description}</td>
                  <td className="px-4 py-3 font-semibold text-[#1e2a3a]">{fmtVND(e.amount)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs max-w-[180px] truncate">{e.note}</td>
                  <td className="px-4 py-3 text-gray-500">{e.createdBy}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleDelete(e.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded">
                      <Trash2 size={15}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-300">
                <td colSpan={4} className="px-4 py-3 font-bold text-right">Tổng:</td>
                <td className="px-4 py-3 font-bold text-[#1e2a3a]">{fmtVND(total)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 text-sm">Chưa có chi phí phát sinh nào</div>
        )}
      </div>

      {/* Add expense modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-[#1e2a3a]">Thêm chi phí phát sinh</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20}/>
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Ngày chi <span className="text-red-500">*</span></label>
                  <input type="date" value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 ${errors.date ? 'border-red-400' : 'border-gray-200'}`}/>
                  {errors.date && <p className="text-red-500 text-xs mt-1">{errors.date}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Loại chi phí <span className="text-red-500">*</span></label>
                  <select value={addingCat ? '__new__' : form.category}
                    onChange={e => handleSelectCategory(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400">
                    {allCategories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    <option disabled>──────────</option>
                    <option value="__new__">+ Thêm loại mới...</option>
                  </select>
                  {addingCat && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-2">
                        <input autoFocus value={newCatInput}
                          onChange={e => { setNewCatInput(e.target.value); setNewCatError('') }}
                          onKeyDown={e => { if (e.key === 'Enter') confirmNewCat(); if (e.key === 'Escape') cancelNewCat() }}
                          placeholder="VD: Tiếp thị, Văn phòng phẩm..."
                          className={`flex-1 border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-sky-400 ${newCatError ? 'border-red-400' : 'border-gray-200'}`}/>
                        <button onClick={confirmNewCat}
                          className="px-3 py-1.5 bg-[var(--mia-primary)] text-white text-xs font-semibold rounded-lg hover:bg-sky-600 transition-colors whitespace-nowrap">
                          Thêm
                        </button>
                        <button onClick={cancelNewCat} className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors">
                          <X size={14}/>
                        </button>
                      </div>
                      {newCatError && <p className="text-red-500 text-xs">{newCatError}</p>}
                    </div>
                  )}
                  {customCats.length > 0 && !addingCat && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {customCats.map(c => (
                        <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-50 text-sky-700 text-xs rounded-full border border-sky-200">
                          {c}
                          <button onClick={() => deleteCustomCat(c)} className="hover:text-red-500 transition-colors">
                            <X size={10}/>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Mô tả <span className="text-red-500">*</span></label>
                <input value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="VD: Lương nhân viên kho tháng 6"
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 ${errors.description ? 'border-red-400' : 'border-gray-200'}`}/>
                {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Số tiền (đ) <span className="text-red-500">*</span></label>
                <input value={form.amount}
                  onChange={e => {
                    const raw = e.target.value.replace(/\D/g,'')
                    setForm(f => ({ ...f, amount: raw ? Number(raw).toLocaleString('vi-VN') : '' }))
                  }}
                  placeholder="VD: 45.000.000"
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 ${errors.amount ? 'border-red-400' : 'border-gray-200'}`}/>
                {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Ghi chú</label>
                <textarea value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  rows={2} placeholder="Chi tiết thêm (không bắt buộc)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-400 resize-none"/>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Hủy
              </button>
              <button onClick={handleSave}
                className="px-5 py-2 text-sm font-medium bg-[var(--mia-primary)] text-white rounded-lg hover:bg-sky-600 transition-colors">
                {addingCat ? 'Xác nhận loại' : 'Lưu chi phí'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-[#1e2a3a]">Nhập hàng loạt từ Excel</h2>
              <button onClick={closeImport} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={20}/>
              </button>
            </div>

            <div className="px-6 py-4 flex-1 overflow-y-auto space-y-4">
              <div className="flex flex-wrap gap-3 items-stretch">
                {/* Download template */}
                <button onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 py-3 border border-gray-300 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors self-start">
                  <Download size={15} className="text-green-600"/>
                  Tải file mẫu (.xlsx)
                </button>

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  className={`flex-1 min-w-[220px] flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl py-6 px-4 transition-colors
                    ${dragOver ? 'border-sky-400 bg-sky-50' : 'border-gray-200 bg-gray-50 hover:border-sky-300 hover:bg-sky-50/50'}`}>
                  <FileSpreadsheet size={28} className={dragOver ? 'text-sky-500' : 'text-gray-400'}/>
                  <p className="text-sm text-gray-600 font-medium text-center">
                    {importRows.length > 0 ? 'Upload file khác' : 'Kéo thả file Excel vào đây'}
                  </p>
                  <p className="text-xs text-gray-400">hoặc click để chọn file (.xlsx, .xls)</p>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileInput} className="hidden"/>
                </div>
              </div>

              {/* Category hint */}
              <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-2.5 text-xs text-blue-700">
                <strong>Loại chi phí hợp lệ:</strong>{' '}
                {Object.values(EXPENSE_CATEGORY_LABEL).join(' · ')}
              </div>

              {/* Preview table */}
              {importRows.length > 0 && (
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm font-semibold text-[#1e2a3a]">
                      Xem trước — {importRows.length} dòng
                    </span>
                    {validCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        <CheckCircle size={12}/> {validCount} hợp lệ
                      </span>
                    )}
                    {errorCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                        <AlertCircle size={12}/> {errorCount} lỗi
                      </span>
                    )}
                  </div>
                  <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50 z-10">
                        <tr className="border-b border-gray-200">
                          {['#','Ngày','Loại','Mô tả','Số tiền','Ghi chú','Trạng thái'].map(h => (
                            <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {importRows.map(row => (
                          <tr key={row.rowNum} className={row.valid ? 'hover:bg-gray-50' : 'bg-red-50'}>
                            <td className="px-3 py-2 text-gray-400">{row.rowNum}</td>
                            <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.date ? fmtDate(row.date) : '—'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                                {row.categoryLabel || row.category || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate">{row.description || '—'}</td>
                            <td className="px-3 py-2 font-medium text-[#1e2a3a] whitespace-nowrap">
                              {row.amount > 0 ? fmtVND(row.amount) : '—'}
                            </td>
                            <td className="px-3 py-2 text-gray-400 max-w-[140px] truncate">{row.note}</td>
                            <td className="px-3 py-2">
                              {row.valid
                                ? <span className="flex items-center gap-1 text-green-600 whitespace-nowrap"><CheckCircle size={12}/> Hợp lệ</span>
                                : <span className="text-red-600 text-xs leading-snug">{row.errors.join(' · ')}</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {importRows.length > 0
                  ? `${validCount}/${importRows.length} dòng hợp lệ — dòng lỗi sẽ bị bỏ qua`
                  : 'Tải file mẫu, điền dữ liệu rồi upload lên đây'}
              </p>
              <div className="flex gap-3">
                <button onClick={closeImport}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  Hủy
                </button>
                {validCount > 0 && (
                  <button onClick={submitImport} disabled={importing}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-medium bg-[var(--mia-primary)] text-white rounded-lg hover:bg-sky-600 transition-colors disabled:opacity-60">
                    <Upload size={14}/>
                    {importing ? 'Đang nhập...' : `Nhập ${validCount} dòng`}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
