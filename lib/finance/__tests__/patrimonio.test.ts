/**
 * Patrimonio: las inversiones pagadas con el líquido no se cuentan dos veces,
 * y la gráfica arranca en el saldo inicial y termina en el patrimonio actual.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildPatrimonioSeries, buildWealthSeries, computeLiquidCents, wealthBeforeMonth, wealthSources } from '../patrimonio'
import { lastValueDate, MAX_VALUE_HISTORY, revaluationDeltas, withValue } from '../position-values'
import type { Movement, MovementType, Position } from '../../types'

let seq = 0
const mov = (type: MovementType, amountCents: number, date: string): Movement => ({
  id: `m${++seq}`,
  type,
  amountCents,
  date,
  category: type === 'ingreso' ? 'Paga' : 'Supermercado',
  createdAt: 0,
  updatedAt: 0,
})
const pos = (investedCents: number, valueCents: number, date: string, fromLiquid?: boolean): Position => ({
  id: `p${++seq}`,
  name: 'Fondo',
  investedCents,
  valueCents,
  date,
  ...(fromLiquid === undefined ? {} : { fromLiquid }),
  createdAt: 0,
  updatedAt: 0,
})

const INITIAL = 100_000
const movements = [mov('ingreso', 50_000, '2026-09-01'), mov('gasto', 20_000, '2026-09-10')]

describe('computeLiquidCents', () => {
  it('sin posiciones: saldo inicial + movimientos', () => {
    assert.equal(computeLiquidCents(INITIAL, movements), 130_000)
  })

  it('descuenta solo lo invertido que salió del líquido', () => {
    const positions = [pos(30_000, 35_000, '2026-09-05', true), pos(10_000, 10_000, '2026-09-05', false), pos(5_000, 5_000, '2026-09-05')]
    assert.equal(computeLiquidCents(INITIAL, movements, positions), 100_000)
  })

  it('el patrimonio total no cambia al invertir desde el líquido', () => {
    const before = computeLiquidCents(INITIAL, movements)
    const p = pos(30_000, 30_000, '2026-09-12', true)
    assert.equal(computeLiquidCents(INITIAL, movements, [p]) + p.valueCents, before)
  })
})

describe('wealthBeforeMonth', () => {
  it('cierre del mes anterior; invertir desde el líquido no cuenta como variación', () => {
    const series = buildWealthSeries(INITIAL, movements, [pos(30_000, 30_000, '2026-09-05', true)], '2026-09-30')
    assert.equal(wealthBeforeMonth(series, '2026-09', INITIAL), INITIAL)
    assert.equal(wealthBeforeMonth(series, '2026-10', INITIAL), 130_000)
  })

  it('sin datos anteriores, el saldo inicial', () => {
    assert.equal(wealthBeforeMonth([], '2026-09', INITIAL), INITIAL)
  })
})

describe('buildPatrimonioSeries (AXIS)', () => {
  it('sin posiciones no cambia: un punto por día con movimientos y sin punto de partida', () => {
    assert.deepEqual(buildPatrimonioSeries(INITIAL, movements), [
      { date: '2026-09-01', cents: 150_000 },
      { date: '2026-09-10', cents: 130_000 },
    ])
  })

  it('la inversión desde el líquido es un día con dato', () => {
    const series = buildPatrimonioSeries(INITIAL, movements, [pos(30_000, 30_000, '2026-09-05', true)])
    assert.deepEqual(series.map((p) => p.cents), [150_000, 120_000, 100_000])
  })
})

describe('buildWealthSeries (gráfica)', () => {
  it('vacía sin datos', () => {
    assert.deepEqual(buildWealthSeries(INITIAL, [], [], '2026-09-30'), [])
  })

  it('arranca en el saldo inicial el día anterior al primer dato', () => {
    const series = buildWealthSeries(INITIAL, movements, [], '2026-09-30')
    assert.deepEqual(series, [
      { date: '2026-08-31', cents: INITIAL },
      { date: '2026-09-01', cents: 150_000 },
      { date: '2026-09-10', cents: 130_000 },
    ])
  })

  it('invertir desde el líquido no mueve el total; el último punto usa el valor actual', () => {
    const p = pos(30_000, 36_000, '2026-09-05', true)
    const series = buildWealthSeries(INITIAL, movements, [p], '2026-09-30')
    assert.deepEqual(series, [
      { date: '2026-08-31', cents: INITIAL },
      { date: '2026-09-01', cents: 150_000 },
      { date: '2026-09-05', cents: 150_000 },
      { date: '2026-09-10', cents: 130_000 },
      { date: '2026-09-30', cents: 136_000 },
    ])
    const liquid = computeLiquidCents(INITIAL, movements, [p])
    assert.equal(series[series.length - 1].cents, liquid + p.valueCents)
  })

  it('una inversión con dinero de fuera suma al total desde su fecha', () => {
    const series = buildWealthSeries(INITIAL, movements, [pos(20_000, 20_000, '2026-08-15')], '2026-09-30')
    assert.deepEqual(series.map((p) => [p.date, p.cents]), [
      ['2026-08-14', INITIAL],
      ['2026-08-15', 120_000],
      ['2026-09-01', 170_000],
      ['2026-09-10', 150_000],
    ])
  })

  it('si el último dato es de hoy, la revalorización se aplica a ese punto', () => {
    const series = buildWealthSeries(INITIAL, movements, [pos(10_000, 8_000, '2026-09-10', true)], '2026-09-10')
    assert.equal(series.at(-1)?.date, '2026-09-10')
    assert.equal(series.at(-1)?.cents, 128_000)
  })
})

describe('historial del valor de las inversiones', () => {
  it('apuntar un valor sustituye el del mismo día y mantiene el orden', () => {
    let h = withValue(undefined, '2026-10-10', 31_000)
    h = withValue(h, '2026-09-30', 30_500)
    h = withValue(h, '2026-10-10', 31_500)
    assert.deepEqual(h, [
      { date: '2026-09-30', valueCents: 30_500 },
      { date: '2026-10-10', valueCents: 31_500 },
    ])
    assert.equal(lastValueDate({ valueHistory: h }), '2026-10-10')
    assert.equal(lastValueDate({}), null)
  })

  it('guarda como mucho los más recientes', () => {
    let h = withValue(undefined, '2000-01-01', 1)
    for (let i = 1; i <= MAX_VALUE_HISTORY + 5; i++) h = withValue(h, `2001-01-01T${i}`, i)
    assert.equal(h.length, MAX_VALUE_HISTORY)
  })

  it('cada valor apuntado entra el día en que se apuntó, frente al anterior', () => {
    const p = { ...pos(30_000, 33_000, '2026-08-01', true), valueHistory: [{ date: '2026-09-01', valueCents: 31_000 }, { date: '2026-10-01', valueCents: 33_000 }] }
    assert.deepEqual(revaluationDeltas(p, '2026-10-20'), [
      { date: '2026-09-01', cents: 1_000 },
      { date: '2026-10-01', cents: 2_000 },
    ])
  })

  it('sin historial (posiciones antiguas), la diferencia entra hoy, como antes', () => {
    assert.deepEqual(revaluationDeltas(pos(30_000, 32_000, '2026-08-01'), '2026-10-20'), [{ date: '2026-10-20', cents: 2_000 }])
    assert.deepEqual(revaluationDeltas(pos(30_000, 30_000, '2026-08-01'), '2026-10-20'), [])
  })

  it('la curva sube y baja con los valores apuntados y termina en el patrimonio', () => {
    const p = { ...pos(30_000, 29_000, '2026-09-05', true), valueHistory: [{ date: '2026-09-20', valueCents: 32_000 }, { date: '2026-10-05', valueCents: 29_000 }] }
    const series = buildWealthSeries(INITIAL, movements, [p], '2026-10-20')
    assert.deepEqual(series.map((x) => [x.date, x.cents]), [
      ['2026-08-31', 100_000],
      ['2026-09-01', 150_000],
      ['2026-09-05', 150_000],
      ['2026-09-10', 130_000],
      ['2026-09-20', 132_000],
      ['2026-10-05', 129_000],
    ])
    assert.equal(series.at(-1)?.cents, computeLiquidCents(INITIAL, movements, [p]) + p.valueCents)
  })
})

describe('de dónde viene el cambio del patrimonio', () => {
  const p = { ...pos(30_000, 33_000, '2026-09-05', true), valueHistory: [{ date: '2026-09-20', valueCents: 31_000 }, { date: '2026-10-05', valueCents: 33_000 }] }

  it('ahorro (ingresos − gastos) e inversiones por separado; invertir desde el líquido no cuenta', () => {
    assert.deepEqual(wealthSources(movements, [p], null, '2026-10-20'), { savingsCents: 30_000, investmentsCents: 3_000 })
    assert.deepEqual(wealthSources(movements, [p], '2026-10-01', '2026-10-20'), { savingsCents: 0, investmentsCents: 2_000 })
  })

  it('lo aportado desde fuera de Finax cuenta como ahorro', () => {
    assert.deepEqual(wealthSources([], [pos(10_000, 10_000, '2026-09-05', false)], null, '2026-10-20'), { savingsCents: 10_000, investmentsCents: 0 })
  })

  it('suma lo mismo que la curva en el periodo', () => {
    const series = buildWealthSeries(INITIAL, movements, [p], '2026-10-20')
    const s = wealthSources(movements, [p], null, '2026-10-20')
    assert.equal(series.at(-1)!.cents - series[0].cents, s.savingsCents + s.investmentsCents)
  })
})
