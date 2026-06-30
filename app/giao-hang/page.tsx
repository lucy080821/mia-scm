'use client'
import { useEffect } from 'react'

export default function GiaoHangIndex() {
  useEffect(() => {
    window.location.replace('/logistics/ke-hoach-giao-hang')
  }, [])
  return null
}
