'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/types'

interface UseProductsOptions {
  search?: string
  categoryId?: string
  status?: string
  page?: number
  pageSize?: number
}

export function useProducts({ search = '', categoryId, status = 'all', page = 1, pageSize = 20 }: UseProductsOptions = {}) {
  const [data, setData] = useState<Product[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('products')
      .select('*, category:categories(name), supplier:suppliers(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (status !== 'all') query = query.eq('status', status)
    if (categoryId) query = query.eq('category_id', categoryId)
    if (search) query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)

    const { data, count, error } = await query

    if (error) {
      setError(error.message)
    } else {
      setData((data as Product[]) ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [search, categoryId, status, page, pageSize])

  useEffect(() => { fetch() }, [fetch])

  return { data, total, loading, error, refetch: fetch }
}
