-- ════════════════════════════════════════════════════
-- Mia SCM — Migration: tenants + tenant_id on users
-- Chạy trong Supabase Dashboard > SQL Editor
-- ════════════════════════════════════════════════════

-- 1. Bảng tenants
CREATE TABLE IF NOT EXISTS tenants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text UNIQUE NOT NULL,
  name           text NOT NULL,
  logo_url       text,
  primary_color  text DEFAULT '#0ea5e9',
  enabled_modules text[] DEFAULT ARRAY['ban-hang','kho-hang','logistics','mua-hang','tai-chinh','bao-cao'],
  plan           text DEFAULT 'basic',
  address        text,
  phone          text,
  tax_code       text,
  is_platform    boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

-- 2. Thêm tenant_id vào users
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

-- 3. Insert tenant chủ app (platform owner)
INSERT INTO tenants (slug, name, primary_color, plan, is_platform)
VALUES ('mia-scm', 'Mia SCM', '#0ea5e9', 'enterprise', true)
ON CONFLICT (slug) DO NOTHING;

-- 4. Gán tất cả user hiện có vào platform tenant
UPDATE users
SET tenant_id = (SELECT id FROM tenants WHERE is_platform = true LIMIT 1)
WHERE tenant_id IS NULL;

-- 5. RLS tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Helper tránh infinite recursion trong RLS
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM users WHERE id = auth.uid() LIMIT 1;
$$;

-- User đọc tenant của mình
CREATE POLICY "tenant_select" ON tenants FOR SELECT
  USING (id = get_my_tenant_id());

-- Admin cập nhật tenant của mình
CREATE POLICY "tenant_update" ON tenants FOR UPDATE
  USING (id = get_my_tenant_id() AND get_my_role() = 'admin');

-- Platform owner đọc tất cả tenant (để quản lý)
CREATE POLICY "platform_select_all" ON tenants FOR SELECT
  USING ((SELECT is_platform FROM tenants WHERE id = get_my_tenant_id()) = true);

CREATE POLICY "platform_insert" ON tenants FOR INSERT
  WITH CHECK ((SELECT is_platform FROM tenants WHERE id = get_my_tenant_id()) = true);

-- 6. RLS users (nếu chưa có)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- User đọc đồng nghiệp cùng công ty
CREATE POLICY "users_select_same_tenant" ON users FOR SELECT
  USING (tenant_id = get_my_tenant_id());

-- Admin thêm/sửa/xóa user trong công ty mình
CREATE POLICY "users_admin_manage" ON users FOR ALL
  USING (get_my_role() = 'admin' AND tenant_id = get_my_tenant_id());

-- User tự cập nhật hồ sơ của mình
CREATE POLICY "users_self_update" ON users FOR UPDATE
  USING (id = auth.uid());
