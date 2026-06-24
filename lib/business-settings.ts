export interface NumberingRule {
  prefix: string
  format: string
  counter: number
}

export interface BusinessSettings {
  // Tab 1: Quy trình duyệt
  orderApprovalLevels: 0 | 1 | 2
  orderAutoApproveLimit: number   // 0 = tắt
  poApprovalLevels: 0 | 1 | 2
  requireWhQc: boolean
  stocktakeRequireApproval: boolean

  // Tab 2: Chính sách kho
  stockMethod: 'fefo' | 'fifo' | 'free'
  allowNegativeStock: boolean
  lowStockDays: number
  expiryWarnDays: number
  expiryWarnDays2: number
  requireLot: boolean
  requireExpiry: boolean
  trackSerial: boolean

  // Tab 3: Tài chính
  defaultVatRate: number
  priceIncludesVat: boolean
  priceRounding: number           // 0 | 1000 | 10000
  defaultCreditDays: number
  defaultCreditLimit: number      // 0 = không giới hạn
  warnCreditExceeded: boolean
  blockOverdueDays: number        // 0 = không chặn
  fiscalYearStart: number         // 1-12

  // Tab 4: Đánh số tự động
  numbering: Record<string, NumberingRule>

  // Tab 5: Logistics
  workDays: boolean[]             // [T2, T3, T4, T5, T6, T7, CN]
  workStart: string
  workEnd: string
  workSatEnd: string
  cutoffTime: string
  maxRedeliver: number
  defaultCarrier: 'ghn' | 'ghtk' | 'vnpost' | 'self'
  codEnabled: boolean
  codBearBy: 'buyer' | 'seller'
  codReconcileDays: number

  // Tab 6: Chứng từ & Mẫu in
  bankName: string
  bankAccount: string
  bankOwner: string
  invoiceTerms: string
  invoiceFooter: string
  printLogo: boolean
  printQr: boolean
  paperSize: 'a4' | 'a5' | 'thermal80'
  requireSignatureIssue: boolean
  requireSignatureInvoice: boolean
}

export const DEFAULT_NUMBERING: Record<string, NumberingRule> = {
  sales_order:    { prefix: 'SO', format: 'PREFIX-YYYYMM-####', counter: 1 },
  invoice:        { prefix: 'HD', format: 'PREFIX-YYYY-#####',  counter: 1 },
  quote:          { prefix: 'BG', format: 'PREFIX-YYYYMM-###',  counter: 1 },
  purchase_order: { prefix: 'PO', format: 'PREFIX-YYYYMM-###',  counter: 1 },
  stock_receipt:  { prefix: 'PN', format: 'PREFIX-YYYYMMDD-##', counter: 1 },
  stock_issue:    { prefix: 'PX', format: 'PREFIX-YYYYMMDD-##', counter: 1 },
  delivery:       { prefix: 'DV', format: 'PREFIX-YYYYMM-####', counter: 1 },
  product:        { prefix: 'SP', format: 'PREFIX-#####',       counter: 1 },
  customer:       { prefix: 'KH', format: 'PREFIX-###',         counter: 1 },
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  orderApprovalLevels: 1,
  orderAutoApproveLimit: 0,
  poApprovalLevels: 1,
  requireWhQc: false,
  stocktakeRequireApproval: true,

  stockMethod: 'fefo',
  allowNegativeStock: false,
  lowStockDays: 7,
  expiryWarnDays: 30,
  expiryWarnDays2: 7,
  requireLot: true,
  requireExpiry: true,
  trackSerial: false,

  defaultVatRate: 10,
  priceIncludesVat: true,
  priceRounding: 1000,
  defaultCreditDays: 30,
  defaultCreditLimit: 50000000,
  warnCreditExceeded: true,
  blockOverdueDays: 0,
  fiscalYearStart: 1,

  numbering: DEFAULT_NUMBERING,

  workDays: [true, true, true, true, true, true, false],
  workStart: '07:30',
  workEnd: '17:30',
  workSatEnd: '12:00',
  cutoffTime: '14:00',
  maxRedeliver: 2,
  defaultCarrier: 'ghn',
  codEnabled: true,
  codBearBy: 'buyer',
  codReconcileDays: 1,

  bankName: '',
  bankAccount: '',
  bankOwner: '',
  invoiceTerms: 'Thanh toán trong vòng 30 ngày kể từ ngày xuất hóa đơn.',
  invoiceFooter: 'Cảm ơn quý khách đã tin dùng sản phẩm của chúng tôi!',
  printLogo: true,
  printQr: true,
  paperSize: 'a4',
  requireSignatureIssue: false,
  requireSignatureInvoice: false,
}

export const FORMAT_OPTIONS = [
  { value: 'PREFIX-YYYYMM-####',   label: 'PREFIX-YYYYMM-####' },
  { value: 'PREFIX-YYYY-#####',    label: 'PREFIX-YYYY-#####' },
  { value: 'PREFIX-YYYYMMDD-##',   label: 'PREFIX-YYYYMMDD-##' },
  { value: 'PREFIX-YYYYMM-###',    label: 'PREFIX-YYYYMM-###' },
  { value: 'PREFIX-#####',         label: 'PREFIX-#####' },
  { value: 'PREFIX-###',           label: 'PREFIX-###' },
]

export const NUMBERING_DOCS: { key: string; label: string }[] = [
  { key: 'sales_order',    label: 'Đơn hàng bán' },
  { key: 'invoice',        label: 'Hóa đơn' },
  { key: 'quote',          label: 'Báo giá' },
  { key: 'purchase_order', label: 'Đơn mua hàng' },
  { key: 'stock_receipt',  label: 'Phiếu nhập kho' },
  { key: 'stock_issue',    label: 'Phiếu xuất kho' },
  { key: 'delivery',       label: 'Đơn vận chuyển' },
  { key: 'product',        label: 'Sản phẩm' },
  { key: 'customer',       label: 'Khách hàng' },
]

export function previewNumbering(rule: NumberingRule): string {
  const now = new Date()
  const yyyy = now.getFullYear().toString()
  const mm   = String(now.getMonth() + 1).padStart(2, '0')
  const dd   = String(now.getDate()).padStart(2, '0')
  const hashMatch = rule.format.match(/#+/)
  const hashLen = hashMatch ? hashMatch[0].length : 3
  const counter = String(rule.counter).padStart(hashLen, '0')
  return rule.format
    .replace('PREFIX',   rule.prefix)
    .replace('YYYYMMDD', yyyy + mm + dd)
    .replace('YYYYMM',   yyyy + mm)
    .replace('YYYY',     yyyy)
    .replace(/#+/,       counter)
}

const STORAGE_KEY = 'mia_business_settings'

export function saveBusinessSettings(s: BusinessSettings): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  }
}

export function loadBusinessSettings(): BusinessSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_BUSINESS_SETTINGS, numbering: { ...DEFAULT_NUMBERING } }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_BUSINESS_SETTINGS, numbering: { ...DEFAULT_NUMBERING } }
    const parsed = JSON.parse(raw)
    return {
      ...DEFAULT_BUSINESS_SETTINGS,
      ...parsed,
      numbering: { ...DEFAULT_NUMBERING, ...(parsed.numbering ?? {}) },
    }
  } catch {
    return { ...DEFAULT_BUSINESS_SETTINGS, numbering: { ...DEFAULT_NUMBERING } }
  }
}

export async function loadBusinessSettingsAsync(): Promise<BusinessSettings> {
  try {
    const res = await fetch('/api/business-settings')
    if (res.ok) {
      const data = await res.json()
      if (data && typeof data === 'object') {
        const merged = {
          ...DEFAULT_BUSINESS_SETTINGS,
          ...data,
          numbering: { ...DEFAULT_NUMBERING, ...(data.numbering ?? {}) },
        }
        saveBusinessSettings(merged)
        return merged
      }
    }
  } catch {}
  return loadBusinessSettings()
}

let _saveTimer: ReturnType<typeof setTimeout> | null = null

export function saveBusinessSettingsAsync(s: BusinessSettings): void {
  saveBusinessSettings(s)
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    fetch('/api/business-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    }).catch(() => {})
  }, 800)
}
