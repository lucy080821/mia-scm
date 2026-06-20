'use client'
import { ReactNode, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export interface ColumnDef<T> {
  key: string
  header: string
  tooltip?: string
  render?: (row: T) => ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  total?: number
  page?: number
  pageSize?: number
  onPageChange?: (page: number) => void
  loading?: boolean
  selectable?: boolean
  onRowClick?: (row: T) => void
  emptyText?: string
  keyField?: string
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-[#e5e7eb]">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded animate-pulse" style={{ width: `${60 + (i % 3) * 20}%` }} />
        </td>
      ))}
    </tr>
  )
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  total = 0,
  page = 1,
  pageSize = 20,
  onPageChange,
  loading,
  selectable,
  onRowClick,
  emptyText = 'Không có dữ liệu',
  keyField = 'id',
}: DataTableProps<T>) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const totalPages = Math.ceil(total / pageSize)

  const toggleAll = () => {
    if (selected.size === data.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(data.map(r => String(r[keyField]))))
    }
  }

  const toggleRow = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#e5e7eb] bg-gray-50">
              {selectable && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={data.length > 0 && selected.size === data.length}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-[var(--mia-primary)] cursor-pointer"
                  />
                </th>
              )}
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap ${col.className ?? ''}`}
                >
                  {col.tooltip ? (
                    <div className="inline-flex items-center gap-1">
                      <span>{col.header}</span>
                      <span className="relative group">
                        <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[9px] font-bold inline-flex items-center justify-center cursor-help leading-none select-none">?</span>
                        <span className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all absolute z-[9999] top-full left-1/2 -translate-x-1/2 mt-2 w-60 bg-gray-800 text-white text-[10px] font-normal normal-case tracking-normal rounded-lg px-2.5 py-2 leading-relaxed whitespace-normal shadow-xl pointer-events-none">
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-gray-800" />
                          {col.tooltip}
                        </span>
                      </span>
                    </div>
                  ) : col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={columns.length + (selectable ? 1 : 0)} />
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4 py-12 text-center text-gray-400 text-sm"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              data.map((row, idx) => {
                const rowId = String(row[keyField])
                return (
                  <tr
                    key={rowId || idx}
                    className={`border-b border-[#e5e7eb] transition-colors ${onRowClick ? 'cursor-pointer hover:bg-sky-50' : 'hover:bg-gray-50'} ${selected.has(rowId) ? 'bg-sky-50' : ''}`}
                    onClick={() => onRowClick?.(row)}
                  >
                    {selectable && (
                      <td className="w-10 px-4 py-3" onClick={e => { e.stopPropagation(); toggleRow(rowId) }}>
                        <input
                          type="checkbox"
                          checked={selected.has(rowId)}
                          onChange={() => toggleRow(rowId)}
                          className="rounded border-gray-300 text-[var(--mia-primary)] cursor-pointer"
                        />
                      </td>
                    )}
                    {columns.map(col => (
                      <td key={col.key} className={`px-4 py-3 text-gray-700 ${col.className ?? ''}`}>
                        {col.render ? col.render(row) : (row[col.key] as ReactNode)}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {total > pageSize && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#e5e7eb] bg-white">
          <p className="text-xs text-gray-500">
            Hiển thị {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total} kết quả
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPageChange?.(page - 1)}
              disabled={page <= 1}
              className="w-8 h-8 flex items-center justify-center rounded border border-[#e5e7eb] text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
              const p = i + 1
              return (
                <button
                  key={p}
                  onClick={() => onPageChange?.(p)}
                  className={`w-8 h-8 flex items-center justify-center rounded border text-xs transition-colors ${page === p ? 'bg-[var(--mia-primary)] border-[var(--mia-primary)] text-white' : 'border-[#e5e7eb] text-gray-600 hover:bg-gray-50'}`}
                >
                  {p}
                </button>
              )
            })}
            <button
              onClick={() => onPageChange?.(page + 1)}
              disabled={page >= totalPages}
              className="w-8 h-8 flex items-center justify-center rounded border border-[#e5e7eb] text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
