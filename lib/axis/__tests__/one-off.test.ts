/**
 * Movimientos puntuales: son dinero real (líquido, patrimonio, objetivos), pero
 * no entran en lo habitual (gasto y ahorro habituales, plan) ni disparan los
 * avisos que comparan un mes con el anterior.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext, closedMonthsOf } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan } from '../plan/allocation'
import { usualMonthlyExpense } from '../rules/shared'
import { db } from '../../db/db'
import { addMovement, listMovements, updateMovement } from '../../db/movements'
import { parseBackup, BACKUP_FORMAT } from '../../db/backup'
import type { Movement } from '../../types'
import { config, gasto, ingreso, snapshot, TODAY } from './fixtures'

const puntual = (m: Movement): Movement => ({ ...m, puntual: true })
const contextFor = (movements: Movement[]) => buildFinancialContext(snapshot({ config: config(500_000), movements }), TODAY)
const ids = (movements: Movement[]) => decide({ context: contextFor(movements) }).signals.map((s) => s.id)
const signal = (movements: Movement[], id: string) => decide({ context: contextFor(movements) }).signals.find((s) => s.id === id)

/** Julio y agosto cerrados: 2.000 € de ingresos y 1.000 € de gastos. */
const base = () => ['07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)])

describe('contexto: la parte puntual de cada mes', () => {
  it('sin puntuales no aparece ningún campo nuevo (los goldens no cambian)', () => {
    const [aug] = closedMonthsOf(base(), TODAY)
    assert.deepEqual(Object.keys(aug).sort(), ['expenseCents', 'incomeCents', 'key', 'movementCount'])
    assert.equal('oneOffIncomeCents' in contextFor(base()).flows.current, false)
  })

  it('con puntuales, el mes los lleva aparte y los totales siguen siendo reales', () => {
    const [aug] = closedMonthsOf([...base(), puntual(gasto('2026-08-20', 300_000)), puntual(ingreso('2026-08-21', 50_000))], TODAY)
    assert.equal(aug.expenseCents, 400_000)
    assert.equal(aug.oneOffExpenseCents, 300_000)
    assert.equal(aug.incomeCents, 250_000)
    assert.equal(aug.oneOffIncomeCents, 50_000)
  })

  it('el líquido sí cuenta lo puntual: es dinero real', () => {
    const withFlag = contextFor([...base(), puntual(gasto('2026-08-20', 300_000))])
    const without = contextFor([...base(), gasto('2026-08-20', 300_000)])
    assert.equal(withFlag.wealth.liquidCents, without.wealth.liquidCents)
  })
})

describe('lo habitual no incluye lo puntual', () => {
  it('un gasto puntual grande no sube el gasto habitual', () => {
    const big = gasto('2026-08-20', 300_000)
    assert.equal(usualMonthlyExpense(closedMonthsOf([...base(), big], TODAY)), 250_000)
    assert.equal(usualMonthlyExpense(closedMonthsOf([...base(), puntual(big)], TODAY)), 100_000)
  })

  it('un ingreso puntual grande no sube el ahorro del plan', () => {
    const job = ingreso('2026-08-15', 500_000)
    const plan = (ms: Movement[]) => buildAllocationPlan(decide({ context: contextFor([...base(), ...ms]) }))
    assert.equal(plan([job]).monthly?.savingsCents, 350_000)
    assert.equal(plan([puntual(job)]).monthly?.savingsCents, 100_000)
  })
})

describe('avisos de AXIS', () => {
  /** Septiembre (en curso): 2.000 € de ingresos y 500 € de gasto normal. */
  const september = () => [ingreso('2026-09-01', 200_000), gasto('2026-09-05', 50_000)]

  it('gastos > ingresos solo por algo puntual → expenses.one-off, no over-income, y el plan no se bloquea', () => {
    const repair = gasto('2026-09-10', 300_000)
    assert.ok(ids([...base(), ...september(), repair]).includes('expenses.over-income'))
    const flagged = [...base(), ...september(), puntual(repair)]
    assert.ok(!ids(flagged).includes('expenses.over-income'))
    const s = signal(flagged, 'expenses.one-off')
    assert.ok(s)
    assert.match(s.fact, /3\.000,00 € de gastos puntuales/)
    assert.notEqual(buildAllocationPlan(decide({ context: contextFor(flagged) })).blocker, 'overspending')
  })

  it('si sin lo puntual también se gasta más de lo que entra, sigue siendo over-income', () => {
    const ms = [...base(), ingreso('2026-09-01', 200_000), gasto('2026-09-05', 250_000), puntual(gasto('2026-09-10', 100_000))]
    assert.ok(ids(ms).includes('expenses.over-income'))
    assert.ok(!ids(ms).includes('expenses.one-off'))
  })

  it('la subida de gastos se mide sin lo puntual', () => {
    const trip = gasto('2026-09-10', 100_000)
    assert.ok(ids([...base(), ...september(), trip]).includes('expenses.increase'))
    assert.ok(!ids([...base(), ...september(), puntual(trip)]).includes('expenses.increase'))
  })

  it('con algo puntual, el texto de la subida usa lo habitual y lo dice', () => {
    const ms = [...base(), ingreso('2026-09-01', 200_000), gasto('2026-09-05', 150_000), puntual(gasto('2026-09-10', 20_000))]
    const s = signal(ms, 'expenses.increase')
    assert.ok(s)
    assert.equal(s.fact, 'Sin lo puntual, los gastos han subido un 50% respecto al mes anterior: 1.000,00 € → 1.500,00 €.')
  })

  it('un ingreso puntual no es un «ingreso extraordinario»', () => {
    const job = ingreso('2026-09-12', 200_000)
    assert.ok(ids([...base(), ...september(), job]).includes('income.extraordinary'))
    assert.ok(!ids([...base(), ...september(), puntual(job)]).includes('income.extraordinary'))
  })

  it('un ingreso puntual del mes pasado no hace que este mes parezca una caída', () => {
    const job = ingreso('2026-08-12', 300_000)
    assert.ok(ids([...base(), job, ...september()]).includes('income.drop'))
    const flagged = [...base(), puntual(job), ...september()]
    assert.ok(!ids(flagged).includes('income.drop'))
    assert.ok(!ids(flagged).includes('savings.falling'))
  })
})

describe('guardar y copiar', () => {
  beforeEach(async () => {
    await db.movements.clear()
  })

  it('se guarda solo cuando es true y se puede quitar al editar', async () => {
    const m = await addMovement({ type: 'gasto', amountCents: 1_000, date: TODAY, category: 'Supermercado', puntual: true })
    assert.equal((await listMovements())[0].puntual, true)
    await updateMovement(m.id, { type: 'gasto', amountCents: 1_000, date: TODAY, category: 'Supermercado' })
    assert.equal('puntual' in (await listMovements())[0], false)
  })

  it('la copia de seguridad lo acepta y rechaza valores que no sean true', () => {
    const file = (puntual: unknown) =>
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: 2,
        exportedAt: '2026-10-04T10:00:00.000Z',
        config: null,
        movements: [{ id: 'm1', type: 'gasto', amountCents: 1_000, date: TODAY, category: 'Supermercado', puntual, createdAt: 1, updatedAt: 1 }],
        objectives: [],
        positions: [],
        memories: [],
      })
    assert.equal(parseBackup(file(true)).movements[0].puntual, true)
    assert.throws(() => parseBackup(file('sí')))
    assert.throws(() => parseBackup(file(false)))
  })
})
