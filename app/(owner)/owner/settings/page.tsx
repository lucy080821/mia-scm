'use client'
import { Settings, Globe, Shield, Key } from 'lucide-react'

export default function OwnerSettings() {
  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-[#0f172a]">Cài đặt Platform</h1>
        <p className="text-sm text-gray-400 mt-0.5">Cấu hình hệ thống toàn cục</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { icon: Globe, title: 'Tên miền', desc: 'Cấu hình domain cho từng công ty', badge: 'Sắp ra mắt' },
          { icon: Shield, title: 'Bảo mật', desc: 'Chính sách mật khẩu, 2FA toàn hệ thống', badge: 'Sắp ra mắt' },
          { icon: Key, title: 'API Keys', desc: 'Quản lý API keys tích hợp bên ngoài', badge: 'Sắp ra mắt' },
          { icon: Settings, title: 'Cấu hình hệ thống', desc: 'Giới hạn người dùng, dung lượng, timezone', badge: 'Sắp ra mắt' },
        ].map(({ icon: Icon, title, desc, badge }) => (
          <div key={title} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm flex items-start gap-4 opacity-70">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
              <Icon size={18} className="text-amber-500" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-[#0f172a]">{title}</p>
                <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full font-medium">{badge}</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
