import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getCallerInfo(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabaseAdmin
    .from('users').select('role, tenant_id').eq('id', user.id).single()
  return profile ? { userId: user.id, ...profile } : null
}

function toNum(v: string): number | null {
  if (!v || !v.trim()) return null
  const n = Number(String(v).replace(/[,. ]/g, '').trim())
  return isNaN(n) ? null : n
}

function toDate(v: string): string | null {
  if (!v || !v.trim()) return null
  const parts = v.trim().split('/')
  if (parts.length !== 3) return null
  const iso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  return isNaN(Date.parse(iso)) ? null : iso
}

type ImportError = { line: number; message: string }

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> },
) {
  const { type } = await params
  const caller = await getCallerInfo(req)
  if (!caller || caller.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { rows } = (await req.json()) as { rows: Record<string, string>[] }
  if (!rows?.length) return NextResponse.json({ inserted: 0, errors: [] })

  let inserted = 0
  const errors: ImportError[] = []

  // ── PRODUCTS ──────────────────────────────────────────────────────────────
  if (type === 'products') {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        let supplierId: string | null = null
        if (row.supplier?.trim()) {
          const { data } = await supabaseAdmin
            .from('suppliers').select('id').ilike('name', row.supplier.trim()).maybeSingle()
          supplierId = data?.id ?? null
        }
        let categoryId: string | null = null
        if (row.category?.trim()) {
          const { data } = await supabaseAdmin
            .from('categories').select('id').ilike('name', row.category.trim()).maybeSingle()
          categoryId = data?.id ?? null
        }
        const { data: productData, error } = await supabaseAdmin.from('products').insert({
          sku:              row.sku?.trim(),
          name:             row.name?.trim(),
          category_id:      categoryId,
          supplier_id:      supplierId,
          unit:             row.unit?.trim() || 'cái',
          purchase_price:   toNum(row.purchase_price) ?? 0,
          sale_price:       toNum(row.sale_price) ?? 0,
          min_stock:        toNum(row.min_stock) ?? 0,
          expiry_days:      toNum(row.expiry_days),
          manufacture_date: toDate(row.manufacture_date),
          status:           row.status?.trim() || 'active',
          tenant_id:        caller.tenant_id,
        }).select('id').single()
        if (error) throw new Error(error.message)

        // Tạo inventory record nếu có warehouse_code và initial_quantity
        const initQty = toNum(row.initial_quantity)
        if (row.warehouse_code?.trim() && initQty && initQty > 0 && productData) {
          const { data: wh } = await supabaseAdmin
            .from('warehouses').select('id').eq('code', row.warehouse_code.trim()).maybeSingle()
          if (wh) {
            await supabaseAdmin.from('inventory').insert({
              product_id:   productData.id,
              warehouse_id: wh.id,
              quantity:     initQty,
              lot_number:   null,
              tenant_id:    caller.tenant_id,
            })
          }
        }

        inserted++
      } catch (e: unknown) {
        errors.push({ line: i + 2, message: e instanceof Error ? e.message : String(e) })
      }
    }

  // ── CUSTOMERS ─────────────────────────────────────────────────────────────
  } else if (type === 'customers') {
    const { count: existing } = await supabaseAdmin
      .from('customers').select('*', { count: 'exact', head: true })
    let seq = (existing ?? 0) + 1

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const code = row.code?.trim() || `CUS${String(seq++).padStart(4, '0')}`
        const { error } = await supabaseAdmin.from('customers').insert({
          code,
          name:           row.name?.trim(),
          short_name:     row.short_name?.trim() || null,
          type:           row.type?.trim() || 'company',
          phone:          row.phone?.trim() || null,
          email:          row.email?.trim() || null,
          address:        row.address?.trim() || null,
          credit_limit:   toNum(row.credit_limit) ?? 0,
          payment_term:   toNum(row.payment_term) ?? 30,
          status:         row.status?.trim() || 'active',
          tenant_id:      caller.tenant_id,
        })
        if (error) throw new Error(error.message)
        inserted++
      } catch (e: unknown) {
        errors.push({ line: i + 2, message: e instanceof Error ? e.message : String(e) })
      }
    }

  // ── SUPPLIERS ─────────────────────────────────────────────────────────────
  } else if (type === 'suppliers') {
    const { count: existing } = await supabaseAdmin
      .from('suppliers').select('*', { count: 'exact', head: true })
    let seq = (existing ?? 0) + 1

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const code = row.code?.trim() || `NCC${String(seq++).padStart(4, '0')}`
        const { error } = await supabaseAdmin.from('suppliers').insert({
          code,
          name:           row.name?.trim(),
          type:           row.type?.trim() || 'manufacturer',
          tax_code:       row.tax_code?.trim() || null,
          phone:          row.phone?.trim() || null,
          email:          row.email?.trim() || null,
          address:        row.address?.trim() || null,
          payment_term:   toNum(row.payment_term) ?? 30,
          delivery_days:  toNum(row.delivery_days) ?? 3,
          rating:         toNum(row.rating),
          status:         'active',
          tenant_id:      caller.tenant_id,
        })
        if (error) throw new Error(error.message)
        inserted++
      } catch (e: unknown) {
        errors.push({ line: i + 2, message: e instanceof Error ? e.message : String(e) })
      }
    }

  // ── INVENTORY ─────────────────────────────────────────────────────────────
  } else if (type === 'inventory') {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const { data: product } = await supabaseAdmin
          .from('products').select('id').eq('sku', row.sku?.trim()).maybeSingle()
        if (!product) throw new Error(`Không tìm thấy SKU: ${row.sku}`)

        const { data: warehouse } = await supabaseAdmin
          .from('warehouses').select('id').eq('code', row.warehouse_code?.trim()).maybeSingle()
        if (!warehouse) throw new Error(`Không tìm thấy kho: ${row.warehouse_code}`)

        const { error } = await supabaseAdmin.from('inventory').insert({
          product_id:   product.id,
          warehouse_id: warehouse.id,
          lot_number:   row.lot_number?.trim() || null,
          quantity:     toNum(row.quantity) ?? 0,
          expiry_date:  toDate(row.expiry_date),
          tenant_id:    caller.tenant_id,
        })
        if (error) throw new Error(error.message)
        inserted++
      } catch (e: unknown) {
        errors.push({ line: i + 2, message: e instanceof Error ? e.message : String(e) })
      }
    }

  // ── EMPLOYEES ─────────────────────────────────────────────────────────────
  } else if (type === 'employees') {
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      try {
        const password = row.pin?.trim() || '123456'
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email:          row.email?.trim(),
          password,
          email_confirm:  true,
          user_metadata:  { full_name: row.full_name, role: row.role },
        })
        if (authError) throw new Error(authError.message)

        const { error: profileError } = await supabaseAdmin.from('users').insert({
          id:             authData.user.id,
          email:          row.email?.trim(),
          full_name:      row.full_name?.trim(),
          phone:          row.phone?.trim() || null,
          role:           row.role?.trim() || 'sales',
          employee_code:  row.employee_code?.trim() || null,
          status:         row.status?.trim() || 'active',
          tenant_id:      caller.tenant_id,
        })
        if (profileError) {
          await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
          throw new Error(profileError.message)
        }
        inserted++
      } catch (e: unknown) {
        errors.push({ line: i + 2, message: e instanceof Error ? e.message : String(e) })
      }
    }

  } else {
    return NextResponse.json({ error: 'Loại import không hợp lệ' }, { status: 400 })
  }

  return NextResponse.json({ inserted, errors })
}
