-- Cho phép tạo đơn mua hàng draft không cần nhà cung cấp (AI-generated, admin điền sau)
ALTER TABLE purchase_orders ALTER COLUMN supplier_id DROP NOT NULL;
