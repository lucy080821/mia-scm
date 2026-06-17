// Prefix-based route access per role
const ROLE_ACCESS: Record<string, string[]> = {
  owner:    ['*'],
  admin:    ['*'],

  // Bán hàng: toàn bộ module bán + xem doanh thu & công nợ phải thu
  sales:    [
    '/dashboard',
    '/ban-hang',
    '/tai-chinh/doanh-thu',
    '/tai-chinh/cong-no',
    '/bao-cao',
  ],

  // Kho: toàn bộ kho + mua hàng
  warehouse: [
    '/dashboard',
    '/kho-hang',
    '/mua-hang',
    '/bao-cao',
  ],

  // Logistics: toàn bộ logistics + xuất kho + tổng quan kho
  logistics: [
    '/dashboard',
    '/logistics',
    '/kho-hang/xuat-kho',
    '/kho-hang/tong-quan-kho',
    '/bao-cao',
  ],

  // Tài xế: đơn vận chuyển + kế hoạch giao hàng
  driver:   [
    '/dashboard',
    '/logistics/don-van-chuyen',
    '/logistics/ke-hoach-giao-hang',
  ],

  // Kế toán: toàn bộ tài chính + xem đơn bán, hóa đơn, mua hàng để đối chiếu
  ketoan:   [
    '/dashboard',
    '/tai-chinh',
    '/ban-hang/don-hang-ban',
    '/ban-hang/hoa-don',
    '/mua-hang',
    '/bao-cao',
  ],
}

export function canAccess(role: string, pathname: string): boolean {
  const allowed = ROLE_ACCESS[role] ?? []
  if (allowed.includes('*')) return true
  return allowed.some(
    prefix => pathname === prefix || pathname.startsWith(prefix + '/')
  )
}

export const ROLE_LABEL: Record<string, string> = {
  owner:     'Chủ hệ thống',
  admin:     'Quản trị viên',
  sales:     'Nhân viên bán hàng',
  warehouse: 'Nhân viên kho',
  logistics: 'Điều phối logistics',
  driver:    'Tài xế',
  ketoan:    'Kế toán',
}

export const ROLE_COLOR: Record<string, string> = {
  owner:     'bg-amber-400/20 text-amber-300',
  admin:     'bg-yellow-400/20 text-yellow-300',
  sales:     'bg-sky-400/20 text-sky-300',
  warehouse: 'bg-orange-400/20 text-orange-300',
  logistics: 'bg-purple-400/20 text-purple-300',
  driver:    'bg-pink-400/20 text-pink-300',
  ketoan:    'bg-green-400/20 text-green-300',
}
