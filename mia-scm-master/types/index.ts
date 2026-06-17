export interface Customer {
  id: string
  code: string
  name: string
  short_name?: string
  type: 'company' | 'individual'
  tax_code?: string
  phone?: string
  email?: string
  address?: string
  credit_limit: number
  payment_term: number
  status: 'active' | 'paused' | 'inactive'
  assigned_to?: string
  created_at: string
  updated_at: string
}

export interface Supplier {
  id: string
  code: string
  name: string
  type: 'distributor_l1' | 'manufacturer'
  tax_code?: string
  phone?: string
  email?: string
  address?: string
  payment_term: number
  delivery_days: number
  credit_limit: number
  rating?: number
  status: 'active' | 'inactive'
  created_at: string
}

export interface Product {
  id: string
  sku: string
  name: string
  category_id?: string
  supplier_id?: string
  unit: string
  purchase_price: number
  sale_price: number
  min_stock: number
  expiry_days?: number
  status: 'active' | 'inactive'
  created_at: string
}

export interface Warehouse {
  id: string
  code: string
  name: string
  location?: string
  capacity?: number
  status: 'active' | 'inactive'
}

export interface InventoryItem {
  id: string
  product_id: string
  warehouse_id: string
  lot_number?: string
  quantity: number
  expiry_date?: string
  updated_at: string
  product?: Product
  warehouse?: Warehouse
}

export interface SalesOrder {
  id: string
  code: string
  customer_id: string
  order_date: string
  delivery_date?: string
  total_amount: number
  discount: number
  vat_amount: number
  final_amount: number
  payment_status: 'unpaid' | 'partial' | 'paid'
  delivery_status: string
  status: 'new' | 'confirmed' | 'picking' | 'delivering' | 'completed' | 'cancelled'
  assigned_to?: string
  note?: string
  created_at: string
  customer?: Customer
}

export interface SalesOrderItem {
  id: string
  order_id: string
  product_id: string
  quantity: number
  unit_price: number
  discount_pct: number
  subtotal: number
  product?: Product
}

export interface PurchaseOrder {
  id: string
  code: string
  supplier_id: string
  order_date: string
  expected_date?: string
  total_amount: number
  status: 'draft' | 'pending' | 'sent' | 'delivering' | 'completed'
  created_by?: string
  note?: string
  created_at: string
  supplier?: Supplier
}

export interface Delivery {
  id: string
  code: string
  sales_order_id?: string
  vehicle_id?: string
  driver_id?: string
  route?: string
  planned_date?: string
  actual_date?: string
  distance_km?: number
  freight_cost: number
  carrier_type: 'own' | 'ghn' | 'ghtk'
  status: 'pending' | 'picking' | 'delivering' | 'delivered' | 'delayed' | 'failed'
  created_at: string
  driver?: Driver
  vehicle?: Vehicle
}

export interface Vehicle {
  id: string
  plate: string
  type: 'truck_5t' | 'truck_3t'
  brand?: string
  capacity_kg?: number
  fuel_level: number
  insurance_expiry?: string
  status: 'available' | 'on_trip' | 'maintenance' | 'inactive'
}

export interface Driver {
  id: string
  name: string
  phone?: string
  license_type?: string
  vehicle_id?: string
  rating?: number
  total_trips: number
  status: 'available' | 'on_trip' | 'off_duty'
}

export type StatusKey =
  | 'completed' | 'active' | 'pending' | 'delivering'
  | 'cancelled' | 'delayed' | 'draft' | 'new' | 'confirmed'
  | 'picking' | 'paid' | 'unpaid' | 'partial' | 'available'
  | 'on_trip' | 'maintenance' | 'inactive' | 'paused'
  | 'sent' | 'delivered' | 'failed' | 'qc_check' | 'approved'
