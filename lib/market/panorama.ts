/**
 * «Cómo van las inversiones»: un vistazo a cada familia de la Guía (ahorro
 * seguro, renta fija, fondos, ETF, acciones, materias primas, inmobiliario y
 * criptomonedas) con los indicadores de la investigación de mercado. Puro y
 * determinista: no llama a ninguna IA.
 *
 * - Solo cuentan los indicadores vigentes (`indicatorFreshness`); sin ninguno,
 *   la familia dice que no hay datos recientes, nunca un nivel antiguo.
 * - Describe lo que ya ha pasado (variación en un mes, o en un año para la
 *   vivienda), nunca lo que va a pasar ni qué comprar.
 * - Un movimiento es «fuerte» con los umbrales de `PANORAMA_THRESHOLDS`; la
 *   bolsa usa los mismos que `MARKET_MOVES` (la notificación de la bolsa).
 * - Fondos y ETF no son una clase de activo: van como lo que llevan dentro,
 *   así que se describen con la bolsa y los bonos.
 */
import { INVESTMENT_GROUPS, type InvestmentGroupId } from '../axis/guide/products'
import { indicatorFreshness } from './freshness'
import { MARKET_MOVES } from './moves'
import type { AssetClassNote, MarketIndicator } from './types'

export type GroupTrend = 'strong-rise' | 'strong-drop' | 'rise' | 'drop' | 'calm' | 'no-data' | 'depends'

export const GROUP_TREND_LABEL: Record<GroupTrend, string> = {
  'strong-rise': 'Sube con fuerza',
  'strong-drop': 'Cae con fuerza',
  rise: 'Sube',
  drop: 'Baja',
  calm: 'Tranquilo',
  'no-data': 'Sin datos recientes',
  depends: 'Depende',
}

export interface GroupFigure {
  label: string
  /** Valor ya formateado: «18.913 pts», «3,38 %», «71.808 €». */
  value: string
  /** Variación formateada con su plazo: «+3,2 % en un mes», o `null`. */
  change: string | null
  asOf: string
  source: string
}

export interface GroupPanorama {
  id: InvestmentGroupId
  name: string
  trend: GroupTrend
  /** Una o dos frases con lo que ha pasado. */
  headline: string
  figures: GroupFigure[]
  /** Nota de la investigación de la semana para esta familia, si dice algo. */
  note: string | null
}

export const PANORAMA_THRESHOLDS = Object.freeze({
  /** Una variación «en un mes» compara datos separados entre estos días. */
  MIN_DAYS: 20,
  MAX_DAYS: 50,
  /** Bolsa (%, en un mes): fuerte con los umbrales de la notificación; se mueve desde ±4 %. */
  EQUITY_MOVE_PCT: 4,
  /** Bonos (puntos de rentabilidad a 10 años, en un mes). */
  BOND_STRONG_PP: 0.5,
  BOND_MOVE_PP: 0.2,
  /** Materias primas (%, en un mes). */
  COMMODITY_STRONG_PCT: 10,
  COMMODITY_MOVE_PCT: 5,
  /** Criptomonedas (%, en un mes). */
  CRYPTO_STRONG_PCT: 25,
  CRYPTO_MOVE_PCT: 10,
  /** Vivienda (variación interanual, %). */
  HOUSING_STRONG_RISE: 10,
  HOUSING_RISE: 4,
  HOUSING_DROP: -1,
  HOUSING_STRONG_DROP: -5,
})

/** Claves de la investigación (`AssetClassNote.key`) cuya nota se enseña en cada familia. */
const NOTE_KEYS: Partial<Record<InvestmentGroupId, string[]>> = {
  ahorro: ['cash'],
  'renta-fija': ['bonds-gov', 'bonds-corp'],
  acciones: ['equity-global', 'equity-europe', 'equity-us'],
  materias: ['gold'],
  inmobiliario: ['real-estate'],
  cripto: ['crypto'],
}

const T = PANORAMA_THRESHOLDS

const num = (n: number, decimals: number) => n.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
/** Hasta `decimals` decimales, sin ceros de sobra: 0,6 · 0,25 · 3. */
const short = (n: number, decimals: number) => n.toLocaleString('es-ES', { maximumFractionDigits: decimals })
const signed = (n: number, decimals: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${short(Math.abs(n), decimals)}`
const abs = (n: number, decimals: number) => short(Math.abs(n), decimals)

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** «2026-09-16» → «16 de septiembre». */
const dayText = (d: string) => {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(d)
  return m ? `${Number(m[2])} de ${MONTHS[Number(m[1]) - 1]}` : d
}

function fmtValue(i: MarketIndicator): string {
  const v = i.value as number
  switch (i.unit) {
    case '%':
      return `${short(v, 2)} %`
    case 'pts':
      return `${num(v, 0)} pts`
    case 'EUR':
      return `${num(v, 0)} €`
    case 'USD':
      return `${num(v, v >= 1000 ? 0 : 2)} $`
  }
}

/** Plazo de una variación en palabras. */
function span(i: MarketIndicator): string {
  if (i.group === 'housing') return 'frente al trimestre anterior'
  const d = i.changeDays
  if (!d) return 'frente al dato anterior'
  return d >= T.MIN_DAYS && d <= T.MAX_DAYS ? 'en un mes' : `en ${d} días`
}

function fmtChange(i: MarketIndicator): string | null {
  if (i.changePct === null) return null
  return i.unit === '%' ? `${signed(i.changePct, 2)} puntos ${span(i)}` : `${signed(i.changePct, 1)} % ${span(i)}`
}

function figure(i: MarketIndicator): GroupFigure {
  return { label: i.label, value: fmtValue(i), change: fmtChange(i), asOf: i.asOf, source: i.source }
}

/** Variación en un mes (entre 20 y 50 días), o `null` si el dato no la tiene con ese plazo. */
function monthly(i: MarketIndicator): number | null {
  if (i.changePct === null || !i.changeDays) return null
  return i.changeDays >= T.MIN_DAYS && i.changeDays <= T.MAX_DAYS ? i.changePct : null
}

function trendOf(pct: number, move: number, strongRise: number, strongDrop: number): GroupTrend {
  if (pct >= strongRise) return 'strong-rise'
  if (pct <= strongDrop) return 'strong-drop'
  if (pct >= move) return 'rise'
  if (pct <= -move) return 'drop'
  return 'calm'
}

/** El indicador con la mayor variación mensual (en valor absoluto). */
function biggest(list: MarketIndicator[]): { i: MarketIndicator; pct: number } | null {
  const withPct = list.flatMap((i) => {
    const pct = monthly(i)
    return pct === null ? [] : [{ i, pct }]
  })
  return withPct.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0] ?? null
}

const verb = (pct: number) => (pct >= 0 ? 'ha subido' : 'ha bajado')

type Built = Pick<GroupPanorama, 'trend' | 'headline' | 'figures'>

const NO_DATA: Built = { trend: 'no-data', headline: 'Esta semana su fuente no ha dado datos recientes; en cuanto los dé, aparecerán aquí.', figures: [] }

function savings(by: Map<string, MarketIndicator>): Built {
  const dfr = by.get('ecb-dfr')
  const ipc = by.get('ine-ipc')
  if (!dfr) return NO_DATA
  const rate = dfr.value as number
  const figures = [figure(dfr), ...(ipc ? [figure(ipc)] : [])]
  const changed = dfr.changePct ? ` Lo ${dfr.changePct > 0 ? 'subió' : 'bajó'} ${abs(dfr.changePct, 2)} puntos en su última decisión (${dayText(dfr.asOf)}).` : ''
  const base = `El BCE paga un ${short(rate, 2)} % a los bancos; las cuentas y depósitos suelen pagar algo menos.${changed}`
  const trend: GroupTrend = dfr.changePct ? (dfr.changePct > 0 ? 'rise' : 'drop') : 'calm'
  if (!ipc) return { trend, headline: base, figures }
  const real = rate - (ipc.value as number)
  const vsInflation =
    real >= 0
      ? ` Con la inflación al ${short(ipc.value as number, 1)} %, el ahorro seguro mantiene su poder de compra.`
      : ` Con la inflación al ${short(ipc.value as number, 1)} %, el ahorro seguro pierde poder de compra (unos ${abs(real, 1)} puntos al año).`
  return { trend, headline: base + vsInflation, figures }
}

function bonds(by: Map<string, MarketIndicator>): Built {
  const list = ['ea-10y', 'es-10y'].flatMap((k) => (by.has(k) ? [by.get(k) as MarketIndicator] : []))
  if (list.length === 0) return NO_DATA
  const figures = list.map(figure)
  // Uno solo para no mezclar señales: el diario de la eurozona antes que la media mensual de España.
  const lead = list.find((i) => monthly(i) !== null) ?? list[0]
  const where = lead.key === 'es-10y' ? 'de España' : 'de la eurozona'
  const paying = `Un bono a 10 años ${where} paga hoy un ${short(lead.value as number, 2)} % al año.`
  const pp = monthly(lead)
  if (pp === null) return { trend: 'calm', headline: paying, figures }
  // Si la rentabilidad sube, los bonos que ya existían valen menos: la tendencia es la del precio.
  const trend = trendOf(-pp, T.BOND_MOVE_PP, T.BOND_STRONG_PP, -T.BOND_STRONG_PP)
  const moved =
    trend === 'calm'
      ? ` Su rentabilidad apenas se ha movido en el último mes (${signed(pp, 2)} puntos), así que el precio de los bonos tampoco.`
      : ` Su rentabilidad ${verb(pp)} ${abs(pp, 2)} puntos en un mes: los bonos que ya existían ${pp > 0 ? 'valen algo menos' : 'valen algo más'}.`
  return { trend, headline: paying + moved, figures }
}

const EQUITY_NAMES: Record<string, string> = { ibex: 'IBEX 35', stoxx50: 'EURO STOXX 50', spx: 'S&P 500', ndq: 'Nasdaq 100' }

function stocks(by: Map<string, MarketIndicator>): Built {
  const list = MARKET_MOVES.EQUITY_KEYS.flatMap((k) => (by.has(k) ? [by.get(k) as MarketIndicator] : []))
  if (list.length === 0) return NO_DATA
  const figures = list.map(figure)
  const top = biggest(list)
  if (!top) return { trend: 'calm', headline: 'Hay datos recientes de la bolsa, pero sin una variación a un mes con la que comparar.', figures }
  const trend = trendOf(top.pct, T.EQUITY_MOVE_PCT, MARKET_MOVES.RISE_PCT, MARKET_MOVES.DROP_PCT)
  const name = EQUITY_NAMES[top.i.key] ?? top.i.label
  const headline =
    trend === 'calm'
      ? `La bolsa está tranquila: el mayor movimiento del último mes es el del ${name}, ${signed(top.pct, 1)} %.`
      : `El ${name} ${verb(top.pct)} un ${abs(top.pct, 1)} % en el último mes${trend === 'strong-drop' ? '. Las caídas así son normales en bolsa y suelen recuperarse con tiempo, no en semanas' : ''}.`
  return { trend, headline, figures }
}

function commodities(by: Map<string, MarketIndicator>): Built {
  const list = ['gold', 'brent'].flatMap((k) => (by.has(k) ? [by.get(k) as MarketIndicator] : []))
  if (list.length === 0) return NO_DATA
  const figures = list.map(figure)
  const top = biggest(list)
  if (!top) return { trend: 'calm', headline: 'Hay precios recientes, pero sin una variación a un mes con la que comparar.', figures }
  const trend = trendOf(top.pct, T.COMMODITY_MOVE_PCT, T.COMMODITY_STRONG_PCT, -T.COMMODITY_STRONG_PCT)
  const name = top.i.key === 'gold' ? 'El oro' : 'El petróleo Brent'
  const monthly = top.i.asOf.length === 7 ? ' (media mensual)' : ''
  return { trend, headline: `${name} ${verb(top.pct)} un ${abs(top.pct, 1)} % en el último mes${monthly}.`, figures }
}

function housing(by: Map<string, MarketIndicator>): Built {
  const ipv = by.get('ine-ipv')
  if (!ipv) return NO_DATA
  const yoy = ipv.value as number
  const trend: GroupTrend =
    yoy >= T.HOUSING_STRONG_RISE ? 'strong-rise' : yoy >= T.HOUSING_RISE ? 'rise' : yoy <= T.HOUSING_STRONG_DROP ? 'strong-drop' : yoy <= T.HOUSING_DROP ? 'drop' : 'calm'
  const q = /^(\d{4})-Q([1-4])$/.exec(ipv.asOf)
  const when = q ? ` (${q[2]}.º trimestre de ${q[1]})` : ''
  const headline =
    yoy >= 0
      ? `La vivienda en España cuesta un ${num(yoy, 1)} % más que hace un año${when}.`
      : `La vivienda en España cuesta un ${abs(yoy, 1)} % menos que hace un año${when}.`
  return { trend, headline, figures: [figure(ipv)] }
}

function crypto(by: Map<string, MarketIndicator>): Built {
  const list = ['btc', 'eth'].flatMap((k) => (by.has(k) ? [by.get(k) as MarketIndicator] : []))
  if (list.length === 0) return NO_DATA
  const figures = list.map(figure)
  const top = biggest(list)
  if (!top) return { trend: 'calm', headline: 'Hay precios recientes, pero sin una variación a un mes con la que comparar.', figures }
  const trend = trendOf(top.pct, T.CRYPTO_MOVE_PCT, T.CRYPTO_STRONG_PCT, -T.CRYPTO_STRONG_PCT)
  const name = top.i.key === 'btc' ? 'El bitcoin' : 'El ether'
  const swing = trend === 'strong-rise' || trend === 'strong-drop' ? ' En criptomonedas, movimientos así pueden darse la vuelta igual de rápido.' : ''
  return { trend, headline: `${name} ${verb(top.pct)} un ${abs(top.pct, 1)} % en el último mes.${swing}`, figures }
}

const lower = (t: GroupTrend) => GROUP_TREND_LABEL[t].toLowerCase()

/** Fondos y ETF van como lo que llevan: se describen con la bolsa y los bonos. */
function vehicle(kind: 'fondos' | 'etf', equity: Built, bond: Built): Built {
  const what =
    kind === 'fondos'
      ? 'Un fondo va como lo que lleva dentro: uno de bolsa, como las acciones; uno de renta fija, como los bonos; uno mixto, a medio camino.'
      : 'Un ETF copia un índice y va como él: uno de bolsa mundial, como las acciones; uno de bonos, como la renta fija; uno de oro, como el oro.'
  const parts = [
    equity.trend !== 'no-data' ? `la bolsa ${equity.trend === 'calm' ? 'está tranquila' : lower(equity.trend)}` : null,
    bond.trend !== 'no-data' ? `los bonos ${bond.trend === 'calm' ? 'están tranquilos' : lower(bond.trend).replace(/^sube/, 'suben').replace(/^cae/, 'caen').replace(/^baja/, 'bajan')}` : null,
  ].filter(Boolean)
  const now = parts.length > 0 ? ` Ahora mismo ${parts.join(' y ')}.` : ''
  return { trend: 'depends', headline: what + now, figures: [] }
}

const NO_NEWS = /sin (noticias|novedades|datos|informaci[oó]n)/i

function noteFor(id: InvestmentGroupId, notes: readonly AssetClassNote[]): string | null {
  const keys = NOTE_KEYS[id] ?? []
  const texts = keys.flatMap((k) => notes.filter((n) => n.key === k && n.note && !NO_NEWS.test(n.note)).map((n) => n.note))
  return texts.length > 0 ? texts.join(' ') : null
}

/**
 * Las 8 familias de la Guía, en su orden, con lo que ha pasado en cada una.
 * `notes` son las notas por clase de la investigación; pásalas solo si la
 * investigación es reciente (si no, `[]`).
 */
export function marketPanorama(indicators: readonly MarketIndicator[], notes: readonly AssetClassNote[] = [], now: Date = new Date()): GroupPanorama[] {
  const by = new Map(
    indicators.filter((i) => typeof i.value === 'number' && Number.isFinite(i.value) && indicatorFreshness(i, now) === 'fresh').map((i) => [i.key, i]),
  )
  const equity = stocks(by)
  const bond = bonds(by)
  const built: Record<InvestmentGroupId, Built> = {
    ahorro: savings(by),
    'renta-fija': bond,
    fondos: vehicle('fondos', equity, bond),
    etf: vehicle('etf', equity, bond),
    acciones: equity,
    materias: commodities(by),
    inmobiliario: housing(by),
    cripto: crypto(by),
  }
  return INVESTMENT_GROUPS.map((g) => ({ id: g.id, name: g.name, ...built[g.id], note: noteFor(g.id, notes) }))
}

/** Las familias con un movimiento fuerte: lo que «ha explotado» o se ha hundido. */
export function panoramaHighlights(groups: readonly GroupPanorama[]): GroupPanorama[] {
  return groups.filter((g) => g.trend === 'strong-rise' || g.trend === 'strong-drop')
}
