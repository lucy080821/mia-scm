import { useEffect, useRef } from 'react'

/**
 * Tự động gọi lại `fn` theo interval (ms) và khi tab được focus lại.
 * Dùng kết hợp với useOrdersRealtime để đảm bảo luôn có dữ liệu mới
 * ngay cả khi Supabase Realtime chưa được enable cho bảng đó.
 */
export function useAutoRefresh(fn: () => void, intervalMs = 15_000) {
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    const tick = () => fnRef.current()

    // Polling
    const timer = setInterval(tick, intervalMs)

    // Refresh khi tab được focus lại (admin chuyển qua tab khác rồi quay lại)
    const onFocus = () => tick()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tick()
    })

    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [intervalMs])
}
