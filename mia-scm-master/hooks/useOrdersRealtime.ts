import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type OrderChangePayload = {
  new: Record<string, unknown>
  old: Record<string, unknown>
  eventType: string
}

export function useOrdersRealtime(
  onChangeHandler: (payload: OrderChangePayload) => void,
  tables: string[] = ['sales_orders'],
) {
  const handlerRef = useRef(onChangeHandler)
  handlerRef.current = onChangeHandler

  useEffect(() => {
    const channel = supabase.channel(`orders-rt-${Math.random().toString(36).slice(2)}`)

    for (const table of tables) {
      channel.on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table },
        (payload: any) => {
          handlerRef.current({
            new: (payload.new ?? {}) as Record<string, unknown>,
            old: (payload.old ?? {}) as Record<string, unknown>,
            eventType: payload.eventType,
          })
        }
      )
    }

    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])
}
