-- Migration: gán kho cho tài xế, xe và đơn vận chuyển
-- Chạy trong Supabase SQL Editor

ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL;

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL;

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES warehouses(id) ON DELETE SET NULL;

-- Index để filter nhanh
CREATE INDEX IF NOT EXISTS idx_drivers_warehouse  ON drivers(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_warehouse ON vehicles(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_warehouse ON deliveries(warehouse_id);
