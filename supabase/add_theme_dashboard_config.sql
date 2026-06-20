-- ============================================================
-- Mia SCM — Add theme_config and dashboard_config to tenants
-- Chạy trong Supabase Dashboard → SQL Editor
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS theme_config JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS dashboard_config JSONB DEFAULT '[]';

COMMENT ON COLUMN tenants.theme_config IS 'Per-tenant UI theme: sidebarBg, accentColor, fontFamily, fontSize';
COMMENT ON COLUMN tenants.dashboard_config IS 'Per-tenant dashboard widget visibility config: [{id, enabled}]';
