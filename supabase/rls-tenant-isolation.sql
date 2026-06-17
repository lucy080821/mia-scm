-- ============================================================
-- Mia SCM — Tenant Isolation via Row Level Security
-- Chạy file này trong Supabase Dashboard → SQL Editor
-- SAU KHI đã chạy schema.sql và tất cả migrations
-- ============================================================

-- ── 1. Đảm bảo bảng tenants tồn tại ──────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  plan text DEFAULT 'starter' CHECK (plan IN ('starter','growth','enterprise')),
  status text DEFAULT 'active' CHECK (status IN ('active','suspended','cancelled')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
-- Owner-only via service_role; no anon/authenticated access to tenants table directly

-- ── 2. Thêm tenant_id vào bảng users (nếu chưa có) ───────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE public.users ADD COLUMN tenant_id uuid REFERENCES tenants(id);
    CREATE INDEX idx_users_tenant ON public.users(tenant_id);
  END IF;
END $$;

-- ── 3. Helper: lấy tenant_id của user đang đăng nhập ─────────
-- SECURITY DEFINER để đọc bảng users mà không bị vòng lặp RLS
CREATE OR REPLACE FUNCTION public.auth_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid() LIMIT 1
$$;

-- ── 4. Thêm tenant_id vào tất cả bảng nghiệp vụ ─────────────
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'customers','suppliers','products','categories','customer_groups',
    'warehouses','inventory',
    'sales_orders','sales_order_items',
    'purchase_orders','purchase_order_items',
    'stock_receipts','stock_receipt_items',
    'stock_issues','stock_issue_items',
    'stock_transfers','stock_transfer_items',
    'stocktakes','stocktake_items',
    'quotes','quote_items',
    'sales_returns','sales_return_items',
    'vehicles','drivers','deliveries',
    'expenses','customer_payments','supplier_payments'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'tenant_id'
      ) THEN
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id uuid REFERENCES tenants(id)', tbl);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tenant ON public.%I(tenant_id)', tbl, tbl);
      END IF;
    END IF;
  END LOOP;
END $$;

-- ── 5. Tạo trigger tự động set tenant_id khi INSERT ──────────
CREATE OR REPLACE FUNCTION public.set_tenant_id()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.auth_tenant_id();
  END IF;
  RETURN NEW;
END;
$$;

-- Áp dụng trigger cho các bảng chính
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'customers','suppliers','products','categories',
    'sales_orders','purchase_orders',
    'stock_receipts','stock_issues','stock_transfers','stocktakes',
    'quotes','sales_returns',
    'vehicles','drivers','deliveries','expenses'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format(
        'DROP TRIGGER IF EXISTS trg_set_tenant_%s ON public.%I;
         CREATE TRIGGER trg_set_tenant_%s
           BEFORE INSERT ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.set_tenant_id()',
        tbl, tbl, tbl, tbl
      );
    END IF;
  END LOOP;
END $$;

-- ── 6. Cập nhật RLS policies với tenant isolation ─────────────

-- CUSTOMERS
DROP POLICY IF EXISTS "Authenticated read" ON customers;
DROP POLICY IF EXISTS "Sales insert" ON customers;
DROP POLICY IF EXISTS "Sales update" ON customers;
DROP POLICY IF EXISTS "Tenant read" ON customers;
DROP POLICY IF EXISTS "Tenant write" ON customers;
CREATE POLICY "Tenant read"   ON customers FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant insert" ON customers FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant update" ON customers FOR UPDATE TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant delete" ON customers FOR DELETE TO authenticated
  USING (tenant_id = public.auth_tenant_id());

-- SUPPLIERS
DROP POLICY IF EXISTS "Authenticated read" ON suppliers;
DROP POLICY IF EXISTS "Authenticated write" ON suppliers;
DROP POLICY IF EXISTS "Tenant read" ON suppliers;
DROP POLICY IF EXISTS "Tenant write" ON suppliers;
CREATE POLICY "Tenant read"  ON suppliers FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant write" ON suppliers FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- PRODUCTS
DROP POLICY IF EXISTS "Authenticated read" ON products;
DROP POLICY IF EXISTS "Warehouse write" ON products;
DROP POLICY IF EXISTS "Tenant read" ON products;
DROP POLICY IF EXISTS "Tenant write" ON products;
CREATE POLICY "Tenant read"  ON products FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant write" ON products FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- CATEGORIES (shared + tenant-specific)
DROP POLICY IF EXISTS "Authenticated read" ON categories;
DROP POLICY IF EXISTS "Tenant read" ON categories;
DROP POLICY IF EXISTS "Tenant write" ON categories;
CREATE POLICY "Tenant read"  ON categories FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant write" ON categories FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- CUSTOMER GROUPS
DROP POLICY IF EXISTS "Authenticated read" ON customer_groups;
DROP POLICY IF EXISTS "Tenant read" ON customer_groups;
DROP POLICY IF EXISTS "Tenant write" ON customer_groups;
CREATE POLICY "Tenant read"  ON customer_groups FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant write" ON customer_groups FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- WAREHOUSES
DROP POLICY IF EXISTS "Authenticated read" ON warehouses;
DROP POLICY IF EXISTS "Tenant read" ON warehouses;
DROP POLICY IF EXISTS "Tenant write" ON warehouses;
CREATE POLICY "Tenant read"  ON warehouses FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant write" ON warehouses FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- INVENTORY
DROP POLICY IF EXISTS "Authenticated read" ON inventory;
DROP POLICY IF EXISTS "Warehouse write" ON inventory;
DROP POLICY IF EXISTS "Tenant read" ON inventory;
DROP POLICY IF EXISTS "Tenant write" ON inventory;
CREATE POLICY "Tenant read"  ON inventory FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant write" ON inventory FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- SALES ORDERS
DROP POLICY IF EXISTS "Authenticated read" ON sales_orders;
DROP POLICY IF EXISTS "Sales write" ON sales_orders;
DROP POLICY IF EXISTS "Tenant read" ON sales_orders;
DROP POLICY IF EXISTS "Tenant write" ON sales_orders;
CREATE POLICY "Tenant read"  ON sales_orders FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant write" ON sales_orders FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- SALES ORDER ITEMS (inherit tenant qua sales_orders)
DROP POLICY IF EXISTS "Authenticated read" ON sales_order_items;
DROP POLICY IF EXISTS "Sales write" ON sales_order_items;
DROP POLICY IF EXISTS "Tenant read" ON sales_order_items;
DROP POLICY IF EXISTS "Tenant write" ON sales_order_items;
CREATE POLICY "Tenant read"  ON sales_order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales_orders so
      WHERE so.id = sales_order_items.order_id
        AND so.tenant_id = public.auth_tenant_id()
    )
  );
CREATE POLICY "Tenant write" ON sales_order_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales_orders so
      WHERE so.id = sales_order_items.order_id
        AND so.tenant_id = public.auth_tenant_id()
    )
  );

-- PURCHASE ORDERS
DROP POLICY IF EXISTS "Authenticated read" ON purchase_orders;
DROP POLICY IF EXISTS "Purchase write" ON purchase_orders;
DROP POLICY IF EXISTS "Tenant read" ON purchase_orders;
DROP POLICY IF EXISTS "Tenant write" ON purchase_orders;
CREATE POLICY "Tenant read"  ON purchase_orders FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant write" ON purchase_orders FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- PURCHASE ORDER ITEMS
DROP POLICY IF EXISTS "Authenticated read" ON purchase_order_items;
DROP POLICY IF EXISTS "Purchase write" ON purchase_order_items;
DROP POLICY IF EXISTS "Tenant read" ON purchase_order_items;
DROP POLICY IF EXISTS "Tenant write" ON purchase_order_items;
CREATE POLICY "Tenant read"  ON purchase_order_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_items.order_id
        AND po.tenant_id = public.auth_tenant_id()
    )
  );
CREATE POLICY "Tenant write" ON purchase_order_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = purchase_order_items.order_id
        AND po.tenant_id = public.auth_tenant_id()
    )
  );

-- STOCK RECEIPTS
DROP POLICY IF EXISTS "Authenticated read" ON stock_receipts;
DROP POLICY IF EXISTS "Warehouse write" ON stock_receipts;
DROP POLICY IF EXISTS "Tenant read" ON stock_receipts;
DROP POLICY IF EXISTS "Tenant write" ON stock_receipts;
CREATE POLICY "Tenant read"  ON stock_receipts FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant write" ON stock_receipts FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- STOCK RECEIPT ITEMS
DROP POLICY IF EXISTS "Authenticated read" ON stock_receipt_items;
DROP POLICY IF EXISTS "Tenant read" ON stock_receipt_items;
DROP POLICY IF EXISTS "Tenant write" ON stock_receipt_items;
CREATE POLICY "Tenant read"  ON stock_receipt_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stock_receipts sr
      WHERE sr.id = stock_receipt_items.receipt_id
        AND sr.tenant_id = public.auth_tenant_id()
    )
  );
CREATE POLICY "Tenant write" ON stock_receipt_items FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM stock_receipts sr
      WHERE sr.id = stock_receipt_items.receipt_id
        AND sr.tenant_id = public.auth_tenant_id()
    )
  );

-- STOCK ISSUES
DROP POLICY IF EXISTS "Authenticated read" ON stock_issues;
DROP POLICY IF EXISTS "Warehouse write" ON stock_issues;
DROP POLICY IF EXISTS "Tenant read" ON stock_issues;
DROP POLICY IF EXISTS "Tenant write" ON stock_issues;
CREATE POLICY "Tenant read"  ON stock_issues FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant write" ON stock_issues FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- VEHICLES
DROP POLICY IF EXISTS "Authenticated read" ON vehicles;
DROP POLICY IF EXISTS "Logistics write" ON vehicles;
DROP POLICY IF EXISTS "Tenant read" ON vehicles;
DROP POLICY IF EXISTS "Tenant write" ON vehicles;
CREATE POLICY "Tenant read"  ON vehicles FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant write" ON vehicles FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- DRIVERS
DROP POLICY IF EXISTS "Authenticated read" ON drivers;
DROP POLICY IF EXISTS "Logistics write" ON drivers;
DROP POLICY IF EXISTS "Tenant read" ON drivers;
DROP POLICY IF EXISTS "Tenant write" ON drivers;
CREATE POLICY "Tenant read"  ON drivers FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant write" ON drivers FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- DELIVERIES
DROP POLICY IF EXISTS "Authenticated read" ON deliveries;
DROP POLICY IF EXISTS "Logistics write" ON deliveries;
DROP POLICY IF EXISTS "Tenant read" ON deliveries;
DROP POLICY IF EXISTS "Tenant write" ON deliveries;
CREATE POLICY "Tenant read"  ON deliveries FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id());
CREATE POLICY "Tenant write" ON deliveries FOR ALL TO authenticated
  USING (tenant_id = public.auth_tenant_id())
  WITH CHECK (tenant_id = public.auth_tenant_id());

-- EXPENSES (nếu tồn tại)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='expenses') THEN
    ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Tenant read" ON expenses;
    DROP POLICY IF EXISTS "Tenant write" ON expenses;
    EXECUTE $p$
      CREATE POLICY "Tenant read"  ON expenses FOR SELECT TO authenticated
        USING (tenant_id = public.auth_tenant_id());
      CREATE POLICY "Tenant write" ON expenses FOR ALL TO authenticated
        USING (tenant_id = public.auth_tenant_id())
        WITH CHECK (tenant_id = public.auth_tenant_id())
    $p$;
  END IF;
END $$;

-- CUSTOMER PAYMENTS (nếu tồn tại)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='customer_payments') THEN
    ALTER TABLE customer_payments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Tenant read" ON customer_payments;
    DROP POLICY IF EXISTS "Tenant write" ON customer_payments;
    EXECUTE $p$
      CREATE POLICY "Tenant read"  ON customer_payments FOR SELECT TO authenticated
        USING (tenant_id = public.auth_tenant_id());
      CREATE POLICY "Tenant write" ON customer_payments FOR ALL TO authenticated
        USING (tenant_id = public.auth_tenant_id())
        WITH CHECK (tenant_id = public.auth_tenant_id())
    $p$;
  END IF;
END $$;

-- SUPPLIER PAYMENTS (nếu tồn tại)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='supplier_payments') THEN
    ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Tenant read" ON supplier_payments;
    DROP POLICY IF EXISTS "Tenant write" ON supplier_payments;
    EXECUTE $p$
      CREATE POLICY "Tenant read"  ON supplier_payments FOR SELECT TO authenticated
        USING (tenant_id = public.auth_tenant_id());
      CREATE POLICY "Tenant write" ON supplier_payments FOR ALL TO authenticated
        USING (tenant_id = public.auth_tenant_id())
        WITH CHECK (tenant_id = public.auth_tenant_id())
    $p$;
  END IF;
END $$;

-- ── 7. USERS: restrict scope trong cùng tenant ─────────────────
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Admin full access" ON users;
DROP POLICY IF EXISTS "Tenant users read" ON users;
DROP POLICY IF EXISTS "Admin write users" ON users;

-- Mọi user xem được tất cả user trong cùng tenant
CREATE POLICY "Tenant users read" ON users FOR SELECT TO authenticated
  USING (tenant_id = public.auth_tenant_id() OR id = auth.uid());

-- Chỉ admin mới tạo/sửa/xóa user trong cùng tenant
CREATE POLICY "Admin write users" ON users FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.auth_tenant_id() AND
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'admin' AND u.tenant_id = public.auth_tenant_id()
    )
  );
CREATE POLICY "Admin update users" ON users FOR UPDATE TO authenticated
  USING (
    tenant_id = public.auth_tenant_id() AND (
      id = auth.uid() OR
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = 'admin' AND u.tenant_id = public.auth_tenant_id()
      )
    )
  );

-- ── 8. Public tracking endpoints (không cần auth) ─────────────
-- Deliveries: cho phép đọc theo tracking_token nếu cột tồn tại
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'tracking_token'
  ) THEN
    DROP POLICY IF EXISTS "Public tracking read" ON deliveries;
    EXECUTE $p$
      CREATE POLICY "Public tracking read" ON deliveries FOR SELECT
        USING (tracking_token IS NOT NULL AND tracking_token != '')
    $p$;
  END IF;
END $$;

-- ── 9. Supabase Realtime: chỉ subscribe channel của tenant mình
-- Cấu hình trong Supabase Dashboard → Realtime → Policies
-- Hoặc dùng filter khi subscribe:
-- supabase.channel('orders').on('postgres_changes', {
--   event: '*', schema: 'public', table: 'sales_orders',
--   filter: `tenant_id=eq.${tenantId}`
-- }, handler)

-- ── HOÀN THÀNH ─────────────────────────────────────────────────
-- Sau khi chạy script này:
-- 1. Cập nhật tất cả API routes để include tenant_id khi INSERT
--    (trigger set_tenant_id() sẽ tự set nếu dùng Supabase browser client)
-- 2. Với supabaseAdmin (service_role), bypass RLS nên cần set tenant_id thủ công
-- 3. Chạy script seed để cập nhật tenant_id cho data hiện có:
--    UPDATE <table> SET tenant_id = '<your-tenant-uuid>' WHERE tenant_id IS NULL;
