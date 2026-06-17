export interface DeliveryStop {
  id: string
  seq: number        // thứ tự gợi ý (không bắt buộc)
  customer: string
  address: string
  items: string      // "12 thùng SN150, 5kg Additive A"
  cod: number
  note?: string
}

export interface TokenPayload {
  deliveryId: string
  code: string       // DV-240524-001
  driver: string
  vehicle: string
  route: string
  stops: DeliveryStop[]
  createdAt: number  // unix ms
  expiresAt: number  // createdAt + 24h
}

export function encodeToken(payload: TokenPayload): string {
  const json = JSON.stringify(payload)
  if (typeof window !== 'undefined') {
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  }
  return Buffer.from(json, 'utf-8').toString('base64url')
}

export function decodeToken(token: string): TokenPayload | null {
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/')
    let json: string
    if (typeof window !== 'undefined') {
      json = decodeURIComponent(escape(atob(base64)))
    } else {
      json = Buffer.from(base64, 'base64').toString('utf-8')
    }
    const payload = JSON.parse(json) as TokenPayload
    if (Date.now() > payload.expiresAt) return null
    return payload
  } catch {
    return null
  }
}

// ─── Permanent driver token (không hết hạn) ───────────────────────────────────
export interface DriverTokenPayload { driverId: string; driverName: string }

export function createDriverToken(driver: { id: string; name: string }): string {
  const json = JSON.stringify({ driverId: driver.id, driverName: driver.name })
  if (typeof window !== 'undefined')
    return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return Buffer.from(json, 'utf-8').toString('base64url')
}

export function decodeDriverToken(token: string): DriverTokenPayload | null {
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/')
    const json = typeof window !== 'undefined'
      ? decodeURIComponent(escape(atob(base64)))
      : Buffer.from(base64, 'base64').toString('utf-8')
    const p = JSON.parse(json)
    if (!p.driverId) return null
    return p as DriverTokenPayload
  } catch { return null }
}

// ─── Per-trip token (giữ để backward compat) ─────────────────────────────────
export function createToken(delivery: {
  id: string; code: string; driver: string; vehicle: string; route: string
  customer: string; address?: string; items?: string; cod: number
}): string {
  const payload: TokenPayload = {
    deliveryId: delivery.id,
    code: delivery.code,
    driver: delivery.driver,
    vehicle: delivery.vehicle,
    route: delivery.route,
    stops: [{
      id: `${delivery.id}-s1`,
      seq: 1,
      customer: delivery.customer,
      address: delivery.address ?? delivery.route.split('→')[1]?.trim() ?? '',
      items: delivery.items ?? 'Hàng hóa theo đơn',
      cod: delivery.cod,
    }],
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  }
  return encodeToken(payload)
}
