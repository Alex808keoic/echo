/**
 * Fase B1: AXIS con la semántica del reparto automático de objetivos.
 *
 * El progreso, el estado y el dinero destinado salen de `allocateObjectives`
 * (vía `buildFinancialContext`), nunca del `currentCents` guardado. AXIS no
 * recalcula la cascada: la consume.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { detectSignals } from '../rules'
import { allocateObjectives } from '../../finance/objectives'
import type { FinancialContext } from '../types'
import type { Objective } from '../../types'
import { config, healthyMovements, objective, snapshot, TODAY } from './fixtures'

/** `healthyMovements` deja un neto de +255.000 y un ahorro de 1.300 € en el mes en curso. */
const NET = 255_000
const at = (liquidCents: number, objectives: Objective[]): FinancialContext =>
  buildFinancialContext(snapshot({ config: config(liquidCents - NET), movements: healthyMovements(), objectives }), TODAY)
const ids = (ctx: FinancialContext) => detectSignals(ctx).map((s) => s.id)
const OLD = Date.parse('2026-06-01') // creado hace más de 30 días a TODAY (2026-09-15)

describe('B1 · cubierto frente a conseguido', () => {
  it('activo con la meta alcanzada por el reparto → cubierto, no conseguido', () => {
    const ctx = at(400_000, [objective({ id: 'a', name: 'Viaje', targetCents: 300_000 })])
    const [o] = ctx.objectives
    assert.deepEqual([o.status, o.completed, o.currentCents, o.remainingCents, o.progressPct, o.rank], ['covered', true, 300_000, 0, 100, 1])
    assert.ok(ids(ctx).includes('objectives.covered:a'))
    assert.ok(!ids(ctx).includes('objectives.completed:a'), 'cubierto no es conseguido')
    const covered = detectSignals(ctx).find((s) => s.id === 'objectives.covered:a')!
    assert.match(covered.interpretation, /si baja, volverá a estar en curso\. No es lo mismo que conseguido\./)
    assert.deepEqual(covered.recommendation?.action, { verb: 'decide', target: 'objective', targetId: 'a' })
  })

  it('si baja el líquido, el cubierto vuelve a estar en curso', () => {
    const goal = objective({ id: 'a', name: 'Viaje', targetCents: 300_000 })
    assert.equal(at(300_000, [goal]).objectives[0].status, 'covered')
    const [o] = at(250_000, [goal]).objectives
    assert.deepEqual([o.status, o.completed, o.currentCents, o.remainingCents], ['in-progress', false, 250_000, 50_000])
    assert.ok(!ids(at(250_000, [goal])).includes('objectives.covered:a'))
  })

  it('achievedAt → conseguido al 100 %, fuera de la cascada: su parte va al siguiente', () => {
    const done = objective({ id: 'a', name: 'Viaje', targetCents: 300_000, achievedAt: Date.parse('2026-09-01') })
    const next = objective({ id: 'b', name: 'Moto', targetCents: 300_000 })
    const ctx = at(200_000, [done, next])
    const byId = Object.fromEntries(ctx.objectives.map((o) => [o.id, o]))
    assert.deepEqual([byId.a.status, byId.a.rank, byId.a.progressPct, byId.a.currentCents, byId.a.remainingCents], ['achieved', null, 100, 300_000, 0])
    assert.deepEqual([byId.b.status, byId.b.rank, byId.b.currentCents], ['in-progress', 1, 200_000], 'todo el líquido va a «Moto»')
    assert.ok(ids(ctx).includes('objectives.completed:a'))
    assert.match(detectSignals(ctx).find((s) => s.id === 'objectives.completed:a')!.fact, /conseguido \(lo marcaste tú\)/)
  })

  it('reactivar (sin achievedAt) → vuelve a estar activo y en la cascada', () => {
    const reactivated = objective({ id: 'a', name: 'Viaje', targetCents: 300_000 })
    const ctx = at(200_000, [reactivated, objective({ id: 'b', name: 'Moto', targetCents: 300_000 })])
    assert.deepEqual(ctx.objectives.map((o) => [o.id, o.status, o.rank, o.currentCents]), [['a', 'in-progress', 1, 200_000], ['b', 'in-progress', 2, 0]])
    assert.ok(!ids(ctx).includes('objectives.completed:a'))
  })

  it('un contexto anterior a B1 (sin status) con completed → se trata como cubierto, nunca como conseguido', () => {
    const ctx = at(400_000, [objective({ id: 'a', name: 'Viaje', targetCents: 300_000 })])
    const legacy: FinancialContext = { ...ctx, objectives: ctx.objectives.map(({ status: _s, rank: _r, aheadRemainingCents: _a, ...o }) => o) }
    assert.ok(ids(legacy).includes('objectives.covered:a'))
    assert.ok(!ids(legacy).includes('objectives.completed:a'))
  })
})

describe('B1 · sin dinero (stale)', () => {
  it('el segundo con 0 € porque el primero consume todo NO está estancado', () => {
    const ctx = at(200_000, [objective({ id: 'a', name: 'Viaje', targetCents: 300_000, createdAt: OLD }), objective({ id: 'b', name: 'Moto', targetCents: 300_000, createdAt: OLD })])
    const b = ctx.objectives.find((o) => o.id === 'b')!
    assert.deepEqual([b.currentCents, b.aheadRemainingCents], [0, 100_000])
    assert.ok(!ids(ctx).some((id) => id.startsWith('objectives.stale')))
  })

  it('el que le toca recibir dinero y no recibe nada (sin líquido) → stale, conservador y sin inventar duración', () => {
    const ctx = at(0, [objective({ id: 'a', name: 'Viaje', targetCents: 300_000, createdAt: OLD })])
    const stale = detectSignals(ctx).find((s) => s.id === 'objectives.stale:a')
    assert.ok(stale)
    assert.match(stale.fact, /es el siguiente en recibir dinero, pero ahora mismo tu dinero líquido no llega hasta él/)
    assert.doesNotMatch(stale.fact, /lleva \d+ días sin/, 'sin historial del reparto no se afirma cuánto tiempo lleva así')
    assert.doesNotMatch(stale.recommendation?.what ?? '', /aportación/, 'no hay aportaciones manuales')
  })

  it('tras objetivos cubiertos, el siguiente sin dinero sí está estancado (nada pendiente por delante)', () => {
    const ctx = at(300_000, [objective({ id: 'a', name: 'Viaje', targetCents: 300_000, createdAt: OLD }), objective({ id: 'b', name: 'Moto', targetCents: 300_000, createdAt: OLD })])
    assert.deepEqual(ctx.objectives.map((o) => [o.id, o.status, o.aheadRemainingCents]), [['a', 'covered', 0], ['b', 'in-progress', 0]])
    assert.ok(ids(ctx).includes('objectives.stale:b'))
  })

  it('recién creado (menos de 30 días) → no se emite', () => {
    assert.ok(!ids(at(0, [objective({ id: 'a', name: 'Viaje', targetCents: 300_000, createdAt: Date.parse('2026-09-01') })])).some((id) => id.startsWith('objectives.stale')))
  })
})

describe('B1 · ritmo en cascada (pace)', () => {
  // Sin líquido; ~6 meses hasta la fecha; ahorro del mes 1.300 €.
  const A = () => objective({ id: 'a', name: 'Viaje', targetCents: 300_000, targetDate: '2027-03-15' })
  const B = () => objective({ id: 'b', name: 'Moto', targetCents: 600_000, targetDate: '2027-03-15' })

  it('el prioritario necesita solo lo suyo; el segundo, lo suyo más lo que falta al primero', () => {
    const ctx = at(0, [A(), B()])
    const [a, b] = ctx.objectives
    assert.deepEqual([a.id, a.aheadRemainingCents, b.id, b.aheadRemainingCents], ['a', 0, 'b', 300_000])
    const months = a.monthsLeft!
    assert.equal(a.requiredMonthlyCents, Math.ceil(300_000 / months / 100) * 100)
    assert.equal(b.requiredMonthlyCents, Math.ceil((300_000 + 600_000) / months / 100) * 100)
  })

  it('no cuenta dos veces el mismo ahorro: B alcanzable por sí solo, pero no detrás de A', () => {
    const together = detectSignals(at(0, [A(), B()]))
    assert.equal(together.find((s) => s.id === 'objectives.pace:a')?.priority, 'low', '50.000/mes < 1.300 €')
    const pb = together.find((s) => s.id === 'objectives.pace:b')!
    assert.equal(pb.priority, 'high', '150.000/mes > 130.000 de ahorro')
    assert.match(pb.fact, /y antes 3\.000,00 € de los objetivos que van por delante/)
    const alone = detectSignals(at(0, [B()])).find((s) => s.id === 'objectives.pace:b')!
    assert.equal(alone.priority, 'low', 'solo, 100.000/mes sí cabe en el ahorro del mes')
  })

  it('el segundo empieza a recibir después del primero: con A cubierto, B ya no arrastra nada por delante', () => {
    const ctx = at(300_000, [A(), B()])
    const [a, b] = ctx.objectives
    assert.equal(a.status, 'covered')
    assert.equal(a.requiredMonthlyCents, undefined, 'cubierto: sin ritmo pendiente')
    assert.equal(b.aheadRemainingCents, 0)
    assert.equal(b.requiredMonthlyCents, Math.ceil(600_000 / b.monthsLeft! / 100) * 100)
  })
})

describe('B1 · dinero destinado a objetivos', () => {
  it('activos → exactamente lo asignado por allocateObjectives', () => {
    const objectives = [objective({ id: 'a', name: 'Viaje', targetCents: 300_000 }), objective({ id: 'b', name: 'Moto', targetCents: 300_000 })]
    const ctx = at(500_000, objectives)
    assert.equal(ctx.wealth.reservedForObjectivesCents, allocateObjectives(objectives, ctx.wealth.liquidCents).allocatedCents)
    assert.equal(ctx.wealth.reservedForObjectivesCents, 500_000)
    assert.deepEqual(ctx.objectives.map((o) => o.currentCents), [300_000, 200_000])
  })

  it('un conseguido no vuelve a consumir dinero destinado', () => {
    const ctx = at(500_000, [objective({ id: 'a', name: 'Viaje', targetCents: 300_000, achievedAt: 1 }), objective({ id: 'b', name: 'Moto', targetCents: 300_000 })])
    assert.equal(ctx.wealth.reservedForObjectivesCents, 300_000, 'solo «Moto»; «Viaje» no reserva su meta')
    assert.ok(ctx.wealth.reservedForObjectivesCents <= ctx.wealth.liquidCents)
  })

  it('el currentCents guardado no se usa como fuente', () => {
    const stored = objective({ id: 'a', name: 'Viaje', targetCents: 300_000, currentCents: 999_999 })
    const ctx = at(120_000, [stored])
    assert.deepEqual([ctx.objectives[0].currentCents, ctx.objectives[0].remainingCents, ctx.wealth.reservedForObjectivesCents], [120_000, 180_000, 120_000])
  })

  it('las cifras financieras no dependen del reparto: líquido, patrimonio y flujos iguales con o sin objetivos', () => {
    const withGoals = at(500_000, [objective({ id: 'a', name: 'Viaje', targetCents: 300_000 })])
    const without = at(500_000, [])
    assert.deepEqual(withGoals.wealth.liquidCents, without.wealth.liquidCents)
    assert.deepEqual(withGoals.wealth.totalCents, without.wealth.totalCents)
    assert.deepEqual(withGoals.flows, without.flows)
    assert.equal(decide({ context: without }).context.wealth.reservedForObjectivesCents, 0)
  })
})
