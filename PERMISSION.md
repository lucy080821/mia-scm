# PHÂN QUYỀN (RBAC) — Mia SCM

Phân quyền được thiết kế theo **3 lớp**, mỗi lớp phục vụ một mục đích. Bảo mật thật nằm ở lớp Database, hai lớp trên chỉ để UX và chặn sớm.

```
Lớp 1 — UI          → ẩn/hiện menu, nút (trải nghiệm, KHÔNG phải bảo mật)
Lớp 2 — Middleware  → chặn route trước khi vào trang
Lớp 3 — Database    → Supabase RLS, phòng tuyến cuối, KHÔNG bypass được
```

---

## 1. Định nghĩa Role & Permission

### 5 vai trò mặc định

| Role | Mô tả | Phạm vi |
|------|-------|---------|
| `admin` | Chủ DN / quản trị viên | Toàn quyền |
| `sales` | Nhân viên bán hàng | Bán hàng + xem kho |
| `warehouse` | Nhân viên kho | Kho hàng + nhập/xuất |
| `logistics` | Điều phối giao hàng | Logistics + xem đơn |
| `driver` | Tài xế | Chỉ app mobile — đơn được giao |

### Permission matrix

```typescript
// lib/permissions.ts

export type Role = 'admin' | 'sales' | 'warehouse' | 'logistics' | 'driver'

// Mỗi quyền theo dạng: 'module.action'
export type Permission =
  // Bán hàng
  | 'sales.view' | 'sales.create' | 'sales.edit' | 'sales.delete' | 'sales.approve'
  | 'customer.view' | 'customer.create' | 'customer.edit'
  | 'invoice.view' | 'invoice.create'
  // Kho hàng
  | 'inventory.view' | 'inventory.create' | 'inventory.edit' | 'inventory.approve'
  | 'product.view' | 'product.create' | 'product.edit'
  | 'stocktake.view' | 'stocktake.create' | 'stocktake.approve'
  // Logistics
  | 'delivery.view' | 'delivery.create' | 'delivery.assign' | 'delivery.update_status'
  | 'vehicle.view' | 'vehicle.manage'
  // Mua hàng
  | 'purchase.view' | 'purchase.create' | 'purchase.approve'
  | 'supplier.view' | 'supplier.manage'
  // Báo cáo & Cài đặt
  | 'report.view' | 'report.export'
  | 'settings.view' | 'settings.manage' | 'user.manage'

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ['*'] as any, // admin có tất cả — xử lý đặc biệt trong hasPermission

  sales: [
    'sales.view', 'sales.create', 'sales.edit',
    'customer.view', 'customer.create', 'customer.edit',
    'invoice.view', 'invoice.create',
    'inventory.view', 'product.view',      // chỉ xem kho
    'delivery.view',
    'report.view',
  ],

  warehouse: [
    'inventory.view', 'inventory.create', 'inventory.edit',
    'product.view', 'product.create', 'product.edit',
    'stocktake.view', 'stocktake.create',
    'sales.view',                          // xem đơn để xuất hàng
    'purchase.view',                       // xem PO để nhập hàng
    'supplier.view',
    'report.view',
  ],

  logistics: [
    'delivery.view', 'delivery.create', 'delivery.assign', 'delivery.update_status',
    'vehicle.view', 'vehicle.manage',
    'sales.view',                          // xem đơn cần giao
    'inventory.view',
    'report.view',
  ],

  driver: [
    'delivery.view',                       // chỉ đơn được giao cho mình
    'delivery.update_status',              // cập nhật đã giao
  ],
}

// Hàm kiểm tra quyền — dùng ở mọi nơi
export function hasPermission(role: Role, permission: Permission): boolean {
  if (role === 'admin') return true
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

// Kiểm tra quyền truy cập module (cho sidebar)
export function canAccessModule(role: Role, module: string): boolean {
  if (role === 'admin') return true
  return ROLE_PERMISSIONS[role]?.some(p => p.startsWith(module + '.')) ?? false
}
```

---

## 2. Lớp 1 — UI: ẩn/hiện theo quyền

### Hook lấy quyền user hiện tại

```typescript
// hooks/usePermission.ts
'use client'
import { useAuth } from './useAuth'
import { hasPermission, canAccessModule, type Permission } from '@/lib/permissions'

export function usePermission() {
  const { user } = useAuth()  // user.role từ session
  return {
    can: (p: Permission) => user ? hasPermission(user.role, p) : false,
    canAccess: (m: string) => user ? canAccessModule(user.role, m) : false,
    role: user?.role,
  }
}
```

### Lọc Sidebar theo quyền

```typescript
// components/layout/Sidebar.tsx
'use client'
import { usePermission } from '@/hooks/usePermission'

export function Sidebar() {
  const { canAccess } = usePermission()

  // navItems định nghĩa thêm field `module`
  const sections = [
    { label: 'BÁN HÀNG',  module: 'sales',     items: [...] },
    { label: 'KHO HÀNG',  module: 'inventory', items: [...] },
    { label: 'LOGISTICS', module: 'delivery',  items: [...] },
    { label: 'MUA HÀNG',  module: 'purchase',  items: [...] },
    { label: 'CÀI ĐẶT',   module: 'settings',  items: [...] },
  ]

  return (
    <nav>
      {sections
        .filter(s => canAccess(s.module))   // ← chỉ hiện module được phép
        .map(s => <NavSection key={s.module} {...s} />)}
    </nav>
  )
}
```

### Ẩn nút hành động

```tsx
// Ví dụ trong trang Đơn mua hàng — nút "Duyệt" chỉ hiện với người có quyền
import { usePermission } from '@/hooks/usePermission'

function PurchaseOrderRow({ order }) {
  const { can } = usePermission()
  return (
    <td>
      <button>Xem</button>
      {can('purchase.approve') && <button>Duyệt</button>}
      {can('purchase.create')  && <button>Sửa</button>}
    </td>
  )
}
```

---

## 3. Lớp 2 — Middleware: chặn route

```typescript
// middleware.ts (thư mục gốc)
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccessModule, type Role } from '@/lib/permissions'

// Map prefix route → module cần quyền
const ROUTE_MODULE: Record<string, string> = {
  '/ban-hang':   'sales',
  '/kho-hang':   'inventory',
  '/logistics':  'delivery',
  '/mua-hang':   'purchase',
  '/cai-dat':    'settings',
  '/bao-cao':    'report',
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createServerClient(/* ...env, cookies... */)

  const { data: { session } } = await supabase.auth.getSession()
  const { pathname } = req.nextUrl

  // Chưa đăng nhập → về login
  if (!session && pathname.startsWith('/(dashboard)')) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Đã đăng nhập → kiểm tra quyền module
  if (session) {
    const role = session.user.user_metadata.role as Role
    const matched = Object.entries(ROUTE_MODULE)
      .find(([prefix]) => pathname.startsWith(prefix))

    if (matched && !canAccessModule(role, matched[1])) {
      // Không có quyền → về dashboard kèm thông báo
      return NextResponse.redirect(new URL('/dashboard?denied=1', req.url))
    }

    // Tài xế chỉ được vào app mobile
    if (role === 'driver' && !pathname.startsWith('/mobile')) {
      return NextResponse.redirect(new URL('/mobile/deliveries', req.url))
    }
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|login).*)'],
}
```

---

## 4. Lớp 3 — Database RLS (QUAN TRỌNG NHẤT)

Đây là bảo mật thật. Kể cả khi ai đó gọi thẳng Supabase API bỏ qua frontend, RLS vẫn chặn.

### Bước 1 — Lưu role trong bảng users + JWT

```sql
-- Thêm role vào user metadata khi tạo user
-- (đã có cột role trong bảng users từ schema chính)

-- Hàm helper lấy role của user hiện tại
CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS text AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$ LANGUAGE sql STABLE;
```

### Bước 2 — Bật RLS và viết policy cho từng bảng

```sql
-- ===== BẢNG sales_orders =====
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;

-- Admin: toàn quyền
CREATE POLICY "admin_all_sales" ON sales_orders
  FOR ALL USING (auth.user_role() = 'admin');

-- Sales: xem + tạo + sửa
CREATE POLICY "sales_read" ON sales_orders
  FOR SELECT USING (auth.user_role() IN ('admin','sales','warehouse','logistics'));

CREATE POLICY "sales_insert" ON sales_orders
  FOR INSERT WITH CHECK (auth.user_role() IN ('admin','sales'));

CREATE POLICY "sales_update" ON sales_orders
  FOR UPDATE USING (auth.user_role() IN ('admin','sales'));

-- Chỉ admin được xóa
CREATE POLICY "sales_delete" ON sales_orders
  FOR DELETE USING (auth.user_role() = 'admin');


-- ===== BẢNG inventory =====
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_read" ON inventory
  FOR SELECT USING (auth.user_role() IN ('admin','sales','warehouse','logistics'));

CREATE POLICY "inv_write" ON inventory
  FOR ALL USING (auth.user_role() IN ('admin','warehouse'));


-- ===== BẢNG deliveries — tài xế chỉ thấy đơn của mình =====
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_admin_logistics" ON deliveries
  FOR ALL USING (auth.user_role() IN ('admin','logistics'));

-- Tài xế: CHỈ xem đơn được gán cho mình
CREATE POLICY "delivery_driver_own" ON deliveries
  FOR SELECT USING (
    auth.user_role() = 'driver'
    AND driver_id = (SELECT id FROM drivers WHERE user_id = auth.uid())
  );

-- Tài xế: chỉ update trạng thái đơn của mình
CREATE POLICY "delivery_driver_update" ON deliveries
  FOR UPDATE USING (
    auth.user_role() = 'driver'
    AND driver_id = (SELECT id FROM drivers WHERE user_id = auth.uid())
  );


-- ===== BẢNG users — chỉ admin quản lý =====
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_self_read" ON users
  FOR SELECT USING (id = auth.uid() OR auth.user_role() = 'admin');

CREATE POLICY "users_admin_manage" ON users
  FOR ALL USING (auth.user_role() = 'admin');
```

### Pattern chung cho mọi bảng

```
- SELECT: ai trong danh sách role được xem
- INSERT/UPDATE: chỉ role có quyền sửa
- DELETE: thường chỉ admin
- Dữ liệu cá nhân (tài xế): thêm điều kiện so khớp với auth.uid()
```

---

## 5. Trang quản lý phân quyền (UI cho admin)

Trong `/cai-dat/he-thong` tab "Phân quyền", admin có thể:

```tsx
// app/(dashboard)/cai-dat/he-thong/phan-quyen/page.tsx
// - Bảng ma trận: hàng = permission, cột = role, ô = checkbox
// - Admin tick/bỏ tick để bật/tắt quyền cho từng role
// - Lưu vào bảng role_permissions (nếu muốn linh hoạt hơn hard-code)

CREATE TABLE role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL,
  permission text NOT NULL,
  enabled boolean DEFAULT true,
  UNIQUE(role, permission)
);
```

Lưu ý: nếu dùng bảng `role_permissions` động thì hàm `hasPermission` phải query DB (cache lại trong session để tránh chậm). Với MVP, **hard-code trong `lib/permissions.ts` là đủ và nhanh hơn** — chỉ chuyển sang dạng động khi khách hàng thật sự cần tùy chỉnh quyền.

---

## 6. Checklist triển khai

```
[ ] 1. Thêm cột role vào bảng users (đã có trong schema)
[ ] 2. Thêm cột user_id vào bảng drivers (liên kết tài xế ↔ tài khoản)
[ ] 3. Tạo lib/permissions.ts với ma trận quyền
[ ] 4. Tạo hook usePermission()
[ ] 5. Lọc Sidebar + ẩn nút theo can()
[ ] 6. Viết middleware.ts chặn route
[ ] 7. Bật RLS + viết policy cho TẤT CẢ bảng (không bỏ sót bảng nào)
[ ] 8. Test với từng role: đăng nhập thử, kiểm tra không vào được trang cấm
[ ] 9. Trang quản lý user cho admin (tạo/sửa/đổi role)
```

> **Nguyên tắc vàng:** Không bao giờ tin client. Lớp UI và middleware có thể bị bỏ qua. RLS ở database là lớp duy nhất không thể bypass — luôn phải có.