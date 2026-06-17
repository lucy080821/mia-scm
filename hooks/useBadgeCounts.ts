import { useState, useEffect, useCallback } from 'react'

export function useBadgeCounts() {
  const [counts, setCounts] = useState<Record<string, number>>({})

  const fetchCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications/counts')
      if (res.ok) setCounts(await res.json())
    } catch {}
  }, [])

  useEffect(() => {
    fetchCounts()
    const interval = setInterval(fetchCounts, 30_000)
    return () => clearInterval(interval)
  }, [fetchCounts])

  return counts
}
