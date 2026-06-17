'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Customer } from '@/types'

interface UseCustomersOptions {
  search?: string
  status?: string
  page?: number
  pageSize?: number
}

export function useCustomers({ search = '', status = 'all', page = 1, pageSize = 20 }: UseCustomersOptions = {}) {
  const [data, setData] = useState<Customer[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('customers')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (status !== 'all') query = query.eq('status', status)
    if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%,phone.ilike.%${search}%`)

    const { data, count, error } = await query

    if (error) {
      setError(error.message)
    } else {
      setData((data as Customer[]) ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [search, status, page, pageSize])

  useEffect(() => { fetch() }, [fetch])

  return { data, total, loading, error, refetch: fetch }
}
