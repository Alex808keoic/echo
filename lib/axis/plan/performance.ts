/**
 * Cómo va cada inversión (decidido con el usuario el 2026-11-02): cuánto ha
 * subido o bajado desde que la compraste, en el último mes y en el último año,
 * con los valores que apuntas (`valueHistory`). Finax no consulta cotizaciones:
 * si no actualizas el valor, para Finax no se ha movido. Pura.
 *
 * El plan lo usa para controlar el riesgo, nunca para adivinar el mercado:
 *   - una inversión de la parte arriesgada que cae `RISKY_DROP_PCT` % o más
 *     deja de recibir dinero nuevo hasta que lo revises (puede no recuperarse);
 *   - un valor de hace más de `STALE_VALUE_DAYS` días se avisa: las caídas y
 *     subidas que no apuntas no cuentan.
 */
import type { PositionValue } from '../../types'

/** Caída (en %, sobre lo aportado) a partir de la cual una inversión de la parte arriesgada se revisa. */
export const RISKY_DROP_PCT = 30
/** Días sin actualizar el valor de una inversión a partir de los cuales se avisa. */
export const STALE_VALUE_DAYS = 35

/** Ventanas de comparación: el valor más reciente anterior a `minDays` días, si no es más viejo que `maxDays`. */
const MONTH_WINDOW = { minDays: 21, maxDays: 50 } as const
const YEAR_WINDOW = { minDays: 330, maxDays: 400 } as const

const DAY_MS = 86_400_000
const dayOf = (iso: string) => {
  const t = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(t) ? NaN : Math.round(t / DAY_MS)
}
const round1 = (n: number) => Math.round(n * 10) / 10

export interface PositionPerformance {
  /** Subida o bajada sobre lo aportado, en % con un decimal; `null` sin aportación. */
  changePct: number | null
  /** Frente al valor de hace un mes (21–50 días); `null` si no hay ese valor apuntado. */
  monthChangePct: number | null
  /** Frente al valor de hace un año (330–400 días); `null` si no hay ese valor apuntado. */
  yearChangePct: number | null
  /** Día del último valor apuntado (`YYYY-MM-DD`). */
  valueAsOf: string
  /** Días desde el último valor apuntado hasta `asOf`. */
  staleDays: number
}

type PositionLike = { investedCents: number; valueCents: number; date: string; updatedAt?: number; valueHistory?: readonly PositionValue[] }

function changeAgainst(history: readonly PositionValue[], lastDay: number, valueCents: number, window: { minDays: number; maxDays: number }): number | null {
  const base = [...history].reverse().find((h) => {
    const age = lastDay - dayOf(h.date)
    return age >= window.minDays && age <= window.maxDays
  })
  if (!base || base.valueCents <= 0) return null
  return round1(((valueCents - base.valueCents) / base.valueCents) * 100)
}

export function positionPerformance(p: PositionLike, asOf: string): PositionPerformance {
  const history = (p.valueHistory ?? []).filter((h) => Number.isSafeInteger(h.valueCents) && !Number.isNaN(dayOf(h.date)))
  // Sin historial (inversiones anteriores al 2026-10-20): la última vez que se editó, o el día de compra.
  const edited = typeof p.updatedAt === 'number' && Number.isFinite(p.updatedAt) ? new Date(p.updatedAt).toISOString().slice(0, 10) : p.date
  const valueAsOf = history.length > 0 ? history[history.length - 1].date : edited > p.date ? edited : p.date
  const lastDay = dayOf(valueAsOf)
  return {
    changePct: p.investedCents > 0 ? round1(((p.valueCents - p.investedCents) / p.investedCents) * 100) : null,
    monthChangePct: changeAgainst(history, lastDay, p.valueCents, MONTH_WINDOW),
    yearChangePct: changeAgainst(history, lastDay, p.valueCents, YEAR_WINDOW),
    valueAsOf,
    staleDays: Math.max(0, dayOf(asOf) - lastDay),
  }
}
