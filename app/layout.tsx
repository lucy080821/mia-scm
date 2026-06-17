import type { Metadata, Viewport } from 'next'
import './globals.css'
import ServiceWorkerRegistrar from '@/components/layout/ServiceWorkerRegistrar'

export const metadata: Metadata = {
  title: 'Mia SCM',
  description: 'Hệ thống quản lý chuỗi cung ứng thông minh cho nhà phân phối FMCG tại Việt Nam',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/mia-logo.png', type: 'image/png' }],
    shortcut: '/mia-logo.png',
    apple: '/mia-logo.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Mia SCM',
  },
}

export const viewport: Viewport = {
  themeColor: '#1e2a3a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <link rel="apple-touch-icon" href="/mia-logo.png" />
      </head>
      <body className="h-full" suppressHydrationWarning>
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  )
}
