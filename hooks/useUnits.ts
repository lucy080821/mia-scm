'use client'
import { useState, useEffect } from 'react'
import { loadBusinessSettingsAsync, saveBusinessSettingsAsync, loadBusinessSettings } from '@/lib/business-settings'

export const DEFAULT_UNITS = ['Thùng', 'Cái', 'Gói', 'Hộp', 'Kg', 'Lít', 'Chai', 'Bao']

export function useUnits() {
  const [units, setUnits] = useState<string[]>(() => {
    // Khởi tạo từ localStorage để tránh flash
    const s = loadBusinessSettings()
    return s.units && s.units.length > 0 ? s.units : DEFAULT_UNITS
  })

  useEffect(() => {
    loadBusinessSettingsAsync().then(s => {
      if (s.units && s.units.length > 0) setUnits(s.units)
      else setUnits(DEFAULT_UNITS)
    })
  }, [])

  return units
}

export async function saveUnits(units: string[]): Promise<void> {
  const current = await loadBusinessSettingsAsync()
  saveBusinessSettingsAsync({ ...current, units })
}
