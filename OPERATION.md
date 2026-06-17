# LUỒNG VẬN HÀNH (WORKFLOW) — Mia SCM

Tài liệu này biến Mia SCM từ "app xem" thành "app vận hành". Mỗi thao tác là một hành động có hậu quả — thay đổi tồn kho, công nợ, trạng thái đơn.

## Khác biệt cốt lõi

| App xem (hiện tại) | App vận hành (cần xây) |
|---|---|
| Hiển thị data có sẵn | Mỗi nút bấm ghi vào DB |
| Không đổi trạng thái | State machine đầy đủ |
| Kho: xem tồn | Kho: quét mã, trừ tồn thật |
| Tài xế: xem đơn | Tài xế: chụp ảnh, ký, thu COD |

---

## 1. State Machine của đơn hàng

```
[Mới] ──xác nhận──> [Đã xác nhận] ──tạo phiếu xuất──> [Chờ soạn]
                                                          │
                                                      soạn hàng
                                                          ↓
                                                    [Đang soạn]
                                                          │
                                                    xác nhận xuất
                                                          ↓
                                                   [Đã xuất kho]
                                                          │
                                                      phân tuyến
                                                          ↓
                                                    [Chờ giao]
                                                          │
                                                      điều xe
                                                          ↓
                                                   [Đang giao] ──giao xong──> [Hoàn thành]
                                                          │
                                                     giao thất bại
                                                          ↓
                                                   [Giao lỗi] ──> giao lại / hoàn kho

  Bất kỳ trạng thái nào trước [Đã xuất kho] đều có thể ──> [Đã hủy]
```

### Định nghĩa trạng thái + ai được chuyển

```typescript
// lib/workflow/orderStateMachine.ts

export type OrderStatus =
  | 'new'           // Mới tạo
  | 'confirmed'     // Đã xác nhận (sales)
  | 'picking'       // Đang soạn hàng (kho)
  | 'picked'        // Đã xuất kho (kho)
  | 'pending_ship'  // Chờ giao (logistics)
  | 'delivering'    // Đang giao (tài xế)
  | 'completed'     // Hoàn thành
  | 'failed'        // Giao lỗi
  | 'cancelled'     // Đã hủy

// Chuyển trạng thái hợp lệ: từ trạng thái nào → được sang trạng thái nào, ai làm
export const TRANSITIONS: Record<OrderStatus, { to: OrderStatus; role: string; action: string }[]> = {
  new: [
    { to: 'confirmed', role: 'sales', action: 'Xác nhận đơn' },
    { to: 'cancelled', role: 'sales', action: 'Hủy đơn' },
  ],
  confirmed: [
    { to: 'picking', role: 'warehouse', action: 'Bắt đầu soạn hàng' },
    { to: 'cancelled', role: 'sales', action: 'Hủy đơn' },
  ],
  picking: [
    { to: 'picked', role: 'warehouse', action: 'Xác nhận xuất kho' },
  ],
  picked: [
    { to: 'pending_ship', role: 'logistics', action: 'Phân tuyến giao' },
  ],
  pending_ship: [
    { to: 'delivering', role: 'logistics', action: 'Điều xe giao hàng' },
  ],
  delivering: [
    { to: 'completed', role: 'driver', action: 'Xác nhận đã giao' },
    { to: 'failed', role: 'driver', action: 'Báo giao thất bại' },
  ],
  failed: [
    { to: 'delivering', role: 'logistics', action: 'Giao lại' },
    { to: 'picked', role: 'logistics', action: 'Hoàn về kho' },
  ],
  completed: [],
  cancelled: [],
}

// Kiểm tra chuyển trạng thái có hợp lệ không
export function canTransition(from: OrderStatus, to: OrderStatus, role: string): boolean {
  return TRANSITIONS[from]?.some(t => t.to === to && (t.role === role || role === 'admin')) ?? false
}
```

---

## 2. Thao tác BÁN HÀNG — Tạo & xác nhận đơn

```typescript
// lib/workflow/createOrder.ts
import { supabase } from '@/lib/supabase'

interface OrderItem { product_id: string; quantity: number; unit_price: number }

// Tạo đơn — trạng thái 'new', CHƯA trừ kho
export async function createOrder(input: {
  customer_id: string
  items: OrderItem[]
  delivery_date: string
}) {
  // 1. Kiểm tra tồn kho đủ không (cảnh báo, chưa trừ)
  for (const item of input.items) {
    const { data: inv } = await supabase
      .from('inventory')
      .select('quantity')
      .eq('product_id', item.product_id)
    const totalStock = inv?.reduce((s, i) => s + i.quantity, 0) ?? 0
    if (totalStock < item.quantity) {
      throw new Error(`Không đủ tồn kho cho sản phẩm. Còn ${totalStock}, cần ${item.quantity}`)
    }
  }

  // 2. Tạo đơn + chi tiết (dùng RPC để transaction an toàn)
  const { data, error } = await supabase.rpc('create_sales_order', {
    p_customer_id: input.customer_id,
    p_items: input.items,
    p_delivery_date: input.delivery_date,
  })
  if (error) throw new Error(`Lỗi tạo đơn: ${error.message}`)
  return data
}

// Xác nhận đơn — tự sinh phiếu xuất + đơn vận chuyển
export async function confirmOrder(orderId: string) {
  // RPC làm 3 việc trong 1 transaction:
  // - Đổi status đơn: new → confirmed
  // - Tạo phiếu xuất kho (status: pending)
  // - Tạo đơn vận chuyển (status: pending)
  const { data, error } = await supabase.rpc('confirm_order_create_documents', {
    p_order_id: orderId,
  })
  if (error) throw new Error(`Lỗi xác nhận đơn: ${error.message}`)
  return data
}
```

```sql
-- Postgres function: xác nhận đơn + tạo chứng từ (transaction)
CREATE OR REPLACE FUNCTION confirm_order_create_documents(p_order_id uuid)
RETURNS json AS $$
DECLARE
  v_issue_id uuid;
  v_delivery_id uuid;
BEGIN
  -- Đổi trạng thái đơn
  UPDATE sales_orders SET status = 'confirmed' WHERE id = p_order_id;

  -- Tạo phiếu xuất kho
  INSERT INTO stock_issues (code, sales_order_id, status, issue_date)
  VALUES (generate_code('PX'), p_order_id, 'pending', now())
  RETURNING id INTO v_issue_id;

  -- Tạo đơn vận chuyển
  INSERT INTO deliveries (code, sales_order_id, status)
  VALUES (generate_code('DV'), p_order_id, 'pending')
  RETURNING id INTO v_delivery_id;

  RETURN json_build_object('issue_id', v_issue_id, 'delivery_id', v_delivery_id);
END;
$$ LANGUAGE plpgsql;
```

---

## 3. Thao tác KHO — Soạn hàng (trừ tồn thật)

```typescript
// lib/workflow/picking.ts
import { supabase } from '@/lib/supabase'

// Quét/nhập 1 SKU khi soạn hàng
export async function pickItem(input: {
  issue_id: string
  product_id: string
  warehouse_id: string
  quantity: number
  lot_number?: string   // FEFO: lô được chọn
}) {
  // RPC: trừ tồn kho theo lô + ghi nhận đã soạn (transaction)
  const { data, error } = await supabase.rpc('pick_item_reduce_stock', {
    p_issue_id: input.issue_id,
    p_product_id: input.product_id,
    p_warehouse_id: input.warehouse_id,
    p_quantity: input.quantity,
    p_lot_number: input.lot_number,
  })
  if (error) throw new Error(`Lỗi soạn hàng: ${error.message}`)
  return data
}

// Gợi ý lô theo FEFO (hết hạn trước xuất trước)
export async function getFefoLots(product_id: string, warehouse_id: string) {
  const { data } = await supabase
    .from('inventory')
    .select('lot_number, quantity, expiry_date')
    .eq('product_id', product_id)
    .eq('warehouse_id', warehouse_id)
    .gt('quantity', 0)
    .order('expiry_date', { ascending: true })  // ← FEFO: hạn gần nhất trước
  return data
}

// Hoàn tất soạn → chuyển đơn sang 'picked'
export async function completePicking(issue_id: string, order_id: string) {
  const { error } = await supabase.rpc('complete_picking', {
    p_issue_id: issue_id,
    p_order_id: order_id,
  })
  if (error) throw new Error(`Lỗi hoàn tất soạn: ${error.message}`)
}
```

```sql
-- Trừ tồn kho theo lô khi soạn hàng
CREATE OR REPLACE FUNCTION pick_item_reduce_stock(
  p_issue_id uuid, p_product_id uuid, p_warehouse_id uuid,
  p_quantity int, p_lot_number text
) RETURNS void AS $$
BEGIN
  -- Trừ tồn kho lô cụ thể
  UPDATE inventory
  SET quantity = quantity - p_quantity, updated_at = now()
  WHERE product_id = p_product_id
    AND warehouse_id = p_warehouse_id
    AND lot_number = p_lot_number;

  -- Kiểm tra không âm
  IF (SELECT quantity FROM inventory WHERE product_id = p_product_id
      AND warehouse_id = p_warehouse_id AND lot_number = p_lot_number) < 0 THEN
    RAISE EXCEPTION 'Tồn kho không đủ cho lô %', p_lot_number;
  END IF;

  -- Ghi nhận dòng đã soạn vào phiếu xuất
  INSERT INTO stock_issue_items (issue_id, product_id, quantity, lot_number)
  VALUES (p_issue_id, p_product_id, p_quantity, p_lot_number);
END;
$$ LANGUAGE plpgsql;
```

---

## 4. Thao tác KIỂM KÊ — Đếm thực tế + điều chỉnh

```typescript
// lib/workflow/stocktake.ts

// Nhập số đếm thực tế cho 1 SKU
export async function recordCount(input: {
  stocktake_id: string
  product_id: string
  counted_qty: number   // số đếm thực tế
}) {
  // Lấy tồn hệ thống để tính chênh lệch
  const { data: inv } = await supabase
    .from('inventory')
    .select('quantity')
    .eq('product_id', input.product_id)
  const systemQty = inv?.reduce((s, i) => s + i.quantity, 0) ?? 0
  const diff = input.counted_qty - systemQty

  await supabase.from('stocktake_items').upsert({
    stocktake_id: input.stocktake_id,
    product_id: input.product_id,
    system_qty: systemQty,
    counted_qty: input.counted_qty,
    diff,
  }, { onConflict: 'stocktake_id,product_id' })

  return { systemQty, counted: input.counted_qty, diff }
}

// Duyệt kiểm kê → điều chỉnh tồn kho theo số đếm thực
export async function approveStocktake(stocktake_id: string) {
  // RPC: cập nhật tồn kho = số đếm thực, ghi log điều chỉnh
  const { error } = await supabase.rpc('approve_stocktake_adjust', {
    p_stocktake_id: stocktake_id,
  })
  if (error) throw new Error(`Lỗi duyệt kiểm kê: ${error.message}`)
}
```

---

## 5. Thao tác TÀI XẾ — Giao hàng (app mobile)

```typescript
// lib/workflow/delivery.ts

// Bắt đầu giao 1 đơn
export async function startDelivery(delivery_id: string) {
  const { error } = await supabase
    .from('deliveries')
    .update({ status: 'delivering', actual_start: new Date().toISOString() })
    .eq('id', delivery_id)
  if (error) throw new Error(`Lỗi: ${error.message}`)

  // Đồng bộ trạng thái đơn hàng
  await updateOrderStatus(delivery_id, 'delivering')
}

// Xác nhận giao thành công — chứng từ giao hàng (POD)
export async function completeDelivery(input: {
  delivery_id: string
  order_id: string
  photo_url: string        // ảnh giao hàng (upload Supabase Storage)
  signature_url: string    // chữ ký người nhận
  cod_collected: number    // tiền COD đã thu
  payment_method: 'cash' | 'transfer'
}) {
  // RPC: cập nhật giao + công nợ + trạng thái đơn (transaction)
  const { error } = await supabase.rpc('complete_delivery_update_debt', {
    p_delivery_id: input.delivery_id,
    p_order_id: input.order_id,
    p_photo_url: input.photo_url,
    p_signature_url: input.signature_url,
    p_cod_collected: input.cod_collected,
    p_payment_method: input.payment_method,
  })
  if (error) throw new Error(`Lỗi hoàn tất giao: ${error.message}`)
}

// Báo giao thất bại
export async function failDelivery(input: {
  delivery_id: string
  reason: string           // 'khách vắng' | 'khách từ chối' | 'sai địa chỉ'
  photo_url?: string
  note?: string
}) {
  await supabase
    .from('deliveries')
    .update({
      status: 'failed',
      fail_reason: input.reason,
      fail_photo: input.photo_url,
      fail_note: input.note,
    })
    .eq('id', input.delivery_id)
}

// Upload ảnh giao hàng lên Supabase Storage
export async function uploadDeliveryPhoto(delivery_id: string, file: File) {
  const path = `deliveries/${delivery_id}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from('delivery-proofs').upload(path, file)
  if (error) throw new Error(`Lỗi upload ảnh: ${error.message}`)
  const { data } = supabase.storage.from('delivery-proofs').getPublicUrl(path)
  return data.publicUrl
}
```

```sql
-- Hoàn tất giao: cập nhật đơn + công nợ trong 1 transaction
CREATE OR REPLACE FUNCTION complete_delivery_update_debt(
  p_delivery_id uuid, p_order_id uuid, p_photo_url text,
  p_signature_url text, p_cod_collected bigint, p_payment_method text
) RETURNS void AS $$
DECLARE v_customer_id uuid; v_final_amount bigint;
BEGIN
  -- Cập nhật đơn giao
  UPDATE deliveries SET status = 'delivered', actual_date = now(),
    proof_photo = p_photo_url, signature = p_signature_url,
    cod_collected = p_cod_collected
  WHERE id = p_delivery_id;

  -- Cập nhật đơn hàng → hoàn thành
  UPDATE sales_orders SET status = 'completed',
    payment_status = CASE WHEN p_cod_collected >= final_amount THEN 'paid' ELSE 'partial' END
  WHERE id = p_order_id
  RETURNING customer_id, final_amount INTO v_customer_id, v_final_amount;

  -- Cập nhật công nợ khách (nếu chưa thu đủ)
  IF p_cod_collected < v_final_amount THEN
    UPDATE customers SET current_debt = current_debt + (v_final_amount - p_cod_collected)
    WHERE id = v_customer_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

---

## 6. Bảng bổ sung cần thêm vào schema

```sql
-- Chi tiết phiếu xuất (dòng đã soạn)
CREATE TABLE stock_issue_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid REFERENCES stock_issues ON DELETE CASCADE,
  product_id uuid REFERENCES products,
  quantity int NOT NULL,
  lot_number text,
  picked_at timestamptz DEFAULT now()
);

-- Chi tiết kiểm kê
CREATE TABLE stocktake_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stocktake_id uuid REFERENCES stocktakes ON DELETE CASCADE,
  product_id uuid REFERENCES products,
  system_qty int NOT NULL,
  counted_qty int,
  diff int,
  UNIQUE(stocktake_id, product_id)
);

-- Thêm cột cho deliveries (chứng từ giao hàng)
ALTER TABLE deliveries ADD COLUMN proof_photo text;
ALTER TABLE deliveries ADD COLUMN signature text;
ALTER TABLE deliveries ADD COLUMN cod_collected bigint DEFAULT 0;
ALTER TABLE deliveries ADD COLUMN fail_reason text;
ALTER TABLE deliveries ADD COLUMN fail_photo text;
ALTER TABLE deliveries ADD COLUMN actual_start timestamptz;

-- Log mọi thay đổi trạng thái (audit trail)
CREATE TABLE order_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES sales_orders,
  from_status text,
  to_status text,
  changed_by uuid REFERENCES users,
  note text,
  created_at timestamptz DEFAULT now()
);
```

---

## 7. Component: nút hành động theo trạng thái

```tsx
// components/workflow/OrderActions.tsx
'use client'
import { TRANSITIONS, type OrderStatus } from '@/lib/workflow/orderStateMachine'
import { usePermission } from '@/hooks/usePermission'

export function OrderActions({ order }: { order: { id: string; status: OrderStatus } }) {
  const { role } = usePermission()

  // Chỉ hiện nút cho trạng thái hiện tại + role được phép
  const availableActions = TRANSITIONS[order.status]
    .filter(t => t.role === role || role === 'admin')

  return (
    <div className="flex gap-2">
      {availableActions.map(action => (
        <button
          key={action.to}
          onClick={() => handleAction(order.id, action.to)}
          className="btn btn-primary"
        >
          {action.action}
        </button>
      ))}
    </div>
  )
}
```

---

## 8. Checklist xây phần vận hành

```
BÁN HÀNG
[ ] Màn tạo đơn: chọn khách → thêm SP → tính tiền (có check tồn)
[ ] Nút xác nhận đơn → RPC tạo phiếu xuất + đơn VC
[ ] Nút sửa/hủy đơn (theo state machine)

KHO
[ ] Màn soạn hàng: quét mã / nhập SKU → trừ tồn theo FEFO
[ ] Gợi ý lô FEFO tự động
[ ] Nút hoàn tất soạn → đơn sang 'picked'
[ ] Màn kiểm kê: nhập đếm thực → tính chênh lệch → duyệt điều chỉnh

LOGISTICS
[ ] Phân tuyến + gán xe/tài xế
[ ] Điều xe → đẩy xuống app tài xế

APP TÀI XẾ (mobile / PWA)
[ ] Danh sách đơn được giao
[ ] Bắt đầu giao + định vị
[ ] Chụp ảnh + lấy chữ ký + thu COD
[ ] Báo giao thất bại
[ ] RPC hoàn tất → cập nhật công nợ

CHUNG
[ ] State machine + kiểm tra transition hợp lệ
[ ] order_status_log — ghi mọi thay đổi (audit)
[ ] Tất cả thao tác đổi DB phải qua RPC (transaction an toàn)
```

---

## Tóm tắt

Điểm mấu chốt biến app từ "xem" thành "vận hành":

1. **State machine** — đơn đi qua các trạng thái, mỗi chuyển có role được phép
2. **Mọi thao tác có hậu quả** — xác nhận đơn tạo phiếu xuất, soạn hàng trừ tồn, giao xong cập nhật công nợ
3. **Transaction qua RPC** — thao tác nhiều bảng phải atomic, không để tồn kho sai
4. **App tài xế riêng** — mobile/PWA với chụp ảnh, ký, COD
5. **Audit log** — ghi lại ai đổi gì khi nào