/**
 * Resumen del año: cómo ha ido tu dinero en un año natural (o en lo que va de
 * año), como la reunión anual con tu consultor. Cuánto ingresaste, gastaste y
 * ahorraste, en qué se fue más, cómo cambió tu dinero líquido, cuánto
 * invertiste, cuánto le costó la inflación a lo que tenías quieto, qué
 * objetivos conseguiste y qué conviene hacer el año que viene. Si tus
 * respuestas de «Tu perfil» tienen casi un año, propone repetirlas.
 *
 * Pura y determinista: sale de tus datos. No hay historial del valor de tus
 * inversiones ni de tus deudas (se actualizan a mano), así que de ellas solo
 * se dice lo de hoy.
 */
import { formatCents } from '../../money'
import { computeLiquidCents } from '../../finance/patrimonio'
import { oneOffTotals, summarize, totalsByCategory } from '../../finance/summary'
import type { AppConfig, Debt, Movement, Objective, Position } from '../../types'
import { inflationPhrase, type InflationRef } from './inflation'

/** Respuestas de «Tu perfil» con más días que esto: se propone repetirlas. */
export const PROFILE_REVIEW_DAYS = 330
/** Tasa de ahorro por debajo de la cual se propone subirla. */
export const LOW_SAVINGS_RATE_PCT = 10

export interface YearReview {
  /** `YYYY` */
  year: string
  /** El año aún no ha acabado: «en lo que va de año». */
  partial: boolean
  /** Meses con movimientos. */
  months: number
  incomeCents: number
  expenseCents: number
  savedCents: number
  savingsRatePct: number | null
  lines: string[]
  /** Qué hacer el año que viene (o lo que queda de este). */
  next: string[]
  /** Toca repetir «Tu perfil». */
  profileStale: boolean
}

const eur = (cents: number) => formatCents(cents)
const DAY_MS = 86_400_000

/** Años con movimientos, del más reciente al más antiguo. */
export function yearsWithData(movements: readonly Movement[]): string[] {
  return [...new Set(movements.map((m) => m.date.slice(0, 4)))].sort().reverse()
}

export function reviewYear(input: {
  snapshot: { config: AppConfig | null; movements: Movement[]; positions: Position[]; objectives: Objective[]; debts?: Debt[] }
  year: string
  asOf: string
  inflation: InflationRef
  /** Fecha (ms) de la respuesta más reciente de «Tu perfil», o `null` si no lo has respondido. */
  profileAnsweredAt: number | null
  now?: number
}): YearReview | null {
  const { snapshot, year, asOf, inflation } = input
  const now = input.now ?? Date.now()
  const inYear = snapshot.movements.filter((m) => m.date.startsWith(year))
  if (inYear.length === 0) return null
  const partial = asOf.slice(0, 4) === year
  const s = summarize(inYear)
  const oneOff = oneOffTotals(inYear)
  const months = new Set(inYear.map((m) => m.date.slice(0, 7))).size
  const saved = s.incomeCents - s.expenseCents
  const rate = s.incomeCents > 0 ? Math.round((saved / s.incomeCents) * 100) : null
  const when = partial ? 'En lo que va de año' : `En ${year}`
  const lines: string[] = []

  lines.push(`${when} ingresaste ${eur(s.incomeCents)} y gastaste ${eur(s.expenseCents)}.`)
  lines.push(saved >= 0 ? `Ahorraste ${eur(saved)}${rate !== null ? `: el ${rate} % de lo que ingresaste` : ''}.` : `Gastaste ${eur(-saved)} más de lo que ingresaste.`)
  if (oneOff.incomeCents > 0 || oneOff.expenseCents > 0) {
    const parts = [oneOff.incomeCents > 0 ? `${eur(oneOff.incomeCents)} de ingresos` : null, oneOff.expenseCents > 0 ? `${eur(oneOff.expenseCents)} de gastos` : null].filter(Boolean)
    lines.push(`De eso, fue puntual: ${parts.join(' y ')}.`)
  }
  const top = totalsByCategory(inYear, 'gasto')[0]
  if (top) lines.push(`Donde más gastaste: «${top.label}», ${eur(top.cents)} (el ${top.pct} % de tus gastos).`)

  // Dinero líquido al empezar el año y al acabarlo (o hoy).
  const initial = snapshot.config?.initialBalanceCents ?? 0
  const liquidAt = (day: string) =>
    computeLiquidCents(
      initial,
      snapshot.movements.filter((m) => m.date <= day),
      snapshot.positions.filter((p) => p.date <= day),
    )
  const start = liquidAt(`${Number(year) - 1}-12-31`)
  const end = liquidAt(partial ? asOf : `${year}-12-31`)
  lines.push(`Tu dinero líquido pasó de ${eur(start)} a ${eur(end)}.`)

  const investedInYear = snapshot.positions.filter((p) => p.date.startsWith(year)).reduce((t, p) => t + Math.max(0, p.investedCents), 0)
  if (investedInYear > 0) lines.push(`Invertiste ${eur(investedInYear)}.`)
  const invested = snapshot.positions.reduce((t, p) => t + Math.max(0, p.investedCents), 0)
  const value = snapshot.positions.reduce((t, p) => t + Math.max(0, p.valueCents), 0)
  if (invested > 0) lines.push(`Hoy tus inversiones valen ${eur(value)}: ${value >= invested ? `${eur(value - invested)} más` : `${eur(invested - value)} menos`} de lo que aportaste en total.`)

  // Inflación: lo que perdió el dinero quieto (la media del año, la parte del año transcurrida).
  const fraction = partial ? Number(asOf.slice(5, 7)) / 12 : 1
  const idle = Math.max(0, Math.round((start + end) / 2))
  const loss = Math.round((idle * inflation.pct * fraction) / 100 / 100) * 100
  if (loss > 0) lines.push(`Con ${inflationPhrase(inflation)}, tu dinero quieto perdió unos ${eur(loss)} de poder de compra.`)

  const achieved = snapshot.objectives.filter((o) => o.achievedAt !== undefined && new Date(o.achievedAt).getFullYear() === Number(year))
  if (achieved.length > 0) lines.push(`Conseguiste ${achieved.length === 1 ? 'tu objetivo' : 'tus objetivos'} ${achieved.map((o) => `«${o.name}»`).join(', ')}.`)

  const owed = (snapshot.debts ?? []).reduce((t, d) => t + Math.max(0, d.balanceCents), 0)
  if (owed > 0) lines.push(`Hoy debes ${eur(owed)} en total.`)

  // Para el año que viene.
  const next: string[] = []
  const profileStale = input.profileAnsweredAt === null || now - input.profileAnsweredAt > PROFILE_REVIEW_DAYS * DAY_MS
  if (rate !== null && rate < LOW_SAVINGS_RATE_PCT) next.push(`Intenta ahorrar al menos el ${LOW_SAVINGS_RATE_PCT} % de lo que ingresas: mira en Estadísticas qué gasto puedes bajar.`)
  if (owed > 0) next.push('Actualiza lo que te queda de cada deuda y sigue tu plan para devolver antes las caras.')
  if (snapshot.positions.length > 0) next.push('Actualiza el valor de tus inversiones para ver tu rentabilidad real.')
  next.push(partial ? 'Revisa si tus objetivos siguen siendo los mismos y si sus fechas son realistas.' : 'Piensa qué quieres conseguir este año y crea o ajusta tus objetivos.')
  if (profileStale) next.push('Vuelve a responder «Tu perfil»: en un año pueden cambiar tus plazos y cómo llevas el riesgo, y con ellos tu plan.')
  return { year, partial, months, incomeCents: s.incomeCents, expenseCents: s.expenseCents, savedCents: saved, savingsRatePct: rate, lines, next, profileStale }
}
