import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Mia SCM',
    short_name: 'Mia SCM',
    description: 'Hệ thống quản lý chuỗi cung ứng thông minh cho nhà phân phối FMCG',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#f0f2f5',
    theme_color: '#1e2a3a',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/logo.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    categories: ['business', 'productivity'],
    lang: 'vi',
  }
}
