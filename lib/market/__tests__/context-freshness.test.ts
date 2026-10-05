/**
 * Frescura por indicador en el contexto de AXIS (sin red).
 *
 * `buildMarketContext` marca cada indicador con `indicatorFreshness` (las
 * mismas reglas de la síntesis). AXIS solo describe como situación actual
 * los `fresh`; los `stale`/`unknown` se conservan, sin valor en sus textos.
 * Nada de esto cambia cifras financieras, objetivos ni decisiones.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildMarketContext } from '../relevance'
import { history, NOW, research } from './fixtures'
import type { MarketContext, MarketIndicator } from '../types'
import { decide } from '../../axis/core/decision'
import { buildFinancialContext } from '../../axis/context'
import { config, healthyMovements, position, snapshot, TODAY } from '../../axis/__tests__/fixtures'

const IPC_DEC_2025: MarketIndicator = { key: 'ine-ipc', label: 'IPC España', group: 'inflation', value: 2.9, unit: '%', asOf: '2025-12', changePct: -0.1, source: 'INE' }
const HICP_SEP_2026: MarketIndicator = { key: 'ea-hicp', label: 'HICP eurozona', group: 'inflation', value: 3.8, unit: '%', asOf: '2026-09', changePct: 0.6, source: 'Eurostat', status: 'estimated' }
const ODD: MarketIndicator = { key: 'ibex', label: 'IBEX 35', group: 'index', value: 19000, unit: 'pts', asOf: 'n/d', changePct: null, source: 'Banco de España' }
const DFR: MarketIndicator = { key: 'ecb-dfr', label: 'BCE · facilidad de depósito', group: 'rate', value: 2.5, unit: '%', asOf: '2026-09-16', changePct: 0.25, source: 'BCE' }

const AT = new Date('2026-10-05T07:30:00Z')
const ctxFrom = (indicators: MarketIndicator[], now = AT): MarketContext =>
  buildMarketContext(research({ generatedAt: '2026-10-03T11:00:00.000Z', indicators }), history, ['Fondo Indexado Global'], now)
const freshnessByKey = (m: MarketContext) => Object.fromEntries(m.keyIndicators.map((i) => [i.key, i.freshness]))

const financial = () => buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements(), positions: [position({ name: 'Fondo Indexado Global', valueCents: 50_000, investedCents: 40_000 })] }), TODAY)
const snapshotFact = (m: MarketContext) => decide({ context: financial(), market: m }).signals.find((s) => s.id === 'market.snapshot')?.fact ?? ''

describe('AXIS · frescura de cada indicador de mercado', () => {
  it('1. indicador fresh → marcado fresh y descrito con su valor como situación actual', () => {
    const m = ctxFrom([HICP_SEP_2026])
    assert.deepEqual(freshnessByKey(m), { 'ea-hicp': 'fresh' })
    assert.match(snapshotFact(m), /HICP eurozona: 3,8 % \(2026-09, Eurostat\)/)
    assert.doesNotMatch(snapshotFact(m), /Sin dato actual/)
  })

  it('2. indicador stale → marcado stale; nunca su valor como situación actual', () => {
    const m = ctxFrom([IPC_DEC_2025])
    assert.deepEqual(freshnessByKey(m), { 'ine-ipc': 'stale' })
    const fact = snapshotFact(m)
    assert.match(fact, /sin indicadores\. Sin dato actual: IPC España \(último dato de 2025-12\)\./)
    assert.doesNotMatch(fact, /2,9|2\.9/)
  })

  it('3. indicador unknown → marcado unknown; no se interpreta', () => {
    const m = ctxFrom([ODD])
    assert.deepEqual(freshnessByKey(m), { ibex: 'unknown' })
    const fact = snapshotFact(m)
    assert.match(fact, /Sin dato actual: IBEX 35 \(sin fecha fiable\)/)
    assert.doesNotMatch(fact, /19\.000|19000/)
  })

  it('4. mezcla fresh + stale + unknown → solo los fresh sustentan la lectura actual', () => {
    const m = ctxFrom([DFR, IPC_DEC_2025, HICP_SEP_2026, ODD])
    assert.deepEqual(freshnessByKey(m), { 'ecb-dfr': 'fresh', 'ine-ipc': 'stale', 'ea-hicp': 'fresh', ibex: 'unknown' })
    const fact = snapshotFact(m)
    const [current, old] = fact.split('Sin dato actual:')
    assert.match(current, /BCE · facilidad de depósito: 2,5 %/)
    assert.match(current, /HICP eurozona: 3,8 %/)
    assert.doesNotMatch(current, /IPC España|IBEX/)
    assert.equal(old.trim(), 'IPC España (último dato de 2025-12), IBEX 35 (sin fecha fiable).')
  })

  it('5. los indicadores antiguos se conservan en el contexto (marcados), no desaparecen', () => {
    const m = ctxFrom([DFR, IPC_DEC_2025, ODD])
    assert.deepEqual(m.keyIndicators.map((i) => [i.key, i.value, i.asOf, i.freshness]), [
      ['ecb-dfr', 2.5, '2026-09-16', 'fresh'],
      ['ine-ipc', 2.9, '2025-12', 'stale'],
      ['ibex', 19000, 'n/d', 'unknown'],
    ])
  })

  it('un contexto de un cliente antiguo (sin `freshness`) no se da por actual', () => {
    const m = ctxFrom([HICP_SEP_2026])
    const legacy = { ...m, keyIndicators: m.keyIndicators.map(({ freshness: _f, ...rest }) => rest) } as unknown as MarketContext
    assert.match(snapshotFact(legacy), /sin indicadores\. Sin dato actual: HICP eurozona \(sin fecha fiable\)/)
  })

  it('6. los fixtures de los goldens son todos fresh a su fecha: la lectura de mercado no cambia', () => {
    const m = buildMarketContext(research(), history, ['Fondo Indexado Global'], NOW)
    assert.ok(m.keyIndicators.length > 0)
    assert.ok(m.keyIndicators.every((i) => i.freshness === 'fresh'))
    assert.doesNotMatch(snapshotFact(m), /Sin dato actual/)
  })

  it('7. la frescura no cambia cifras financieras, objetivos ni decisiones: solo el texto del hecho de mercado', () => {
    const context = financial() // una sola instantánea: los fixtures generan ids aleatorios
    const fresh = decide({ context, market: ctxFrom([DFR, HICP_SEP_2026]) })
    const stale = decide({ context, market: ctxFrom([DFR, { ...HICP_SEP_2026, asOf: '2025-12' }]) })
    assert.deepEqual(stale.context, fresh.context)
    const sansSnapshot = (d: typeof fresh) => d.signals.filter((s) => s.id !== 'market.snapshot')
    assert.deepEqual(sansSnapshot(stale), sansSnapshot(fresh))
    for (const k of ['recommendation', 'alternatives', 'confidence', 'nextStep', 'level'] as const) assert.deepEqual(stale[k], fresh[k], k)
    assert.deepEqual(stale.signals.map((s) => [s.id, s.priority]), fresh.signals.map((s) => [s.id, s.priority]))
  })
})
