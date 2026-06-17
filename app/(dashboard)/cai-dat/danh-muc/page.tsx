'use client'
import { useState } from 'react'
import { Plus, Edit2, Trash2, Package, MapPin, Users, Tag } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'

const mockCategories = [
  { id: 'c1', code: 'CAT001', name: 'Chăm sóc cá nhân',       parent: null,            products: 42, status: 'active' },
  { id: 'c2', code: 'CAT002', name: 'Thực phẩm & Đồ uống',    parent: null,            products: 65, status: 'active' },
  { id: 'c3', code: 'CAT003', name: 'Chăm sóc nhà cửa',       parent: null,            products: 28, status: 'active' },
  { id: 'c4', code: 'CAT004', name: 'Sữa & Sản phẩm sữa',     parent: 'Thực phẩm',    products: 18, status: 'active' },
  { id: 'c5', code: 'CAT005', name: 'Gia vị & Nước chấm',      parent: 'Thực phẩm',    products: 24, status: 'active' },
  { id: 'c6', code: 'CAT006', name: 'Bột giặt & Nước xả',     parent: 'Chăm sóc nhà', products: 15, status: 'active' },
]

const mockRegions = [
  { id: 'r1', code: 'MB', name: 'Miền Bắc',   provinces: 25, customers: 120 },
  { id: 'r2', code: 'MT', name: 'Miền Trung',  provinces: 14, customers: 68 },
  { id: 'r3', code: 'MN', name: 'Miền Nam',    provinces: 19, customers: 210 },
  { id: 'r4', code: 'TN', name: 'Tây Nguyên',  provinces: 5,  customers: 32 },
]

const mockGroups = [
  { id: 'g1', code: 'GRP001', name: 'Siêu thị & TTTM',      discount: 5,  creditDays: 30, customers: 45 },
  { id: 'g2', code: 'GRP002', name: 'Đại lý cấp 1',         discount: 8,  creditDays: 45, customers: 28 },
  { id: 'g3', code: 'GRP003', name: 'Nhà phân phối',         discount: 10, creditDays: 60, customers: 14 },
  { id: 'g4', code: 'GRP004', name: 'Cửa hàng tạp hóa',    discount: 3,  creditDays: 15, customers: 312 },
]

const TABS = [
  { id: 'category', label: 'Danh mục sản phẩm', icon: Package },
  { id: 'region',   label: 'Khu vực',           icon: MapPin },
  { id: 'group',    label: 'Nhóm khách hàng',   icon: Users },
  { id: 'unit',     label: 'Đơn vị tính',       icon: Tag },
]

const mockUnits = ['Thùng', 'Lốc', 'Chai', 'Hộp', 'Kg', 'Gói', 'Túi', 'Cái', 'Tấm', 'Bộ']

export default function DanhMucPage() {
  const [tab, setTab] = useState('category')

  return (
    <div>
      <PageHeader title="Danh mục" subtitle="Quản lý danh mục sản phẩm, khu vực, nhóm khách hàng" />

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-[#e5e7eb] rounded-xl p-1 mb-5 w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${active ? 'bg-[#0ea5e9] text-white shadow-sm' : 'text-gray-500 hover:text-[#1e2a3a] hover:bg-gray-50'}`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Danh mục sản phẩm */}
      {tab === 'category' && (
        <div className="bg-white rounded-xl border border-[#e5e7eb]">
          <div className="p-4 border-b border-[#e5e7eb] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1e2a3a]">Danh mục sản phẩm ({mockCategories.length})</h3>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0ea5e9] text-white text-xs font-semibold rounded-lg hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 transition-all">
              <Plus size={13} /> Thêm danh mục
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Mã</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tên danh mục</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Danh mục cha</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Số sản phẩm</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Trạng thái</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">TT</th>
              </tr>
            </thead>
            <tbody>
              {mockCategories.map(c => (
                <tr key={c.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-gray-400">{c.code}</td>
                  <td className="px-4 py-3 text-sm font-medium text-[#1e2a3a]">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{c.parent ?? <span className="text-gray-300 text-xs">Cấp gốc</span>}</td>
                  <td className="px-4 py-3 text-sm text-center font-medium text-[#1e2a3a]">{c.products}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Hoạt động</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><Edit2 size={13} /></button>
                      <button className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Khu vực */}
      {tab === 'region' && (
        <div className="bg-white rounded-xl border border-[#e5e7eb]">
          <div className="p-4 border-b border-[#e5e7eb] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1e2a3a]">Khu vực kinh doanh ({mockRegions.length})</h3>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0ea5e9] text-white text-xs font-semibold rounded-lg hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 transition-all">
              <Plus size={13} /> Thêm khu vực
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Mã</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Khu vực</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Số tỉnh/TP</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Số khách hàng</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">TT</th>
              </tr>
            </thead>
            <tbody>
              {mockRegions.map(r => (
                <tr key={r.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-gray-400">{r.code}</td>
                  <td className="px-4 py-3 text-sm font-medium text-[#1e2a3a]">{r.name}</td>
                  <td className="px-4 py-3 text-sm text-center text-gray-600">{r.provinces}</td>
                  <td className="px-4 py-3 text-sm text-center font-medium text-[#1e2a3a]">{r.customers}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><Edit2 size={13} /></button>
                      <button className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Nhóm khách hàng */}
      {tab === 'group' && (
        <div className="bg-white rounded-xl border border-[#e5e7eb]">
          <div className="p-4 border-b border-[#e5e7eb] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#1e2a3a]">Nhóm khách hàng ({mockGroups.length})</h3>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0ea5e9] text-white text-xs font-semibold rounded-lg hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 transition-all">
              <Plus size={13} /> Thêm nhóm
            </button>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Mã</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tên nhóm</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Chiết khấu (%)</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Công nợ (ngày)</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Số KH</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">TT</th>
              </tr>
            </thead>
            <tbody>
              {mockGroups.map(g => (
                <tr key={g.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-xs font-mono text-gray-400">{g.code}</td>
                  <td className="px-4 py-3 text-sm font-medium text-[#1e2a3a]">{g.name}</td>
                  <td className="px-4 py-3 text-center"><span className="text-sm font-semibold text-green-600">{g.discount}%</span></td>
                  <td className="px-4 py-3 text-sm text-center text-gray-600">{g.creditDays} ngày</td>
                  <td className="px-4 py-3 text-sm text-center font-medium text-[#1e2a3a]">{g.customers}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><Edit2 size={13} /></button>
                      <button className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Đơn vị tính */}
      {tab === 'unit' && (
        <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#1e2a3a]">Đơn vị tính ({mockUnits.length})</h3>
            <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0ea5e9] text-white text-xs font-semibold rounded-lg hover:bg-[#0284c7] hover:scale-[1.02] active:scale-95 transition-all">
              <Plus size={13} /> Thêm đơn vị
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {mockUnits.map(u => (
              <div key={u} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-[#e5e7eb] rounded-lg group hover:border-[#0ea5e9] transition-colors">
                <span className="text-sm font-medium text-[#1e2a3a]">{u}</span>
                <button className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
