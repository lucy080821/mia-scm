import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getServerTenantId } from '@/lib/server-auth'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'

export async function POST(req: NextRequest) {
  try {
    const tenantId = await getServerTenantId()
    if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { suppliers } = await req.json() as {
      suppliers: {
        id: string; code: string; name: string; type: string
        status: string; rating: number; payment_term: number
        delivery_days: number; total_orders: number; total_amount: number
      }[]
    }

    if (!suppliers?.length) {
      return NextResponse.json({ summary: 'Chưa có nhà cung cấp nào để phân tích.' })
    }

    // Get recent POs for these suppliers (last 90 days)
    const ago90 = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10)
    const { data: recentPOs } = await supabaseAdmin
      .from('purchase_orders')
      .select('supplier_id, status, total_amount, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', ago90)
      .in('status', ['sent', 'delivering', 'completed'])
      .limit(200)

    // Aggregate PO stats per supplier
    const poStats: Record<string, { count: number; amount: number; lastDate: string }> = {}
    for (const po of (recentPOs ?? []) as { supplier_id: string; total_amount: number; created_at: string }[]) {
      if (!po.supplier_id) continue
      if (!poStats[po.supplier_id]) poStats[po.supplier_id] = { count: 0, amount: 0, lastDate: '' }
      poStats[po.supplier_id].count++
      poStats[po.supplier_id].amount += po.total_amount ?? 0
      if (!poStats[po.supplier_id].lastDate || po.created_at > poStats[po.supplier_id].lastDate) {
        poStats[po.supplier_id].lastDate = po.created_at
      }
    }

    const key = process.env.GROQ_API_KEY
    if (!key) {
      return NextResponse.json({ error: 'GROQ_API_KEY chưa cấu hình' }, { status: 503 })
    }

    const supplierContext = suppliers.map(s => ({
      code: s.code,
      name: s.name,
      type: s.type === 'distributor_l1' ? 'Nhà phân phối' : 'Nhà sản xuất',
      status: s.status === 'active' ? 'Đang hợp tác' : s.status === 'paused' ? 'Tạm ngừng' : 'Ngừng HĐ',
      rating: s.rating ?? 0,
      payment_term: s.payment_term,
      delivery_days: s.delivery_days,
      orders_90d: poStats[s.id]?.count ?? 0,
      amount_90d: poStats[s.id]?.amount ?? 0,
      last_order_date: poStats[s.id]?.lastDate?.slice(0, 10) ?? null,
    }))

    const systemPrompt = `Bạn là chuyên gia phân tích chuỗi cung ứng cho doanh nghiệp phân phối FMCG tại Việt Nam.
Phân tích danh sách nhà cung cấp và đưa ra nhận xét thực tế, ngắn gọn.
Chỉ nhận xét dựa trên DỮ LIỆU THỰC được cung cấp. Không bịa đặt.
LUÔN dùng TÊN nhà cung cấp (name), KHÔNG dùng mã code.
Nếu dữ liệu quá ít (< 2 NCC hoặc chưa có lịch sử đơn hàng) thì summary ngắn gọn, alerts và recommendations để mảng rỗng, top/risk để null.
Trả về JSON hợp lệ (KHÔNG có markdown, KHÔNG có text ngoài JSON):
{
  "summary": "1-2 câu tổng quan về tình trạng NCC",
  "alerts": ["cảnh báo ngắn dùng TÊN NCC, vấn đề cụ thể"],
  "recommendations": ["đề xuất ngắn dùng TÊN NCC"],
  "top_supplier": "TÊN NCC hoạt động tốt nhất nếu có đủ dữ liệu, null nếu không",
  "risk_supplier": "TÊN NCC rủi ro nhất nếu có đủ dữ liệu, null nếu không"
}`

    const res = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        max_tokens: 600,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Danh sách NCC: ${JSON.stringify(supplierContext)}` },
        ],
      }),
    })

    if (!res.ok) throw new Error(`Groq lỗi ${res.status}`)
    const groqData = await res.json()
    const raw = groqData.choices[0].message.content as string
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const result = JSON.parse(cleaned)
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
