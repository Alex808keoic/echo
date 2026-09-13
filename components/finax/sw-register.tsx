'use client'

import { useEffect } from 'react'

/** Registra el service worker solo en producción (en desarrollo interferiría con el hot reload). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la app funciona igual; solo pierde el arranque offline.
    })
  }, [])
  return null
}
