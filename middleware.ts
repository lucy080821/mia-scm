import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { canAccessModule, type Role } from '@/lib/permissions'
import { canAccess } from '@/lib/auth-client'

// Prefix route → module cần quyền truy cập
const ROUTE_MODULE: Record<string, string> = {
  '/ban-hang':  'sales',
  '/kho-hang':  'inventory',
  '/logistics': 'delivery',
  '/mua-hang':  'purchase',
  '/tai-chinh': 'finance',
  '/bao-cao':   'report',
  '/cai-dat':   'settings',
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /giao-hang (không token) → redirect luôn về trang logistics (tài xế)
  if (pathname === '/giao-hang') {
    return NextResponse.redirect(new URL('/logistics/ke-hoach-giao-hang', request.url))
  }

  // Bỏ qua static assets và trang giao hàng công khai có token
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/giao-hang') ||
    pathname.startsWith('/api/delivery-confirm') ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|webmanifest|txt|json|woff2?|ttf|otf|css|js|map)$/i.test(pathname)
  ) {
    return NextResponse.next({ request })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Chưa cấu hình Supabase (dev mode) — cho qua tất cả
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({ request })
  }

  const response = NextResponse.next({ request })
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  // Chưa đăng nhập → về login
  if (!user && pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    const role = (user.user_metadata?.role ?? 'sales') as Role

    // Đã đăng nhập đang vào login → về đúng home theo role
    if (pathname === '/login') {
      const home = role === 'owner'  ? '/owner/dashboard'
                 : role === 'driver' ? '/logistics/ke-hoach-giao-hang'
                 : '/dashboard'
      return NextResponse.redirect(new URL(home, request.url))
    }

    // Owner chỉ được ở /owner/* — mọi route khác đều về owner dashboard
    if (role === 'owner' && !pathname.startsWith('/owner')) {
      return NextResponse.redirect(new URL('/owner/dashboard', request.url))
    }

    // Non-owner không được vào /owner/*
    if (pathname.startsWith('/owner') && role !== 'owner') {
      return NextResponse.redirect(new URL('/dashboard?denied=1', request.url))
    }

    // Tài xế: kiểm tra từng route cụ thể (danh sách trong auth-client.ts)
    if (role === 'driver' && pathname !== '/dashboard' && !canAccess('driver', pathname)) {
      return NextResponse.redirect(new URL('/logistics/ke-hoach-giao-hang', request.url))
    }

    // Kiểm tra quyền theo module (không áp dụng cho owner)
    if (role !== 'owner') {
      const matched = Object.entries(ROUTE_MODULE)
        .find(([prefix]) => pathname.startsWith(prefix))

      if (matched && !canAccessModule(role, matched[1])) {
        return NextResponse.redirect(new URL('/dashboard?denied=1', request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webmanifest|txt|woff2?|ttf|otf)|api).*)'],
}
