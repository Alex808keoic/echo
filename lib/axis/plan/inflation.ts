/**
 * Inflación para el plan: el dinero quieto pierde poder de compra; invertir a
 * largo plazo busca crecer más que ella. Dato: el IPC de España de la
 * investigación de mercado, SOLO si está vigente (`fresh`, como cualquier
 * indicador que se presenta con valor). Si no, el objetivo del BCE (2 %),
 * dicho como supuesto. Solo cambia textos y la proyección «en euros de hoy»:
 * nunca los importes del plan.
 */
import { formatCents } from '../../money'
import type { MarketContext } from '../../market/types'

/** Objetivo de inflación del BCE: el supuesto cuando no hay un dato vigente. */
export const INFLATION_ASSUMPTION_PCT = 2

export interface InflationRef {
  /** % anual. */
  pct: number
  source: 'ine' | 'assumption'
  /** Periodo del dato del INE (`YYYY-MM`), si lo es. */
  asOf?: string
}

export function inflationFrom(market: Pick<MarketContext, 'keyIndicators'> | null | undefined): InflationRef {
  const ipc = market?.keyIndicators.find((i) => i.key === 'ine-ipc')
  if (ipc && ipc.freshness === 'fresh' && typeof ipc.value === 'number' && Number.isFinite(ipc.value) && ipc.value > -5 && ipc.value < 30) {
    return { pct: Math.round(ipc.value * 10) / 10, source: 'ine', asOf: ipc.asOf }
  }
  return { pct: INFLATION_ASSUMPTION_PCT, source: 'assumption' }
}

const pctText = (pct: number) => `${String(pct).replace('.', ',')} %`

/** «una inflación del 4,9 % (IPC de España, INE)» · «una inflación del 2 % (el objetivo del BCE)». */
export function inflationPhrase(ref: InflationRef): string {
  return ref.source === 'ine' ? `una inflación del ${pctText(ref.pct)} (IPC de España, INE)` : `una inflación del ${pctText(ref.pct)} (el objetivo del BCE; no hay un dato reciente)`
}

/** Poder de compra que pierde en un año una cantidad quieta, en euros enteros. */
export function yearlyLossCents(cents: number, ref: InflationRef): number {
  if (cents <= 0 || ref.pct <= 0) return 0
  return Math.round((cents * ref.pct) / 100 / 100) * 100
}

/** Frase para dinero quieto: «Quieto, con una inflación del 4,9 % (…), pierde unos 539,00 € de poder de compra al año.» */
export function idleLossSentence(cents: number, ref: InflationRef): string | null {
  const loss = yearlyLossCents(cents, ref)
  return loss > 0 ? `Quieto en la cuenta, con ${inflationPhrase(ref)}, pierde unos ${formatCents(loss)} de poder de compra al año.` : null
}

/** Valor de hoy de una cantidad dentro de `years` años (euros de hoy). */
export function todayValueCents(cents: number, years: number, ref: InflationRef): number {
  return Math.round(cents / Math.pow(1 + ref.pct / 100, years))
}
