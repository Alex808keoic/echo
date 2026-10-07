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

  return (
    <div className="flex h-full min-h-[320px] items-center justify-center px-5">
      {slow ? (
        <div role="alert" className="max-w-[280px] text-center">
          <p className="text-[15px] font-bold text-grafito text-balance">{SLOW_LOADING_VIEW.title}</p>
          <p className="mt-1 text-[13px] font-medium text-muted-foreground text-pretty">{SLOW_LOADING_VIEW.message}</p>
          <Button className="mt-4 min-w-[160px]" onClick={() => window.location.reload()}>
            {SLOW_LOADING_VIEW.retryLabel}
          </Button>
        </div>
      ) : (
        <p className="text-[13px] font-medium text-muted-foreground">Cargando tus datos…</p>
      )}
    </div>
  )
}
