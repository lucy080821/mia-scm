-- Thêm tenant_id vào driver_locations để phân tách data theo công ty
ALTER TABLE driver_locations
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Đổi conflict key từ driver_name đơn sang (driver_name, tenant_id)
-- (Supabase upsert dùng unique constraint)
ALTER TABLE driver_locations
  DROP CONSTRAINT IF EXISTS driver_locations_pkey;

ALTER TABLE driver_locations
  ADD CONSTRAINT driver_locations_pkey PRIMARY KEY (driver_name, tenant_id);
