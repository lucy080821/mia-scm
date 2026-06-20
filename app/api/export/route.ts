import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import ExcelJS from 'exceljs'

export const dynamic = 'force-dynamic'

type Module = 'ban-hang' | 'kho-hang' | 'logistics' | 'mua-hang' | 'tai-chinh' | 'all'

const ROLE_ALLOWED: Record<string, Module[]> = {
  admin:     ['ban-hang', 'kho-hang', 'logistics', 'mua-hang', 'tai-chinh', 'all'],
  sales:     ['ban-hang'],
  warehouse: ['kho-hang'],
  logistics: ['logistics'],
  driver:    ['logistics'],
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getExportUser(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null

  let dbProfile: { id: string; role: string; tenant_id: string | null } | null = null
  const { data: byId } = await supabaseAdmin.from('users').select('id, role, tenant_id').eq('id', user.id).maybeSingle()
  if (byId) { dbProfile = byId }
  else if (user.email) {
    const { data: byEmail } = await supabaseAdmin.from('users').select('id, role, tenant_id').eq('email', user.email).maybeSingle()
    dbProfile = byEmail
  }
  return { dbId: dbProfile?.id ?? user.id, role: dbProfile?.role ?? 'sales', email: user.email ?? '', tenantId: dbProfile?.tenant_id ?? null }
}

// ── Excel styles ──────────────────────────────────────────────────────────────

const HDR_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E2A3A' } }
const ALT_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } }
const HDR_FONT: Partial<ExcelJS.Font> = { name: 'Times New Roman', bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
const BODY_FONT: Partial<ExcelJS.Font> = { name: 'Times New Roman', size: 10 }
const HDR_BORDER: Partial<ExcelJS.Borders> = { bottom: { style: 'medium', color: { argb: 'FF0EA5E9' } } }
const CELL_BORDER: Partial<ExcelJS.Borders> = { bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } } }

type ColDef = { label: string; key: string; width?: number; numFmt?: string; align?: ExcelJS.Alignment['horizontal'] }

function makeSheet(
  wb: ExcelJS.Workbook,
  name: string,
  cols: ColDef[],
  rows: Record<string, string | number | null | undefined>[],
) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }] })

  ws.columns = cols.map(c => ({ header: c.label, key: c.key, width: c.width ?? 16 }))

  // Style header
  const hdr = ws.getRow(1)
  hdr.height = 28
  hdr.eachCell(cell => {
    cell.fill = HDR_FILL
    cell.font = HDR_FONT
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
    cell.border = HDR_BORDER
  })

  // Data rows
  rows.forEach((row, i) => {
    const wsRow = ws.addRow(row)
    wsRow.height = 18
    const isAlt = i % 2 === 1
    wsRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
      cell.font = BODY_FONT
      cell.alignment = { vertical: 'middle', horizontal: cols[colNum - 1]?.align ?? 'left' }
      cell.border = CELL_BORDER
      if (isAlt) cell.fill = ALT_FILL
      const nf = cols[colNum - 1]?.numFmt
      if (nf) cell.numFmt = nf
    })
    wsRow.commit()
  })

  return ws
}

// ── Status maps ───────────────────────────────────────────────────────────────

const ORDER_STATUS: Record<string, string> = {
  new: 'Mới', confirmed: 'Đã xác nhận', picking: 'Đang lấy hàng',
  delivering: 'Đang giao', completed: 'Hoàn thành', cancelled: 'Đã hủy', failed: 'Thất bại',
}
const PAY_STATUS: Record<string, string> = {
  unpaid: 'Chưa thanh toán', partial: 'TT một phần', paid: 'Đã thanh toán',
}
const DELIVERY_STATUS: Record<string, string> = {
  pending: 'Chờ lấy', picking: 'Đang lấy', delivering: 'Đang giao',
  delivered: 'Đã giao', delayed: 'Giao trễ', failed: 'Thất bại',
}
const PO_STATUS: Record<string, string> = {
  draft: 'Nháp', pending: 'Chờ duyệt', sent: 'Đã gửi NCC', delivering: 'Đang giao', completed: 'Hoàn thành',
}
const STOCK_STATUS: Record<string, string> = {
  pending: 'Chờ', qc_check: 'Kiểm QC', approved: 'Đã duyệt', completed: 'Hoàn thành', cancelled: 'Đã hủy',
}
const VEH_STATUS: Record<string, string> = {
  available: 'Sẵn sàng', on_trip: 'Đang chạy', maintenance: 'Bảo trì', inactive: 'Ngưng',
}
const CARRIER: Record<string, string> = { own: 'Xe nhà', ghn: 'GHN', ghtk: 'GHTK' }
const CUST_STATUS: Record<string, string> = { active: 'Hoạt động', paused: 'Tạm dừng', inactive: 'Ngưng' }
const EXP_CAT: Record<string, string> = {
  salary: 'Lương', warehouse_rent: 'Thuê kho', fuel: 'Nhiên liệu', maintenance: 'Bảo dưỡng', other: 'Khác',
}
const PAY_METHOD: Record<string, string> = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', cod: 'COD' }
const DRV_STATUS: Record<string, string> = { available: 'Sẵn sàng', on_trip: 'Đang giao', inactive: 'Ngưng' }

const VND = '#,##0'
function fmtD(v: string | null | undefined) { return v?.slice(0, 10).split('-').reverse().join('/') ?? '' }
function fmtN(v: number | null | undefined) { return v ?? 0 }

// ── Module: BAN HÀNG ──────────────────────────────────────────────────────────

async function buildBanHang(wb: ExcelJS.Workbook, from: string, to: string, role: string, dbId: string, tenantId: string | null) {
  const isSales = role === 'sales'

  // Sheet 1: Đơn hàng bán
  let ordQ = supabaseAdmin
    .from('sales_orders')
    .select('id, code, order_date, delivery_date, total_amount, discount, vat_amount, final_amount, payment_status, status, note, customer:customers(name), assigned:users(full_name)')
    .gte('order_date', from).lte('order_date', to).order('order_date', { ascending: false })
  if (tenantId) ordQ = ordQ.eq('tenant_id', tenantId)
  if (isSales) ordQ = ordQ.eq('assigned_to', dbId)
  const { data: orders } = await ordQ

  makeSheet(wb, 'Đơn hàng bán', [
    { label: 'Mã đơn',          key: 'code',           width: 20 },
    { label: 'Ngày đặt',        key: 'order_date',     width: 12, align: 'center' },
    { label: 'Ngày giao',       key: 'delivery_date',  width: 12, align: 'center' },
    { label: 'Khách hàng',      key: 'customer',       width: 28 },
    { label: 'Tổng tiền (đ)',   key: 'total_amount',   width: 16, numFmt: VND, align: 'right' },
    { label: 'Chiết khấu (đ)',  key: 'discount',       width: 15, numFmt: VND, align: 'right' },
    { label: 'VAT (đ)',         key: 'vat_amount',     width: 14, numFmt: VND, align: 'right' },
    { label: 'Thành tiền (đ)',  key: 'final_amount',   width: 16, numFmt: VND, align: 'right' },
    { label: 'TT thanh toán',   key: 'payment_status', width: 20 },
    { label: 'Trạng thái',      key: 'status',         width: 18 },
    { label: 'Nhân viên',       key: 'assigned',       width: 22 },
    { label: 'Ghi chú',         key: 'note',           width: 32 },
  ], (orders ?? []).map(o => ({
    code: o.code, order_date: fmtD(o.order_date), delivery_date: fmtD(o.delivery_date),
    customer: (o.customer as any)?.name ?? '',
    total_amount: fmtN(o.total_amount), discount: fmtN(o.discount),
    vat_amount: fmtN(o.vat_amount), final_amount: fmtN(o.final_amount),
    payment_status: PAY_STATUS[o.payment_status] ?? o.payment_status,
    status: ORDER_STATUS[o.status] ?? o.status,
    assigned: (o.assigned as any)?.full_name ?? '', note: o.note ?? '',
  })))

  // Sheet 2: Chi tiết đơn hàng
  const orderIds = (orders ?? []).map(o => (o as any).id).filter(Boolean)
  if (orderIds.length > 0) {
    const { data: items } = await supabaseAdmin
      .from('sales_order_items')
      .select('order_id, quantity, unit_price, discount_pct, subtotal, product:products(name, sku)')
      .in('order_id', orderIds)
    const codeMap = Object.fromEntries((orders ?? []).map(o => [(o as any).id, o.code]))
    makeSheet(wb, 'Chi tiết đơn hàng', [
      { label: 'Mã đơn',       key: 'order_code',   width: 20 },
      { label: 'SKU',          key: 'sku',          width: 14 },
      { label: 'Sản phẩm',    key: 'product',      width: 30 },
      { label: 'Số lượng',    key: 'quantity',     width: 12, align: 'center' },
      { label: 'Đơn giá (đ)', key: 'unit_price',   width: 16, numFmt: VND, align: 'right' },
      { label: 'CK (%)',      key: 'discount_pct', width: 10, align: 'center' },
      { label: 'Thành tiền (đ)', key: 'subtotal',  width: 16, numFmt: VND, align: 'right' },
    ], (items ?? []).map(i => ({
      order_code: codeMap[(i as any).order_id] ?? '',
      sku: (i.product as any)?.sku ?? '',
      product: (i.product as any)?.name ?? '',
      quantity: fmtN(i.quantity), unit_price: fmtN(i.unit_price),
      discount_pct: fmtN(i.discount_pct), subtotal: fmtN(i.subtotal),
    })))
  }

  // Sheet 3: Khách hàng
  let cusQ = supabaseAdmin
    .from('customers')
    .select('code, name, short_name, type, tax_code, phone, email, address, credit_limit, payment_term, status')
    .order('code')
  if (tenantId) cusQ = cusQ.eq('tenant_id', tenantId)
  if (isSales) cusQ = cusQ.eq('assigned_to', dbId)
  const { data: custs } = await cusQ
  makeSheet(wb, 'Khách hàng', [
    { label: 'Mã KH',          key: 'code',         width: 12 },
    { label: 'Tên khách hàng', key: 'name',         width: 30 },
    { label: 'Tên ngắn',      key: 'short_name',    width: 16 },
    { label: 'Loại',          key: 'type',          width: 14 },
    { label: 'MST',            key: 'tax_code',     width: 15 },
    { label: 'Điện thoại',    key: 'phone',         width: 15 },
    { label: 'Email',          key: 'email',        width: 26 },
    { label: 'Địa chỉ',       key: 'address',      width: 38 },
    { label: 'Hạn mức TD (đ)', key: 'credit_limit', width: 16, numFmt: VND, align: 'right' },
    { label: 'Ngày TT',       key: 'payment_term',  width: 14 },
    { label: 'Trạng thái',    key: 'status',        width: 14 },
  ], (custs ?? []).map(c => ({
    code: c.code, name: c.name, short_name: c.short_name ?? '',
    type: c.type === 'company' ? 'Công ty' : c.type === 'individual' ? 'Cá nhân' : c.type ?? '',
    tax_code: c.tax_code ?? '', phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '',
    credit_limit: fmtN(c.credit_limit),
    payment_term: c.payment_term ? `${c.payment_term} ngày` : '',
    status: CUST_STATUS[c.status] ?? c.status,
  })))
}

// ── Module: KHO HÀNG ─────────────────────────────────────────────────────────

async function buildKhoHang(wb: ExcelJS.Workbook, from: string, to: string, tenantId: string | null) {
  const invQ = supabaseAdmin.from('inventory')
    .select('quantity, expiry_date, lot_number, updated_at, product:products(name, sku, unit), warehouse:warehouses(name)')
    .order('updated_at', { ascending: false })
  const { data: inv } = await (tenantId ? invQ.eq('tenant_id', tenantId) : invQ)
  makeSheet(wb, 'Tồn kho', [
    { label: 'SKU',          key: 'sku',       width: 14 },
    { label: 'Sản phẩm',    key: 'product',   width: 30 },
    { label: 'Kho',          key: 'warehouse', width: 22 },
    { label: 'Lô hàng',     key: 'lot',       width: 14 },
    { label: 'Đơn vị',      key: 'unit',      width: 10, align: 'center' },
    { label: 'Số lượng',    key: 'quantity',  width: 13, align: 'right' },
    { label: 'HSD',          key: 'expiry',   width: 12, align: 'center' },
    { label: 'Cập nhật',    key: 'updated',  width: 14, align: 'center' },
  ], (inv ?? []).map(i => ({
    sku: (i.product as any)?.sku ?? '', product: (i.product as any)?.name ?? '',
    warehouse: (i.warehouse as any)?.name ?? '', lot: i.lot_number ?? '',
    unit: (i.product as any)?.unit ?? '', quantity: fmtN(i.quantity),
    expiry: fmtD(i.expiry_date), updated: fmtD(i.updated_at),
  })))

  const prodsQ = supabaseAdmin.from('products')
    .select('sku, name, unit, purchase_price, sale_price, min_stock, expiry_days, status, supplier:suppliers(name)')
    .order('sku')
  const { data: prods } = await (tenantId ? prodsQ.eq('tenant_id', tenantId) : prodsQ)
  makeSheet(wb, 'Sản phẩm', [
    { label: 'SKU',              key: 'sku',            width: 14 },
    { label: 'Tên sản phẩm',    key: 'name',           width: 30 },
    { label: 'Đơn vị',          key: 'unit',           width: 10, align: 'center' },
    { label: 'Nhà cung cấp',    key: 'supplier',       width: 24 },
    { label: 'Giá nhập (đ)',    key: 'purchase_price', width: 16, numFmt: VND, align: 'right' },
    { label: 'Giá bán (đ)',     key: 'sale_price',     width: 16, numFmt: VND, align: 'right' },
    { label: 'Tồn tối thiểu',  key: 'min_stock',      width: 14, align: 'right' },
    { label: 'HSD (ngày)',      key: 'expiry_days',    width: 12, align: 'center' },
    { label: 'Trạng thái',      key: 'status',         width: 14 },
  ], (prods ?? []).map(p => ({
    sku: p.sku, name: p.name, unit: p.unit,
    supplier: (p.supplier as any)?.name ?? '',
    purchase_price: fmtN(p.purchase_price), sale_price: fmtN(p.sale_price),
    min_stock: fmtN(p.min_stock), expiry_days: p.expiry_days ?? '',
    status: p.status === 'active' ? 'Hoạt động' : 'Ngưng',
  })))

  const receiptsQ = supabaseAdmin.from('stock_receipts')
    .select('code, receipt_date, total_amount, status, supplier:suppliers(name), warehouse:warehouses(name), created_by:users(full_name)')
    .gte('receipt_date', from).lte('receipt_date', to).order('receipt_date', { ascending: false })
  const { data: receipts } = await (tenantId ? receiptsQ.eq('tenant_id', tenantId) : receiptsQ)
  makeSheet(wb, 'Nhập kho', [
    { label: 'Mã phiếu',    key: 'code',       width: 22 },
    { label: 'Ngày nhập',   key: 'date',       width: 12, align: 'center' },
    { label: 'Nhà CC',      key: 'supplier',   width: 26 },
    { label: 'Kho nhập',    key: 'warehouse',  width: 22 },
    { label: 'Tổng tiền (đ)', key: 'total',   width: 16, numFmt: VND, align: 'right' },
    { label: 'Trạng thái',  key: 'status',     width: 16 },
    { label: 'Người tạo',   key: 'created_by', width: 22 },
  ], (receipts ?? []).map(r => ({
    code: r.code, date: fmtD(r.receipt_date),
    supplier: (r.supplier as any)?.name ?? '', warehouse: (r.warehouse as any)?.name ?? '',
    total: fmtN(r.total_amount), status: STOCK_STATUS[r.status] ?? r.status,
    created_by: (r.created_by as any)?.full_name ?? '',
  })))

  const issuesQ = supabaseAdmin.from('stock_issues')
    .select('code, issue_date, status, sales_order:sales_orders(code), warehouse:warehouses(name), created_by:users(full_name)')
    .gte('issue_date', from).lte('issue_date', to).order('issue_date', { ascending: false })
  const { data: issues } = await (tenantId ? issuesQ.eq('tenant_id', tenantId) : issuesQ)
  makeSheet(wb, 'Xuất kho', [
    { label: 'Mã phiếu',   key: 'code',       width: 22 },
    { label: 'Ngày xuất',  key: 'date',       width: 12, align: 'center' },
    { label: 'Đơn hàng',   key: 'order',      width: 22 },
    { label: 'Kho xuất',   key: 'warehouse',  width: 22 },
    { label: 'Trạng thái', key: 'status',     width: 16 },
    { label: 'Người tạo',  key: 'created_by', width: 22 },
  ], (issues ?? []).map(i => ({
    code: i.code, date: fmtD(i.issue_date),
    order: (i.sales_order as any)?.code ?? '', warehouse: (i.warehouse as any)?.name ?? '',
    status: STOCK_STATUS[i.status] ?? i.status, created_by: (i.created_by as any)?.full_name ?? '',
  })))
}

// ── Module: LOGISTICS ─────────────────────────────────────────────────────────

async function buildLogistics(wb: ExcelJS.Workbook, from: string, to: string, tenantId: string | null) {
  const SEL = 'id, code, route, planned_date, actual_date, distance_km, freight_cost, carrier_type, status, sales_order:sales_orders(code), driver:drivers(name), vehicle:vehicles(plate)'
  const toTs = to + 'T23:59:59'
  const [{ data: byPlanned }, { data: byActual }] = await Promise.all([
    tenantId
      ? supabaseAdmin.from('deliveries').select(SEL).eq('tenant_id', tenantId).gte('planned_date', from).lte('planned_date', toTs)
      : supabaseAdmin.from('deliveries').select(SEL).gte('planned_date', from).lte('planned_date', toTs),
    tenantId
      ? supabaseAdmin.from('deliveries').select(SEL).eq('tenant_id', tenantId).gte('actual_date', from).lte('actual_date', toTs)
      : supabaseAdmin.from('deliveries').select(SEL).gte('actual_date', from).lte('actual_date', toTs),
  ])
  const seen = new Set<string>()
  const deliveries = [...(byPlanned ?? []), ...(byActual ?? [])].filter(d => {
    if (seen.has((d as any).id)) return false; seen.add((d as any).id); return true
  }).sort((a, b) => {
    const da = (a as any).actual_date ?? (a as any).planned_date ?? ''
    const db = (b as any).actual_date ?? (b as any).planned_date ?? ''
    return db.localeCompare(da)
  })

  makeSheet(wb, 'Đơn vận chuyển', [
    { label: 'Mã VC',          key: 'code',     width: 20 },
    { label: 'Đơn hàng',       key: 'order',    width: 20 },
    { label: 'Tuyến đường',    key: 'route',    width: 26 },
    { label: 'Tài xế',        key: 'driver',   width: 20 },
    { label: 'Phương tiện',   key: 'vehicle',  width: 14 },
    { label: 'Ngày KH',       key: 'planned',  width: 12, align: 'center' },
    { label: 'Ngày TT',       key: 'actual',   width: 12, align: 'center' },
    { label: 'K.cách (km)',   key: 'distance', width: 13, align: 'right' },
    { label: 'Cước phí (đ)',  key: 'freight',  width: 15, numFmt: VND, align: 'right' },
    { label: 'Loại VC',       key: 'carrier',  width: 12 },
    { label: 'Trạng thái',    key: 'status',   width: 16 },
  ], deliveries.map(d => ({
    code: d.code, order: (d.sales_order as any)?.code ?? '', route: d.route ?? '',
    driver: (d.driver as any)?.name ?? '', vehicle: (d.vehicle as any)?.plate ?? '',
    planned: fmtD(d.planned_date), actual: fmtD(d.actual_date),
    distance: d.distance_km ?? '', freight: fmtN(d.freight_cost),
    carrier: CARRIER[d.carrier_type] ?? d.carrier_type,
    status: DELIVERY_STATUS[d.status] ?? d.status,
  })))

  const vehQ = supabaseAdmin.from('vehicles').select('plate, type, brand, capacity_kg, fuel_level, insurance_expiry, status').order('plate')
  const { data: vehicles } = await (tenantId ? vehQ.eq('tenant_id', tenantId) : vehQ)
  makeSheet(wb, 'Phương tiện', [
    { label: 'Biển số',        key: 'plate',     width: 14 },
    { label: 'Loại xe',       key: 'type',      width: 14 },
    { label: 'Thương hiệu',   key: 'brand',     width: 16 },
    { label: 'Tải trọng (kg)', key: 'capacity', width: 14, align: 'right' },
    { label: 'Nhiên liệu (%)', key: 'fuel',     width: 14, align: 'center' },
    { label: 'HSD bảo hiểm',  key: 'insurance', width: 16, align: 'center' },
    { label: 'Trạng thái',    key: 'status',    width: 14 },
  ], (vehicles ?? []).map(v => ({
    plate: v.plate, type: v.type ?? '', brand: v.brand ?? '',
    capacity: fmtN(v.capacity_kg), fuel: fmtN(v.fuel_level),
    insurance: fmtD(v.insurance_expiry), status: VEH_STATUS[v.status] ?? v.status,
  })))

  const drvQ = supabaseAdmin.from('drivers').select('name, phone, license_type, rating, total_trips, status, vehicle:vehicles(plate)').order('name')
  const { data: drivers } = await (tenantId ? drvQ.eq('tenant_id', tenantId) : drvQ)
  makeSheet(wb, 'Tài xế', [
    { label: 'Họ tên',       key: 'name',    width: 24 },
    { label: 'SĐT',          key: 'phone',   width: 15 },
    { label: 'Hạng bằng',   key: 'license', width: 12, align: 'center' },
    { label: 'Xe gắn',      key: 'vehicle', width: 14 },
    { label: 'Đánh giá',    key: 'rating',  width: 11, align: 'center' },
    { label: 'Tổng chuyến', key: 'trips',   width: 13, align: 'center' },
    { label: 'Trạng thái',  key: 'status',  width: 14 },
  ], (drivers ?? []).map(d => ({
    name: d.name, phone: d.phone ?? '', license: d.license_type ?? '',
    vehicle: (d.vehicle as any)?.plate ?? '', rating: d.rating ?? '',
    trips: fmtN(d.total_trips), status: DRV_STATUS[d.status] ?? d.status,
  })))
}

// ── Module: MUA HÀNG ─────────────────────────────────────────────────────────

async function buildMuaHang(wb: ExcelJS.Workbook, from: string, to: string, tenantId: string | null) {
  const posQ = supabaseAdmin.from('purchase_orders')
    .select('code, order_date, expected_date, total_amount, status, note, supplier:suppliers(name), created_by:users(full_name)')
    .gte('order_date', from).lte('order_date', to).order('order_date', { ascending: false })
  const { data: pos } = await (tenantId ? posQ.eq('tenant_id', tenantId) : posQ)
  makeSheet(wb, 'Đơn mua hàng', [
    { label: 'Mã PO',          key: 'code',       width: 22 },
    { label: 'Ngày đặt',      key: 'order_date', width: 12, align: 'center' },
    { label: 'Nhà CC',        key: 'supplier',   width: 28 },
    { label: 'Ngày dự kiến',  key: 'expected',   width: 14, align: 'center' },
    { label: 'Tổng tiền (đ)', key: 'total',      width: 16, numFmt: VND, align: 'right' },
    { label: 'Trạng thái',    key: 'status',     width: 16 },
    { label: 'Người tạo',     key: 'created_by', width: 22 },
    { label: 'Ghi chú',       key: 'note',       width: 32 },
  ], (pos ?? []).map(p => ({
    code: p.code, order_date: fmtD(p.order_date),
    supplier: (p.supplier as any)?.name ?? '', expected: fmtD(p.expected_date),
    total: fmtN(p.total_amount), status: PO_STATUS[p.status] ?? p.status,
    created_by: (p.created_by as any)?.full_name ?? '', note: p.note ?? '',
  })))

  const suppsQ = supabaseAdmin.from('suppliers')
    .select('code, name, type, tax_code, phone, email, address, payment_term, delivery_days, rating, status')
    .order('code')
  const { data: supps } = await (tenantId ? suppsQ.eq('tenant_id', tenantId) : suppsQ)
  makeSheet(wb, 'Nhà cung cấp', [
    { label: 'Mã NCC',         key: 'code',          width: 12 },
    { label: 'Tên NCC',        key: 'name',          width: 30 },
    { label: 'Loại',           key: 'type',          width: 18 },
    { label: 'MST',            key: 'tax_code',      width: 15 },
    { label: 'Điện thoại',    key: 'phone',         width: 15 },
    { label: 'Email',          key: 'email',         width: 26 },
    { label: 'Địa chỉ',       key: 'address',       width: 38 },
    { label: 'NT TT (ngày)',   key: 'payment_term',  width: 14, align: 'center' },
    { label: 'TG giao (ngày)', key: 'delivery_days', width: 15, align: 'center' },
    { label: 'Đánh giá',      key: 'rating',        width: 12, align: 'center' },
    { label: 'Trạng thái',    key: 'status',        width: 14 },
  ], (supps ?? []).map(s => ({
    code: s.code, name: s.name,
    type: s.type === 'distributor_l1' ? 'Phân phối cấp 1' : s.type === 'manufacturer' ? 'Nhà sản xuất' : s.type ?? '',
    tax_code: s.tax_code ?? '', phone: s.phone ?? '', email: s.email ?? '', address: s.address ?? '',
    payment_term: s.payment_term ?? '', delivery_days: s.delivery_days ?? '',
    rating: s.rating ?? '', status: s.status === 'active' ? 'Hoạt động' : 'Ngưng',
  })))
}

// ── Module: TÀI CHÍNH ─────────────────────────────────────────────────────────

async function buildTaiChinh(wb: ExcelJS.Workbook, from: string, to: string, tenantId: string | null) {
  const ordQ = supabaseAdmin.from('sales_orders')
    .select('code, order_date, total_amount, discount, vat_amount, final_amount, payment_status, customer:customers(name)')
    .eq('status', 'completed').gte('order_date', from).lte('order_date', to).order('order_date', { ascending: false })
  const { data: orders } = await (tenantId ? ordQ.eq('tenant_id', tenantId) : ordQ)
  makeSheet(wb, 'Doanh thu', [
    { label: 'Mã đơn',          key: 'code',         width: 22 },
    { label: 'Ngày',            key: 'date',         width: 12, align: 'center' },
    { label: 'Khách hàng',      key: 'customer',     width: 28 },
    { label: 'Thành tiền (đ)',  key: 'final_amount', width: 16, numFmt: VND, align: 'right' },
    { label: 'Chiết khấu (đ)', key: 'discount',     width: 15, numFmt: VND, align: 'right' },
    { label: 'VAT (đ)',         key: 'vat',          width: 14, numFmt: VND, align: 'right' },
    { label: 'TT thanh toán',   key: 'payment',      width: 20 },
  ], (orders ?? []).map(o => ({
    code: o.code, date: fmtD(o.order_date), customer: (o.customer as any)?.name ?? '',
    final_amount: fmtN(o.final_amount), discount: fmtN(o.discount), vat: fmtN(o.vat_amount),
    payment: PAY_STATUS[o.payment_status] ?? o.payment_status,
  })))

  const expsQ = supabaseAdmin.from('expenses')
    .select('code, expense_date, category, description, amount, note, created_by:users(full_name)')
    .gte('expense_date', from).lte('expense_date', to).order('expense_date', { ascending: false })
  const { data: exps } = await (tenantId ? expsQ.eq('tenant_id', tenantId) : expsQ)
  makeSheet(wb, 'Chi phí phát sinh', [
    { label: 'Mã CP',       key: 'code',        width: 20 },
    { label: 'Ngày',        key: 'date',        width: 12, align: 'center' },
    { label: 'Loại CP',     key: 'category',    width: 18 },
    { label: 'Mô tả',       key: 'description', width: 38 },
    { label: 'Số tiền (đ)', key: 'amount',      width: 16, numFmt: VND, align: 'right' },
    { label: 'Ghi chú',     key: 'note',        width: 30 },
    { label: 'Người tạo',   key: 'created_by',  width: 22 },
  ], (exps ?? []).map(e => ({
    code: e.code, date: fmtD(e.expense_date), category: EXP_CAT[e.category] ?? e.category,
    description: e.description, amount: fmtN(e.amount), note: e.note ?? '',
    created_by: (e.created_by as any)?.full_name ?? '',
  })))

  const cpayQ = supabaseAdmin.from('customer_payments')
    .select('code, payment_date, amount, method, note, customer:customers(name), sales_order:sales_orders(code), created_by:users(full_name)')
    .gte('payment_date', from).lte('payment_date', to).order('payment_date', { ascending: false })
  const { data: cpay } = await (tenantId ? cpayQ.eq('tenant_id', tenantId) : cpayQ)
  makeSheet(wb, 'Công nợ KH', [
    { label: 'Mã phiếu',    key: 'code',       width: 20 },
    { label: 'Ngày',        key: 'date',       width: 12, align: 'center' },
    { label: 'Khách hàng',  key: 'customer',   width: 28 },
    { label: 'Đơn hàng',   key: 'order',      width: 20 },
    { label: 'Số tiền (đ)', key: 'amount',     width: 16, numFmt: VND, align: 'right' },
    { label: 'Hình thức',   key: 'method',     width: 16 },
    { label: 'Ghi chú',    key: 'note',       width: 30 },
  ], (cpay ?? []).map(p => ({
    code: p.code, date: fmtD(p.payment_date), customer: (p.customer as any)?.name ?? '',
    order: (p.sales_order as any)?.code ?? '', amount: fmtN(p.amount),
    method: PAY_METHOD[p.method] ?? p.method, note: p.note ?? '',
  })))

  const spayQ = supabaseAdmin.from('supplier_payments')
    .select('code, payment_date, amount, method, note, supplier:suppliers(name), purchase_order:purchase_orders(code), created_by:users(full_name)')
    .gte('payment_date', from).lte('payment_date', to).order('payment_date', { ascending: false })
  const { data: spay } = await (tenantId ? spayQ.eq('tenant_id', tenantId) : spayQ)
  makeSheet(wb, 'Công nợ NCC', [
    { label: 'Mã phiếu',    key: 'code',     width: 20 },
    { label: 'Ngày',        key: 'date',     width: 12, align: 'center' },
    { label: 'Nhà CC',      key: 'supplier', width: 28 },
    { label: 'Đơn mua',    key: 'po',       width: 20 },
    { label: 'Số tiền (đ)', key: 'amount',   width: 16, numFmt: VND, align: 'right' },
    { label: 'Hình thức',   key: 'method',   width: 16 },
    { label: 'Ghi chú',    key: 'note',     width: 30 },
  ], (spay ?? []).map(p => ({
    code: p.code, date: fmtD(p.payment_date), supplier: (p.supplier as any)?.name ?? '',
    po: (p.purchase_order as any)?.code ?? '', amount: fmtN(p.amount),
    method: PAY_METHOD[p.method] ?? p.method, note: p.note ?? '',
  })))
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const user = await getExportUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = req.nextUrl
    const module = (searchParams.get('module') ?? 'ban-hang') as Module
    const from   = searchParams.get('from') ?? new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    const to     = searchParams.get('to')   ?? new Date().toISOString().slice(0, 10)

    const allowed = ROLE_ALLOWED[user.role] ?? []
    if (module !== 'all' && !allowed.includes(module))
      return NextResponse.json({ error: 'Không có quyền xuất module này' }, { status: 403 })
    if (module === 'all' && user.role !== 'admin')
      return NextResponse.json({ error: 'Chỉ admin được xuất toàn bộ' }, { status: 403 })

    const wb = new ExcelJS.Workbook()
    wb.creator  = 'Mia SCM'
    wb.created  = new Date()
    wb.modified = new Date()

    const mods: Module[] = module === 'all'
      ? ['ban-hang', 'kho-hang', 'logistics', 'mua-hang', 'tai-chinh']
      : [module]

    for (const m of mods) {
      switch (m) {
        case 'ban-hang':  await buildBanHang(wb, from, to, user.role, user.dbId, user.tenantId);  break
        case 'kho-hang':  await buildKhoHang(wb, from, to, user.tenantId);                         break
        case 'logistics': await buildLogistics(wb, from, to, user.tenantId);                       break
        case 'mua-hang':  await buildMuaHang(wb, from, to, user.tenantId);                         break
        case 'tai-chinh': await buildTaiChinh(wb, from, to, user.tenantId);                        break
      }
    }

    const LABELS: Record<string, string> = {
      'ban-hang': 'BanHang', 'kho-hang': 'KhoHang',
      'logistics': 'Logistics', 'mua-hang': 'MuaHang',
      'tai-chinh': 'TaiChinh', 'all': 'ToanBo',
    }

    const filename = `MiaSCM_${LABELS[module]}_${from}_${to}.xlsx`
    const buf = await wb.xlsx.writeBuffer()

    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e: any) {
    console.error('[GET /api/export]', e)
    return NextResponse.json({ error: e.message ?? 'Lỗi server' }, { status: 500 })
  }
}
