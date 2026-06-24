'use client'
import { useState, useEffect, useRef } from 'react'
import { Printer, Download, Plus, X, ChevronDown, Pencil, Building2, Upload, Check } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { formatVND, formatDate } from '@/lib/utils'
import { useTenant } from '@/contexts/TenantContext'

interface LineItem { id: number; name: string; unit: string; qty: number; price: number; discount: number }
type Customer = { id: string; name: string; address: string; tax_code: string; phone: string }
type Product  = { id: string; sku: string; name: string; unit: string; sale_price: number }
type RecentInvoice = {
  id: string; invoice_no: string; invoice_date: string | null
  customer_name: string | null; customer_address: string | null
  tax_code: string | null; order_ref: string | null; note: string | null
  items: LineItem[]; vat_pct: number; subtotal: number; vat: number; total: number; status: string
}
type CompanyInfo = { name: string; address: string; tax_code: string; phone: string; email: string; logo: string }

const DEFAULT_FORM = {
  customer: '', address: '', tax_code: '', order_ref: '',
  invoice_date: new Date().toISOString().slice(0, 10), invoice_no: '', note: 'Thanh toán trong vòng 30 ngày kể từ ngày xuất hóa đơn.',
}

function calcLine(it: LineItem) { return Math.round(it.qty * it.price * (1 - it.discount / 100)) }
function genNo() {
  const d = new Date(), pad = (n: number) => String(n).padStart(2, '0')
  return `HD-${String(d.getFullYear()).slice(2)}${pad(d.getMonth()+1)}${pad(d.getDate())}-${String(Math.floor(Math.random()*900)+100)}`
}

export default function InvoicePage() {
  const tenant = useTenant()

  const tenantCompany: CompanyInfo = {
    name:     tenant.name,
    address:  tenant.address ?? '',
    tax_code: tenant.taxCode ?? '',
    phone:    tenant.phone ?? '',
    email:    '',
    logo:     tenant.logoUrl ?? '',
  }

  const [form,    setForm]    = useState({ ...DEFAULT_FORM })
  const [items,   setItems]   = useState<LineItem[]>([])
  const [nextId,  setNextId]  = useState(1)
  const [toast,   setToast]   = useState('')
  const [vatPct,  setVatPct]  = useState(10)
  const [savedInvoiceId,  setSavedInvoiceId]  = useState<string | null>(null)
  const [recentInvoices,  setRecentInvoices]  = useState<RecentInvoice[]>([])

  // Company info — khởi tạo từ tenant, cho phép chỉnh thêm (email, logo riêng)
  const [company,     setCompany]     = useState<CompanyInfo>(tenantCompany)
  const [editCompany, setEditCompany] = useState(false)
  const [editCo,      setEditCo]      = useState<CompanyInfo>(tenantCompany)
  const logoRef = useRef<HTMLInputElement>(null)

  // Autocomplete
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products,  setProducts]  = useState<Product[]>([])
  const [custOpen,  setCustOpen]  = useState(false)
  const [prodOpen,  setProdOpen]  = useState<number | null>(null)

  // Sync khi tenant thay đổi (đăng nhập công ty khác)
  useEffect(() => {
    const storageKey = `mia_invoice_company_${tenant.id}`
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try { const c = JSON.parse(saved); setCompany(c); setEditCo(c) } catch {}
    } else {
      // Lấy thẳng từ tenant nếu chưa có custom data
      setCompany(tenantCompany); setEditCo(tenantCompany)
    }
    fetch('/api/customers').then(r => r.json())
      .then(d => setCustomers(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {})
    fetch('/api/products').then(r => r.json())
      .then(d => setProducts(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {})
    fetch('/api/invoices').then(r => r.json())
      .then(d => setRecentInvoices(Array.isArray(d) ? d : [])).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id])

  const setF = (k: keyof typeof DEFAULT_FORM, v: string) => setForm(f => ({ ...f, [k]: v }))
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const subtotal = items.reduce((s, i) => s + calcLine(i), 0)
  const vat      = Math.round(subtotal * vatPct / 100)
  const total    = subtotal + vat

  const loadRecentInvoices = () => {
    fetch('/api/invoices').then(r => r.json())
      .then(d => setRecentInvoices(Array.isArray(d) ? d : [])).catch(() => {})
  }

  const handleNew = () => {
    setForm({ ...DEFAULT_FORM, invoice_no: genNo(), invoice_date: new Date().toISOString().slice(0, 10) })
    setItems([]); setNextId(1); setSavedInvoiceId(null); showToast('Đã tạo hóa đơn mới')
  }

  const handleSaveDraft = async () => {
    const no = form.invoice_no || genNo()
    if (!form.invoice_no) setF('invoice_no', no)
    const payload = {
      invoice_no: no, invoice_date: form.invoice_date,
      customer_name: form.customer, customer_address: form.address,
      tax_code: form.tax_code, order_ref: form.order_ref,
      note: form.note, items, subtotal, vat_pct: vatPct, vat, total, status: 'draft',
    }
    try {
      if (savedInvoiceId) {
        const res = await fetch(`/api/invoices/${savedInvoiceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) { showToast('Đã cập nhật bản nháp'); loadRecentInvoices() }
        else showToast('Lỗi cập nhật')
      } else {
        const res = await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          const data = await res.json()
          setSavedInvoiceId(data.id)
          showToast('Đã lưu bản nháp')
          loadRecentInvoices()
        } else {
          showToast('Lỗi lưu hóa đơn')
        }
      }
    } catch {
      showToast('Lỗi kết nối')
    }
  }

  const loadInvoice = (inv: RecentInvoice) => {
    setForm({
      customer: inv.customer_name ?? '',
      address: inv.customer_address ?? '',
      tax_code: inv.tax_code ?? '',
      order_ref: inv.order_ref ?? '',
      invoice_date: inv.invoice_date ?? new Date().toISOString().slice(0, 10),
      invoice_no: inv.invoice_no,
      note: inv.note ?? '',
    })
    const loaded = (inv.items ?? []).map((it, i) => ({ ...it, id: i + 1 }))
    setItems(loaded); setNextId(loaded.length + 1); setVatPct(inv.vat_pct ?? 10)
    setSavedInvoiceId(inv.id)
    showToast(`Đã tải ${inv.invoice_no}`)
  }
  const handleAddLine = () => { setItems(p => [...p, { id: nextId, name: '', unit: 'cái', qty: 1, price: 0, discount: 0 }]); setNextId(n => n+1) }
  const handleItemChange = (id: number, k: keyof LineItem, v: string | number) =>
    setItems(p => p.map(it => it.id === id ? { ...it, [k]: v } : it))
  const handleRemoveLine = (id: number) => setItems(p => p.filter(it => it.id !== id))

  const selectCustomer = (c: Customer) => {
    setForm(f => ({ ...f, customer: c.name, address: c.address ?? '', tax_code: c.tax_code ?? '' }))
    setCustOpen(false)
  }
  const selectProduct = (itemId: number, p: Product) => {
    handleItemChange(itemId, 'name', p.name)
    handleItemChange(itemId, 'unit', p.unit)
    handleItemChange(itemId, 'price', p.sale_price)
    setProdOpen(null)
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = () => setEditCo(c => ({ ...c, logo: reader.result as string }))
    reader.readAsDataURL(file)
  }

  const openEdit = () => { setEditCo({ ...company }); setEditCompany(true) }
  const saveCompany = () => {
    setCompany({ ...editCo })
    localStorage.setItem(`mia_invoice_company_${tenant.id}`, JSON.stringify(editCo))
    setEditCompany(false); showToast('Đã lưu thông tin công ty')
  }

  const custMatches = customers
    .filter(c => !form.customer || c.name.toLowerCase().includes(form.customer.toLowerCase()))
    .slice(0, 8)
  const prodMatches = (q: string) => products
    .filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.sku?.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8)

  // ── Redesigned invoice HTML ──────────────────────────────────────────────────
  const buildPrintContent = () => `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"><title>Hóa đơn ${form.invoice_no}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;color:#1e2a3a;background:#fff;font-size:13px}

  .header{background:#1e2a3a;padding:24px 36px;display:flex;justify-content:space-between;align-items:center}
  .co-block{display:flex;align-items:center;gap:14px}
  .co-logo{width:56px;height:56px;object-fit:contain;border-radius:8px;background:white;padding:4px}
  .co-logo-text{width:56px;height:56px;border-radius:8px;background:#0ea5e9;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:white;letter-spacing:-1px;flex-shrink:0}
  .co-name{font-size:15px;font-weight:700;color:white}
  .co-sub{font-size:10.5px;color:rgba(255,255,255,.55);margin-top:3px;line-height:1.6}
  .inv-meta{text-align:right}
  .inv-title{font-size:20px;font-weight:900;color:#0ea5e9;letter-spacing:1.5px}
  .inv-meta p{font-size:11.5px;color:rgba(255,255,255,.65);margin-top:5px;line-height:1.7}
  .inv-meta strong{color:white}

  .content{padding:24px 36px}

  .parties{display:grid;grid-template-columns:1fr 1fr;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:20px}
  .party{padding:14px 18px}
  .party:first-child{border-right:1px solid #e5e7eb;background:#f8fafc}
  .party-label{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#0ea5e9;margin-bottom:7px}
  .party h4{font-size:13px;font-weight:700;color:#1e2a3a;margin-bottom:5px}
  .party p{font-size:11.5px;color:#6b7280;line-height:1.65}

  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  thead{background:#1e2a3a}
  th{padding:9px 13px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:rgba(255,255,255,.75);text-align:left}
  th.r{text-align:right}
  tbody tr:nth-child(even){background:#f8fafc}
  td{padding:10px 13px;font-size:12px;color:#374151;border-bottom:1px solid #f1f5f9}
  td.r{text-align:right;font-weight:600;color:#1e2a3a}
  td.num{text-align:right}

  .bottom{display:flex;gap:24px;justify-content:space-between;align-items:flex-start;margin-top:4px}
  .note-box{flex:1;padding:12px 16px;background:#f0f9ff;border-left:3px solid #0ea5e9;border-radius:0 8px 8px 0;font-size:11px;color:#6b7280;line-height:1.6}
  .totals-box{width:280px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;flex-shrink:0}
  .totals-row{display:flex;justify-content:space-between;padding:9px 16px;font-size:12px;border-bottom:1px solid #f1f5f9}
  .totals-row span:last-child{font-weight:600}
  .total-final{background:#0ea5e9;border:none}
  .total-final span{color:white!important;font-weight:800!important;font-size:15px!important}

  .signatures{margin-top:40px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;border-top:1px solid #e5e7eb;padding-top:20px}
  .sign{text-align:center}
  .sign-title{font-size:10.5px;font-weight:700;color:#1e2a3a;text-transform:uppercase;letter-spacing:.5px}
  .sign-hint{font-size:9.5px;color:#9ca3af;margin-top:2px;margin-bottom:48px}
  .sign-line{border-top:1px solid #d1d5db;padding-top:6px;font-size:9.5px;font-style:italic;color:#9ca3af}

  @page{size:A4 portrait;margin:0}
  @media print{body{margin:0}}
</style></head><body>

<div class="header">
  <div class="co-block">
    ${company.logo
      ? `<img src="${company.logo}" class="co-logo" />`
      : `<div class="co-logo-text">${company.name.charAt(0)}</div>`}
    <div>
      <div class="co-name">${company.name}</div>
      <div class="co-sub">${company.address}${company.tax_code ? ` · MST: ${company.tax_code}` : ''}${company.phone ? `<br>Tel: ${company.phone}` : ''}${company.email ? ` · ${company.email}` : ''}</div>
    </div>
  </div>
  <div class="inv-meta">
    <div class="inv-title">HÓA ĐƠN BÁN HÀNG</div>
    <p>Số: <strong>${form.invoice_no}</strong></p>
    <p>Ngày: <strong>${formatDate(form.invoice_date)}</strong></p>
    ${form.order_ref ? `<p>Mã đơn hàng: <strong>${form.order_ref}</strong></p>` : ''}
  </div>
</div>

<div class="content">
  <div class="parties">
    <div class="party">
      <div class="party-label">Người bán</div>
      <h4>${company.name}</h4>
      <p>${company.address}${company.tax_code ? `<br>MST: ${company.tax_code}` : ''}${company.phone ? `<br>Tel: ${company.phone}` : ''}${company.email ? `<br>${company.email}` : ''}</p>
    </div>
    <div class="party">
      <div class="party-label">Người mua</div>
      <h4>${form.customer || '—'}</h4>
      <p>${form.address || ''}${form.tax_code ? `<br>MST: ${form.tax_code}` : ''}</p>
    </div>
  </div>

  <table>
    <thead><tr>
      <th style="width:32px">#</th>
      <th>Tên hàng hóa / dịch vụ</th>
      <th style="width:60px">ĐVT</th>
      <th class="r" style="width:52px">SL</th>
      <th class="r" style="width:110px">Đơn giá</th>
      <th class="r" style="width:52px">CK%</th>
      <th class="r" style="width:120px">Thành tiền</th>
    </tr></thead>
    <tbody>
      ${items.map((it, i) => `<tr>
        <td style="color:#9ca3af">${i+1}</td>
        <td style="font-weight:600">${it.name}</td>
        <td style="color:#6b7280">${it.unit}</td>
        <td class="num">${it.qty.toLocaleString('vi-VN')}</td>
        <td class="num">${it.price.toLocaleString('vi-VN')} đ</td>
        <td class="num">${it.discount > 0 ? it.discount+'%' : '—'}</td>
        <td class="r">${calcLine(it).toLocaleString('vi-VN')} đ</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div class="bottom">
    ${form.note ? `<div class="note-box"><strong>Ghi chú:</strong> ${form.note}</div>` : '<div></div>'}
    <div class="totals-box">
      <div class="totals-row"><span style="color:#6b7280">Tạm tính</span><span>${subtotal.toLocaleString('vi-VN')} đ</span></div>
      <div class="totals-row"><span style="color:#6b7280">VAT (${vatPct}%)</span><span>${vat.toLocaleString('vi-VN')} đ</span></div>
      <div class="totals-row total-final"><span>Tổng cộng</span><span>${total.toLocaleString('vi-VN')} đ</span></div>
    </div>
  </div>

  <div class="signatures">
    <div class="sign"><div class="sign-title">Người mua hàng</div><div class="sign-hint">(Ký, ghi rõ họ tên)</div><div class="sign-line">Ký tên</div></div>
    <div class="sign"><div class="sign-title">Người bán hàng</div><div class="sign-hint">(Ký, ghi rõ họ tên)</div><div class="sign-line">Ký tên</div></div>
    <div class="sign"><div class="sign-title">Giám đốc</div><div class="sign-hint">(Ký, đóng dấu)</div><div class="sign-line">Ký tên &amp; đóng dấu</div></div>
  </div>
</div>
</body></html>`

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=820,height=960')
    if (!win) { showToast('Trình duyệt chặn popup'); return }
    win.document.write(buildPrintContent()); win.document.close(); win.focus(); win.print()
  }

  const handleDownload = async () => {
    if (!form.customer) { showToast('Vui lòng nhập thông tin khách hàng trước'); return }
    if (items.length === 0) { showToast('Thêm ít nhất một mặt hàng trước khi xuất'); return }

    showToast('Đang tạo PDF...')

    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:white;z-index:-1'
    container.innerHTML = buildPrintContent()
    document.body.appendChild(container)

    try {
      await new Promise(r => setTimeout(r, 120))
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf').then(m => ({ jsPDF: m.jsPDF })),
      ])

      const canvas = await html2canvas(container, { scale: 2, useCORS: true, logging: false })
      const imgData = canvas.toDataURL('image/jpeg', 0.95)

      const A4_W = 210, A4_H = 297
      const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true })
      const imgH = (canvas.height * A4_W) / canvas.width

      let posY = 0, remaining = imgH
      doc.addImage(imgData, 'JPEG', 0, posY, A4_W, imgH)
      remaining -= A4_H

      while (remaining > 0) {
        posY -= A4_H
        doc.addPage()
        doc.addImage(imgData, 'JPEG', 0, posY, A4_W, imgH)
        remaining -= A4_H
      }

      doc.save(`HoaDon-${form.invoice_no || 'moi'}.pdf`)
      showToast('Đã tải file PDF thành công')
    } catch (e) {
      showToast('Lỗi tạo PDF — thử lại hoặc dùng "In hóa đơn"')
      console.error(e)
    } finally {
      document.body.removeChild(container)
    }
  }

  return (
    <div>
      <PageHeader title="Xuất hóa đơn" subtitle="Tạo và quản lý hóa đơn bán hàng">
        <button onClick={handleNew}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
          <Plus size={15} /> Hóa đơn mới
        </button>
      </PageHeader>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-4">

          {/* ── Thông tin công ty xuất hóa đơn ── */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e5e7eb]">
              <div className="flex items-center gap-2.5">
                <Building2 size={15} className="text-[var(--mia-primary)]" />
                <span className="text-sm font-semibold text-[#1e2a3a]">Thông tin công ty xuất hóa đơn</span>
              </div>
              {!editCompany && (
                <button onClick={openEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 hover:text-[var(--mia-primary)] hover:border-[var(--mia-primary)] transition-all">
                  <Pencil size={11} /> Chỉnh sửa
                </button>
              )}
            </div>

            {!editCompany ? (
              <div className="flex items-center gap-4 px-5 py-4">
                {company.logo
                  ? <img src={company.logo} alt="logo" className="w-12 h-12 object-contain rounded-lg border border-[#e5e7eb] p-1 flex-shrink-0" />
                  : <div className="w-12 h-12 bg-[#1e2a3a] rounded-lg flex items-center justify-center text-white font-bold text-lg flex-shrink-0">{company.name.charAt(0)}</div>
                }
                <div>
                  <p className="font-semibold text-[#1e2a3a] text-sm">{company.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{company.address}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {company.tax_code && `MST: ${company.tax_code}`}
                    {company.phone && ` · ${company.phone}`}
                    {company.email && ` · ${company.email}`}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {/* Logo upload */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Logo công ty</label>
                  <div className="flex items-center gap-3">
                    {editCo.logo
                      ? <img src={editCo.logo} alt="logo" className="w-14 h-14 object-contain rounded-lg border border-[#e5e7eb] p-1" />
                      : <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 border border-dashed border-gray-300">
                          <Building2 size={20} />
                        </div>
                    }
                    <div className="flex flex-col gap-2">
                      <input ref={logoRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      <button onClick={() => logoRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-[#e5e7eb] text-xs text-gray-600 rounded-lg hover:bg-gray-50 hover:border-[var(--mia-primary)] hover:text-[var(--mia-primary)] transition-all">
                        <Upload size={11} /> Tải logo lên
                      </button>
                      {editCo.logo && (
                        <button onClick={() => setEditCo(c => ({ ...c, logo: '' }))}
                          className="text-xs text-red-400 hover:text-red-600 transition-colors text-left">Xóa logo</button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    ['Tên công ty *', 'name'],
                    ['Mã số thuế',   'tax_code'],
                    ['Địa chỉ',      'address'],
                    ['Điện thoại',   'phone'],
                    ['Email',        'email'],
                  ] as [string, keyof CompanyInfo][]).map(([label, key]) => (
                    <div key={key} className={label === 'Địa chỉ' ? 'sm:col-span-2' : ''}>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">{label}</label>
                      <input value={editCo[key]} onChange={e => setEditCo(c => ({ ...c, [key]: e.target.value }))}
                        className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]" />
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setEditCompany(false)}
                    className="px-4 py-2 text-sm text-gray-500 border border-[#e5e7eb] rounded-lg hover:bg-gray-50 transition-colors">Hủy</button>
                  <button onClick={saveCompany}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#1e2a3a] text-white text-sm font-semibold rounded-lg hover:bg-[var(--mia-primary)] hover:scale-[1.02] active:scale-95 transition-all">
                    <Check size={13} /> Lưu mặc định
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Thông tin hóa đơn ── */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
            <h2 className="text-sm font-semibold text-[#1e2a3a] mb-4">Thông tin hóa đơn</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Khách hàng autocomplete */}
              <div className="relative">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Khách hàng *</label>
                <div className="relative">
                  <input value={form.customer}
                    onChange={e => { setF('customer', e.target.value); setCustOpen(true) }}
                    onFocus={() => setCustOpen(true)}
                    onBlur={() => setTimeout(() => setCustOpen(false), 150)}
                    placeholder="Tìm tên khách hàng..."
                    className="w-full px-3 py-2 pr-8 border border-[#e5e7eb] rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]" />
                  <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                {custOpen && custMatches.length > 0 && (
                  <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border border-[#e5e7eb] rounded-xl shadow-lg overflow-hidden">
                    {custMatches.map(c => (
                      <button key={c.id} onMouseDown={() => selectCustomer(c)}
                        className="w-full text-left px-3 py-2.5 hover:bg-sky-50 transition-colors border-b border-gray-50 last:border-0">
                        <p className="text-sm font-semibold text-[#1e2a3a]">{c.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{c.phone || ''}{c.address ? ` · ${c.address}` : ''}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Mã số thuế</label>
                <input value={form.tax_code} onChange={e => setF('tax_code', e.target.value)}
                  placeholder="Tự điền khi chọn khách hàng"
                  className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]" />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Địa chỉ</label>
                <input value={form.address} onChange={e => setF('address', e.target.value)}
                  placeholder="Tự điền khi chọn khách hàng"
                  className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Mã đơn hàng</label>
                <input value={form.order_ref} onChange={e => setF('order_ref', e.target.value)}
                  placeholder="VD: DH-260601-001"
                  className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Ngày hóa đơn</label>
                <input type="date" value={form.invoice_date} onChange={e => setF('invoice_date', e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]" />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Số hóa đơn</label>
                <input value={form.invoice_no} onChange={e => setF('invoice_no', e.target.value)}
                  className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]" />
              </div>
            </div>
          </div>

          {/* ── Chi tiết hàng hóa ── */}
          <div className="bg-white rounded-xl border border-[#e5e7eb]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e7eb]">
              <h2 className="text-sm font-semibold text-[#1e2a3a]">Chi tiết hàng hóa</h2>
              <button onClick={handleAddLine}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-[#e5e7eb] text-sm text-gray-600 rounded-lg hover:bg-gray-50 hover:border-[var(--mia-primary)] hover:text-[var(--mia-primary)] transition-colors">
                <Plus size={13} /> Thêm dòng
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e5e7eb] bg-gray-50">
                    {['#', 'Tên sản phẩm', 'ĐVT', 'SL', 'Đơn giá', 'CK %', 'Thành tiền', ''].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={item.id} className="border-b border-[#e5e7eb] last:border-0 hover:bg-gray-50/50">
                      <td className="px-3 py-2 text-xs text-gray-400 w-8">{idx + 1}</td>
                      <td className="px-3 py-2 min-w-[200px] relative">
                        <input value={item.name}
                          onChange={e => { handleItemChange(item.id, 'name', e.target.value); setProdOpen(item.id) }}
                          onFocus={() => setProdOpen(item.id)}
                          onBlur={() => setTimeout(() => setProdOpen(null), 150)}
                          placeholder="Tìm sản phẩm..."
                          className="w-full text-xs border-0 outline-none bg-transparent text-[#1e2a3a] font-medium placeholder:text-gray-300" />
                        {prodOpen === item.id && prodMatches(item.name).length > 0 && (
                          <div className="absolute z-30 left-0 top-full mt-0.5 w-72 bg-white border border-[#e5e7eb] rounded-xl shadow-lg overflow-hidden">
                            {prodMatches(item.name).map(p => (
                              <button key={p.id} onMouseDown={() => selectProduct(item.id, p)}
                                className="w-full text-left px-3 py-2.5 hover:bg-sky-50 transition-colors border-b border-gray-50 last:border-0">
                                <p className="text-xs font-semibold text-[#1e2a3a]">{p.name}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{p.sku} · {p.unit} · {formatVND(p.sale_price)}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 w-16">
                        <input value={item.unit} onChange={e => handleItemChange(item.id, 'unit', e.target.value)}
                          className="w-full text-xs border-0 outline-none bg-transparent text-gray-500" />
                      </td>
                      <td className="px-3 py-2 w-16">
                        <input type="number" min={0} value={item.qty} onChange={e => handleItemChange(item.id, 'qty', Number(e.target.value))}
                          className="w-full text-xs border-0 outline-none bg-transparent text-gray-700" />
                      </td>
                      <td className="px-3 py-2 w-28">
                        <input type="number" min={0} value={item.price} onChange={e => handleItemChange(item.id, 'price', Number(e.target.value))}
                          className="w-full text-xs border-0 outline-none bg-transparent text-gray-700" />
                      </td>
                      <td className="px-3 py-2 w-14">
                        <input type="number" min={0} max={100} value={item.discount} onChange={e => handleItemChange(item.id, 'discount', Number(e.target.value))}
                          className="w-full text-xs border-0 outline-none bg-transparent text-gray-700" />
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold text-[#1e2a3a] whitespace-nowrap">{formatVND(calcLine(item))}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => handleRemoveLine(item.id)} className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors">
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">Chưa có hàng hóa — nhấn "Thêm dòng"</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end p-5 border-t border-[#e5e7eb]">
              <div className="w-64 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tạm tính:</span>
                  <span className="font-medium text-[#1e2a3a]">{formatVND(subtotal)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500 flex items-center gap-1.5">
                    VAT
                    <span className="inline-flex items-center border border-gray-200 rounded-md overflow-hidden">
                      <input type="number" min={0} max={100} value={vatPct}
                        onChange={e => setVatPct(Math.max(0, Math.min(100, Number(e.target.value))))}
                        className="w-10 text-center text-xs px-1 py-0.5 outline-none border-0 bg-white font-semibold text-[#1e2a3a]" />
                      <span className="px-1 text-xs text-gray-400 bg-gray-50 border-l border-gray-200">%</span>
                    </span>
                  </span>
                  <span className="font-medium text-[#1e2a3a]">{formatVND(vat)}</span>
                </div>
                <div className="flex justify-between text-base font-bold border-t border-[#e5e7eb] pt-2">
                  <span className="text-[#1e2a3a]">Tổng cộng:</span>
                  <span className="text-[var(--mia-primary)]">{formatVND(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Note + Actions */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
            <label className="block text-sm font-semibold text-[#1e2a3a] mb-2">Ghi chú / Điều khoản</label>
            <textarea rows={3} value={form.note} onChange={e => setF('note', e.target.value)}
              className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)] resize-none" />
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={handleSaveDraft}
                className="flex items-center gap-1.5 px-4 py-2 border border-[#e5e7eb] text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 hover:scale-[1.02] active:scale-95 transition-all">
                {savedInvoiceId ? 'Cập nhật nháp' : 'Lưu nháp'}
              </button>
              <button onClick={handlePrint}
                className="flex items-center gap-1.5 px-4 py-2 border border-[#e5e7eb] text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 hover:scale-[1.02] active:scale-95 transition-all">
                <Printer size={14} /> In hóa đơn
              </button>
              <button onClick={handleDownload}
                className="flex items-center gap-1.5 px-4 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 hover:scale-[1.02] active:scale-95 transition-all">
                <Download size={14} /> Xuất PDF
              </button>
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
            <h2 className="text-sm font-semibold text-[#1e2a3a] mb-3">Hóa đơn đã lưu</h2>
            {recentInvoices.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">Chưa có hóa đơn nào được lưu</p>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-0.5">
                {recentInvoices.map(inv => (
                  <button key={inv.id} onClick={() => loadInvoice(inv)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-all ${
                      savedInvoiceId === inv.id
                        ? 'border-[var(--mia-primary)] bg-sky-50'
                        : 'border-[#e5e7eb] hover:bg-gray-50'
                    }`}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-[#1e2a3a] truncate">{inv.invoice_no}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                        inv.status === 'draft' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                      }`}>{inv.status === 'draft' ? 'nháp' : 'đã xuất'}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                      {inv.customer_name || '—'} · {formatVND(inv.total)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
            <h2 className="text-sm font-semibold text-[#1e2a3a] mb-4">Chứng từ hiện tại</h2>
            <div className="space-y-2">
              {[
                ['Số hóa đơn', form.invoice_no],
                ['Ngày lập', form.invoice_date ? formatDate(form.invoice_date) : '—'],
                ['Mã đơn hàng', form.order_ref || '—'],
                ['Khách hàng', form.customer || '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-1.5 border-b border-[#e5e7eb] last:border-0">
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className="text-xs font-medium text-[#1e2a3a] max-w-[140px] text-right truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
            <h2 className="text-sm font-semibold text-[#1e2a3a] mb-4">Tổng kết hóa đơn</h2>
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">Số dòng hàng</span>
                <span className="text-sm font-bold text-[#1e2a3a]">{items.length}</span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">Tổng số lượng</span>
                <span className="text-sm font-bold text-[#1e2a3a]">{items.reduce((s, i) => s + i.qty, 0).toLocaleString('vi-VN')}</span>
              </div>
              <div className="bg-sky-50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">Tổng tiền hàng</span>
                <span className="text-sm font-bold text-[var(--mia-primary)]">{formatVND(subtotal)}</span>
              </div>
              <div className="bg-sky-50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">Tổng thanh toán</span>
                <span className="text-base font-bold text-[var(--mia-primary)]">{formatVND(total)}</span>
              </div>
            </div>
          </div>

          {form.customer && (
            <div className="bg-gradient-to-br from-[#1e2a3a] to-[#1a3a5c] rounded-xl p-5 text-white">
              <p className="text-xs text-white/60 mb-1">Người nhận</p>
              <p className="font-bold text-base">{form.customer}</p>
              {form.address && (<><p className="text-xs text-white/60 mt-3 mb-1">Địa chỉ</p><p className="text-sm text-white/80">{form.address}</p></>)}
              {form.tax_code && (<><p className="text-xs text-white/60 mt-3 mb-1">MST</p><p className="text-sm text-white/80">{form.tax_code}</p></>)}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#1e2a3a] text-white text-sm px-4 py-3 rounded-xl shadow-xl">
          {toast}
        </div>
      )}
    </div>
  )
}
