'use client'

import { useEffect, useState } from 'react'
import type { SVGProps } from 'react'
import { ChevronLeft, ChevronRight, MoneyIcon, ShieldIcon, StatsIcon, TargetIcon } from './icons'
import type { FinancialOverview } from '@/hooks/use-financial-overview'
import { cn } from '@/lib/utils'
import { AxisMark } from './axis-mark'
import { Button } from './button'
import { Onboarding, ONBOARDING_TITLE } from './forms/onboarding'
import { useSheet } from './sheet'
import { useEcosystem } from '@/hooks/use-ecosystem'

/** Si ya se vio la bienvenida en este dispositivo. */
const SEEN_KEY = 'finax.welcomeSeen'

type Overview = FinancialOverview | undefined

const POINTS: ReadonlyArray<{ icon: ((props: SVGProps<SVGSVGElement>) => React.ReactNode) | null; title: string; text: string }> = [
  { icon: MoneyIcon, title: 'Tu dinero, claro', text: 'Lo que tienes, lo que entra y lo que sale, de un vistazo.' },
  { icon: StatsIcon, title: 'Entiende tus gastos', text: 'En qué se va tu dinero cada mes, por categorías.' },
  { icon: TargetIcon, title: 'Tus objetivos', text: 'Un fondo de emergencia, un viaje… y cuánto te falta.' },
  { icon: null, title: 'AXIS, tu consultor', text: 'Te prepara un plan: cuánto ahorrar, cuánto invertir y en qué tipo de inversión.' },
  { icon: ShieldIcon, title: 'Tus datos, tuyos', text: 'Se guardan en tu móvil, sin cuenta. Si entras con Google, también en tu cuenta, para tenerlos en cualquier móvil.' },
]

/**
 * La primera vez que se abre Finax: dos pantallas con la estética de la bienvenida de
 * AXIS (marca centrada, título grande, puntos con icono, puntos de avance, botón grande).
 * «Empezar» abre la guía de siempre; «Saltar» deja en Inicio. Solo sin configurar.
 * «¿Ya usas Finax?» entra con Google y recupera los datos de la nube sin pasar por la guía.
 */
export function FirstRunWelcome({ overview }: { overview: Overview }) {
  const { open } = useSheet()
  const [step, setStep] = useState<0 | 1 | null>(null)
  const { restoreWithGoogle } = useEcosystem()
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  const fresh = overview !== undefined && overview.isEmpty && overview.config === null
  useEffect(() => {
    if (!fresh) return
    try {
      if (!window.localStorage.getItem(SEEN_KEY)) setStep(0)
    } catch {
      setStep(0)
    }
  }, [fresh])

  if (step === null || !fresh) return null

  const close = (startGuide: boolean) => {
    try {
      window.localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Sin almacenamiento se vería otra vez la próxima vez; no pasa nada.
    }
    setStep(null)
    if (startGuide) open(ONBOARDING_TITLE, <Onboarding />)
  }

  const restore = async () => {
    setRestoring(true)
    setRestoreError(null)
    try {
      window.localStorage.setItem(SEEN_KEY, '1')
    } catch {
      // Ver la bienvenida otra vez no rompe nada.
    }
    const failure = await restoreWithGoogle()
    if (failure) {
      setRestoreError(failure)
      setRestoring(false)
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-background px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]" role="dialog" aria-label="Bienvenida a Finax">
      <header className="flex min-h-11 items-center justify-between">
        {step === 1 ? (
          <button type="button" onClick={() => setStep(0)} aria-label="Atrás" className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full active:bg-muted">
            <ChevronLeft className="h-5 w-5 text-grafito" />
          </button>
        ) : (
          <span className="flex items-center gap-1.5">
            <img src="/logo-mark.png" alt="" aria-hidden="true" className="h-6 w-6 object-contain" />
            <span className="text-xl font-extrabold tracking-tight text-grafito">finax</span>
          </span>
        )}
        <button type="button" onClick={() => close(false)} className="min-h-11 px-2 text-[14px] font-semibold text-muted-foreground">
          Saltar
        </button>
      </header>

      <div key={step} className="screen-fade flex flex-1 flex-col justify-center overflow-y-auto py-6">
        {step === 0 ? (
          <div className="text-center">
            <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-[28px] bg-card shadow-[0_12px_28px_-10px_rgba(14,166,118,0.45)]">
              <img src="/logo-mark.png" alt="" aria-hidden="true" className="h-16 w-16 object-contain" />
            </span>
            <h1 className="mt-8 text-[28px] font-extrabold leading-tight tracking-tight text-grafito text-balance">Bienvenido a Finax</h1>
            <p className="mx-auto mt-3 max-w-xs text-[15px] font-medium leading-relaxed text-muted-foreground text-pretty">
              Tu dinero, con sentido. Entiende en qué se va, ahorra para lo que importa y deja que <b className="text-grafito">AXIS</b> te diga el siguiente paso.
            </p>
          </div>
        ) : (
          <div>
            <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-grafito">Qué hace Finax</h1>
            <p className="mt-2 text-[14px] font-medium leading-snug text-muted-foreground">Empiezas en un minuto: tu saldo de hoy y listo.</p>
            <ul className="mt-5 space-y-2.5">
              {POINTS.map((point) => (
                <li key={point.title} className="flex items-start gap-3.5 rounded-3xl bg-card px-4 py-3 shadow-[0_6px_18px_-12px_rgba(31,41,55,0.35)]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-finax-soft text-finax-dark" aria-hidden="true">
                    {point.icon ? <point.icon className="h-[19px] w-[19px]" /> : <AxisMark size={20} />}
                  </span>
                  <div>
                    <p className="text-[14px] font-bold text-grafito">{point.title}</p>
                    <p className="text-[12.5px] font-medium leading-snug text-muted-foreground">{point.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div>
        <div className="mb-4 flex justify-center gap-1.5" aria-hidden="true">
          {[0, 1].map((i) => (
            <span key={i} className={cn('h-1.5 rounded-full transition-all duration-300', i === step ? 'w-5 bg-finax-dark' : 'w-1.5 bg-muted')} />
          ))}
        </div>
        <Button fullWidth className="min-h-[52px]" onClick={() => (step === 0 ? setStep(1) : close(true))} disabled={restoring}>
          {step === 0 ? 'Empezar' : 'Configurar Finax'}
          <ChevronRight className="h-4 w-4" />
        </Button>
        {step === 0 && (
          <>
            <Button variant="ghost" fullWidth className="mt-2 min-h-[48px]" onClick={() => void restore()} disabled={restoring}>
              {restoring ? 'Abriendo Google…' : '¿Ya usas Finax? Entrar con Google'}
            </Button>
            {restoreError && <p className="mt-2 text-center text-[12.5px] font-medium text-negative">No se ha podido abrir Google: {restoreError}</p>}
          </>
        )}
      </div>
    </div>
  )
}
