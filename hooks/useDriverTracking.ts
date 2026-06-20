'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface DriverTrackingState {
  active: boolean
  lat: number | null
  lng: number | null
  accuracy: number | null
  speedKmh: number | null
  error: string
  start: () => void
  stop: () => Promise<void>
}

export function useDriverTracking(
  driverName: string,
  vehiclePlate: string,
  routeId: string,
  routeName: string,
  tenantId: string,
): DriverTrackingState {
  const [active, setActive]       = useState(false)
  const [lat, setLat]             = useState<number | null>(null)
  const [lng, setLng]             = useState<number | null>(null)
  const [accuracy, setAccuracy]   = useState<number | null>(null)
  const [speedKmh, setSpeedKmh]   = useState<number | null>(null)
  const [error, setError]         = useState('')
  const watchIdRef                = useRef<number | null>(null)

  const pushLocation = useCallback(async (pos: GeolocationPosition) => {
    const { latitude, longitude, accuracy: acc, speed } = pos.coords
    setLat(latitude)
    setLng(longitude)
    setAccuracy(acc !== null ? Math.round(acc) : null)
    setSpeedKmh(speed !== null ? Math.round(speed * 3.6) : null)
    setActive(true)
    setError('')

    try {
      await supabase.from('driver_locations').upsert({
        driver_name:   driverName,
        vehicle_plate: vehiclePlate,
        route_id:      routeId,
        route_name:    routeName,
        tenant_id:     tenantId,
        lat:           latitude,
        lng:           longitude,
        accuracy:      acc,
        speed_kmh:     speed !== null ? Math.round(speed * 3.6) : null,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'driver_name,tenant_id' })
    } catch {
      // không block nếu Supabase lỗi
    }
  }, [driverName, vehiclePlate, routeId, routeName])

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Thiết bị không hỗ trợ GPS')
      return
    }
    setError('')
    watchIdRef.current = navigator.geolocation.watchPosition(
      pushLocation,
      (err) => {
        setError(
          err.code === 1 ? 'Bạn chưa cho phép truy cập vị trí'
          : err.code === 2 ? 'Không xác định được vị trí'
          : 'Hết thời gian chờ GPS'
        )
        setActive(false)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    )
  }, [pushLocation])

  const stop = useCallback(async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setActive(false)
    setLat(null)
    setLng(null)
    setSpeedKmh(null)
    try {
      await supabase.from('driver_locations').delete().eq('driver_name', driverName).eq('tenant_id', tenantId)
    } catch {}
  }, [driverName])

  // cleanup khi unmount
  useEffect(() => () => {
    if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current)
  }, [])

  return { active, lat, lng, accuracy, speedKmh, error, start, stop }
}
