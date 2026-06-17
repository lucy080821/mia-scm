'use client'
import { useEffect, useRef } from 'react'

interface DeliveryStop {
  lat: number
  lng: number
  label: string
  status?: 'pending' | 'delivering' | 'delivered'
}

interface DeliveryMapProps {
  stops?: DeliveryStop[]
  height?: string
}

const defaultStops: DeliveryStop[] = [
  { lat: 10.8231, lng: 106.6297, label: 'Kho HCM', status: 'delivered' },
  { lat: 10.9808, lng: 106.6711, label: 'Bình Dương', status: 'delivering' },
  { lat: 10.9575, lng: 106.8428, label: 'Đồng Nai', status: 'pending' },
]

const statusColor: Record<string, string> = {
  delivered: '#10b981',
  delivering: '#0ea5e9',
  pending: '#f59e0b',
}

export default function DeliveryMap({ stops = defaultStops, height = '300px' }: DeliveryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<unknown>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Dynamically import leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      if (!containerRef.current) return
      // Leaflet marks initialized containers — clear it if already set
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((containerRef.current as any)._leaflet_id) return
      // Fix default marker icon paths broken by webpack
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      // Import Leaflet CSS
      if (!document.querySelector('#leaflet-css')) {
        const link = document.createElement('link')
        link.id = 'leaflet-css'
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }

      const map = L.map(containerRef.current!).setView([10.9, 106.7], 10)
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      stops.forEach((stop) => {
        const color = statusColor[stop.status ?? 'pending']
        const icon = L.divIcon({
          className: '',
          html: `<div style="
            width:14px;height:14px;border-radius:50%;
            background:${color};border:2px solid white;
            box-shadow:0 1px 4px rgba(0,0,0,0.4);
          "></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        })

        L.marker([stop.lat, stop.lng], { icon })
          .addTo(map)
          .bindPopup(`<strong>${stop.label}</strong>`)
      })
    })

    return () => {
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(mapRef.current as any).remove()
        mapRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="rounded-xl overflow-hidden w-full"
    />
  )
}
