'use client'
import { useState, useRef, useCallback } from 'react'
import {
  Download, CheckCircle2, XCircle, AlertTriangle,
  FileSpreadsheet, ChevronRight, RotateCcw, Package,
  Users, Building2, Warehouse, ArrowRight, Info, UserCircle, Loader2,
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

// ─── Types ────────────────────────────────────────────────────────────────────

type ImportType = 'products' | 'customers' | 'suppliers' | 'inventory' | 'employees'
type RowStatus = 'ok' | 'error' | 'warning'

interface ParsedRow {
  _line: number
  _status: RowStatus
  _errors: string[]
  [key: string]: string | number | RowStatus | string[]
}

interface ImportResult {
  inserted: number
  errors: { line: number; message: string }[]
}

interface ImportConfig {
  id: ImportType
  label: string
  icon: React.ReactNode
  color: string
  fields: FieldDef[]
  sampleRows: string[][]
}

interface FieldDef {
  key: string
  label: string
  required?: boolean
  type?: 'text' | 'number' | 'date' | 'enum'
  enum?: string[]
  hint?: string
}

// ─── Import configs ───────────────────────────────────────────────────────────

const CONFIGS: ImportConfig[] = [
  {
    id: 'products',
    label: 'Sản phẩm',
    icon: <Package size={18} />,
    color: 'text-blue-600',
    fields: [
      { key: 'sku',              label: 'SKU',                 required: true,  hint: 'Mã sản phẩm duy nhất, VD: CMK0001' },
      { key: 'name',             label: 'Tên sản phẩm',        required: true,  hint: 'Tên đầy đủ' },
      { key: 'category',         label: 'Danh mục',            hint: 'VD: Bánh kẹo, Sữa, Nước uống' },
      { key: 'supplier',         label: 'Nhà cung cấp',        hint: 'Tên NCC (phải tồn tại trong hệ thống)' },
      { key: 'unit',             label: 'Đơn vị tính',         required: true,  hint: 'gói / hộp / thùng / kg / chai' },
      { key: 'purchase_price',   label: 'Giá nhập (đ)',        required: true,  type: 'number', hint: 'Số nguyên, không dấu chấm. VD: 12000' },
      { key: 'sale_price',       label: 'Giá bán (đ)',         required: true,  type: 'number', hint: 'VD: 18000' },
      { key: 'min_stock',        label: 'Tồn tối thiểu',      type: 'number',  hint: 'Mặc định 0' },
      { key: 'expiry_days',      label: 'Tổng HSD (ngày)',     type: 'number',  hint: 'Tính từ ngày SX. VD: 180 = 6 tháng. Để trống nếu không HSD' },
      { key: 'manufacture_date', label: 'Ngày sản xuất lô',   type: 'date',    hint: 'DD/MM/YYYY. Dùng để tính % HSD còn lại' },
      { key: 'status',           label: 'Trạng thái',          type: 'enum',    enum: ['active', 'inactive'], hint: 'active hoặc inactive' },
      { key: 'warehouse_code',   label: 'Mã kho (tồn đầu)',                    hint: 'Mã kho để nhập tồn ban đầu. Để trống nếu nhập riêng ở bước Tồn kho' },
      { key: 'initial_quantity', label: 'Số lượng tồn đầu',   type: 'number',  hint: 'Số lượng tồn kho ban đầu tại kho trên' },
    ],
    sampleRows: [
      ['CMK0001', 'Bánh muffin socola chip Chocomilk 90g', 'Bánh kẹo', 'Công ty Chocomilk', 'gói', '12000', '18000', '200', '180', '01/01/2026', 'active', 'KHO-HCM', '500'],
      ['CMK0002', 'Sữa chua ăn không đường Chocomilk 100g', 'Sữa', 'Công ty Chocomilk', 'hộp', '12000', '17000', '300', '30', '01/06/2026', 'active', 'KHO-HCM', '800'],
      ['CMK0003', 'Bánh cracker vị rau củ Chocomilk 200g', 'Bánh kẹo', 'Công ty Chocomilk', 'hộp', '23000', '32000', '150', '270', '15/03/2026', 'active', '', ''],
    ],
  },
  {
    id: 'customers',
    label: 'Khách hàng',
    icon: <Users size={18} />,
    color: 'text-sky-600',
    fields: [
      { key: 'code',         label: 'Mã khách hàng',       hint: 'VD: CUS0001. Để trống để tự sinh' },
      { key: 'name',         label: 'Tên khách hàng',      required: true },
      { key: 'short_name',   label: 'Tên viết tắt' },
      { key: 'type',         label: 'Loại',                type: 'enum', enum: ['company', 'individual'], hint: 'company / individual' },
      { key: 'phone',        label: 'Số điện thoại' },
      { key: 'email',        label: 'Email' },
      { key: 'address',      label: 'Địa chỉ' },
      { key: 'credit_limit', label: 'Hạn mức công nợ (đ)', type: 'number', hint: 'Mặc định 0' },
      { key: 'payment_term', label: 'Kỳ thanh toán (ngày)', type: 'number', hint: 'Mặc định 30' },
      { key: 'status',       label: 'Trạng thái',          type: 'enum', enum: ['active', 'paused', 'inactive'] },
    ],
    sampleRows: [
      ['CUS0001', 'Siêu thị Co.opmart Quận 1', 'Co.opmart Q1', 'company', '028 1234 5678', 'coopmart.q1@saigonco-op.com.vn', '168 Nguyễn Đình Chiểu, Q.3, TP.HCM', '200000000', '30', 'active'],
      ['CUS0002', 'Cửa hàng Bách Hóa Xanh Bình Dương', 'BHX Bình Dương', 'company', '0274 123 4567', '', '15 Lê Hồng Phong, TP. Thủ Dầu Một, Bình Dương', '50000000', '15', 'active'],
      ['CUS0003', 'Nguyễn Thị Mai', 'Mai', 'individual', '0901234567', '', '45 Trần Phú, Q. Hà Đông, Hà Nội', '0', '7', 'active'],
    ],
  },
  {
    id: 'suppliers',
    label: 'Nhà cung cấp',
    icon: <Building2 size={18} />,
    color: 'text-orange-600',
    fields: [
      { key: 'code',          label: 'Mã NCC',              hint: 'VD: NCC0001. Để trống để tự sinh' },
      { key: 'name',          label: 'Tên NCC',             required: true },
      { key: 'type',          label: 'Loại',                type: 'enum', enum: ['manufacturer', 'distributor_l1'], hint: 'manufacturer / distributor_l1' },
      { key: 'tax_code',      label: 'Mã số thuế' },
      { key: 'phone',         label: 'Điện thoại',          required: true },
      { key: 'email',         label: 'Email' },
      { key: 'address',       label: 'Địa chỉ' },
      { key: 'payment_term',  label: 'Kỳ TT (ngày)',        type: 'number', hint: 'Mặc định 30' },
      { key: 'delivery_days', label: 'Ngày giao hàng',      type: 'number', hint: 'Mặc định 3' },
      { key: 'rating',        label: 'Đánh giá (1-5)',      type: 'number', hint: 'VD: 4.5' },
    ],
    sampleRows: [
      ['NCC0001', 'Công ty CP Chocomilk', 'manufacturer', '0312345678', '028 3812 5678', 'sales@chocomilk.vn', 'KCN Tân Bình, TP.HCM', '30', '3', '4.8'],
      ['NCC0002', 'Công ty TNHH Thực phẩm Ngôi Sao', 'manufacturer', '0100106827', '024 3856 7890', 'info@ngoisao-food.vn', '15 Phạm Hùng, Cầu Giấy, Hà Nội', '30', '5', '4.3'],
      ['NCC0003', 'Phân phối Miền Nam Food', 'distributor_l1', '0301234567', '028 7300 1234', 'order@mnfood.vn', '200 Lý Chính Thắng, Q.3, TP.HCM', '15', '2', '4.5'],
    ],
  },
  {
    id: 'inventory',
    label: 'Tồn kho ban đầu',
    icon: <Warehouse size={18} />,
    color: 'text-green-600',
    fields: [
      { key: 'sku',            label: 'SKU sản phẩm',   required: true, hint: 'Phải khớp với SKU đã nhập trong Bước 1' },
      { key: 'warehouse_code', label: 'Mã kho',         required: true, hint: 'Phải khớp với mã kho trong hệ thống' },
      { key: 'lot_number',     label: 'Số lô',          hint: 'VD: LOT-2026-001. Để trống nếu không quản lý lô' },
      { key: 'quantity',       label: 'Số lượng',       required: true, type: 'number', hint: 'Số nguyên dương' },
      { key: 'expiry_date',    label: 'Ngày hết hạn',  type: 'date',   hint: 'DD/MM/YYYY — ngày hết hạn tuyệt đối của lô này' },
    ],
    sampleRows: [
      ['CMK0001', 'KHO-HCM', 'LOT-2026-001', '500', '30/06/2026'],
      ['CMK0001', 'KHO-HN',  'LOT-2026-002', '300', '30/06/2026'],
      ['CMK0002', 'KHO-HCM', 'LOT-2026-003', '800', '30/06/2026'],
      ['CMK0003', 'KHO-HCM', '',             '200', ''],
    ],
  },
  {
    id: 'employees',
    label: 'Nhân viên',
    icon: <UserCircle size={18} />,
    color: 'text-purple-600',
    fields: [
      { key: 'employee_code', label: 'Mã nhân viên',    hint: 'VD: NV001. Để trống để tự sinh' },
      { key: 'full_name',     label: 'Họ và tên',       required: true },
      { key: 'email',         label: 'Email',            required: true, hint: 'Dùng để đăng nhập hệ thống' },
      { key: 'phone',         label: 'Số điện thoại' },
      { key: 'role',          label: 'Vai trò',          required: true, type: 'enum', enum: ['admin', 'sales', 'warehouse', 'logistics', 'driver'], hint: 'admin / sales / warehouse / logistics / driver' },
      { key: 'pin',           label: 'Mật khẩu',        hint: 'Mặc định 123456 nếu để trống — yêu cầu đổi sau lần đầu đăng nhập' },
      { key: 'status',        label: 'Trạng thái',       type: 'enum', enum: ['active', 'inactive'], hint: 'Mặc định: active' },
    ],
    sampleRows: [
      ['NV001', 'Nguyễn Thị Hoa', 'hoa.nt@cty.vn', '0901111222', 'admin', '123456', 'active'],
      ['NV002', 'Trần Văn Nam', 'nam.tv@cty.vn', '0912222333', 'sales', '', 'active'],
      ['NV003', 'Lê Minh Khoa', 'khoa.lm@cty.vn', '0923333444', 'warehouse', '', 'active'],
      ['NV004', 'Phạm Văn Hùng', 'hung.pv@cty.vn', '0934444555', 'driver', '', 'active'],
      ['NV005', 'Hoàng Thị Lan', 'lan.ht@cty.vn', '0945555666', 'logistics', '', 'active'],
    ],
  },
]

// ─── CSV / XLSX helpers ───────────────────────────────────────────────────────

function generateCSV(config: ImportConfig): string {
  const header = config.fields.map(f => f.key).join(',')
  const sample = config.sampleRows.map(r => r.map(v => v.includes(',') ? `"${v}"` : v).join(',')).join('\n')
  return `${header}\n${sample}`
}

function downloadCSV(filename: string, content: string) {
  const bom = '﻿'
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function parseCSV(text: string): string[][] {
  const lines = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  return lines.map(line => {
    const result: string[] = []
    let current = ''; let inQuote = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') { inQuote = !inQuote }
      else if (c === ',' && !inQuote) { result.push(current.trim()); current = '' }
      else { current += c }
    }
    result.push(current.trim())
    return result
  })
}

function validateRow(row: Record<string, string>, fields: FieldDef[], lineNum: number): ParsedRow {
  const errors: string[] = []
  for (const f of fields) {
    const val = (row[f.key] ?? '').trim()
    if (f.required && !val)
      errors.push(`"${f.label}" không được để trống`)
    if (val && f.type === 'number' && isNaN(Number(val.replace(/[,.]/g, ''))))
      errors.push(`"${f.label}" phải là số`)
    if (val && f.key === 'date_elapsed_pct') {
      const n = Number(val)
      if (isNaN(n) || n < 0 || n > 100) errors.push(`"${f.label}" phải là số từ 0 đến 100`)
    }
    if (val && f.type === 'enum' && f.enum && !f.enum.includes(val))
      errors.push(`"${f.label}" phải là: ${f.enum.join(' / ')}`)
    if (val && f.type === 'date') {
      const parts = val.split('/')
      if (parts.length !== 3 || isNaN(Date.parse(`${parts[2]}-${parts[1]}-${parts[0]}`)))
        errors.push(`"${f.label}" phải theo định dạng DD/MM/YYYY`)
    }
  }
  const parsed: ParsedRow = { _line: lineNum, _status: errors.length > 0 ? 'error' : 'ok', _errors: errors }
  for (const f of fields) parsed[f.key] = (row[f.key] ?? '').trim()
  return parsed
}

function processTable(table: string[][], fields: FieldDef[]): ParsedRow[] {
  if (table.length < 2) return []
  const headers = table[0].map(h => String(h).toLowerCase().trim())
  return table.slice(1)
    .filter(r => r.some(c => String(c).trim()))
    .map((r, i) => {
      const obj: Record<string, string> = {}
      headers.forEach((h, j) => { obj[h] = String(r[j] ?? '') })
      return validateRow(obj, fields, i + 2)
    })
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function Steps({ step }: { step: number }) {
  const steps = ['Tải template', 'Upload file', 'Kiểm tra dữ liệu', 'Hoàn thành']
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((s, i) => {
        const num = i + 1
        const active = step === num
        const done = step > num
        return (
          <div key={s} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${active ? 'bg-[#0ea5e9] text-white' : done ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
              {done ? <CheckCircle2 size={13} /> : <span className="w-4 h-4 rounded-full flex items-center justify-center border-2 border-current text-[10px]">{num}</span>}
              {s}
            </div>
            {i < steps.length - 1 && <ChevronRight size={14} className="text-gray-300 mx-1" />}
          </div>
        )
      })}
    </div>
  )
}

// ─── Single import panel ──────────────────────────────────────────────────────

function ImportPanel({ config }: { config: ImportConfig }) {
  const [step, setStep] = useState(1)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleDownload = () => {
    downloadCSV(`template_${config.id}.csv`, generateCSV(config))
    setStep(s => Math.max(s, 2))
  }

  const applyTable = useCallback((table: string[][], name: string) => {
    const parsed = processTable(table, config.fields)
    if (parsed.length === 0) return
    setFileName(name)
    setRows(parsed)
    setStep(3)
  }, [config])

  const processFile = useCallback(async (file: File) => {
    if (file.name.match(/\.xlsx?$/i)) {
      // Parse Excel
      const XLSX = await import('xlsx')
      const reader = new FileReader()
      reader.onload = e => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const table: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
        applyTable(table, file.name)
      }
      reader.readAsArrayBuffer(file)
    } else if (file.name.match(/\.(csv|txt)$/i)) {
      const reader = new FileReader()
      reader.onload = e => {
        const text = e.target?.result as string
        applyTable(parseCSV(text), file.name)
      }
      reader.readAsText(file, 'UTF-8')
    } else {
      alert('Vui lòng chọn file CSV hoặc Excel (.csv, .xlsx)')
    }
  }, [applyTable])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleConfirm = async () => {
    setImporting(true)
    try {
      const { supabase } = await import('@/lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''

      const payload = okRows.map(r => {
        const obj: Record<string, string> = {}
        config.fields.forEach(f => { obj[f.key] = String(r[f.key] ?? '') })
        return obj
      })

      const res = await fetch(`/api/import/${config.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ rows: payload }),
      })
      const result: ImportResult = await res.json()
      if (!res.ok) throw new Error((result as unknown as { error: string }).error ?? 'Lỗi import')
      setImportResult(result)
      setStep(4)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Lỗi import')
    } finally {
      setImporting(false)
    }
  }

  const handleReset = () => {
    setStep(1); setRows([]); setFileName(''); setImportResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const okRows = rows.filter(r => r._status === 'ok')
  const errRows = rows.filter(r => r._status === 'error')
  const displayFields = config.fields.slice(0, 6)

  return (
    <div className="space-y-5">
      <Steps step={step} />

      {/* Step 1 */}
      <div className={`bg-white rounded-xl border-2 p-5 transition-colors ${step >= 1 ? 'border-[#0ea5e9]' : 'border-[#e5e7eb]'}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-5 h-5 rounded-full bg-[#0ea5e9] text-white text-xs flex items-center justify-center font-bold">1</span>
              <h3 className="text-sm font-bold text-[#1e2a3a]">Tải file template</h3>
            </div>
            <p className="text-xs text-gray-500 ml-7">File CSV mẫu đã có header và dữ liệu ví dụ. Mở bằng Excel, điền dữ liệu thực, lưu lại.</p>
          </div>
          <button onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-[#0ea5e9] text-white text-sm font-semibold rounded-lg hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 transition-all shrink-0">
            <Download size={14} /> Tải template .csv
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[#e5e7eb]">
                <th className="text-left py-1.5 pr-4 text-gray-400 font-semibold uppercase text-[10px]">Cột</th>
                <th className="text-left py-1.5 pr-4 text-gray-400 font-semibold uppercase text-[10px]">Tên hiển thị</th>
                <th className="text-left py-1.5 pr-4 text-gray-400 font-semibold uppercase text-[10px]">Bắt buộc</th>
                <th className="text-left py-1.5 text-gray-400 font-semibold uppercase text-[10px]">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {config.fields.map(f => (
                <tr key={f.key} className="border-b border-[#f0f2f5]">
                  <td className="py-1.5 pr-4 font-mono text-[#0ea5e9]">{f.key}</td>
                  <td className="py-1.5 pr-4 font-medium text-[#1e2a3a]">{f.label}</td>
                  <td className="py-1.5 pr-4">
                    {f.required ? <span className="text-red-500 font-semibold">Có</span> : <span className="text-gray-300">Không</span>}
                  </td>
                  <td className="py-1.5 text-gray-400">{f.hint ?? (f.enum ? f.enum.join(' / ') : '—')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Step 2 */}
      <div className={`bg-white rounded-xl border-2 p-5 transition-colors ${step >= 2 ? 'border-[#0ea5e9]' : 'border-dashed border-[#e5e7eb]'}`}>
        <div className="flex items-center gap-2 mb-3">
          <span className={`w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold ${step >= 2 ? 'bg-[#0ea5e9]' : 'bg-gray-300'}`}>2</span>
          <h3 className="text-sm font-bold text-[#1e2a3a]">Upload file đã điền</h3>
        </div>

        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-colors
            ${isDragging ? 'border-[#0ea5e9] bg-sky-50' : 'border-[#e5e7eb] hover:border-[#0ea5e9] hover:bg-gray-50'}`}>
          <FileSpreadsheet size={32} className={isDragging ? 'text-[#0ea5e9]' : 'text-gray-300'} />
          <div className="text-center">
            <p className="text-sm font-medium text-[#1e2a3a]">Kéo thả file vào đây</p>
            <p className="text-xs text-gray-400 mt-1">hoặc click để chọn · Hỗ trợ .csv và .xlsx</p>
          </div>
          {fileName && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 size={13} className="text-green-600" />
              <span className="text-xs font-medium text-green-700">{fileName}</span>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.txt" onChange={handleFileChange} className="hidden" />
        </div>
      </div>

      {/* Step 3 */}
      {step >= 3 && rows.length > 0 && (
        <div className="bg-white rounded-xl border-2 border-[#0ea5e9] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#0ea5e9] text-white text-xs flex items-center justify-center font-bold">3</span>
              <h3 className="text-sm font-bold text-[#1e2a3a]">Kiểm tra & xác nhận</h3>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-xs font-medium text-green-600"><CheckCircle2 size={13} />{okRows.length} hàng hợp lệ</span>
              {errRows.length > 0 && <span className="flex items-center gap-1 text-xs font-medium text-red-500"><XCircle size={13} />{errRows.length} hàng lỗi</span>}
              <button onClick={handleReset} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                <RotateCcw size={12} /> Làm lại
              </button>
            </div>
          </div>

          {errRows.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <p className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={13} /> {errRows.length} hàng có lỗi — sẽ bị bỏ qua khi import
              </p>
              <ul className="space-y-1">
                {errRows.slice(0, 5).map(r => (
                  <li key={r._line as number} className="text-xs text-red-600">
                    Dòng {r._line as number}: {(r._errors as string[]).join('; ')}
                  </li>
                ))}
                {errRows.length > 5 && <li className="text-xs text-red-400">...và {errRows.length - 5} lỗi khác</li>}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-[#e5e7eb]">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-[#e5e7eb]">
                  <th className="text-left px-3 py-2 text-gray-400 font-semibold uppercase text-[10px]">Dòng</th>
                  {displayFields.map(f => (
                    <th key={f.key} className="text-left px-3 py-2 text-gray-400 font-semibold uppercase text-[10px] whitespace-nowrap">{f.label}</th>
                  ))}
                  {config.fields.length > 6 && <th className="px-3 py-2 text-gray-400 text-[10px]">+{config.fields.length - 6} cột</th>}
                  <th className="px-3 py-2 text-gray-400 font-semibold uppercase text-[10px]">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map(r => (
                  <tr key={r._line as number}
                    className={`border-b border-[#f0f2f5] ${r._status === 'error' ? 'bg-red-50' : 'hover:bg-gray-50/50'}`}>
                    <td className="px-3 py-2 text-gray-400">{r._line as number}</td>
                    {displayFields.map(f => (
                      <td key={f.key} className="px-3 py-2 max-w-[120px] truncate font-medium text-[#1e2a3a]">
                        {r[f.key] as string || <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                    {config.fields.length > 6 && <td className="px-3 py-2 text-gray-400">...</td>}
                    <td className="px-3 py-2">
                      {r._status === 'ok'
                        ? <span className="flex items-center gap-1 text-green-600"><CheckCircle2 size={11} />OK</span>
                        : <span className="flex items-center gap-1 text-red-500"><XCircle size={11} />Lỗi</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <div className="px-3 py-2 bg-gray-50 text-xs text-gray-400 border-t border-[#e5e7eb]">
                Hiển thị 10/{rows.length} dòng
              </div>
            )}
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-gray-500">
              Sẽ import <strong className="text-[#1e2a3a]">{okRows.length} bản ghi</strong> hợp lệ
              {errRows.length > 0 && <>, bỏ qua {errRows.length} bản ghi lỗi</>}
            </p>
            <button
              onClick={handleConfirm}
              disabled={okRows.length === 0 || importing}
              className="flex items-center gap-2 px-5 py-2 bg-[#0ea5e9] text-white text-sm font-semibold rounded-lg hover:bg-[#0284c7] disabled:opacity-40 hover:scale-[1.02] active:scale-95 transition-all">
              {importing
                ? <><Loader2 size={14} className="animate-spin" /> Đang import...</>
                : <>Xác nhận import {okRows.length} bản ghi <ArrowRight size={14} /></>}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === 4 && importResult && (
        <div className={`border-2 rounded-xl p-8 flex flex-col items-center gap-4
          ${importResult.inserted > 0 ? 'bg-green-50 border-green-400' : 'bg-yellow-50 border-yellow-400'}`}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center
            ${importResult.inserted > 0 ? 'bg-green-100' : 'bg-yellow-100'}`}>
            <CheckCircle2 size={32} className={importResult.inserted > 0 ? 'text-green-500' : 'text-yellow-500'} />
          </div>
          <div className="text-center">
            <h3 className={`text-base font-bold ${importResult.inserted > 0 ? 'text-green-700' : 'text-yellow-700'}`}>
              {importResult.inserted > 0 ? 'Import thành công!' : 'Không có bản ghi nào được thêm'}
            </h3>
            <p className={`text-sm mt-1 ${importResult.inserted > 0 ? 'text-green-600' : 'text-yellow-600'}`}>
              Đã thêm <strong>{importResult.inserted} bản ghi</strong> {config.label.toLowerCase()} vào hệ thống
            </p>
            {importResult.errors.length > 0 && (
              <div className="mt-3 text-left bg-white/70 rounded-lg p-3 max-w-md mx-auto">
                <p className="text-xs font-semibold text-red-600 mb-1">{importResult.errors.length} bản ghi bị lỗi khi lưu:</p>
                <ul className="space-y-0.5">
                  {importResult.errors.slice(0, 5).map((e, i) => (
                    <li key={i} className="text-xs text-red-500">Dòng {e.line}: {e.message}</li>
                  ))}
                  {importResult.errors.length > 5 && <li className="text-xs text-red-400">...và {importResult.errors.length - 5} lỗi khác</li>}
                </ul>
              </div>
            )}
          </div>
          <button onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 border border-green-400 text-green-700 text-sm font-medium rounded-lg hover:bg-green-100 transition-colors">
            <RotateCcw size={14} /> Import file khác
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function NhapLieuPage() {
  const [activeTab, setActiveTab] = useState<ImportType>('products')
  const config = CONFIGS.find(c => c.id === activeTab)!

  return (
    <div>
      <PageHeader title="Nhập liệu hàng loạt" subtitle="Import dữ liệu từ Excel / CSV vào hệ thống">
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <Info size={14} className="text-blue-500" />
          <span className="text-xs text-blue-600">Import theo thứ tự: NCC → Sản phẩm → Khách hàng → Tồn kho → Nhân viên</span>
        </div>
      </PageHeader>

      <div className="grid grid-cols-5 gap-3 mb-5">
        {CONFIGS.map((c, i) => (
          <button key={c.id} onClick={() => setActiveTab(c.id)}
            className={`p-4 rounded-xl border-2 flex items-center gap-3 text-left transition-all hover:scale-[1.01] active:scale-[0.99]
              ${activeTab === c.id ? 'border-[#0ea5e9] bg-sky-50' : 'border-[#e5e7eb] bg-white hover:border-[#0ea5e9]/40'}`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
              ${activeTab === c.id ? 'bg-[#0ea5e9] text-white' : 'bg-gray-100 text-gray-500'}`}>
              {c.icon}
            </div>
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase">Bước {i + 1}</p>
              <p className={`text-sm font-bold ${activeTab === c.id ? 'text-[#0ea5e9]' : 'text-[#1e2a3a]'}`}>{c.label}</p>
            </div>
          </button>
        ))}
      </div>

      {activeTab === 'employees' && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-4 flex gap-3 mb-4">
          <AlertTriangle size={16} className="text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-yellow-700">Lưu ý bảo mật sau khi import nhân viên</p>
            <ul className="text-yellow-600 text-xs mt-1 space-y-0.5 list-disc list-inside">
              <li>Nhân viên để trống cột PIN sẽ được cấp mật khẩu mặc định <strong>123456</strong></li>
              <li>Yêu cầu tất cả nhân viên <strong>đổi mật khẩu ngay lần đăng nhập đầu tiên</strong></li>
              <li>Chỉ import nhân viên <strong>sau cùng</strong> — sau khi đã có đủ sản phẩm và kho</li>
            </ul>
          </div>
        </div>
      )}

      <ImportPanel key={activeTab} config={config} />

    </div>
  )
}
