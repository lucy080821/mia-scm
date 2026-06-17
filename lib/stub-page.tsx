'use client'
import { Construction } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

export default function StubPage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-16 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 bg-yellow-50 rounded-2xl flex items-center justify-center mb-4">
          <Construction size={28} className="text-yellow-500" />
        </div>
        <h3 className="text-lg font-semibold text-[#1e2a3a] mb-2">Đang phát triển</h3>
        <p className="text-sm text-gray-500 max-w-sm">
          Tính năng <strong>{title}</strong> đang được phát triển và sẽ sớm ra mắt trong phiên bản tiếp theo.
        </p>
      </div>
    </div>
  )
}
