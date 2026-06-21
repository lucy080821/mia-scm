-- Fix: unique constraints on customers/suppliers should be per-tenant, not global
-- This allows different tenants to have the same customer/supplier codes

-- Customers
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_code_key;
ALTER TABLE customers ADD CONSTRAINT customers_code_tenant_key UNIQUE (code, tenant_id);

-- Suppliers
ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_code_key;
ALTER TABLE suppliers ADD CONSTRAINT suppliers_code_tenant_key UNIQUE (code, tenant_id);
