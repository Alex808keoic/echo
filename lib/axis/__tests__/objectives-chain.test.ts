/**
 * Fase B2: señales y previsiones de objetivos coherentes con el reparto automático.
 *
 * - `forecastObjectiveAllocation` simula la MISMA cascada (`allocateObjectives`)
 *   sobre el líquido actual más k meses de capacidad: un objetivo empieza a
 *   recibirla cuando los anteriores están cubiertos.
 * - `objectives.forecast` usa esa simulación; `near` y `savings.healthy` no
 *   inventan acciones manuales.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { forecastObjectiveAllocation } from '../../finance/objectives'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { detectSignals } from '../rules'
import { recurringForecasts } from '../rules/shared'
import { profileFromMemory, reconcileProfile } from '../profile/derive'
import type { AxisMemory, FinancialContext } from '../types'
import type { Objective } from '../../types'
import { config, healthyMovements, objective, snapshot, TODAY } from './fixtures'

const goal = (id: string, targetCents: number, extra: Partial<Objective> = {}): Objective => ({ id, name: id, currentCents: 0, targetCents, createdAt: 1, updatedAt: 1, ...extra })
const months = (objectives: Objective[], liquid: number, monthly: number) =>
  forecastObjectiveAllocation(objectives, liquid, monthly, 120)?.map((p) => [p.objective.id, p.months])

describe('B2 · forecastObjectiveAllocation (misma cascada que allocateObjectives)', () => {
  const A = () => goal('a', 30_000, { priority: 1 })
  const B = () => goal('b', 30_000, { priority: 2 })

  it('caso A · un objetivo de 300 €, 0 € y 100 €/mes → 3 meses', () => {
    assert.deepEqual(months([goal('a', 30_000)], 0, 10_000), [['a', 3]])
  })

  it('caso B · dos de 300 € en cascada → el primero en 3 meses, el segundo en 6 (no en 3)', () => {
    assert.deepEqual(months([A(), B()], 0, 10_000), [['a', 3], ['b', 6]])
  })

  it('caso C · 100 € de líquido → al primero le faltan 200 € (2 meses); el segundo empieza después (5)', () => {
    assert.deepEqual(months([A(), B()], 10_000, 10_000), [['a', 2], ['b', 5]])
  })

  it('caso D · el primero ya cubierto no consume capacidad: el segundo recibe los 100 €/mes', () => {
    assert.deepEqual(months([A(), B()], 30_000, 10_000), [['a', 0], ['b', 3]])
  })

  it('caso E · un conseguido (achievedAt) no consume capacidad y no aparece', () => {
    assert.deepEqual(months([goal('a', 30_000, { priority: 1, achievedAt: 5 }), B()], 0, 10_000), [['b', 3]])
  })

  it('caso F · si cae el líquido, el que estaba cubierto vuelve a necesitar capacidad', () => {
    assert.deepEqual(months([A(), B()], 30_000, 10_000), [['a', 0], ['b', 3]])
    assert.deepEqual(months([A(), B()], 25_000, 10_000), [['a', 1], ['b', 4]])
    assert.deepEqual(months([A(), B()], -10_000, 10_000), [['a', 4], ['b', 7]], 'con líquido negativo, primero se recupera')
  })

  it('caso G · sin capacidad no hay previsión; más allá del horizonte, «beyond» (sin fechas inventadas)', () => {
    assert.equal(forecastObjectiveAllocation([A()], 0, 0, 120), null)
    assert.equal(forecastObjectiveAllocation([A()], 0, -100, 120), null)
    assert.deepEqual(months([goal('a', 10_000_000)], 0, 100), [['a', 'beyond']])
  })

  it('el orden es el de la prioridad (no el de la lista) y una meta 0 no se prevé', () => {
    assert.deepEqual(months([B(), A(), goal('cero', 0, { priority: 3 })], 0, 10_000), [['a', 3], ['b', 6]])
  })
})

/* ------------------------------- en AXIS ------------------------------- */

const NET = 255_000 // neto de healthyMovements
const at = (liquidCents: number, objectives: Objective[]): FinancialContext =>
  buildFinancialContext(snapshot({ config: config(liquidCents - NET), movements: healthyMovements(), objectives }), TODAY)
const paga = (cents: number): AxisMemory => ({ profileFacts: [{ id: 'mem-paga', updatedAt: 1, fact: { kind: 'recurringIncome', cents, frequency: 'monthly', category: 'Paga' } }] })
/** Perfil reconciliado con el contexto, como en decide(). */
const profileOf = (ctx: FinancialContext, memory?: AxisMemory) => reconcileProfile(profileFromMemory(memory), ctx)
const forecastOf = (ctx: FinancialContext, memory?: AxisMemory) => detectSignals(ctx, null, profileOf(ctx, memory)).filter((s) => s.domain === 'forecast')

describe('B2 · objectives.forecast encadenado', () => {
  const A = () => objective({ id: 'a', name: 'Viaje', targetCents: 30_000, priority: 1 })
  const B = () => objective({ id: 'b', name: 'Moto', targetCents: 30_000, priority: 2 })

  it('el segundo no recibe la capacidad del primero: 3 y 6 meses, y lo dice', () => {
    const ctx = at(0, [A(), B()])
    const f = recurringForecasts(ctx, profileOf(ctx, paga(10_000)))
    assert.deepEqual(f.map((x) => [x.objectiveId, x.allMonths, x.after]), [['a', 3, []], ['b', 6, ['Viaje']]])
    const [sa, sb] = forecastOf(ctx, paga(10_000))
    assert.match(sa.fact, /lo que falta para «Viaje» \(300,00 €\) equivale a 3 meses de tus ingresos previstos \(100,00 € al mes de paga\)\.$/)
    assert.match(sb.fact, /lo que falta para «Moto» \(300,00 €\) equivale a 6 meses de tus ingresos previstos \(100,00 € al mes de paga\), después de cubrir «Viaje»\.$/)
  })

  it('con el primero cubierto, solo se prevé el segundo y recibe toda la capacidad', () => {
    const ctx = at(30_000, [A(), B()])
    assert.deepEqual(forecastOf(ctx, paga(10_000)).map((s) => s.id), ['objectives.forecast:b'])
    assert.equal(recurringForecasts(ctx, profileOf(ctx, paga(10_000)))[0].allMonths, 3)
  })

  it('con el primero conseguido, igual: no consume capacidad', () => {
    const ctx = at(0, [objective({ id: 'a', name: 'Viaje', targetCents: 30_000, priority: 1, achievedAt: 1 }), B()])
    assert.deepEqual(recurringForecasts(ctx, profileOf(ctx, paga(10_000))).map((x) => [x.objectiveId, x.allMonths]), [['b', 3]])
  })

  it('sin ingreso recurrente no hay previsión; nunca se inventa', () => {
    assert.deepEqual(forecastOf(at(0, [A(), B()])), [])
  })

  it('la memoria de prioridades no altera el orden de la previsión', () => {
    const memory: AxisMemory = { profileFacts: [...paga(10_000).profileFacts!, { id: 'mem-prio', updatedAt: 2, fact: { kind: 'priorities', objectiveIds: ['b'] } }] }
    assert.deepEqual(forecastOf(at(0, [A(), B()]), memory).map((s) => s.id), ['objectives.forecast:a', 'objectives.forecast:b'])
  })
})

describe('B2 · near y savings.healthy sin acciones manuales', () => {
  it('near: describe lo que falta y que el dinero se asigna solo; sin «Reserva» ni recomendación', () => {
    const ctx = at(170_000, [objective({ id: 'a', name: 'Viaje', targetCents: 180_000 })])
    const near = detectSignals(ctx).find((s) => s.id === 'objectives.near:a')!
    assert.equal(near.priority, 'medium', 'mismo significado financiero')
    assert.match(near.fact, /«Viaje» está al 94%: faltan 100,00 €\./)
    assert.match(near.interpretation, /es el siguiente en recibir dinero: lo próximo que entre en tu líquido se le asigna automáticamente \(va 1\.º en el orden de tus objetivos\)/)
    assert.equal(near.recommendation, undefined)
    assert.doesNotMatch(JSON.stringify(near), /Reserva|reserve/)
  })

  it('savings.healthy con objetivos pendientes: explica el reparto automático, sin «Destina» ni allocate', () => {
    const ctx = at(100_000, [objective({ id: 'a', name: 'Viaje', targetCents: 300_000, priority: 1 }), objective({ id: 'b', name: 'Moto', targetCents: 300_000, priority: 2 })])
    const sh = detectSignals(ctx).find((s) => s.id === 'savings.healthy')!
    assert.equal('recommendation' in sh, false)
    assert.match(sh.interpretation, /se asigna solo a tus objetivos, en su orden: ahora va a «Viaje», al que le faltan 2\.000,00 €\./)
    assert.doesNotMatch(JSON.stringify(sh), /Destina|allocate/)
    assert.equal(decide({ context: ctx }).recommendation, null)
  })

  it('savings.healthy sin objetivos: sigue recomendando definir uno (no cambia)', () => {
    const sh = detectSignals(at(100_000, [])).find((s) => s.id === 'savings.healthy')!
    assert.deepEqual(sh.recommendation?.action, { verb: 'define', target: 'objective' })
  })
})
