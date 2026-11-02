'use client'

import { useEffect, useRef } from 'react'
import type { FinancialOverview } from '@/hooks/use-financial-overview'
import { useEcosystem } from '@/hooks/use-ecosystem'
import { Onboarding, ONBOARDING_TITLE } from './forms/onboarding'
import { useSheet } from './sheet'

/**
 * Al volver de Google desde «¿Ya usas Finax? Entrar con Google»: tapa la pantalla
 * mientras llega la primera sincronización. Si la cuenta no tenía datos de Finax,
 * abre la guía de siempre para configurar.
 */
export function RestoreOverlay({ overview }: { overview: FinancialOverview | undefined }) {
  const { cloud } = useEcosystem()
  const { open } = useSheet()
  const wasRestoring = useRef(false)

  useEffect(() => {
    if (cloud.restoring) {
      wasRestoring.current = true
      return
    }
    if (!wasRestoring.current) return
    // Dexie tarda un instante en avisar de lo recién escrito: se mira un poco después.
    const timer = window.setTimeout(() => {
      wasRestoring.current = false
      if (overview?.config === null) open(ONBOARDING_TITLE, <Onboarding />)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [cloud.restoring, overview?.config, open])

  if (!cloud.restoring) return null

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background px-8 text-center" role="status" aria-live="polite">
      <span className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-card shadow-[0_12px_28px_-10px_rgba(14,166,118,0.45)]">
        <img src="/logo-mark.png" alt="" aria-hidden="true" className="h-12 w-12 animate-pulse object-contain" />
      </span>
      <div>
        <p className="text-[20px] font-extrabold tracking-tight text-grafito">Recuperando tus datos…</p>
        <p className="mt-1.5 text-[13.5px] font-medium leading-snug text-muted-foreground text-pretty">Traemos tus movimientos, objetivos e inversiones de tu cuenta. Solo tarda unos segundos.</p>
      </div>
    </div>
  )
}
