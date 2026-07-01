const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

async function groqChat(systemPrompt: string, userMessage: string): Promise<string> {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY chưa được cấu hình trong .env.local')

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.3,
      max_tokens: 1500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Groq API lỗi ${res.status}: ${err}`)
  }

  const data = await res.json()
  return data.choices[0].message.content as string
}

// ── Parse đơn hàng từ tin nhắn Zalo/text ─────────────────────────────────────
export interface ParsedOrderItem {
  product_id: string
  product_name: string
  unit: string
  qty: number
  unit_price: number
  confidence: number
}
export interface ParseOrderResult {
  items: ParsedOrderItem[]
  delivery_note: string
  customer_hint: string
  overall_confidence: number
  raw_note: string
}

export async function parseOrderFromText(
  text: string,
  products: { id: string; name: string; sku: string; unit: string; sale_price: number }[]
): Promise<ParseOrderResult> {
  const systemPrompt = `Bạn là AI chuyên phân tích đơn hàng FMCG cho nhà phân phối Việt Nam.
Nhiệm vụ: Đọc tin nhắn đặt hàng (Zalo/chat) và trích xuất thông tin đơn hàng.
Danh sách sản phẩm hiện có: ${JSON.stringify(products.map(p => ({ id: p.id, name: p.name, sku: p.sku, unit: p.unit, price: p.sale_price })))}

Trả về JSON hợp lệ theo schema sau (KHÔNG có markdown, KHÔNG có text ngoài JSON):
{
  "items": [{ "product_id": "uuid", "product_name": "tên SP", "unit": "đơn vị", "qty": số, "unit_price": giá, "confidence": 0-100 }],
  "delivery_note": "ghi chú giao hàng từ tin nhắn",
  "customer_hint": "tên/gợi ý khách hàng nếu có",
  "overall_confidence": 0-100,
  "raw_note": "các thông tin khác chưa phân loại được"
}`

  const raw = await groqChat(systemPrompt, `Tin nhắn đặt hàng: "${text}"`)

  // Strip possible markdown code block
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as ParseOrderResult
}

// ── Gợi ý đặt hàng từ dữ liệu tồn kho ───────────────────────────────────────
export interface InventorySuggestion {
  product_id: string
  product_name: string
  current_stock: number
  min_stock: number
  suggested_qty: number
  urgency: 'critical' | 'warning' | 'normal'
  reason: string
  supplier_name?: string
}
export interface InventorySuggestResult {
  suggestions: InventorySuggestion[]
  summary: string
  action_items: string[]
}

export async function getInventorySuggestions(
  alertItems: {
    sku: string; name: string; unit: string; stock: number; min_stock: number
    warehouse: string; level: string
    avg_daily_sales?: number; rop?: number; safety_stock?: number; eoq?: number; abc_class?: string
  }[],
  recentMovements: { code: string; type: string; date: string }[]
): Promise<InventorySuggestResult> {
  const systemPrompt = `Bạn là AI quản lý kho FMCG cho nhà phân phối Việt Nam.
Phân tích dữ liệu tồn kho (có ROP, Safety Stock, EOQ, ABC) và đưa ra gợi ý đặt hàng tối ưu.
- Ưu tiên: nhóm A (abc_class=A) xử lý trước nhóm B, C
- suggested_qty nên bám theo EOQ nếu có, hoặc đủ để bù về ROP
- Đề cập ROP/EOQ trong phần reason nếu liên quan
Trả về JSON hợp lệ (KHÔNG có markdown):
{
  "suggestions": [{ "product_id": "id hoặc sku", "product_name": "tên", "current_stock": số, "min_stock": số, "suggested_qty": số_gợi_ý, "urgency": "critical|warning|normal", "reason": "lý do ngắn gọn", "supplier_name": "NCC nếu biết" }],
  "summary": "tóm tắt tình trạng kho 1-2 câu",
  "action_items": ["hành động ưu tiên 1", "hành động ưu tiên 2", "hành động ưu tiên 3"]
}`

  const raw = await groqChat(systemPrompt,
    `Hàng cảnh báo tồn kho (ROP/EOQ/ABC): ${JSON.stringify(alertItems)}\nGiao dịch gần đây: ${JSON.stringify(recentMovements.slice(0, 10))}`)

  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as InventorySuggestResult
}

// ── Phân tích so sánh kỳ kinh doanh ──────────────────────────────────────────
export interface CompareAnalysisResult {
  headline: string
  sentiment: 'positive' | 'negative' | 'mixed' | 'neutral'
  insights: string[]
  risks: string[]
  suggestions: string[]
}

export async function compareBusinessMetrics(
  domain: string,
  periodA: string,
  periodB: string,
  metrics: { label: string; cur: number; prev: number; change_pct: number }[]
): Promise<CompareAnalysisResult> {
  const domainLabel = domain === 'tai-chinh' ? 'Tài chính' : domain === 'ban-hang' ? 'Bán hàng' : domain === 'logistics' ? 'Logistics' : 'Kho hàng'
  const systemPrompt = `Bạn là chuyên gia phân tích kinh doanh FMCG tại Việt Nam. Phân tích dữ liệu so sánh giữa 2 kỳ kinh doanh và đưa ra nhận xét ngắn gọn, thiết thực, bằng tiếng Việt.
Trả về JSON hợp lệ (KHÔNG có markdown):
{
  "headline": "một câu tóm tắt quan trọng nhất (tối đa 12 từ)",
  "sentiment": "positive|negative|mixed|neutral",
  "insights": ["nhận xét 1 (bắt đầu bằng chỉ số cụ thể)", "nhận xét 2", "nhận xét 3"],
  "risks": ["rủi ro hoặc điểm cần chú ý 1", "rủi ro 2"],
  "suggestions": ["đề xuất hành động cụ thể 1", "đề xuất 2"]
}
Ngắn gọn, xúc tích. Mỗi mục tối đa 1-2 câu. Dùng con số thực tế từ dữ liệu.`

  const userMsg = `Module: ${domainLabel}\nSo sánh: ${periodA} vs ${periodB}\nDữ liệu:\n${metrics.map(m => `- ${m.label}: ${periodA}=${m.cur}, ${periodB}=${m.prev}, thay đổi=${m.change_pct > 0 ? '+' : ''}${m.change_pct}%`).join('\n')}`

  const raw = await groqChat(systemPrompt, userMsg)
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as CompareAnalysisResult
}

// ── Gợi ý tối ưu tuyến giao hàng ─────────────────────────────────────────────
export interface RouteOptimization {
  grouped_orders: { order_ids: string[]; vehicle_suggestion: string; route_name: string; reason: string; est_km: number }[]
  priority_orders: { order_id: string; customer: string; reason: string }[]
  summary: string
  total_km_saved: number
}

export async function optimizeDeliveryRoutes(
  unassigned: { id: string; customer: string; address: string; cod: number; weight_kg: number; priority: string; date_needed: string }[],
  vehicles: { plate: string; type: string; driver: string; capacity_kg: number }[]
): Promise<RouteOptimization> {
  const systemPrompt = `Bạn là AI tối ưu tuyến giao hàng FMCG tại Việt Nam.
Phân tích danh sách đơn chưa phân tuyến và đề xuất gộp tuyến tối ưu.
Trả về JSON hợp lệ (KHÔNG có markdown):
{
  "grouped_orders": [{ "order_ids": ["id1","id2"], "vehicle_suggestion": "biển số xe", "route_name": "tên tuyến", "reason": "lý do gộp", "est_km": km_ước_tính }],
  "priority_orders": [{ "order_id": "id", "customer": "tên KH", "reason": "tại sao ưu tiên" }],
  "summary": "tóm tắt đề xuất",
  "total_km_saved": km_tiết_kiệm_ước_tính
}`

  const raw = await groqChat(systemPrompt,
    `Đơn chưa phân tuyến: ${JSON.stringify(unassigned)}\nXe khả dụng: ${JSON.stringify(vehicles)}`)

  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(cleaned) as RouteOptimization
}
