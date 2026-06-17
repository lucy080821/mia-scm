'use client'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import { canAccess } from '@/lib/auth-client'
import { useAuth } from '@/hooks/useAuth'
import { TenantProvider } from '@/contexts/TenantContext'
import TabSync from '@/components/layout/TabSync'
import { ShieldX } from 'lucide-react'
import { useOrdersRealtime } from '@/hooks/useOrdersRealtime'
import { pushNotification } from '@/lib/realtime-notifs'

function AccessDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
        <ShieldX size={28} className="text-red-500" />
      </div>
      <div className="text-center">
        <h2 className="text-base font-bold text-[#1e2a3a] mb-1">Không có quyền truy cập</h2>
        <p className="text-sm text-gray-400">Tài khoản của bạn không được phép xem trang này.</p>
        <p className="text-xs text-gray-300 mt-1">Liên hệ quản trị viên nếu cần thêm quyền.</p>
      </div>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user?.role === 'owner') router.replace('/owner/dashboard')
  }, [user, router])

  useOrdersRealtime(({ new: newOrder, old: oldOrder, eventType }) => {
    if (!user) return
    const role = user.role
    const status = newOrder?.status as string | undefined
    const oldStatus = oldOrder?.status as string | undefined
    const code = (newOrder?.code ?? '') as string

    if (eventType === 'INSERT' && role === 'admin') {
      pushNotification({
        type: 'order',
        title: 'Đơn hàng mới cần duyệt',
        message: `${code} vừa được tạo, chờ bạn duyệt`,
        href: '/ban-hang/don-hang-ban',
      })
    }

    if (eventType === 'UPDATE' && status && status !== oldStatus) {
      if (status === 'confirmed' && (role === 'warehouse' || role === 'admin')) {
        pushNotification({
          type: 'order',
          title: 'Đơn hàng cần soạn hàng',
          message: `${code} đã được duyệt, cần xuất kho`,
          href: '/kho-hang/xuat-kho',
        })
      }
      if (status === 'picked' && (role === 'logistics' || role === 'admin')) {
        pushNotification({
          type: 'delivery',
          title: 'Đơn hàng sẵn sàng vận chuyển',
          message: `${code} đã xuất kho, cần phân xe giao hàng`,
          href: '/logistics/don-van-chuyen',
        })
      }
      if (status === 'delivering' && role === 'driver') {
        pushNotification({
          type: 'delivery',
          title: 'Đơn hàng cần giao',
          message: `${code} đã được phân công, cần giao ngay`,
          href: '/logistics/don-van-chuyen',
        })
      }
    }
  })

  const allowed = !user || canAccess(user.role, pathname)

  return (
    <TenantProvider>
      <TabSync />
      <div className="flex h-full bg-[#f0f2f5]">
        <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        <div className="flex flex-col flex-1 lg:ml-[200px] min-h-screen min-w-0">
          <Topbar onMenuClick={() => setMobileOpen(true)} />
          <main className="flex-1 p-4 md:p-5 overflow-auto">
            {allowed ? children : <AccessDenied />}
          </main>
        </div>
      </div>
    </TenantProvider>
  )
}
