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
- `/api/finance/` `/api/expenses/` — Tài chính
- `/api/reports/` `/api/export/` — Báo cáo & xuất dữ liệu
- `/api/import/[type]/` — Nhập liệu (CSV/Excel)
- `/api/ai/parse-order/` `/api/ai/inventory-suggest/` `/api/ai/delivery-route/` — AI
- `/api/owner/stats/` `/api/owner/activity/` — Owner dashboard

---

## Biến môi trường

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY          # server-only
```

---

## Quy tắc phát triển

- **Không dùng `alert/confirm/prompt`** — dùng custom React modal.
- Trước khi viết code Next.js, đọc docs trong `node_modules/next/dist/docs/` vì Next.js 16 có breaking changes so với các phiên bản cũ.
- Admin Supabase (`supabase-admin.ts`) chỉ dùng ở server-side (route handlers, server components), không bao giờ expose sang client.
- Tất cả văn bản UI bằng tiếng Việt.
