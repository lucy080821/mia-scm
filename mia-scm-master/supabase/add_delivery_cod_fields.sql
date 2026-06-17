-- Migration: COD reconciliation + POD fields cho deliveries
-- Chạy trong Supabase SQL Editor

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS payment_method text,          -- 'cash' | 'transfer' | 'pending'
  ADD COLUMN IF NOT EXISTS fail_reason    text,          -- lý do giao thất bại
  ADD COLUMN IF NOT EXISTS driver_note    text,          -- ghi chú của tài xế
  ADD COLUMN IF NOT EXISTS pod_photo_url  text;          -- URL ảnh xác nhận giao hàng
