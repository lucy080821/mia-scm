'use client'
import { useEffect, useState } from 'react'
import { Truck, ArrowLeft } from 'lucide-react'

export default function GiaoHangIndex() {
  const [lastToken, setLastToken] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem('mia_driver_last_token')
      if (saved) setLastToken(saved)
    } catch { /* ignore */ }
  }, [])

  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col items-center justify-center p-6 gap-6">
      <div className="text-center max-w-sm w-full">
        <div className="w-16 h-16 bg-[#1e2a3a] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Truck size={28} className="text-white" />
        </div>
        <h1 className="text-lg font-bold text-[#1e2a3a] mb-2">App giao hàng</h1>
        {lastToken ? (
          <>
            <p className="text-sm text-gray-500 mb-5">Bạn có kế hoạch giao hàng chưa hoàn thành.</p>
            <a href={lastToken}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-[#1e2a3a] text-white text-sm font-semibold rounded-2xl hover:bg-[#2d3f55] active:scale-[0.98] transition-all">
              <ArrowLeft size={16} /> Quay lại kế hoạch giao hàng
            </a>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-2">
              Vui lòng mở <strong>link giao hàng</strong> được điều phối gửi cho bạn.
            </p>
            <p className="text-xs text-gray-400 mt-3">Liên hệ quản lý nếu bạn chưa nhận được link.</p>
          </>
        )}
      </div>
    </div>
  )
}
