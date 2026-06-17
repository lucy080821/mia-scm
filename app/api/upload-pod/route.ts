import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const deliveryId = formData.get('deliveryId') as string | null

    if (!file) return NextResponse.json({ error: 'Thiếu file ảnh' }, { status: 400 })

    const ext = file.name.split('.').pop() ?? 'jpg'
    const fileName = `pod/${deliveryId ?? Date.now()}_${Date.now()}.${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { data, error } = await supabaseAdmin.storage
      .from('pod-photos')
      .upload(fileName, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      })

    if (error) {
      console.error('[upload-pod] storage error:', error)
      return NextResponse.json({ error: 'Lỗi upload ảnh: ' + error.message }, { status: 500 })
    }

    const { data: urlData } = supabaseAdmin.storage.from('pod-photos').getPublicUrl(data.path)

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Lỗi server' }, { status: 500 })
  }
}
