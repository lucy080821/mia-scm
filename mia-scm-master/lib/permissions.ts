export type Role = 'owner' | 'admin' | 'sales' | 'warehouse' | 'logistics' | 'driver' | 'ketoan'

export type Permission =
  | 'sales.view' | 'sales.create' | 'sales.edit' | 'sales.delete' | 'sales.approve'
  | 'customer.view' | 'customer.create' | 'customer.edit'
  | 'invoice.view' | 'invoice.create'
  | 'inventory.view' | 'inventory.create' | 'inventory.edit' | 'inventory.approve'
  | 'product.view' | 'product.create' | 'product.edit'
  | 'stocktake.view' | 'stocktake.create' | 'stocktake.approve'
  | 'delivery.view' | 'delivery.create' | 'delivery.assign' | 'delivery.update_status'
  | 'vehicle.view' | 'vehicle.manage'
  | 'purchase.view' | 'purchase.create' | 'purchase.approve'
  | 'supplier.view' | 'supplier.manage'
  | 'finance.view' | 'finance.manage' | 'debt.view' | 'debt.manage'
  | 'report.view' | 'report.export'
  | 'settings.view' | 'settings.manage' | 'user.manage'

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [] as Permission[], // owner = platform owner, toàn quyền — xử lý đặc biệt
  admin: [] as Permission[], // admin có tất cả — xử lý đặc biệt trong hasPermission

  // Nhân viên bán hàng: toàn bộ module bán + xem doanh thu & công nợ phải thu
  sales: [
    'sales.view', 'sales.create', 'sales.edit',
    'customer.view', 'customer.create', 'customer.edit',
    'invoice.view', 'invoice.create',
    'inventory.view', 'product.view',
    'delivery.view',
    'finance.view', 'debt.view',
    'report.view',
  ],

  // Nhân viên kho: toàn bộ kho + mua hàng
  warehouse: [
    'inventory.view', 'inventory.create', 'inventory.edit', 'inventory.approve',
    'product.view', 'product.create', 'product.edit',
    'stocktake.view', 'stocktake.create', 'stocktake.approve',
    'sales.view',
    'purchase.view', 'purchase.create',
    'supplier.view',
    'report.view',
  ],

  // Điều phối logistics: toàn bộ logistics + xem kho xuất + xem đơn bán
  logistics: [
    'delivery.view', 'delivery.create', 'delivery.assign', 'delivery.update_status',
    'vehicle.view', 'vehicle.manage',
    'sales.view',
    'inventory.view',
    'report.view',
  ],

  // Tài xế: chỉ xem & cập nhật trạng thái đơn giao của mình
  driver: [
    'delivery.view',
    'delivery.update_status',
  ],

  // Kế toán: toàn bộ module tài chính + xem đơn bán/mua để đối chiếu
  ketoan: [
    'finance.view', 'finance.manage',
    'debt.view', 'debt.manage',
    'sales.view',
    'invoice.view', 'invoice.create',
    'purchase.view', 'purchase.approve',
    'supplier.view',
    'customer.view',
    'report.view', 'report.export',
  ],
}

export function hasPermission(role: Role, permission: Permission, overrides?: Partial<Record<Role, Permission[]>>): boolean {
  if (role === 'owner' || role === 'admin') return true
  const perms = overrides?.[role] ?? DEFAULT_ROLE_PERMISSIONS[role] ?? []
  return perms.includes(permission)
}

export function canAccessModule(role: Role, module: string): boolean {
  if (role === 'owner' || role === 'admin') return true
  const perms = DEFAULT_ROLE_PERMISSIONS[role] ?? []
  return perms.some(p => p.startsWith(module + '.'))
}
