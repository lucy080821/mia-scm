'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Delivery } from '@/types'

interface UseDeliveriesOptions {
  status?: string
  driverId?: string
  page?: number
  pageSize?: number
}

export function useDeliveries({ status = 'all', driverId, page = 1, pageSize = 20 }: UseDeliveriesOptions = {}) {
  const [data, setData] = useState<Delivery[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('deliveries')
      .select('*, driver:drivers(name,phone,rating), vehicle:vehicles(plate,type)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    if (status !== 'all') query = query.eq('status', status)
    if (driverId) query = query.eq('driver_id', driverId)

    const { data, count, error } = await query

    if (error) {
      setError(error.message)
    } else {
      setData((data as Delivery[]) ?? [])
      setTotal(count ?? 0)
    }
    setLoading(false)
  }, [status, driverId, page, pageSize])

  useEffect(() => { fetch() }, [fetch])

  return { data, total, loading, error, refetch: fetch }
}
