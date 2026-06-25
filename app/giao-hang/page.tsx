import { Truck, ArrowLeft, LayoutDashboard } from 'lucide-react'

export default function GiaoHangIndex() {
  return (
    <div className="min-h-screen bg-[#f0f2f5] flex flex-col items-center justify-center p-6 gap-8">
      <div className="text-center max-w-sm w-full">
        <div className="w-16 h-16 bg-[#1e2a3a] rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Truck size={28} className="text-white" />
        </div>
        <h1 className="text-lg font-bold text-[#1e2a3a] mb-2">App giao hàng</h1>
        <p className="text-sm text-gray-500 mb-2">
          Vui lòng mở <strong>link giao hàng</strong> được điều phối gửi cho bạn để xem kế hoạch giao hàng hôm nay.
        </p>
        <p className="text-xs text-gray-400 mt-3">
          Liên hệ quản lý nếu bạn chưa nhận được link.
        </p>
      </div>

      {/* Dành cho nhân viên/admin bị lạc vào đây */}
      <a
        href="/dashboard"
        className="flex items-center gap-2 px-5 py-2.5 bg-white border border-[#e5e7eb] rounded-xl text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-sm"
      >
        <LayoutDashboard size={15} />
        Về trang quản lý
      </a>
    </div>
  )
}
