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
