-- =====================================================================
-- Mia SCM — SQL migrations for warehouse operations
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =====================================================================

-- Add missing columns to stock_receipts
ALTER TABLE stock_receipts ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE stock_receipts ADD COLUMN IF NOT EXISTS po_ref text;

-- Add missing columns to stock_issues
ALTER TABLE stock_issues ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE stock_issues ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers;

-- Chi tiết phiếu nhập kho
CREATE TABLE IF NOT EXISTS stock_receipt_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id  uuid REFERENCES stock_receipts ON DELETE CASCADE NOT NULL,
  product_id  uuid REFERENCES products NOT NULL,
  ordered_qty int NOT NULL DEFAULT 0,
  received_qty int DEFAULT 0,
  unit_price  bigint DEFAULT 0,
  lot_number  text DEFAULT '',
  expiry_date date,
  qc_passed   boolean,
  note        text
);

-- Chi tiết phiếu xuất kho
CREATE TABLE IF NOT EXISTS stock_issue_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id    uuid REFERENCES stock_issues ON DELETE CASCADE NOT NULL,
  product_id  uuid REFERENCES products NOT NULL,
  required_qty int NOT NULL DEFAULT 0,
  picked_qty  int DEFAULT 0,
  lot_number  text DEFAULT ''
);

-- Phiếu chuyển kho
CREATE TABLE IF NOT EXISTS stock_transfers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code              text UNIQUE NOT NULL,
  from_warehouse_id uuid REFERENCES warehouses NOT NULL,
  to_warehouse_id   uuid REFERENCES warehouses NOT NULL,
  transfer_date     date NOT NULL,
  reason            text,
  note              text,
  status            text DEFAULT 'pending',
  created_by        uuid REFERENCES users,
  created_at        timestamptz DEFAULT now()
);

-- Chi tiết phiếu chuyển kho
CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid REFERENCES stock_transfers ON DELETE CASCADE NOT NULL,
  product_id  uuid REFERENCES products NOT NULL,
  quantity    int NOT NULL,
  lot_number  text DEFAULT ''
);

-- Phiếu kiểm kê
CREATE TABLE IF NOT EXISTS stocktakes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code           text UNIQUE NOT NULL,
  warehouse_id   uuid REFERENCES warehouses NOT NULL,
  stocktake_date date NOT NULL,
  note           text,
  status         text DEFAULT 'open',
  created_by     uuid REFERENCES users,
  created_at     timestamptz DEFAULT now()
);

-- Chi tiết phiếu kiểm kê
CREATE TABLE IF NOT EXISTS stocktake_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_id uuid REFERENCES stocktakes ON DELETE CASCADE NOT NULL,
  product_id   uuid REFERENCES products NOT NULL,
  system_qty   int DEFAULT 0,
  counted_qty  int,
  note         text
);

-- Chi tiết đơn mua hàng (nếu chưa tồn tại)
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES purchase_orders ON DELETE CASCADE NOT NULL,
  product_id        uuid REFERENCES products NOT NULL,
  quantity          int NOT NULL DEFAULT 0,
  unit_price        bigint DEFAULT 0,
  subtotal          bigint DEFAULT 0
);
