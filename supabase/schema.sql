-- ============================================================
-- Mia SCM — Database Schema
-- Chạy file này trong Supabase Dashboard → SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS (dùng Supabase Auth kết hợp bảng profile)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  employee_code text UNIQUE,
  email text UNIQUE,
  pin_hash text,
  role text DEFAULT 'sales' CHECK (role IN ('admin','warehouse','sales','driver')),
  full_name text NOT NULL,
  phone text,
  avatar_url text,
  status text DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admin full access" ON users USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- ============================================================
-- CATEGORIES
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES categories,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON categories FOR SELECT TO authenticated USING (true);

-- ============================================================
-- CUSTOMER GROUPS
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  discount_pct numeric(5,2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE customer_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON customer_groups FOR SELECT TO authenticated USING (true);

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  short_name text,
  type text DEFAULT 'company' CHECK (type IN ('company','individual')),
  group_id uuid REFERENCES customer_groups,
  tax_code text,
  phone text,
  email text,
  address text,
  lat numeric(10,7),
  lng numeric(10,7),
  credit_limit bigint DEFAULT 0,
  payment_term int DEFAULT 30,
  status text DEFAULT 'active' CHECK (status IN ('active','paused','inactive')),
  assigned_to uuid REFERENCES users,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sales insert" ON customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Sales update" ON customers FOR UPDATE TO authenticated USING (true);

-- ============================================================
-- SUPPLIERS
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  type text DEFAULT 'distributor_l1' CHECK (type IN ('distributor_l1','manufacturer')),
  tax_code text,
  phone text,
  email text,
  address text,
  payment_term int DEFAULT 30,
  delivery_days int DEFAULT 3,
  credit_limit bigint DEFAULT 0,
  rating numeric(2,1) CHECK (rating BETWEEN 1 AND 5),
  status text DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated write" ON suppliers FOR ALL TO authenticated USING (true);

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text UNIQUE NOT NULL,
  name text NOT NULL,
  category_id uuid REFERENCES categories,
  supplier_id uuid REFERENCES suppliers,
  unit text NOT NULL DEFAULT 'thùng',
  purchase_price bigint DEFAULT 0,
  sale_price bigint DEFAULT 0,
  min_stock int DEFAULT 0,
  expiry_days int,
  image_url text,
  status text DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON products FOR SELECT TO authenticated USING (true);
CREATE POLICY "Warehouse write" ON products FOR ALL TO authenticated USING (true);

-- ============================================================
-- WAREHOUSES
-- ============================================================
CREATE TABLE IF NOT EXISTS warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  location text,
  lat numeric(10,7),
  lng numeric(10,7),
  capacity int,
  status text DEFAULT 'active' CHECK (status IN ('active','inactive'))
);
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON warehouses FOR SELECT TO authenticated USING (true);

-- ============================================================
-- INVENTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products NOT NULL,
  warehouse_id uuid REFERENCES warehouses NOT NULL,
  lot_number text,
  quantity int NOT NULL DEFAULT 0,
  expiry_date date,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(product_id, warehouse_id, lot_number)
);
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Warehouse write" ON inventory FOR ALL TO authenticated USING (true);

-- ============================================================
-- SALES ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  customer_id uuid REFERENCES customers NOT NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  delivery_date date,
  total_amount bigint DEFAULT 0,
  discount bigint DEFAULT 0,
  vat_amount bigint DEFAULT 0,
  final_amount bigint DEFAULT 0,
  payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  delivery_status text DEFAULT 'pending',
  status text DEFAULT 'new' CHECK (status IN ('new','confirmed','picking','delivering','completed','cancelled')),
  assigned_to uuid REFERENCES users,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON sales_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sales write" ON sales_orders FOR ALL TO authenticated USING (true);

-- ============================================================
-- SALES ORDER ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES sales_orders ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products NOT NULL,
  quantity int NOT NULL,
  unit_price bigint NOT NULL,
  discount_pct numeric(5,2) DEFAULT 0,
  subtotal bigint NOT NULL
);
ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON sales_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Sales write" ON sales_order_items FOR ALL TO authenticated USING (true);

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  supplier_id uuid REFERENCES suppliers NOT NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_date date,
  total_amount bigint DEFAULT 0,
  status text DEFAULT 'draft' CHECK (status IN ('draft','pending','sent','delivering','completed')),
  created_by uuid REFERENCES users,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Purchase write" ON purchase_orders FOR ALL TO authenticated USING (true);

-- ============================================================
-- PURCHASE ORDER ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES purchase_orders ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products NOT NULL,
  quantity int NOT NULL,
  unit_price bigint NOT NULL,
  subtotal bigint NOT NULL
);
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Purchase write" ON purchase_order_items FOR ALL TO authenticated USING (true);

-- ============================================================
-- STOCK RECEIPTS (phiếu nhập kho)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  purchase_order_id uuid REFERENCES purchase_orders,
  supplier_id uuid REFERENCES suppliers,
  warehouse_id uuid REFERENCES warehouses,
  receipt_date date NOT NULL DEFAULT CURRENT_DATE,
  total_amount bigint DEFAULT 0,
  status text DEFAULT 'pending' CHECK (status IN ('pending','qc_check','approved','completed','cancelled')),
  created_by uuid REFERENCES users,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE stock_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON stock_receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Warehouse write" ON stock_receipts FOR ALL TO authenticated USING (true);

-- ============================================================
-- STOCK RECEIPT ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid REFERENCES stock_receipts ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products NOT NULL,
  quantity int NOT NULL,
  unit_price bigint NOT NULL,
  lot_number text,
  expiry_date date,
  subtotal bigint NOT NULL
);
ALTER TABLE stock_receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON stock_receipt_items FOR SELECT TO authenticated USING (true);

-- ============================================================
-- STOCK ISSUES (phiếu xuất kho)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  sales_order_id uuid REFERENCES sales_orders,
  warehouse_id uuid REFERENCES warehouses,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  status text DEFAULT 'pending' CHECK (status IN ('pending','completed','cancelled')),
  created_by uuid REFERENCES users,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE stock_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON stock_issues FOR SELECT TO authenticated USING (true);
CREATE POLICY "Warehouse write" ON stock_issues FOR ALL TO authenticated USING (true);

-- ============================================================
-- VEHICLES
-- ============================================================
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate text UNIQUE NOT NULL,
  type text DEFAULT 'truck_5t' CHECK (type IN ('truck_5t','truck_3t','van','motorbike')),
  brand text,
  capacity_kg int,
  fuel_level int DEFAULT 100 CHECK (fuel_level BETWEEN 0 AND 100),
  insurance_expiry date,
  status text DEFAULT 'available' CHECK (status IN ('available','on_trip','maintenance','inactive'))
);
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Logistics write" ON vehicles FOR ALL TO authenticated USING (true);

-- ============================================================
-- DRIVERS
-- ============================================================
CREATE TABLE IF NOT EXISTS drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users,
  name text NOT NULL,
  phone text,
  license_type text CHECK (license_type IN ('B1','B2','C','D','E')),
  vehicle_id uuid REFERENCES vehicles,
  rating numeric(2,1) DEFAULT 5.0 CHECK (rating BETWEEN 1 AND 5),
  total_trips int DEFAULT 0,
  status text DEFAULT 'available' CHECK (status IN ('available','on_trip','off_duty'))
);
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON drivers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Logistics write" ON drivers FOR ALL TO authenticated USING (true);

-- ============================================================
-- DELIVERIES (đơn vận chuyển)
-- ============================================================
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  sales_order_id uuid REFERENCES sales_orders,
  vehicle_id uuid REFERENCES vehicles,
  driver_id uuid REFERENCES drivers,
  route text,
  origin_lat numeric(10,7),
  origin_lng numeric(10,7),
  dest_lat numeric(10,7),
  dest_lng numeric(10,7),
  planned_date timestamptz,
  actual_date timestamptz,
  distance_km numeric(8,2),
  freight_cost bigint DEFAULT 0,
  carrier_type text DEFAULT 'own' CHECK (carrier_type IN ('own','ghn','ghtk','ninja')),
  status text DEFAULT 'pending' CHECK (status IN ('pending','picking','delivering','delivered','delayed','failed')),
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read" ON deliveries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Logistics write" ON deliveries FOR ALL TO authenticated USING (true);

-- ============================================================
-- SEED: Dữ liệu mẫu cơ bản
-- ============================================================

-- Warehouses
INSERT INTO warehouses (code, name, location, lat, lng, capacity) VALUES
  ('KHO-HCM', 'Kho TP.HCM', '123 Nguyễn Văn Linh, Q.7, TP.HCM', 10.7285, 106.7040, 5000),
  ('KHO-HN', 'Kho Hà Nội', '45 Trường Chinh, Đống Đa, Hà Nội', 21.0285, 105.8412, 3000),
  ('KHO-DN', 'Kho Đà Nẵng', '78 Lê Duẩn, Hải Châu, Đà Nẵng', 16.0544, 108.2022, 2000)
ON CONFLICT (code) DO NOTHING;

-- Categories
INSERT INTO categories (name) VALUES
  ('Nhớt động cơ'),
  ('Phi gia động cơ'),
  ('Phụ gia'),
  ('Bao bì'),
  ('Hóa chất')
ON CONFLICT DO NOTHING;

-- Customer groups
INSERT INTO customer_groups (name, discount_pct) VALUES
  ('Khách sỉ lớn', 5.00),
  ('Khách sỉ nhỏ', 2.00),
  ('Khách lẻ', 0.00)
ON CONFLICT DO NOTHING;

-- ============================================================
-- Helper function: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
