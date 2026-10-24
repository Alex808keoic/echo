/**
 * Ahorro seguro — Banco de España (CSV, latin1, sin autenticación):
 * - be1907: tipos de las nuevas operaciones de depósito de los hogares
 *   (media mensual, TEDR): a plazo hasta 1 año y a la vista. Es lo que pagan
 *   de verdad los bancos en España, no el tipo del BCE. Se publica con unos
 *   dos meses de retraso (`INDICATOR_FRESHNESS.slowMonthlyKeys`).
 * - ti_1_3: Letras del Tesoro a 1 año, mercado secundario (diario), con la
 *   variación frente a hace un mes en puntos.
 */
import { baseFor, daysBetween, fetchText, parseBdeTable, round, source, type Source, type SourceContext } from './shared'
import type { MarketIndicator } from '../../../lib/market/types'

const TABLE = (id: string) => `https://www.bde.es/webbe/es/estadisticas/compartido/datos/csv/${id}.csv`
export const DEPOSITS_URL = TABLE('be1907')
export const LETRAS_URL = TABLE('ti_1_3')

const DEPOSITS = [
  { key: 'es-deposit-1y', label: 'Depósitos a plazo hasta 1 año (hogares, media)', match: /Hogares e ISFLSH\. Dep.sitos a plazo hasta 1 a.o/i },
  { key: 'es-deposit-sight', label: 'Cuentas a la vista (hogares, media)', match: /Dep.sitos de hogares e ISFLSH\. A la vista/i },
] as const

function monthly(csv: string, d: (typeof DEPOSITS)[number]): MarketIndicator {
  const [prev, last] = parseBdeTable(csv, d.match, 2)
  const latest = last ?? prev
  if (!latest) throw new Error(`${d.key}: sin datos`)
  return {
    key: d.key,
    label: d.label,
    group: 'rate',
    value: round(latest.value, 2),
    unit: '%',
    asOf: latest.date,
    changePct: last && prev ? round(last.value - prev.value, 2) : null,
    ...(last && prev ? { changeDays: daysBetween(prev.date, last.date) } : {}),
    source: 'Banco de España',
  }
}

async function letras(ctx: SourceContext): Promise<MarketIndicator> {
  const points = parseBdeTable(await fetchText(ctx, LETRAS_URL, {}, 'latin1'), /Letras del tesoro\. 1 A.o/i, 30)
  const last = points[points.length - 1]
  if (!last) throw new Error('Letras: sin datos')
  const base = baseFor(points, 28)
  return {
    key: 'es-letras-1y',
    label: 'Letras del Tesoro a 1 año',
    group: 'rate',
    value: round(last.value, 2),
    unit: '%',
    asOf: last.date,
    changePct: base ? round(last.value - base.value, 2) : null,
    ...(base ? { changeDays: daysBetween(base.date, last.date) } : {}),
    source: 'Banco de España',
  }
}

export const bdeSavings: Source = async (ctx) => {
  const results = await Promise.allSettled([
    (async () => {
      const csv = await fetchText(ctx, DEPOSITS_URL, {}, 'latin1')
      return DEPOSITS.map((d) => monthly(csv, d))
    })(),
    letras(ctx).then((i) => [i]),
  ])
  const indicators = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (indicators.length === 0) throw new Error('ni depósitos ni Letras disponibles')
  return { source: source('Banco de España · depósitos y Letras', DEPOSITS_URL, 'official', ctx.now), indicators, headlines: [] }
}
