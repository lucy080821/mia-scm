import { NextRequest, NextResponse } from 'next/server'
import { compareBusinessMetrics } from '@/lib/groq'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { domain, periodA, periodB, metrics } = body
    if (!domain || !periodA || !periodB || !metrics) {
      return NextResponse.json({ error: 'Thiếu tham số' }, { status: 400 })
    }
    const result = await compareBusinessMetrics(domain, periodA, periodB, metrics)
    return NextResponse.json(result)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
