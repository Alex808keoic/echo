'use client'

import { useEffect } from 'react'

/**
 * Registra el service worker solo en producción (en desarrollo interferiría con el hot reload)
 * y pide almacenamiento persistente: sin él, Android puede borrar IndexedDB (todos los datos,
 * que no tienen copia en ningún servidor) cuando el móvil se queda sin espacio. Chrome lo
 * concede sin preguntar a las apps instaladas; si lo niega, todo sigue igual.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => {})
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la app funciona igual; solo pierde el arranque offline.
    })
  }, [])
  return null
}
