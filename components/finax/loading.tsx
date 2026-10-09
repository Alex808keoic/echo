'use client'

import { useEffect, useState } from 'react'
import { SLOW_LOADING_MS, SLOW_LOADING_VIEW } from '@/lib/db/storage-errors'
import { Button } from './button'

/**
 * Estado de carga discreto mientras se leen los datos locales. Si tarda
 * demasiado (la base puede estar bloqueada por otra pestaña), deja de ser
 * una espera indefinida: lo explica y ofrece reintentar.
 */
export function ScreenLoading() {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_LOADING_MS)
    return () => clearTimeout(timer)
  }, [])

  if (slow) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center px-5">
        <div role="alert" className="fade-in max-w-[280px] text-center">
          <p className="text-[15px] font-bold text-grafito text-balance">{SLOW_LOADING_VIEW.title}</p>
          <p className="mt-1 text-[13px] font-medium text-muted-foreground text-pretty">{SLOW_LOADING_VIEW.message}</p>
          <Button className="mt-4 min-w-[160px]" onClick={() => window.location.reload()}>
            {SLOW_LOADING_VIEW.retryLabel}
          </Button>
        </div>
      </div>
    )
  }

  // Esqueleto con la forma de una pantalla (cabecera, cifra, gráfica y tarjetas): la espera se entiende sin texto.
  return (
    <div role="status" aria-live="polite" className="space-y-5 px-5 pb-8 pt-5">
      <span className="sr-only">Cargando tus datos…</span>
      <div aria-hidden className="space-y-5">
        <div className="flex items-center justify-between">
          <span className="skeleton block h-7 w-24 rounded-full" />
          <span className="skeleton block h-10 w-10 rounded-full" />
        </div>
        <div className="space-y-2">
          <span className="skeleton block h-3.5 w-28 rounded-full" />
          <span className="skeleton block h-10 w-48 rounded-xl" />
          <span className="skeleton block h-3.5 w-36 rounded-full" />
        </div>
        <span className="skeleton block h-[150px] w-full rounded-3xl" />
        <span className="skeleton block h-20 w-full rounded-3xl" />
        <span className="skeleton block h-24 w-full rounded-3xl" />
      </div>
    </div>
  )
}
