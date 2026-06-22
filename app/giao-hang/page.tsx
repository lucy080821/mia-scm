import { Truck } from 'lucide-react'

export default function GiaoHangIndex() {
  return (
    <div className="min-h-screen bg-[#f0f2f5] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-[#1e2a3a] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Truck size={28} className="text-white" />
        </div>
        <h1 className="text-lg font-bold text-[#1e2a3a] mb-2">App giao hàng</h1>
        <p className="text-sm text-gray-500">
          Vui lòng mở <strong>link giao hàng</strong> được điều phối gửi cho bạn để xem kế hoạch giao hàng hôm nay.
        </p>
        <p className="text-xs text-gray-400 mt-3">
          Liên hệ quản lý nếu bạn chưa nhận được link.
        </p>
      </div>
    </div>
  )
}
