/**
 * Frescura por indicador y protección de la síntesis IA (sin red).
 *
 * La frescura responde a «¿este dato sigue siendo lo bastante reciente para
 * interpretarlo hoy?», no a la edad de la investigación. La síntesis solo
 * recibe como situación actual los indicadores frescos.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { businessDaysBetween, INDICATOR_FRESHNESS, indicatorFreshness, isInterpretable, partitionByFreshness } from '../../../lib/market/freshness'
import { parseIndicator, parseMarketResearch } from '../../../lib/market/validate'
import type { MarketIndicator } from '../../../lib/market/types'
import { compactMaterial, MARKET_SYSTEM_PROMPT } from '../material'
import { collectSources, type CollectedMaterial } from '../sources/index'
import type { Source } from '../sources/shared'
import { research } from '../../../lib/market/__tests__/fixtures'

const NOW = new Date('2026-10-05T07:30:00Z') // lunes

const ind = (over: Partial<MarketIndicator> & Pick<MarketIndicator, 'key'>): MarketIndicator => ({
  label: over.key,
  group: 'inflation',
  value: 1,
  unit: '%',
  asOf: '2026-09',
  changePct: null,
  source: 'X',
  ...over,
})

const IPC_SEP = ind({ key: 'ine-ipc', label: 'IPC España (interanual)', value: 4.9, asOf: '2026-09', changePct: 0.6, source: 'INE', status: 'advance' })
const IPC_DEC_2025 = ind({ key: 'ine-ipc', label: 'IPC España (interanual)', value: 2.9, asOf: '2025-12', changePct: -0.1, source: 'INE' })
const HICP_SEP = ind({ key: 'ea-hicp', label: 'Inflación eurozona (HICP interanual)', value: 3.8, asOf: '2026-09', changePct: 0.6, source: 'Eurostat', status: 'estimated' })
const HICP_DEC_2025 = ind({ key: 'ea-hicp', label: 'Inflación eurozona (HICP interanual)', value: 2.0, asOf: '2025-12', changePct: -0.1, source: 'Eurostat' })

describe('frescura por indicador · reglas', () => {
  it('1. inflación de septiembre de 2026 → fresh el 5-10-2026; deja de serlo 45 días tras fin de mes', () => {
    assert.equal(indicatorFreshness(IPC_SEP, NOW), 'fresh')
    assert.equal(indicatorFreshness(IPC_SEP, new Date('2026-11-14T23:00:00Z')), 'fresh')
    assert.equal(indicatorFreshness(IPC_SEP, new Date('2026-11-15T00:00:00Z')), 'stale')
    assert.equal(INDICATOR_FRESHNESS.monthlyGraceDays, 45)
  })

  it('2. inflación de diciembre de 2025 → stale en octubre de 2026', () => {
    assert.equal(indicatorFreshness(IPC_DEC_2025, NOW), 'stale')
    assert.equal(indicatorFreshness(HICP_DEC_2025, NOW), 'stale')
  })

  it('3. sin fecha o valor suficientes → unknown (nunca se inventa frescura)', () => {
    for (const asOf of ['', 'sept. 2026', '2026', '2026-13', '2026-02-30', '2026-9', '05/10/2026']) {
      assert.equal(indicatorFreshness(ind({ key: 'x', asOf }), NOW), 'unknown', asOf)
    }
    assert.equal(indicatorFreshness(ind({ key: 'ine-ipc', value: null }), NOW), 'unknown')
  })

  it('tipos diarios de mercado: hasta 5 días laborables', () => {
    const euribor = (asOf: string) => ind({ key: 'euribor-12m', group: 'rate', asOf })
    assert.equal(indicatorFreshness(euribor('2026-10-02'), NOW), 'fresh', 'viernes → lunes: 1 laborable')
    assert.equal(indicatorFreshness(euribor('2026-09-28'), NOW), 'fresh', '5 laborables')
    assert.equal(indicatorFreshness(euribor('2026-09-25'), NOW), 'stale', '6 laborables')
    assert.equal(businessDaysBetween(Date.UTC(2026, 9, 2), Date.UTC(2026, 9, 5)), 1)
    assert.equal(indicatorFreshness(ind({ key: 'ibex', group: 'index', unit: 'pts', asOf: '2026-09-10' }), NOW), 'stale')
  })

  it('tipos oficiales: vigentes durante días aunque no cambien; una entrada en vigor futura es vigente', () => {
    const dfr = (asOf: string) => ind({ key: 'ecb-dfr', group: 'rate', asOf })
    assert.equal(indicatorFreshness(dfr('2026-09-16'), NOW), 'fresh', '19 días: sigue siendo el tipo vigente')
    assert.equal(indicatorFreshness(dfr('2026-10-20'), NOW), 'fresh', 'anunciado, en vigor más adelante')
    assert.equal(indicatorFreshness(dfr('2026-06-17'), NOW), 'stale', 'más de 60 días sin confirmar')
    assert.equal(indicatorFreshness(ind({ key: 'fed-funds', group: 'rate', asOf: '2026-09' }), NOW), 'fresh', 'FEDFUNDS mensual')
  })

  it('7. advance / estimated no implica stale', () => {
    assert.equal(indicatorFreshness(IPC_SEP, NOW), 'fresh')
    assert.equal(indicatorFreshness(HICP_SEP, NOW), 'fresh')
    assert.equal(indicatorFreshness({ ...IPC_DEC_2025, status: 'advance' } as MarketIndicator, NOW), 'stale', 'ni lo contrario')
  })

  it('isInterpretable y partitionByFreshness no borran nada', () => {
    const all = [IPC_SEP, HICP_DEC_2025, ind({ key: 'x', asOf: '?' })]
    const { current, notCurrent } = partitionByFreshness(all, NOW)
    assert.deepEqual(current.map((i) => i.key), ['ine-ipc'])
    assert.deepEqual(notCurrent.map((i) => [i.key, i.freshness]), [['ea-hicp', 'stale'], ['x', 'unknown']])
    assert.equal(current.length + notCurrent.length, all.length)
    assert.equal(isInterpretable(IPC_SEP, NOW), true)
    assert.equal(isInterpretable(HICP_DEC_2025, NOW), false)
  })
})

describe('frescura por indicador · compatibilidad', () => {
  it('8. indicadores sin los metadatos nuevos se validan y se clasifican igual', () => {
    const old = { key: 'ine-ipc', label: 'IPC España', group: 'inflation', value: 2.1, unit: '%', asOf: '2026-08', changePct: null, source: 'INE' }
    const parsed = parseIndicator(old)
    assert.deepEqual(parsed, old, 'sin status, fetchedAt ni publishedAt inventados')
    assert.equal(indicatorFreshness(parsed, NOW), 'fresh')
    assert.doesNotThrow(() => parseMarketResearch(research()), 'una investigación con el formato anterior sigue siendo válida')
  })

  it('fetchedAt y publishedAt se conservan si existen y se rechazan si no son fechas', () => {
    const base = { key: 'ea-hicp', label: 'HICP', group: 'inflation', value: 3.8, unit: '%', asOf: '2026-09', changePct: 0.6, source: 'Eurostat' }
    const p = parseIndicator({ ...base, fetchedAt: '2026-10-05T07:30:00.000Z', publishedAt: '2026-10-02T09:00:00.000Z' })
    assert.deepEqual([p.fetchedAt, p.publishedAt], ['2026-10-05T07:30:00.000Z', '2026-10-02T09:00:00.000Z'])
    assert.throws(() => parseIndicator({ ...base, fetchedAt: 'ayer' }), /fetchedAt/)
  })

  it('collectSources sella fetchedAt con la hora de recopilación sin pisar uno existente', async () => {
    const src: Source = async () => ({
      source: { name: 's', url: 'https://example.org', retrievedAt: NOW.toISOString(), type: 'official' },
      indicators: [IPC_SEP, { ...HICP_SEP, fetchedAt: '2026-10-04T00:00:00.000Z' }],
      headlines: [],
    })
    const m = await collectSources([{ name: 's', run: src }], { now: NOW, env: {}, timeoutMs: 100 })
    assert.deepEqual(m.indicators.map((i) => i.fetchedAt), [NOW.toISOString(), '2026-10-04T00:00:00.000Z'])
  })
})

describe('síntesis IA · solo datos frescos como situación actual', () => {
  const material = (indicators: MarketIndicator[]): CollectedMaterial => ({
    retrievedAt: NOW.toISOString(),
    indicators,
    headlines: [],
    sources: [],
    failed: [],
    skipped: [],
  })
  const compact = (indicators: MarketIndicator[]) => compactMaterial(material(indicators), { maxChars: 20_000, coversFrom: '2026-09-28', coversTo: '2026-10-05' })
  const section = (text: string, title: string) => {
    const start = text.indexOf(title)
    if (start < 0) return ''
    const rest = text.slice(start + title.length)
    const end = rest.search(/\n\n/)
    return end < 0 ? rest : rest.slice(0, end)
  }

  it('4. un indicador stale no entra como contexto actual: ni valor ni variación', () => {
    const text = compact([IPC_DEC_2025])
    assert.match(section(text, 'INDICADORES VIGENTES'), /\(ninguno\)/)
    assert.match(section(text, 'INDICADORES NO INTERPRETABLES'), /IPC España \(interanual\): último dato de 2025-12, antiguo \[INE\]/)
    assert.doesNotMatch(text, /2,9|2\.9|-0\.1/, 'ni el valor ni la variación del dato antiguo llegan al modelo')
  })

  it('5. un indicador fresh sí entra, con valor, variación, fecha y estado', () => {
    const text = compact([IPC_SEP])
    assert.match(section(text, 'INDICADORES VIGENTES'), /IPC España \(interanual\): 4\.9 % \(\+0\.6 % vs\. anterior\), dato de 2026-09 \(avance, provisional\) \[INE\]/)
    assert.doesNotMatch(text, /NO INTERPRETABLES/)
  })

  it('6. mezcla fresh + stale + unknown: solo los frescos se pueden interpretar como situación actual', () => {
    const text = compact([IPC_SEP, HICP_DEC_2025, ind({ key: 'raro', label: 'Indicador raro', value: 7, asOf: 'n/d' })])
    const current = section(text, 'INDICADORES VIGENTES')
    const old = section(text, 'INDICADORES NO INTERPRETABLES')
    assert.match(current, /IPC España/)
    assert.doesNotMatch(current, /Inflación eurozona|Indicador raro/)
    assert.match(old, /Inflación eurozona \(HICP interanual\): último dato de 2025-12, antiguo/)
    assert.match(old, /Indicador raro: sin fecha fiable/)
    assert.doesNotMatch(old, /\d+(\.\d+)? %/, 'los no interpretables van sin cifras')
  })

  it('la frescura se juzga a la fecha de la recopilación, no a la de hoy', () => {
    const text = compactMaterial({ ...material([IPC_SEP]), retrievedAt: '2027-03-01T00:00:00.000Z' }, { maxChars: 20_000, coversFrom: '2027-02-22', coversTo: '2027-03-01' })
    assert.match(section(text, 'INDICADORES NO INTERPRETABLES'), /IPC España/)
  })

  it('el prompt prohíbe tendencias de datos antiguos, rellenar huecos e inventar evolución', () => {
    assert.match(MARKET_SYSTEM_PROMPT, /Solo los «INDICADORES VIGENTES» describen la situación actual/)
    assert.match(MARKET_SYSTEM_PROMPT, /no afirmes su nivel actual ni su tendencia/)
    assert.match(MARKET_SYSTEM_PROMPT, /No rellenes fechas, valores ni periodos que falten/)
    assert.match(MARKET_SYSTEM_PROMPT, /no inventes la evolución entre observaciones/)
    assert.match(MARKET_SYSTEM_PROMPT, /Distingue el dato observado/)
  })
})
