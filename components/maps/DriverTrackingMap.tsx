'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface DriverLocation {
  driver_name:   string
  vehicle_plate: string
  route_id:      string
  route_name:    string
  lat:           number
  lng:           number
  accuracy:      number | null
  speed_kmh:     number | null
  updated_at:    string
}

function secsAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  return s < 60 ? `${s}s trước` : `${Math.floor(s / 60)}ph trước`
}

export default function DriverTrackingMap({ height = '420px', tenantId }: { height?: string; tenantId: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<unknown>(null)
  const markersRef   = useRef<Map<string, unknown>>(new Map())
  const [drivers, setDrivers] = useState<DriverLocation[]>([])

  /* ── Load ban đầu + Supabase Realtime ──────────────────────────────────── */
  useEffect(() => {
    if (!tenantId) return
    let cancelled = false
    const load = async () => {
      const { data, error } = await supabase
        .from('driver_locations')
        .select('*')
        .eq('tenant_id', tenantId)
      if (cancelled || error) return
      if (data) setDrivers(data as DriverLocation[])
    }
    load()

    const channel = supabase
      .channel(`driver-tracking-map-${tenantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'driver_locations',
        filter: `tenant_id=eq.${tenantId}`,
      }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as DriverLocation
          setDrivers(prev => prev.filter(d => d.driver_name !== old.driver_name))
        } else {
          const updated = payload.new as DriverLocation
          setDrivers(prev => {
            const idx = prev.findIndex(d => d.driver_name === updated.driver_name)
            if (idx >= 0) { const next = [...prev]; next[idx] = updated; return next }
            return [...prev, updated]
          })
        }
      })
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [tenantId])

  /* ── Khởi tạo Leaflet map ───────────────────────────────────────────────── */
  useEffect(() => {
    // dùng cancelled flag để tránh init sau khi cleanup (React StrictMode chạy effect 2 lần)
    let cancelled = false

    import('leaflet').then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl

      if (!document.querySelector('#leaflet-css')) {
        const link = document.createElement('link')
        link.id = 'leaflet-css'; link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }

      const map = L.map(containerRef.current).setView([16.0, 106.0], 6)
      mapRef.current = map
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map)
    })

    return () => {
      cancelled = true
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (mapRef.current) { (mapRef.current as any).remove(); mapRef.current = null }
      markersRef.current.clear()
    }
  }, [])

  /* ── Cập nhật markers khi drivers thay đổi ────────────────────────────── */
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = mapRef.current as any
    if (!map) return

    import('leaflet').then((L) => {
      if (!mapRef.current) return  // map bị xóa trong lúc chờ import

      // Xóa marker của driver đã offline
      for (const [name, marker] of markersRef.current.entries()) {
        if (!drivers.find(d => d.driver_name === name)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (marker as any).remove()
          markersRef.current.delete(name)
        }
      }

      drivers.forEach(d => {
        const icon = L.divIcon({
          className: '',
          html: `
            <div style="position:relative;width:38px;height:38px">
              <div style="
                width:38px;height:38px;border-radius:50%;
                background:#0ea5e9;border:3px solid white;
                box-shadow:0 2px 10px rgba(0,0,0,0.35);
                display:flex;align-items:center;justify-content:center;
                font-size:18px;
              ">🚚</div>
              <span style="
                position:absolute;top:-4px;right:-4px;
                width:10px;height:10px;border-radius:50%;
                background:#22c55e;border:2px solid white;
              "></span>
            </div>`,
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        })

        const popupHtml = `
          <div style="font-size:12px;min-width:170px;line-height:1.6">
            <strong style="font-size:13px;color:#1e2a3a">${d.driver_name}</strong><br/>
            <span style="color:#6b7280">${d.vehicle_plate}</span><br/>
            <span style="color:#6b7280;font-size:11px">${d.route_name ?? ''}</span>
            <hr style="margin:5px 0;border-color:#e5e7eb"/>
            <div style="display:flex;gap:12px;font-size:11px">
              <span>🏎 <strong>${d.speed_kmh !== null ? d.speed_kmh + ' km/h' : '—'}</strong></span>
              <span>📡 <strong>${d.accuracy !== null ? d.accuracy + ' m' : '—'}</strong></span>
            </div>
            <div style="font-size:10px;color:#9ca3af;margin-top:3px">🕐 ${secsAgo(d.updated_at)}</div>
          </div>`

        const existing = markersRef.current.get(d.driver_name)
        if (existing) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (existing as any).setLatLng([d.lat, d.lng])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(existing as any).getPopup()?.setContent(popupHtml)
        } else {
          const marker = L.marker([d.lat, d.lng], { icon })
            .addTo(map)
            .bindPopup(popupHtml)
          markersRef.current.set(d.driver_name, marker)
          map.setView([d.lat, d.lng], 12)
        }
      })
    })
  }, [drivers])

  return (
    <div className="relative">
      <div ref={containerRef} style={{ height }} className="rounded-xl overflow-hidden w-full border border-[#e5e7eb]" />

      {/* Panel tài xế đang active */}
      <div className="absolute top-3 left-3 z-[1000] bg-white rounded-xl shadow border border-[#e5e7eb] p-3 min-w-[190px] max-w-[220px]">
        <p className="text-xs font-bold text-[#1e2a3a] mb-2 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
          Tài xế đang giao ({drivers.length})
        </p>
        {drivers.length === 0 ? (
          <p className="text-xs text-gray-400">Chưa có tài xế nào online</p>
        ) : (
          <div className="space-y-2">
            {drivers.map(d => (
              <div key={d.driver_name} className="flex items-center gap-2">
                <span className="text-base">🚚</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#1e2a3a] truncate">{d.driver_name}</p>
                  <p className="text-[10px] text-gray-400">{d.vehicle_plate} · {d.speed_kmh ?? 0} km/h</p>
                </div>
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0 ml-auto" />
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
