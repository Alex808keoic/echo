/**
 * Renta fija — BCE Data Portal (SDMX-JSON, sin autenticación):
 * - bono a 10 años de la eurozona (curva AAA, diario), variación en un mes;
 * - bono a 10 años de España (tipo de convergencia, media mensual).
 * Es la rentabilidad, no el precio: si sube, los bonos que ya existían valen
 * menos. La variación va en puntos porcentuales.
 */
import { baseFor, daysBetween, fetchJSON, parseEcbSeries, round, source, type EcbSdmxJson, type Source } from './shared'
import type { MarketIndicator } from '../../../lib/market/types'

const BASE = 'https://data-api.ecb.europa.eu/service/data'
export const EA_10Y_URL = `${BASE}/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y?format=jsondata&lastNObservations=30`
export const ES_10Y_URL = `${BASE}/IRS/M.ES.L.L40.CI.0000.EUR.N.Z?format=jsondata&lastNObservations=2`

/** Una variación «en un mes» compara con un dato de hace al menos estos días. */
const MONTH_DAYS = 28

export const ecbBondYields: Source = async (ctx) => {
  const results = await Promise.allSettled([
    (async (): Promise<MarketIndicator> => {
      const points = parseEcbSeries(await fetchJSON<EcbSdmxJson>(ctx, EA_10Y_URL))
      const last = points[points.length - 1]
      if (!last) throw new Error('bono eurozona: sin observaciones')
      const base = baseFor(points, MONTH_DAYS)
      return {
        key: 'ea-10y',
        label: 'Bono a 10 años de la eurozona (AAA)',
        group: 'bond',
        value: round(last.value, 2),
        unit: '%',
        asOf: last.date,
        changePct: base ? round(last.value - base.value, 2) : null,
        ...(base ? { changeDays: daysBetween(base.date, last.date) } : {}),
        source: 'BCE',
      }
    })(),
    (async (): Promise<MarketIndicator> => {
      const points = parseEcbSeries(await fetchJSON<EcbSdmxJson>(ctx, ES_10Y_URL))
      const last = points[points.length - 1]
      const prev = points[points.length - 2]
      if (!last) throw new Error('bono España: sin observaciones')
      return {
        key: 'es-10y',
        label: 'Bono a 10 años de España (media mensual)',
        group: 'bond',
        value: round(last.value, 2),
        unit: '%',
        asOf: last.date,
        changePct: prev ? round(last.value - prev.value, 2) : null,
        ...(prev ? { changeDays: daysBetween(prev.date, last.date) } : {}),
        source: 'BCE',
      }
    })(),
  ])
  const indicators = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (indicators.length === 0) throw new Error('ninguna serie de bonos disponible')
  return { source: source('BCE · Data Portal (bonos a 10 años)', EA_10Y_URL, 'official', ctx.now), indicators, headlines: [] }
}
