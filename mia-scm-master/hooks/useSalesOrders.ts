'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { SalesOrder } from '@/types'

interface UseOrdersOptions {
  search?: string
  status?: string
  page?: number
  pageSize?: number
}

export function useSalesOrders({ search = '', status = 'all', page = 1, pageSize = 20 }: UseOrdersOptions = {}) {
  const [data, setData] = useState<SalesOrder[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('sales_orders')
      .select('*, customer:customers(id,name,code,phone)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (status !== 'all') query = query.eq('status', status)
    if (search) query = query.or(`code.ilike.%${search}%`)

    const { data, count, error } = await query

    if (error) {
      setError(error.message)
    } else {
      setData((data as SalesOrder[]) ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [search, status, page, pageSize])

  useEffect(() => { fetch() }, [fetch])

  return { data, total, loading, error, refetch: fetch }
}
