@AGENTS.md

# Mia SCM — Tài liệu dự án

Hệ thống quản lý chuỗi cung ứng (Supply Chain Management) dạng multi-tenant SaaS, viết bằng **Next.js 16**, phục vụ nhà phân phối FMCG tại Việt Nam.

---

## Stack kỹ thuật

| Layer | Công nghệ |
|---|---|
| Framework | Next.js 16.2.7, React 19, TypeScript |
| Auth & DB | Supabase (PostgreSQL + JWT + RLS) |
| Styling | TailwindCSS 4, Lucide icons |
| Charts | Recharts |
| Maps | Leaflet, Google Maps API |
| AI | Groq (order parsing, inventory suggestions, route optimization) |
| Deploy | Render |

---

## Cấu trúc route

```
app/
├── (auth)/login/               — Đăng nhập
├── (dashboard)/                — Workspace nhân viên
│   ├── dashboard/              — Trang chủ tổng quan
│   ├── ban-hang/               — Module bán hàng
│   │   ├── khach-hang/         — Quản lý khách hàng
│   │   ├── don-hang-ban/       — Đơn hàng bán
│   │   ├── bao-gia/            — Báo giá
│   │   ├── hoa-don/            — Hóa đơn
│   │   └── tra-hang/           — Trả hàng
│   ├── kho-hang/               — Module kho hàng
│   │   ├── san-pham/           — Sản phẩm
│   │   ├── nhap-kho/           — Nhập kho
│   │   ├── xuat-kho/           — Xuất kho
│   │   ├── chuyen-kho/         — Chuyển kho
│   │   └── kiem-ke/            — Kiểm kê
│   ├── logistics/              — Module logistics
│   │   ├── don-van-chuyen/     — Đơn vận chuyển
│   │   ├── ke-hoach-giao-hang/ — Kế hoạch giao hàng
│   │   ├── phuong-tien/        — Phương tiện
│   │   └── tai-xe/             — Tài xế
│   ├── mua-hang/               — Module mua hàng
│   │   ├── don-mua-hang/       — Đơn mua hàng
│   │   └── nha-cung-cap/       — Nhà cung cấp
│   ├── tai-chinh/              — Module tài chính
│   │   ├── doanh-thu/          — Doanh thu
│   │   ├── chi-phi/            — Chi phí
│   │   ├── loi-nhuan/          — Lợi nhuận
│   │   └── cong-no/            — Công nợ
│   ├── bao-cao/                — Báo cáo
│   └── cai-dat/                — Cài đặt
│       ├── danh-muc/           — Danh mục
│       ├── nghiep-vu/          — Nghiệp vụ
│       ├── nhan-vien/          — Nhân viên
│       └── nhap-lieu/          — Nhập liệu
└── (owner)/owner/              — Portal quản trị nền tảng (Mia)
    ├── dashboard/
    ├── companies/
    ├── billing/
    ├── health/
    ├── activity/
    └── notifications/
```

---

## Gói dịch vụ (Plans)

Định nghĩa tại `app/(owner)/owner/billing/page.tsx` — constant `PLANS`.

| Gói | Giá | Người dùng | Kho |
|---|---|---|---|
| **starter** | 490.000 ₫/tháng | ≤ 10 | ≤ 3 |
| **growth** | 1.190.000 ₫/tháng | ≤ 50 | Không giới hạn |
| **enterprise** | 2.990.000 ₫/tháng | Không giới hạn | Không giới hạn |

### Tính năng theo gói

**Starter** bao gồm:
- Module bán hàng, module kho hàng
- Quản lý sản phẩm & danh mục
- Báo cáo cơ bản, xuất Excel
- Hỗ trợ qua email
- Không có: logistics, API tích hợp, hỗ trợ 24/7

**Growth** thêm so với Starter:
- Module logistics & vận chuyển
- Module kế toán cơ bản
- Quản lý nhà cung cấp
- Báo cáo nâng cao & biểu đồ
- Xuất Excel / PDF
- Hỗ trợ ưu tiên
- Không có: API tích hợp, hỗ trợ 24/7

**Enterprise** thêm so với Growth:
- Tất cả module (bao gồm module tương lai)
- API tích hợp bên ngoài
- Tuỳ chỉnh thương hiệu (logo, màu)
- Sao lưu dữ liệu ưu tiên
- Hỗ trợ 24/7 & account manager
- SLA cam kết 99.9%

Plan được lưu trong cột `plan` của bảng `tenants`. Module nào được bật cho từng tenant lưu trong `enabledModules` (mảng string) của `TenantConfig` trong `lib/tenant.ts`.

---

## Multi-tenancy

**TenantConfig** (`lib/tenant.ts`):
```typescript
{
  id: string
  name: string
  slug: string
  logoUrl?: string
  primaryColor: string        // brand color
  enabledModules: string[]    // ['ban-hang', 'kho-hang', 'logistics', ...]
  plan: 'starter' | 'growth' | 'enterprise'
  isPlatform?: boolean        // true = Mia owner account
}
```

**Module keys:** `ban-hang` · `kho-hang` · `logistics` · `mua-hang` · `tai-chinh` · `bao-cao`

**Tenant resolution (thứ tự ưu tiên):**
1. In-memory cache (trong session)
2. localStorage
3. Supabase query
4. MOCK_TENANTS (test: `t1`, `t2`)
5. DEFAULT_TENANT fallback

---

## Phân quyền (RBAC)

Định nghĩa tại `lib/permissions.ts` và `lib/auth-client.ts`.

| Role | Label | Truy cập |
|---|---|---|
| `owner` | Chủ hệ thống | Chỉ `/owner/*` (platform admin) |
| `admin` | Quản trị viên | Tất cả module của tenant |
| `sales` | Nhân viên bán hàng | Bán hàng, xem tài chính, báo cáo |
| `warehouse` | Nhân viên kho | Kho hàng, mua hàng, báo cáo |
| `logistics` | Điều phối logistics | Logistics, xem kho, báo cáo |
| `driver` | Tài xế | Chỉ giao hàng được phân công |
| `ketoan` | Kế toán | Tài chính, báo cáo, xem hạn chế bán/mua |

**3 lớp bảo vệ:**
1. UI — ẩn/hiện menu theo permission
2. Middleware (`middleware.ts`) — block route sớm
3. Database — Supabase RLS (không thể bypass)

---

## Workflow đơn hàng

```
new → confirmed → picking → picked → pending_ship → delivering → completed
                    ↓                                     ↓
                    └──────────────── cancelled ←─────── failed
```

Transition theo role:
- `new → confirmed`: Admin / Sales
- `confirmed → picking`: Warehouse
- `picking → picked`: Warehouse
- `picked → pending_ship`: Logistics
- `pending_ship → delivering`: Logistics
- `delivering → completed / failed`: Driver

---

## Lib quan trọng

| File | Mục đích |
|---|---|
| `lib/tenant.ts` | Đọc/cache TenantConfig |
| `lib/supabase.ts` | Supabase client (browser) |
| `lib/supabase-admin.ts` | Supabase SERVICE_ROLE (server-only, bypass RLS) |
| `lib/server-auth.ts` | `getServerTenantId()` từ JWT |
| `lib/auth-client.ts` | Client auth helpers, role labels/colors |
| `lib/permissions.ts` | Ma trận RBAC: 7 roles × 28 permissions |
| `lib/business-settings.ts` | Cấu hình nghiệp vụ (approval, kho, VAT, logistics, mẫu in) |
| `lib/groq.ts` | Groq AI integration |
| `lib/delivery-token.ts` | JWT cho trang giao hàng công khai (tài xế, không cần login) |
| `lib/inventory-formulas.ts` | Tính tồn kho FIFO / FEFO / Free |
| `lib/workflow/` | State machine cho đơn hàng, giao hàng, kiểm kê, PO |

---

## API routes (tóm tắt)

Tất cả API đều yêu cầu `Authorization: Bearer <token>` trừ `/api/delivery-confirm/*`.

- `/api/me` — Profile người dùng hiện tại
- `/api/tenants/` — Quản lý tenant (owner only)
- `/api/sales-orders/` — Đơn hàng bán
- `/api/customers/` — Khách hàng
- `/api/products/` — Sản phẩm
- `/api/stock-receipts/` `/api/stock-issues/` `/api/stock-transfers/` — Kho
- `/api/stocktakes/` — Kiểm kê
- `/api/deliveries/` — Giao hàng
- `/api/purchase-orders/` — Đơn mua hàng
- `/api/purchase-orders/[id]/receive` — Nhận hàng từ PO (tạo phiếu nhập kho)
- `/api/suppliers/` — Nhà cung cấp
- `/api/warehouses/` — Kho hàng
- `/api/warehouse-assignments/` — Gán kho cho nhân viên kho (GET/POST/DELETE)
- `/api/finance/` `/api/expenses/` — Tài chính
- `/api/reports/` `/api/export/` — Báo cáo & xuất dữ liệu
- `/api/import/[type]/` — Nhập liệu (CSV/Excel)
- `/api/ai/parse-order/` `/api/ai/inventory-suggest/` `/api/ai/delivery-route/` `/api/ai/supplier-analysis/` — AI
- `/api/owner/stats/` `/api/owner/activity/` — Owner dashboard
- `/api/favicon` `/api/logo` `/api/manifest` — PWA & tenant branding

---

## Biến môi trường

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY          # server-only
```

---

## Tính năng đã triển khai (ngoài CRUD cơ bản)

### Module Mua hàng
- **Goods receipt flow**: Modal nhận hàng từ PO — chọn kho, nhập số lượng thực nhận, số lô, HSD → tạo `stock_receipts` + cập nhật `inventory`. Nhận một phần → PO chuyển `delivering`; nhận đủ → `completed`.
- **Delete draft PO**: Xóa PO ở trạng thái `draft` (cascade xóa items). Có confirmation modal.
- **Nhà cung cấp**: type field dùng enum `'distributor_l1' | 'manufacturer'` (có CHECK constraint trong DB).
- **AI phân tích NCC**: `/api/ai/supplier-analysis` — gửi data NCC thật + lịch sử PO 90 ngày cho Groq, trả về cảnh báo/đề xuất thực tế.

### Module Kho hàng — Tổng quan kho
- **Per-warehouse AI**: Khi có nhiều kho, mỗi kho có AI box riêng, bảng đề xuất đặt hàng riêng, nút tạo đơn riêng.
- **Khi 1 kho**: giữ nguyên layout cũ (không chia theo kho).
- **ROP/EOQ/ABC**: Tính tự động, hiển thị trên bảng đề xuất.
- **Suggested orders**: Chỉ đề xuất khi stock < min_stock (không phải <=), số lượng = deficit (không phải toàn bộ min_stock).

### Phân công kho cho nhân viên
- **Bảng DB**: `employee_warehouses (id, profile_id, warehouse_id, tenant_id, UNIQUE(profile_id, warehouse_id))` — cần tạo thủ công trong Supabase với RLS enabled.
- **API**: `/api/warehouse-assignments` GET/POST/DELETE — graceful nếu bảng chưa tồn tại (trả [] thay vì crash).
- **UI**: Trang `cai-dat/nhan-vien` — cột "Kho phân công" trong bảng, checkbox chọn kho trong modal sửa nhân viên kho.
- **Filter**: Nhân viên kho chỉ thấy kho được gán (nếu chưa gán → thấy tất cả).

### Sidebar & Hydration
- **mounted pattern**: Sidebar dùng `mounted` state — server + client render đầu tiên đều dùng `DEFAULT_TENANT` + `null user`, tránh hydration mismatch làm mất section MUA HÀNG.

### Branding per tenant
- **TenantManifestSync**: Cập nhật `document.title`, `theme-color`, favicon (`<link data-tenant-favicon>`) client-side sau khi tenant load. Guard: chỉ update khi `tenant.name` không phải "Mia SCM" / "Demo".
- **Favicon**: `/api/favicon` proxy logo tenant qua server; client-side override bằng `logoUrl` trực tiếp khi đã có tenant.

### Nhập liệu (Import)
- **Inventory wide format**: Template tồn kho có cột "Tên sản phẩm" (tham khảo), mỗi kho = 1 cột riêng với mã kho thực tế từ DB.
- **Preview**: Load real warehouse codes từ Supabase để hiển thị đúng cột kho của công ty.
- **Parser**: `normalizeInventoryTable` bỏ qua cột "tên sản phẩm" khi detect warehouse columns.

### Tính năng đã nối DB thực (toàn bộ)

| Module | Trang | Trạng thái |
|---|---|---|
| Dashboard | `/dashboard` | ✅ Real — `/api/dashboard`, realtime Supabase channel |
| Bán hàng | Khách hàng | ✅ Real — `/api/customers` |
| Bán hàng | Đơn hàng bán | ✅ Real — `/api/sales-orders`, đầy đủ workflow status |
| Bán hàng | Báo giá | ✅ Real — `/api/quotes` + supabase |
| Bán hàng | Trả hàng | ✅ Real — `/api/sales-returns` |
| Bán hàng | Hóa đơn | ✅ Real — `/api/invoices` GET/POST/PATCH; lưu nháp vào DB, danh sách hóa đơn đã lưu ở right panel. Cần tạo bảng `invoices` trong Supabase (xem SQL bên dưới). Company info vẫn lưu localStorage. |
| Kho hàng | Sản phẩm | ✅ Real — `/api/products`, toggle kho, DOS/ROP/EOQ tự tính |
| Kho hàng | Tổng quan kho | ✅ Real — supabase trực tiếp, AI gợi ý, per-warehouse |
| Kho hàng | Nhập kho | ✅ Real — `/api/stock-receipts` |
| Kho hàng | Xuất kho | ✅ Real — `/api/stock-issues` |
| Kho hàng | Chuyển kho | ✅ Real — `/api/stock-transfers` |
| Kho hàng | Kiểm kê | ✅ Real — `/api/stocktakes` |
| Mua hàng | Đơn mua hàng | ✅ Real — `/api/purchase-orders`, goods receipt flow, delete draft |
| Mua hàng | Nhà cung cấp | ✅ Real — `/api/suppliers` |
| Logistics | Tổng quan | ✅ Real — supabase, KPI deliveries |
| Logistics | Đơn vận chuyển | ✅ Real — `/api/deliveries` |
| Logistics | Kế hoạch giao hàng | ✅ Real — supabase, tạo/cập nhật delivery plan |
| Logistics | Phương tiện | ✅ Real — `/api/vehicles` |
| Logistics | Tài xế | ✅ Real — `/api/users` + `drivers` table, self-heal on_trip status |
| Logistics | Đối soát COD | ✅ Real — supabase query deliveries + drivers |
| Tài chính | Tổng quan | ✅ Real — `/api/finance?type=monthly` (12 tháng P&L) |
| Tài chính | Doanh thu | ✅ Real — `/api/finance?type=orders` |
| Tài chính | Chi phí | ✅ Real — `/api/finance?type=expenses` |
| Tài chính | Chi phí phát sinh | ✅ Real — `/api/expenses` CRUD |
| Tài chính | Lợi nhuận | ✅ Real — `/api/finance?type=monthly` |
| Tài chính | Công nợ | ✅ Real — `/api/finance?type=receivables/payables` |
| Báo cáo | Tất cả | ✅ Real — `/api/reports` (top_products, kpi_users, drilldown, inventory); plan-gated (growth/enterprise) |
| Cài đặt | Danh mục | ✅ Real — `/api/categories` |
| Cài đặt | Nhân viên | ✅ Real — `/api/users`, warehouse assignments |
| Cài đặt | Nhập liệu | ✅ Real — `/api/import/[type]` |
| Cài đặt | Nghiệp vụ | ✅ Real — `saveBusinessSettingsAsync()` / `loadBusinessSettingsAsync()` — lưu vào bảng `business_settings` (Supabase) + localStorage fallback. Debounce 800ms. Cần tạo bảng (xem SQL bên dưới). |

---

## Migrations cần chạy trong Supabase

### Bảng `invoices`
```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  invoice_no TEXT NOT NULL,
  invoice_date DATE,
  customer_name TEXT,
  customer_address TEXT,
  tax_code TEXT,
  order_ref TEXT,
  note TEXT,
  items JSONB DEFAULT '[]',
  subtotal BIGINT DEFAULT 0,
  vat_pct INTEGER DEFAULT 10,
  vat BIGINT DEFAULT 0,
  total BIGINT DEFAULT 0,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON invoices
  USING (tenant_id = (auth.jwt()->>'tenant_id')::uuid);
```

### Bảng `business_settings`
```sql
CREATE TABLE business_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON business_settings
  USING (tenant_id = (auth.jwt()->>'tenant_id')::uuid);
```

API graceful-fail nếu bảng chưa tồn tại (trả về [] / null thay vì crash).

---

## Quy tắc phát triển

- **Không dùng `alert/confirm/prompt`** — dùng custom React modal hoặc toast.
- **Không định nghĩa component con bên trong component cha** — gây re-mount mỗi keystroke, làm mất focus input.
- Trước khi viết code Next.js, đọc docs trong `node_modules/next/dist/docs/` vì Next.js 16 có breaking changes so với các phiên bản cũ.
- Admin Supabase (`supabase-admin.ts`) chỉ dùng ở server-side (route handlers, server components), không bao giờ expose sang client.
- Tất cả văn bản UI bằng tiếng Việt.
- Supplier `type` field: chỉ nhận `'distributor_l1'` hoặc `'manufacturer'` (DB CHECK constraint `suppliers_type_check`).
