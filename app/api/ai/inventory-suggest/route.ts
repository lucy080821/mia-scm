import { NextRequest, NextResponse } from 'next/server'
import { getInventorySuggestions } from '@/lib/groq'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    // Nếu client gửi sẵn data thì dùng, không thì query DB
    let alertItems = body.alertItems as any[] | undefined
    let recentMovements = body.recentMovements as any[] | undefined

    if (!alertItems || alertItems.length === 0) {
      const { data: inv } = await supabaseAdmin
        .from('inventory')
        .select('quantity, product:products(id, sku, name, unit, min_stock), warehouse:warehouses(name)')
        .limit(200)

      if (inv) {
        type Row = { quantity: number; product: any; warehouse: any }
        alertItems = (inv as unknown as Row[])
          .filter(r => r.product && r.quantity <= (r.product.min_stock ?? 0))
          .map(r => ({
            sku: r.product.sku,
            name: r.product.name,
            unit: r.product.unit,
            stock: r.quantity,
            min_stock: r.product.min_stock,
            warehouse: r.warehouse?.name ?? '—',
            level: r.quantity === 0 ? 'critical' : 'warning',
          }))
      }
    }

    if (!recentMovements) {
      const [{ data: receipts }, { data: issues }] = await Promise.all([
        supabaseAdmin.from('stock_receipts').select('code, receipt_date').order('receipt_date', { ascending: false }).limit(10),
        supabaseAdmin.from('stock_issues').select('code, issue_date').order('issue_date', { ascending: false }).limit(10),
      ])
      recentMovements = [
        ...(receipts ?? []).map((r: any) => ({ code: r.code, type: 'in', date: r.receipt_date })),
        ...(issues ?? []).map((i: any) => ({ code: i.code, type: 'out', date: i.issue_date })),
      ]
    }

    if (!alertItems || alertItems.length === 0) {
      return NextResponse.json({
        suggestions: [],
        summary: 'Tất cả sản phẩm đang có tồn kho tốt, không có cảnh báo nào.',
        action_items: [],
      })
    }

    const result = await getInventorySuggestions(alertItems, recentMovements ?? [])
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Lỗi phân tích tồn kho' }, { status: 500 })
  }
}
