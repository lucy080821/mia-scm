'use client'
import { useState, useEffect, useCallback } from 'react'
import { Plus, Edit2, Trash2, Package, Users, Tag, X, Loader2, Warehouse, ToggleLeft, ToggleRight } from 'lucide-react'
import PageHeader from '@/components/layout/PageHeader'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/contexts/TenantContext'

const TABS = [
  { id: 'category',  label: 'Danh mục sản phẩm', icon: Package },
  { id: 'group',     label: 'Nhóm khách hàng',   icon: Users },
  { id: 'unit',      label: 'Đơn vị tính',       icon: Tag },
  { id: 'warehouse', label: 'Kho hàng',           icon: Warehouse },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface Category {
  id: string
  name: string
  parent_id: string | null
  parent_name?: string
  product_count: number
}

interface CustomerGroup {
  id: string
  name: string
  discount_pct: number
  customer_count: number
}

// ─── Modal helper ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e7eb]">
          <h3 className="text-sm font-semibold text-[#1e2a3a]">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

// ─── Categories tab ───────────────────────────────────────────────────────────

function CategoriesTab() {
  const { id: tenantId } = useTenant()
  const [items, setItems]       = useState<Category[]>([])
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)
  const [addName, setAddName]   = useState('')
  const [addParent, setAddParent] = useState('')
  const [saving, setSaving]     = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    const [{ data: cats }, { data: prods }] = await Promise.all([
      supabase.from('categories').select('id, name, parent_id').eq('tenant_id', tenantId).order('name'),
      supabase.from('products').select('category_id').eq('tenant_id', tenantId).eq('status', 'active'),
    ])
    const countMap: Record<string, number> = {}
    for (const p of prods ?? []) {
      if (p.category_id) countMap[p.category_id] = (countMap[p.category_id] ?? 0) + 1
    }
    const nameMap: Record<string, string> = {}
    for (const c of cats ?? []) nameMap[c.id] = c.name
    setItems((cats ?? []).map(c => ({
      ...c,
      parent_name: c.parent_id ? nameMap[c.parent_id] : undefined,
      product_count: countMap[c.id] ?? 0,
    })))
    setLoading(false)
  }, [tenantId])

  useEffect(() => { load() }, [load])

  async function handleAdd() {
    if (!addName.trim()) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/categories', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ name: addName.trim(), parent_id: addParent || null }),
    })
    setSaving(false)
    setShowAdd(false)
    setAddName('')
    setAddParent('')
    load()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/categories/${target.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    if (!res.ok) {
      const j = await res.json()
      setErrorMsg(j.error ?? 'Xoá thất bại')
    }
    load()
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        <div className="p-4 border-b border-[#e5e7eb] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1e2a3a]">
            Danh mục sản phẩm {!loading && `(${items.length})`}
          </h3>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--mia-primary)] text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-colors"
          >
            <Plus size={13} /> Thêm danh mục
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-gray-400 py-12 text-center">Chưa có danh mục nào</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tên danh mục</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Danh mục cha</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Số sản phẩm</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">TT</th>
              </tr>
            </thead>
            <tbody>
              {items.map(c => (
                <tr key={c.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-[#1e2a3a]">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {c.parent_name ?? <span className="text-gray-300 text-xs">Cấp gốc</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-center font-medium text-[#1e2a3a]">{c.product_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><Edit2 size={13} /></button>
                      <button
                        onClick={() => c.product_count > 0 ? setErrorMsg('Không thể xoá danh mục đang có sản phẩm.') : setDeleteTarget(c)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      ><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal title="Thêm danh mục" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tên danh mục *</label>
              <input
                autoFocus
                value={addName}
                onChange={e => setAddName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]"
                placeholder="VD: Thực phẩm & Đồ uống"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Danh mục cha (tuỳ chọn)</label>
              <select
                value={addParent}
                onChange={e => setAddParent(e.target.value)}
                className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]"
              >
                <option value="">— Cấp gốc —</option>
                {items.filter(i => !i.parent_id).map(i => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAdd}
                disabled={saving || !addName.trim()}
                className="flex-1 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Thêm'}
              </button>
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-[#e5e7eb] text-sm text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">Huỷ</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Xoá danh mục" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-gray-600 mb-4">
            Xoá danh mục <strong className="text-[#1e2a3a]">{deleteTarget.name}</strong>? Thao tác này không thể hoàn tác.
          </p>
          <div className="flex gap-2">
            <button onClick={handleDelete} className="flex-1 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors">Xoá</button>
            <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 border border-[#e5e7eb] text-sm text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">Huỷ</button>
          </div>
        </Modal>
      )}

      {errorMsg && (
        <Modal title="Không thể xoá" onClose={() => setErrorMsg('')}>
          <p className="text-sm text-gray-600 mb-4">{errorMsg}</p>
          <button onClick={() => setErrorMsg('')} className="w-full py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-colors">Đóng</button>
        </Modal>
      )}
    </>
  )
}

// ─── Customer groups tab ──────────────────────────────────────────────────────

function GroupsTab() {
  const { id: tenantId } = useTenant()
  const [items, setItems]       = useState<CustomerGroup[]>([])
  const [loading, setLoading]   = useState(true)
  const [showAdd, setShowAdd]   = useState(false)
  const [addName, setAddName]   = useState('')
  const [addDiscount, setAddDiscount] = useState('0')
  const [saving, setSaving]     = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CustomerGroup | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const load = useCallback(async () => {
    if (!tenantId) return
    setLoading(true)
    const [{ data: groups }, { data: customers }] = await Promise.all([
      supabase.from('customer_groups').select('id, name, discount_pct').eq('tenant_id', tenantId).order('name'),
      supabase.from('customers').select('group_id').eq('tenant_id', tenantId),
    ])
    const countMap: Record<string, number> = {}
    for (const c of customers ?? []) {
      if (c.group_id) countMap[c.group_id] = (countMap[c.group_id] ?? 0) + 1
    }
    setItems((groups ?? []).map(g => ({
      ...g,
      discount_pct: g.discount_pct ?? 0,
      customer_count: countMap[g.id] ?? 0,
    })))
    setLoading(false)
  }, [tenantId])

  useEffect(() => { load() }, [load])

  async function handleAdd() {
    if (!addName.trim()) return
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/customer-groups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token ?? ''}`,
      },
      body: JSON.stringify({ name: addName.trim(), discount_pct: addDiscount }),
    })
    setSaving(false)
    setShowAdd(false)
    setAddName('')
    setAddDiscount('0')
    load()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/customer-groups/${target.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    if (!res.ok) {
      const j = await res.json()
      setErrorMsg(j.error ?? 'Xoá thất bại')
    }
    load()
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        <div className="p-4 border-b border-[#e5e7eb] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1e2a3a]">
            Nhóm khách hàng {!loading && `(${items.length})`}
          </h3>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--mia-primary)] text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-colors"
          >
            <Plus size={13} /> Thêm nhóm
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-gray-400 py-12 text-center">Chưa có nhóm nào</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tên nhóm</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Chiết khấu (%)</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Số khách hàng</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">TT</th>
              </tr>
            </thead>
            <tbody>
              {items.map(g => (
                <tr key={g.id} className="border-b border-[#f0f2f5] hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-[#1e2a3a]">{g.name}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm font-semibold text-green-600">{g.discount_pct}%</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-center font-medium text-[#1e2a3a]">{g.customer_count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"><Edit2 size={13} /></button>
                      <button
                        onClick={() => g.customer_count > 0 ? setErrorMsg('Không thể xoá nhóm đang có khách hàng.') : setDeleteTarget(g)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                      ><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal title="Thêm nhóm khách hàng" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tên nhóm *</label>
              <input
                autoFocus
                value={addName}
                onChange={e => setAddName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]"
                placeholder="VD: Đại lý cấp 1"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Chiết khấu (%)</label>
              <input
                type="number"
                min="0" max="100" step="0.5"
                value={addDiscount}
                onChange={e => setAddDiscount(e.target.value)}
                className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAdd}
                disabled={saving || !addName.trim()}
                className="flex-1 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Thêm'}
              </button>
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-[#e5e7eb] text-sm text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">Huỷ</button>
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title="Xoá nhóm khách hàng" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm text-gray-600 mb-4">
            Xoá nhóm <strong className="text-[#1e2a3a]">{deleteTarget.name}</strong>? Thao tác này không thể hoàn tác.
          </p>
          <div className="flex gap-2">
            <button onClick={handleDelete} className="flex-1 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors">Xoá</button>
            <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 border border-[#e5e7eb] text-sm text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">Huỷ</button>
          </div>
        </Modal>
      )}

      {errorMsg && (
        <Modal title="Không thể xoá" onClose={() => setErrorMsg('')}>
          <p className="text-sm text-gray-600 mb-4">{errorMsg}</p>
          <button onClick={() => setErrorMsg('')} className="w-full py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-colors">Đóng</button>
        </Modal>
      )}
    </>
  )
}

// ─── Units tab ────────────────────────────────────────────────────────────────

const DEFAULT_UNITS_FALLBACK = ['Thùng', 'Cái', 'Gói', 'Hộp', 'Kg', 'Lít', 'Chai', 'Bao']

function UnitsTab() {
  const [units, setUnits]     = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [newUnit, setNewUnit] = useState('')

  useEffect(() => {
    import('@/lib/business-settings').then(({ loadBusinessSettingsAsync }) => {
      loadBusinessSettingsAsync().then(s => {
        setUnits(s.units && s.units.length > 0 ? s.units : DEFAULT_UNITS_FALLBACK)
        setLoading(false)
      })
    })
  }, [])

  async function persist(next: string[]) {
    setSaving(true)
    const { loadBusinessSettingsAsync, saveBusinessSettingsAsync } = await import('@/lib/business-settings')
    const current = await loadBusinessSettingsAsync()
    saveBusinessSettingsAsync({ ...current, units: next })
    setSaving(false)
  }

  function handleAdd() {
    const trimmed = newUnit.trim()
    if (!trimmed || units.includes(trimmed)) return
    const next = [...units, trimmed]
    setUnits(next)
    setNewUnit('')
    persist(next)
  }

  function handleDelete(u: string) {
    const next = units.filter(x => x !== u)
    setUnits(next)
    persist(next)
  }

  return (
    <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[#1e2a3a]">
          Đơn vị tính {!loading && `(${units.length})`}
        </h3>
        {saving && <Loader2 size={14} className="animate-spin text-gray-400" />}
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          className="flex-1 border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          placeholder="Thêm đơn vị tính mới..."
          value={newUnit}
          onChange={e => setNewUnit(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
        />
        <button
          onClick={handleAdd}
          disabled={!newUnit.trim()}
          className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40"
        >
          <Plus size={14} />
          Thêm
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : units.length === 0 ? (
        <p className="text-xs text-gray-400 py-8 text-center">Chưa có đơn vị tính nào</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {units.map(u => (
            <div key={u} className="flex items-center gap-1 px-3 py-2 bg-gray-50 border border-[#e5e7eb] rounded-lg">
              <span className="text-sm font-medium text-[#1e2a3a]">{u}</span>
              <button
                onClick={() => handleDelete(u)}
                className="ml-1 text-gray-400 hover:text-red-500"
                title="Xóa"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Warehouses tab ───────────────────────────────────────────────────────────

interface WarehouseItem { id: string; name: string; code: string; status: string }

function WarehousesTab() {
  const [items, setItems]         = useState<WarehouseItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [addName, setAddName]     = useState('')
  const [addCode, setAddCode]     = useState('')
  const [saving, setSaving]       = useState(false)
  const [toggling, setToggling]   = useState<string | null>(null)
  const [errorMsg, setErrorMsg]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/warehouses')
    const data = await res.json()
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleAdd() {
    if (!addName.trim() || !addCode.trim()) return
    setSaving(true)
    const res = await fetch('/api/warehouses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: addName.trim(), code: addCode.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { setErrorMsg(data.error ?? 'Lỗi tạo kho'); setSaving(false); return }
    setSaving(false)
    setShowAdd(false)
    setAddName('')
    setAddCode('')
    load()
  }

  async function handleToggle(w: WarehouseItem) {
    setToggling(w.id)
    const newStatus = w.status === 'active' ? 'inactive' : 'active'
    await fetch(`/api/warehouses/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    setToggling(null)
    load()
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-[#e5e7eb]">
        <div className="p-4 border-b border-[#e5e7eb] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[#1e2a3a]">
            Kho hàng {!loading && `(${items.filter(w => w.status === 'active').length} đang hoạt động)`}
          </h3>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--mia-primary)] text-white text-xs font-semibold rounded-lg hover:opacity-90 transition-colors"
          >
            <Plus size={13} /> Thêm kho
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-xs text-gray-400 mb-2">Chưa có kho nào — thêm kho để bắt đầu nhập/xuất hàng</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#e5e7eb] bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tên kho</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Mã kho</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Trạng thái</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {items.map(w => (
                <tr key={w.id} className={`border-b border-[#f0f2f5] hover:bg-gray-50/50 transition-colors ${w.status !== 'active' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium text-[#1e2a3a]">{w.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{w.code}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${w.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {w.status === 'active' ? 'Hoạt động' : 'Tạm dừng'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center">
                      <button
                        onClick={() => handleToggle(w)}
                        disabled={toggling === w.id}
                        title={w.status === 'active' ? 'Tạm dừng kho' : 'Kích hoạt kho'}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-[var(--mia-primary)] transition-colors disabled:opacity-40"
                      >
                        {toggling === w.id
                          ? <Loader2 size={15} className="animate-spin" />
                          : w.status === 'active' ? <ToggleRight size={18} className="text-green-500" /> : <ToggleLeft size={18} />
                        }
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal title="Thêm kho hàng" onClose={() => setShowAdd(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tên kho *</label>
              <input
                autoFocus
                value={addName}
                onChange={e => setAddName(e.target.value)}
                className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]"
                placeholder="VD: Kho Hồ Chí Minh"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Mã kho *</label>
              <input
                value={addCode}
                onChange={e => setAddCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                className="w-full border border-[#e5e7eb] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[var(--mia-primary)]"
                placeholder="VD: KHO-HCM"
              />
              <p className="text-[10px] text-gray-400 mt-1">Mã kho phải duy nhất, chỉ dùng chữ hoa và dấu gạch ngang</p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleAdd}
                disabled={saving || !addName.trim() || !addCode.trim()}
                className="flex-1 py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Thêm kho'}
              </button>
              <button onClick={() => setShowAdd(false)} className="flex-1 py-2 border border-[#e5e7eb] text-sm text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">Huỷ</button>
            </div>
          </div>
        </Modal>
      )}

      {errorMsg && (
        <Modal title="Lỗi" onClose={() => setErrorMsg('')}>
          <p className="text-sm text-gray-600 mb-4">{errorMsg}</p>
          <button onClick={() => setErrorMsg('')} className="w-full py-2 bg-[var(--mia-primary)] text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-colors">Đóng</button>
        </Modal>
      )}
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DanhMucPage() {
  const [tab, setTab] = useState('category')

  return (
    <div>
      <PageHeader title="Danh mục" subtitle="Quản lý danh mục sản phẩm, nhóm khách hàng và kho hàng" />

      <div className="flex gap-1 bg-white border border-[#e5e7eb] rounded-xl p-1 mb-5 w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                ${active ? 'bg-[var(--mia-primary)] text-white shadow-sm' : 'text-gray-500 hover:text-[#1e2a3a] hover:bg-gray-50'}`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'category'  && <CategoriesTab />}
      {tab === 'group'     && <GroupsTab />}
      {tab === 'unit'      && <UnitsTab />}
      {tab === 'warehouse' && <WarehousesTab />}
    </div>
  )
}
