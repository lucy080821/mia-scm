import { NextRequest, NextResponse } from 'next/server'
import { parseOrderFromText } from '@/lib/groq'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json()
    if (!text?.trim()) {
      return NextResponse.json({ error: 'Thiếu nội dung tin nhắn' }, { status: 400 })
    }

    const { data: products } = await supabaseAdmin
      .from('products')
      .select('id, name, sku, unit, sale_price')
      .eq('status', 'active')
      .limit(100)

    const result = await parseOrderFromText(text, products ?? [])
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err.message ?? 'Lỗi phân tích đơn hàng' }, { status: 500 })
  }
}
