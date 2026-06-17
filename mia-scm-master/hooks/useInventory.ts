'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { InventoryItem } from '@/types'

interface UseInventoryOptions {
  warehouseId?: string
  search?: string
  page?: number
  pageSize?: number
}

export function useInventory({ warehouseId, search = '', page = 1, pageSize = 50 }: UseInventoryOptions = {}) {
  const [data, setData] = useState<InventoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('inventory')
      .select('*, product:products(sku,name,unit,min_stock,expiry_days), warehouse:warehouses(code,name)', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (warehouseId) query = query.eq('warehouse_id', warehouseId)
    if (search) {
      query = query.or(`product.name.ilike.%${search}%,product.sku.ilike.%${search}%`)
    }

    const { data, count, error } = await query

    if (error) {
      setError(error.message)
    } else {
      setData((data as InventoryItem[]) ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [warehouseId, search, page, pageSize])

  useEffect(() => { fetch() }, [fetch])

  return { data, total, loading, error, refetch: fetch }
}
