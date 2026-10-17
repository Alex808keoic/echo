/**
 * «Cómo podría evolucionar tu dinero»: escenarios ILUSTRATIVOS por tipo de
 * producto de la guía, para hacerse una idea, nunca una previsión.
 *
 * Modelo: crecimiento lognormal con una rentabilidad anual esperada (`mu`) y
 * una volatilidad anual (`sigma`), ambas nominales, antes de comisiones,
 * impuestos e inflación. Los tres escenarios son los percentiles 10, 50 y 90
 * del valor final: «si va mal» = 1 de cada 10 veces sale peor; «si va bien» =
 * 1 de cada 10 veces sale mejor. Con más años, el abanico en euros se abre,
 * pero la rentabilidad media por año se estrecha.
 *
 * Los supuestos son órdenes de magnitud generales (largo plazo histórico y
 * tipos de interés de 2026), fijos en este archivo: no salen del mercado ni de
 * ningún modelo de IA, solo se ven en la pantalla de la guía y nunca llegan al
 * chat ni al modelo. `badYearPct` es una caída de un año muy malo, del orden
 * de las ocurridas en el pasado (las caídas reales son más bruscas de lo que
 * dice una distribución normal, por eso va aparte).
 */

export interface GrowthAssumption {
  kind: 'growth'
  /** Rentabilidad anual esperada, en % (nominal). */
  mu: number
  /** Volatilidad anual, en %. 0 = interés fijo. */
  sigma: number
  /** Caída de un año muy malo, en % positivo (0 si no puede bajar). */
  badYearPct: number
}

export interface NoProjection {
  kind: 'none'
  /** Por qué no tiene sentido aproximarlo. */
  reason: string
  /** Caída de un año muy malo, si se conoce un orden de magnitud. */
  badYearPct?: number
}

export type ScenarioAssumption = GrowthAssumption | NoProjection

const g = (mu: number, sigma: number, badYearPct: number): GrowthAssumption => ({ kind: 'growth', mu, sigma, badYearPct })

export const SCENARIO_ASSUMPTIONS: Readonly<Record<string, ScenarioAssumption>> = {
  'cuenta-deposito': g(2, 0, 0),
  letras: g(2.2, 0.3, 0),
  'fondo-monetario': g(2.1, 0.5, 1),
  'bonos-estado': g(3, 5, 15),
  'bonos-empresa': g(3.8, 7, 15),
  'fondo-renta-fija': g(3, 5, 15),
  'fondo-indexado': g(7, 16, 35),
  'fondo-activo': g(5.5, 17, 40),
  'fondo-mixto': g(4.5, 9, 15),
  etf: g(7, 16, 35),
  'etf-region': g(7, 19, 40),
  'etf-sector': g(7, 25, 50),
  'etf-bonos': g(3, 5, 15),
  'etf-apalancado': { kind: 'none', reason: 'Se recalcula cada día: a varios años su resultado no sigue al índice y puede perderlo casi todo aunque el índice suba.', badYearPct: 80 },
  acciones: g(7, 28, 50),
  'acciones-dividendo': g(6, 22, 40),
  'acciones-crecimiento': g(8, 40, 70),
  'acciones-pequenas': g(7, 45, 80),
  oro: g(4, 16, 30),
  plata: g(3, 28, 50),
  energia: g(2, 35, 60),
  'metales-industriales': g(3, 25, 50),
  agricolas: g(1, 22, 40),
  socimi: g(6, 25, 45),
  'fondo-inmobiliario': g(6, 20, 40),
  'crowdfunding-inmobiliario': { kind: 'none', reason: 'Cada proyecto es distinto: o devuelve lo acordado, se retrasa o se pierde. No hay un patrón razonable que aproximar.' },
  cripto: { kind: 'none', reason: 'No hay una base razonable para aproximarlo: su precio no depende de beneficios ni de intereses y ha pasado de subidas enormes a caídas enormes.', badYearPct: 75 },
  'cripto-otras': { kind: 'none', reason: 'La mayoría acaba valiendo casi cero y unas pocas se disparan: cualquier cifra sería inventada.', badYearPct: 95 },
  stablecoins: { kind: 'none', reason: 'No está pensada para crecer: intenta valer siempre lo mismo que un dólar o un euro.' },
}

export const SCENARIO_NOTICE =
  'Es una aproximación con supuestos generales, no una previsión: el resultado real puede ser mejor o peor que cualquiera de estos. No incluye comisiones, impuestos ni inflación. Que algo haya ido bien en el pasado no asegura nada.'

/** Cantidades y plazos que se pueden elegir en la pantalla. */
export const SCENARIO_AMOUNTS_CENTS = [10_000, 100_000, 1_000_000] as const
export const SCENARIO_YEARS = [1, 5, 10, 20] as const

export interface ScenarioResult {
  years: number
  /** Valor final en céntimos (enteros) en cada escenario. */
  badCents: number
  midCents: number
  goodCents: number
}

/** z del percentil 90 de una normal estándar. */
const Z90 = 1.2816

function valueAt(amountCents: number, a: GrowthAssumption, years: number, z: number): number {
  const mu = Math.log(1 + a.mu / 100)
  const s = a.sigma / 100
  // Mediana: crece a la rentabilidad compuesta `mu`; los extremos se abren con sigma·√años.
  return Math.round(amountCents * Math.exp(mu * years + z * s * Math.sqrt(years)))
}

export function projectScenario(amountCents: number, a: GrowthAssumption, years: number): ScenarioResult {
  return { years, badCents: valueAt(amountCents, a, years, -Z90), midCents: valueAt(amountCents, a, years, 0), goodCents: valueAt(amountCents, a, years, Z90) }
}

/** Serie mes a mes (0…years·12) de cada escenario, para la gráfica y para leerla al tocar. */
export function scenarioSeries(amountCents: number, a: GrowthAssumption, years: number): ScenarioResult[] {
  return Array.from({ length: years * 12 + 1 }, (_, m) => projectScenario(amountCents, a, m / 12))
}

/** «Hoy», «5 meses», «2 años», «1 año y 3 meses». */
export function monthsLabel(months: number): string {
  if (months === 0) return 'Hoy'
  const y = Math.floor(months / 12)
  const m = months % 12
  const years = y === 1 ? '1 año' : `${y} años`
  const rest = m === 1 ? '1 mes' : `${m} meses`
  if (y === 0) return rest
  return m === 0 ? years : `${years} y ${rest}`
}

/** Plazo por defecto según el tipo: corto para lo seguro, largo para la renta variable. */
export function defaultYears(a: ScenarioAssumption): (typeof SCENARIO_YEARS)[number] {
  if (a.kind === 'none') return 1
  if (a.sigma <= 1) return 1
  if (a.sigma <= 10) return 5
  return 10
}
