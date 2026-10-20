/**
 * Historial del valor de cada inversión (`Position.valueHistory`). Puro.
 *
 * Solo se sabe lo que el usuario apunta: el día de la aportación una
 * posición vale lo aportado, y después vale lo último que se apuntó. Entre
 * dos valores no se inventa nada (la gráfica no interpola).
 */
import type { Position, PositionValue } from '../types'

/** Como mucho se guardan estos valores por posición (los más recientes): más de 8 años actualizando cada semana. */
export const MAX_VALUE_HISTORY = 400

/** Apunta el valor de un día: sustituye el de ese mismo día si ya había uno. Ordenado de antiguo a reciente. */
export function withValue(history: readonly PositionValue[] | undefined, date: string, valueCents: number): PositionValue[] {
  const rest = (history ?? []).filter((h) => h.date !== date)
  return [...rest, { date, valueCents }].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_VALUE_HISTORY)
}

/** Último día en que se apuntó el valor (`null` si nunca desde que existe el historial). */
export function lastValueDate(p: Pick<Position, 'valueHistory'>): string | null {
  const h = p.valueHistory
  return h && h.length > 0 ? h[h.length - 1].date : null
}

/**
 * Cambios de valor de una posición por fecha, frente a lo aportado: el día de
 * cada valor apuntado, lo que subió o bajó desde el anterior. Si el valor
 * actual no coincide con el último apuntado (posiciones anteriores al
 * historial), la diferencia va a `asOf`. Las fechas anteriores a la
 * aportación cuentan en la aportación. Sin ceros.
 */
export function revaluationDeltas(p: Pick<Position, 'investedCents' | 'valueCents' | 'date' | 'valueHistory'>, asOf: string): Array<{ date: string; cents: number }> {
  const out: Array<{ date: string; cents: number }> = []
  let prev = p.investedCents
  for (const h of p.valueHistory ?? []) {
    const date = h.date < p.date ? p.date : h.date
    if (h.valueCents !== prev) out.push({ date, cents: h.valueCents - prev })
    prev = h.valueCents
  }
  if (p.valueCents !== prev) out.push({ date: asOf, cents: p.valueCents - prev })
  return out
}
