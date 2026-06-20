'use client'
import React, { useState, useEffect } from 'react'
import {
  GitBranch, Package, DollarSign, Hash, Truck, FileText,
  Save, ShieldX, CheckCircle2, RotateCcw, Info,
} from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { useAuth } from '@/hooks/useAuth'
import { useTenant } from '@/contexts/TenantContext'
import {
  loadBusinessSettings, saveBusinessSettings,
  type BusinessSettings, type NumberingRule,
  FORMAT_OPTIONS, NUMBERING_DOCS, previewNumbering,
} from '@/lib/business-settings'

// ── Shared UI ────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button" onClick={onChange}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer hover:opacity-90
        ${checked ? 'bg-[var(--mia-primary)]' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200
        ${checked ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
    </button>
  )
}

function Radio({ checked, onChange, label, desc }: { checked: boolean; onChange: () => void; label: string; desc?: string }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group" onClick={onChange}>
      <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors
        ${checked ? 'border-[var(--mia-primary)] bg-[var(--mia-primary)]' : 'border-gray-300 group-hover:border-gray-400'}`}>
        {checked && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>
      <div>
        <p className={`text-sm font-medium ${checked ? 'text-[#1e2a3a]' : 'text-gray-600'}`}>{label}</p>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
    </label>
  )
}

function SaveBtn({ saved, onClick, color }: { saved: boolean; onClick: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-semibold rounded-lg hover:scale-[1.02] active:scale-95 transition-all
        ${saved ? 'bg-green-500 text-white' : 'text-white'}`}
      style={!saved ? { backgroundColor: color } : {}}
    >
      {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
      {saved ? 'Đã lưu!' : 'Lưu thay đổi'}
    </button>
  )
}

function Card({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#e5e7eb] p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-[#1e2a3a]">{title}</h3>
        {desc && <p className="text-xs text-gray-400 mt-0.5">{desc}</p>}
      </div>
      {children}
    </div>
  )
}

function NumInput({ label, value, onChange, min, unit }: {
  label: string; value: number; onChange: (v: number) => void; min?: number; unit?: string
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number" min={min ?? 0} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="w-24 h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]"
        />
        {unit && <span className="text-sm text-gray-400">{unit}</span>}
      </div>
    </div>
  )
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'approval',   label: 'Quy trình duyệt',  icon: GitBranch },
  { id: 'warehouse',  label: 'Chính sách kho',    icon: Package },
  { id: 'finance',    label: 'Tài chính',          icon: DollarSign },
  { id: 'numbering',  label: 'Đánh số tự động',   icon: Hash },
  { id: 'logistics',  label: 'Logistics',          icon: Truck },
  { id: 'documents',  label: 'Chứng từ & Mẫu in', icon: FileText },
]

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — QUY TRÌNH DUYỆT
// ══════════════════════════════════════════════════════════════════════════════

function ApprovalTab({ s, set, color }: { s: BusinessSettings; set: (p: Partial<BusinessSettings>) => void; color: string }) {
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const ApprovalRadios = ({ value, onChange }: { value: 0|1|2; onChange: (v: 0|1|2) => void }) => (
    <div className="space-y-3">
      <Radio checked={value === 0} onChange={() => onChange(0)}
        label="Không cần duyệt" desc="Tạo xong là xác nhận ngay, không qua ai" />
      <Radio checked={value === 1} onChange={() => onChange(1)}
        label="1 cấp duyệt" desc="Trưởng phòng / Manager duyệt" />
      <Radio checked={value === 2} onChange={() => onChange(2)}
        label="2 cấp duyệt" desc="Manager → Giám đốc" />
    </div>
  )

  return (
    <div className="space-y-5 max-w-2xl">
      <Card title="Đơn hàng bán" desc="Ai được xác nhận đơn hàng bán trước khi xuất kho?">
        <ApprovalRadios value={s.orderApprovalLevels} onChange={v => set({ orderApprovalLevels: v })} />
        <div className="pt-1">
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">
            Tự động duyệt nếu giá trị thấp hơn
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number" min={0} value={s.orderAutoApproveLimit}
              onChange={e => set({ orderAutoApproveLimit: Number(e.target.value) })}
              className="w-40 h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]"
            />
            <span className="text-sm text-gray-400">đồng</span>
            <span className="text-xs text-gray-300 italic">(0 = không dùng)</span>
          </div>
        </div>
      </Card>

      <Card title="Đơn mua hàng" desc="Quy trình duyệt đơn đặt mua từ nhà cung cấp">
        <ApprovalRadios value={s.poApprovalLevels} onChange={v => set({ poApprovalLevels: v })} />
      </Card>

      <Card title="Kho hàng & Kiểm kê">
        <div className="space-y-4">
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-[#1e2a3a]">Yêu cầu QC khi nhập kho</p>
              <p className="text-xs text-gray-400 mt-0.5">Lô hàng phải qua kiểm tra chất lượng trước khi nhập tồn</p>
            </div>
            <Toggle checked={s.requireWhQc} onChange={() => set({ requireWhQc: !s.requireWhQc })} />
          </div>
          <div className="flex items-center justify-between py-1 border-t border-[#f0f2f5]">
            <div>
              <p className="text-sm font-medium text-[#1e2a3a]">Kiểm kê phải được duyệt</p>
              <p className="text-xs text-gray-400 mt-0.5">Kết quả kiểm kê cần admin / warehouse manager phê duyệt trước khi điều chỉnh tồn</p>
            </div>
            <Toggle checked={s.stocktakeRequireApproval} onChange={() => set({ stocktakeRequireApproval: !s.stocktakeRequireApproval })} />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <SaveBtn saved={saved} onClick={handleSave} color={color} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — CHÍNH SÁCH KHO
// ══════════════════════════════════════════════════════════════════════════════

function WarehouseTab({ s, set, color }: { s: BusinessSettings; set: (p: Partial<BusinessSettings>) => void; color: string }) {
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Card title="Phương pháp xuất kho" desc="Quy tắc chọn lô khi soạn hàng">
        <div className="space-y-3">
          <Radio checked={s.stockMethod === 'fefo'} onChange={() => set({ stockMethod: 'fefo' })}
            label="FEFO — Hết hạn trước xuất trước"
            desc="Khuyến nghị cho hàng FMCG, thực phẩm, dược phẩm" />
          <Radio checked={s.stockMethod === 'fifo'} onChange={() => set({ stockMethod: 'fifo' })}
            label="FIFO — Nhập trước xuất trước"
            desc="Phù hợp hàng không có hạn sử dụng" />
          <Radio checked={s.stockMethod === 'free'} onChange={() => set({ stockMethod: 'free' })}
            label="Tự do — Nhân viên tự chọn lô"
            desc="Linh hoạt nhất, phù hợp kho nhỏ ít SKU" />
        </div>
      </Card>

      <Card title="Kiểm soát tồn kho">
        <div className="space-y-4">
          <div className="flex items-center justify-between py-1">
            <div>
              <p className="text-sm font-medium text-[#1e2a3a]">Cho phép bán âm tồn kho</p>
              <p className="text-xs text-gray-400 mt-0.5">Khi bật: cảnh báo nhưng không chặn xuất kho khi hết hàng</p>
            </div>
            <Toggle checked={s.allowNegativeStock} onChange={() => set({ allowNegativeStock: !s.allowNegativeStock })} />
          </div>

          <div className="border-t border-[#f0f2f5] pt-4">
            <NumInput label="Ngưỡng cảnh báo tồn thấp" value={s.lowStockDays}
              onChange={v => set({ lowStockDays: v })} min={1} unit="ngày dự trữ" />
            <p className="text-xs text-gray-400 mt-1">Tự tính từ tốc độ bán trung bình — cảnh báo khi tồn &lt; X ngày</p>
          </div>
        </div>
      </Card>

      <Card title="Hàng sắp hết hạn">
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="Cảnh báo lần 1 trước" value={s.expiryWarnDays}
            onChange={v => set({ expiryWarnDays: v })} min={1} unit="ngày" />
          <NumInput label="Cảnh báo lần 2 trước" value={s.expiryWarnDays2}
            onChange={v => set({ expiryWarnDays2: v })} min={1} unit="ngày" />
        </div>
      </Card>

      <Card title="Lô hàng & Serial">
        <div className="space-y-4">
          {[
            { key: 'requireLot', label: 'Bắt buộc nhập số lô khi nhập kho', desc: 'Không cho phép nhập hàng nếu chưa có mã lô' },
            { key: 'requireExpiry', label: 'Bắt buộc nhập hạn sử dụng', desc: 'Bắt buộc với FEFO — không điền không cho nhập' },
            { key: 'trackSerial', label: 'Theo dõi serial number', desc: 'Quản lý từng đơn vị sản phẩm theo số serial riêng' },
          ].map(({ key, label, desc }, i) => (
            <div key={key} className={`flex items-center justify-between py-1 ${i > 0 ? 'border-t border-[#f0f2f5]' : ''}`}>
              <div>
                <p className="text-sm font-medium text-[#1e2a3a]">{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
              </div>
              <Toggle
                checked={s[key as keyof BusinessSettings] as boolean}
                onChange={() => set({ [key]: !s[key as keyof BusinessSettings] })}
              />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <SaveBtn saved={saved} onClick={handleSave} color={color} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — TÀI CHÍNH
// ══════════════════════════════════════════════════════════════════════════════

const MONTHS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
                'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']

function FinanceTab({ s, set, color }: { s: BusinessSettings; set: (p: Partial<BusinessSettings>) => void; color: string }) {
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Card title="Thuế & Giá">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Thuế suất VAT mặc định</label>
              <select
                value={s.defaultVatRate}
                onChange={e => set({ defaultVatRate: Number(e.target.value) })}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]"
              >
                {[0, 5, 8, 10].map(r => <option key={r} value={r}>{r}%</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Giá hiển thị</label>
              <div className="space-y-2 pt-1">
                <Radio checked={s.priceIncludesVat} onChange={() => set({ priceIncludesVat: true })}
                  label="Đã bao gồm VAT" />
                <Radio checked={!s.priceIncludesVat} onChange={() => set({ priceIncludesVat: false })}
                  label="Chưa bao gồm VAT" />
              </div>
            </div>
          </div>

          <div className="border-t border-[#f0f2f5] pt-4">
            <label className="block text-xs font-semibold text-gray-500 mb-2">Làm tròn giá</label>
            <div className="flex gap-3">
              {[
                { v: 0,     label: 'Không làm tròn' },
                { v: 1000,  label: 'Làm tròn 1.000đ' },
                { v: 10000, label: 'Làm tròn 10.000đ' },
              ].map(({ v, label }) => (
                <button key={v} onClick={() => set({ priceRounding: v })}
                  className={`px-3 py-2 rounded-lg text-sm border-2 transition-all font-medium
                    ${s.priceRounding === v
                      ? 'border-[var(--mia-primary)] bg-sky-50 text-sky-700'
                      : 'border-[#e5e7eb] text-gray-500 hover:border-gray-300'}`}
                  style={s.priceRounding === v ? { borderColor: color, color, backgroundColor: color + '15' } : {}}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Chính sách công nợ">
        <div className="grid grid-cols-2 gap-4">
          <NumInput label="Hạn thanh toán mặc định" value={s.defaultCreditDays}
            onChange={v => set({ defaultCreditDays: v })} min={0} unit="ngày" />
          <NumInput label="Hạn mức tín dụng khách mới" value={s.defaultCreditLimit}
            onChange={v => set({ defaultCreditLimit: v })} min={0} unit="đồng" />
        </div>
        <p className="text-xs text-gray-400">Hạn mức 0 = không giới hạn</p>

        <div className="space-y-3 border-t border-[#f0f2f5] pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-[#1e2a3a]">Cảnh báo khi khách vượt hạn mức</p>
            <Toggle checked={s.warnCreditExceeded} onChange={() => set({ warnCreditExceeded: !s.warnCreditExceeded })} />
          </div>

          <div className="flex items-center justify-between border-t border-[#f0f2f5] pt-3">
            <div>
              <p className="text-sm font-medium text-[#1e2a3a]">Chặn tạo đơn khi quá hạn thanh toán</p>
              <p className="text-xs text-gray-400 mt-0.5">0 = không chặn</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" min={0} value={s.blockOverdueDays}
                onChange={e => set({ blockOverdueDays: Number(e.target.value) })}
                className="w-16 h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]"
              />
              <span className="text-sm text-gray-400">ngày</span>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Kỳ kế toán">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Năm tài chính bắt đầu từ</label>
          <select
            value={s.fiscalYearStart}
            onChange={e => set({ fiscalYearStart: Number(e.target.value) })}
            className="w-48 h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]"
          >
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1.5">Ảnh hưởng đến các báo cáo YTD, dashboard tổng quan</p>
        </div>
      </Card>

      <div className="flex justify-end">
        <SaveBtn saved={saved} onClick={handleSave} color={color} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4 — ĐÁNH SỐ TỰ ĐỘNG
// ══════════════════════════════════════════════════════════════════════════════

function NumberingTab({ s, set, color }: { s: BusinessSettings; set: (p: Partial<BusinessSettings>) => void; color: string }) {
  const [saved, setSaved] = useState(false)

  const updateRule = (key: string, patch: Partial<NumberingRule>) => {
    set({ numbering: { ...s.numbering, [key]: { ...s.numbering[key], ...patch } } })
  }

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3 max-w-3xl">
        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700">
          Mã tự động áp dụng cho chứng từ tạo mới từ thời điểm lưu. Chứng từ cũ không bị ảnh hưởng.
          Counter có thể chỉnh để reset đầu năm.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden max-w-3xl">
        <div className="px-5 py-3 border-b border-[#e5e7eb] bg-gray-50">
          <div className="grid grid-cols-[160px_80px_220px_80px_1fr] gap-4 text-xs font-semibold text-gray-500 uppercase">
            <span>Loại chứng từ</span>
            <span>Prefix</span>
            <span>Định dạng</span>
            <span>Counter</span>
            <span>Ví dụ</span>
          </div>
        </div>
        <div className="divide-y divide-[#f0f2f5]">
          {NUMBERING_DOCS.map(({ key, label }) => {
            const rule = s.numbering[key] ?? { prefix: '', format: 'PREFIX-YYYYMM-####', counter: 1 }
            return (
              <div key={key} className="px-5 py-3 hover:bg-gray-50/50 transition-colors">
                <div className="grid grid-cols-[160px_80px_220px_80px_1fr] gap-4 items-center">
                  <span className="text-sm font-medium text-[#1e2a3a]">{label}</span>
                  <input
                    value={rule.prefix}
                    onChange={e => updateRule(key, { prefix: e.target.value.toUpperCase() })}
                    maxLength={6}
                    className="h-8 px-2 text-sm font-mono border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] w-full"
                  />
                  <select
                    value={rule.format}
                    onChange={e => updateRule(key, { format: e.target.value })}
                    className="h-8 px-2 text-xs font-mono border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] w-full"
                  >
                    {FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input
                    type="number" min={1} value={rule.counter}
                    onChange={e => updateRule(key, { counter: Math.max(1, Number(e.target.value)) })}
                    className="h-8 px-2 text-sm font-mono border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] w-full"
                  />
                  <span className="text-xs font-mono text-sky-600 bg-sky-50 px-2 py-1 rounded-lg w-fit">
                    {previewNumbering(rule)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex justify-end max-w-3xl">
        <SaveBtn saved={saved} onClick={handleSave} color={color} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 5 — LOGISTICS
// ══════════════════════════════════════════════════════════════════════════════

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN']
const CARRIER_OPTIONS = [
  { v: 'ghn',    label: 'Giao Hàng Nhanh (GHN)' },
  { v: 'ghtk',   label: 'GHTK' },
  { v: 'vnpost', label: 'Vietnam Post' },
  { v: 'self',   label: 'Tự giao' },
]

function LogisticsTab({ s, set, color }: { s: BusinessSettings; set: (p: Partial<BusinessSettings>) => void; color: string }) {
  const [saved, setSaved] = useState(false)

  const toggleDay = (i: number) => {
    const next = [...s.workDays]
    next[i] = !next[i]
    set({ workDays: next })
  }

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Card title="Giờ làm việc">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2">Ngày làm việc</label>
          <div className="flex gap-2">
            {DAY_LABELS.map((d, i) => (
              <button key={i} onClick={() => toggleDay(i)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all
                  ${s.workDays[i]
                    ? 'text-white border-transparent'
                    : 'border-[#e5e7eb] text-gray-400 hover:border-gray-300'}`}
                style={s.workDays[i] ? { backgroundColor: color } : {}}>
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Giờ bắt đầu (T2–T6)</label>
            <input type="time" value={s.workStart}
              onChange={e => set({ workStart: e.target.value })}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Giờ kết thúc (T2–T6)</label>
            <input type="time" value={s.workEnd}
              onChange={e => set({ workEnd: e.target.value })}
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          {s.workDays[5] && (
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Giờ kết thúc Thứ 7</label>
              <input type="time" value={s.workSatEnd}
                onChange={e => set({ workSatEnd: e.target.value })}
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
          )}
        </div>

        <div className="border-t border-[#f0f2f5] pt-4">
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Giờ cắt đơn (cut-off)</label>
          <div className="flex items-center gap-3">
            <input type="time" value={s.cutoffTime}
              onChange={e => set({ cutoffTime: e.target.value })}
              className="h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            <p className="text-xs text-gray-400">Đơn nhận trước giờ này → giao trong ngày. Sau cut-off → giao ngày hôm sau</p>
          </div>
        </div>
      </Card>

      <Card title="Đơn vị vận chuyển">
        <div className="space-y-3">
          {CARRIER_OPTIONS.map(({ v, label }) => (
            <Radio key={v} checked={s.defaultCarrier === v} onChange={() => set({ defaultCarrier: v as BusinessSettings['defaultCarrier'] })}
              label={label} />
          ))}
        </div>
      </Card>

      <Card title="Giao hàng & COD">
        <div className="space-y-4">
          <NumInput label="Số lần giao lại tối đa" value={s.maxRedeliver}
            onChange={v => set({ maxRedeliver: v })} min={0} unit="lần" />

          <div className="border-t border-[#f0f2f5] pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#1e2a3a]">Thu COD</p>
                <p className="text-xs text-gray-400 mt-0.5">Tài xế thu tiền mặt khi giao hàng</p>
              </div>
              <Toggle checked={s.codEnabled} onChange={() => set({ codEnabled: !s.codEnabled })} />
            </div>

            {s.codEnabled && (
              <>
                <div className="flex items-center justify-between border-t border-[#f0f2f5] pt-3">
                  <p className="text-sm font-medium text-[#1e2a3a]">Phí COD tính vào</p>
                  <div className="flex gap-3">
                    <Radio checked={s.codBearBy === 'buyer'} onChange={() => set({ codBearBy: 'buyer' })} label="Người mua" />
                    <Radio checked={s.codBearBy === 'seller'} onChange={() => set({ codBearBy: 'seller' })} label="Người bán" />
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-[#f0f2f5] pt-3">
                  <p className="text-sm font-medium text-[#1e2a3a]">Đối soát COD với tài xế</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">mỗi</span>
                    <input type="number" min={1} value={s.codReconcileDays}
                      onChange={e => set({ codReconcileDays: Number(e.target.value) })}
                      className="w-16 h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
                    <span className="text-sm text-gray-400">ngày</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <SaveBtn saved={saved} onClick={handleSave} color={color} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 6 — CHỨNG TỪ & MẪU IN
// ══════════════════════════════════════════════════════════════════════════════

function DocumentsTab({ s, set, color }: { s: BusinessSettings; set: (p: Partial<BusinessSettings>) => void; color: string }) {
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <Card title="Thông tin ngân hàng" desc="Hiển thị trên hóa đơn, báo giá để khách chuyển khoản">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ngân hàng</label>
            <input value={s.bankName} onChange={e => set({ bankName: e.target.value })}
              placeholder="Vietcombank – Chi nhánh TP.HCM"
              className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Số tài khoản</label>
              <input value={s.bankAccount} onChange={e => set({ bankAccount: e.target.value })}
                placeholder="0123456789"
                className="w-full h-9 px-3 text-sm font-mono border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Chủ tài khoản</label>
              <input value={s.bankOwner} onChange={e => set({ bankOwner: e.target.value })}
                placeholder="CONG TY TNHH ABC"
                className="w-full h-9 px-3 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)]" />
            </div>
          </div>
        </div>
      </Card>

      <Card title="Nội dung chứng từ">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Điều khoản thanh toán mặc định</label>
            <textarea rows={3} value={s.invoiceTerms} onChange={e => set({ invoiceTerms: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] resize-none" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ghi chú cuối hóa đơn / báo giá</label>
            <textarea rows={2} value={s.invoiceFooter} onChange={e => set({ invoiceFooter: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#e5e7eb] rounded-lg outline-none focus:border-[var(--mia-primary)] resize-none" />
          </div>
        </div>
      </Card>

      <Card title="Tùy chọn in">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-2">Khổ giấy mặc định</label>
            <div className="flex gap-3">
              {[
                { v: 'a4',        label: 'A4' },
                { v: 'a5',        label: 'A5' },
                { v: 'thermal80', label: '80mm Nhiệt (tài xế)' },
              ].map(({ v, label }) => (
                <button key={v} onClick={() => set({ paperSize: v as BusinessSettings['paperSize'] })}
                  className={`px-3 py-2 rounded-lg text-sm border-2 font-medium transition-all
                    ${s.paperSize === v
                      ? 'text-white border-transparent'
                      : 'border-[#e5e7eb] text-gray-500 hover:border-gray-300'}`}
                  style={s.paperSize === v ? { backgroundColor: color } : {}}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-[#f0f2f5] pt-4 space-y-3">
            {[
              { key: 'printLogo', label: 'In logo công ty trên chứng từ', desc: 'Hiển thị logo từ mục Thông tin công ty' },
              { key: 'printQr',   label: 'In mã QR trên chứng từ', desc: 'QR để tra cứu đơn hàng / xác nhận giao hàng' },
            ].map(({ key, label, desc }, i) => (
              <div key={key} className={`flex items-center justify-between ${i > 0 ? 'border-t border-[#f0f2f5] pt-3' : ''}`}>
                <div>
                  <p className="text-sm font-medium text-[#1e2a3a]">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
                <Toggle
                  checked={s[key as keyof BusinessSettings] as boolean}
                  onChange={() => set({ [key]: !s[key as keyof BusinessSettings] })}
                />
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Chữ ký số">
        <div className="space-y-3">
          {[
            { key: 'requireSignatureIssue',   label: 'Yêu cầu chữ ký số trên phiếu xuất kho' },
            { key: 'requireSignatureInvoice', label: 'Yêu cầu chữ ký số trên hóa đơn' },
          ].map(({ key, label }, i) => (
            <div key={key} className={`flex items-center justify-between ${i > 0 ? 'border-t border-[#f0f2f5] pt-3' : ''}`}>
              <p className="text-sm font-medium text-[#1e2a3a]">{label}</p>
              <Toggle
                checked={s[key as keyof BusinessSettings] as boolean}
                onChange={() => set({ [key]: !s[key as keyof BusinessSettings] })}
              />
            </div>
          ))}
        </div>
      </Card>

      <div className="flex justify-end">
        <SaveBtn saved={saved} onClick={handleSave} color={color} />
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

function AdminRequired() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
        <ShieldX size={28} className="text-red-500" />
      </div>
      <div className="text-center">
        <h2 className="text-base font-bold text-[#1e2a3a] mb-1">Chỉ Quản trị viên mới có quyền</h2>
        <p className="text-sm text-gray-400">Trang cài đặt nghiệp vụ yêu cầu vai trò Admin.</p>
        <p className="text-xs text-gray-300 mt-1">Liên hệ quản trị viên nếu cần điều chỉnh cấu hình.</p>
      </div>
    </div>
  )
}

export default function NghiepVuPage() {
  const { user } = useAuth()
  const tenant = useTenant()
  const color = tenant.primaryColor

  const [tab, setTab] = useState('approval')
  const [settings, setSettings] = useState<BusinessSettings | null>(null)

  useEffect(() => {
    setSettings(loadBusinessSettings())
  }, [])

  const patch = (p: Partial<BusinessSettings>) => {
    setSettings(prev => {
      if (!prev) return prev
      const next = { ...prev, ...p }
      saveBusinessSettings(next)
      return next
    })
  }

  if (!user) return null
  if (user.role !== 'admin') return <AdminRequired />
  if (!settings) return null

  const tabProps = { s: settings, set: patch, color }

  return (
    <div>
      <PageHeader
        title="Cài đặt nghiệp vụ"
        subtitle="Tùy chỉnh quy trình vận hành đặc thù của công ty"
        actions={
          <button onClick={() => { setSettings(loadBusinessSettings()) }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">
            <RotateCcw size={13} /> Tải lại
          </button>
        }
      />

      {/* Tab bar */}
      <div className="flex gap-1 bg-white border border-[#e5e7eb] rounded-xl p-1 mb-6 w-fit flex-wrap">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${active ? 'text-white shadow-sm' : 'text-gray-500 hover:text-[#1e2a3a] hover:bg-gray-50'}`}
              style={active ? { backgroundColor: color } : {}}>
              <Icon size={14} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Tab content */}
      {tab === 'approval'  && <ApprovalTab  {...tabProps} />}
      {tab === 'warehouse' && <WarehouseTab {...tabProps} />}
      {tab === 'finance'   && <FinanceTab   {...tabProps} />}
      {tab === 'numbering' && <NumberingTab {...tabProps} />}
      {tab === 'logistics' && <LogisticsTab {...tabProps} />}
      {tab === 'documents' && <DocumentsTab {...tabProps} />}
    </div>
  )
}
