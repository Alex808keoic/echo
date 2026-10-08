/**
 * «Tu plan» (fase 2c): textos de cada paso, barra del reparto y las dos
 * escrituras del plan (crear el «Fondo de emergencia» el primero, o ponerlo
 * el primero). Solo presentación: importes y orden son los de buildAllocationPlan.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan, CUSHION_OBJECTIVE_NAME, type AllocationPlan, type PlanStep } from '../plan/allocation'
import { describeStep, LONG_TERM_EXPLANATION, PLAN_DISCLAIMER, planHeadline, planSegments } from '../plan/describe'
import type { MemoryFact } from '../profile/types'
import type { Movement, Objective } from '../../types'
import { activeInOrder } from '../../finance/objectives'
import { db } from '../../db/db'
import { clearAllData } from '../../db/backup'
import { addObjective, addObjectiveFirst, moveObjectiveToFirst } from '../../db/objectives'
import { config, gasto, ingreso, objective, snapshot, TODAY } from './fixtures'

const history3 = (): Movement[] => [
  ...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]),
  ingreso('2026-09-01', 200_000),
  gasto('2026-09-05', 50_000),
]
function setup(liquidCents: number, objectives: Objective[] = [], facts: MemoryFact[] = []) {
  const movements = history3()
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const ctx = buildFinancialContext(snapshot({ config: config(liquidCents - net), movements, objectives }), TODAY)
  const memory = facts.length ? { profileFacts: facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) } : undefined
  const decision = decide({ context: ctx, ...(memory ? { memory } : {}) })
  return { plan: buildAllocationPlan(decision), objectives: decision.context.objectives }
}
const views = ({ plan, objectives }: { plan: AllocationPlan; objectives: ReturnType<typeof setup>['objectives'] }) => plan.steps.map((s) => describeStep(s, plan, objectives))
const PROFILE: MemoryFact[] = [
  { kind: 'horizon', value: 'long' },
  { kind: 'riskAttitude', value: 'balanced' },
]
const CUSHION = (target: number, priority = 1) => objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: target, priority })

describe('textos del plan', () => {
  it('sin colchón: el primer paso lo crea, con su meta y su acción', () => {
    const s = setup(100_000)
    const [first] = views(s)
    assert.equal(first.title, `Crea tu «${CUSHION_OBJECTIVE_NAME}» de 3.000,00 €`)
    assert.match(first.detail ?? '', /3 meses de tu gasto habitual/)
    assert.equal(first.action?.kind, 'create-cushion')
    assert.equal(planHeadline(s.plan, s.objectives), first.title)
  })

  it('colchón a medias: cuánto al mes, cuánto falta y que no conviene invertir aún', () => {
    const v = views(setup(100_000, [CUSHION(300_000)], PROFILE))
    const fill = v.find((x) => x.title.startsWith('1.000,00 € al mes a tu colchón'))
    assert.ok(fill)
    assert.match(fill!.detail ?? '', /Te faltan 2\.000,00 €: unos 2 meses/)
  })

  it('largo plazo: importe, porcentaje y categoría; con menor de edad, el aviso del adulto', () => {
    const s = setup(800_000, [CUSHION(300_000)], [...PROFILE, { kind: 'adult', value: false }])
    const invest = s.plan.steps.find((x): x is Extract<PlanStep, { kind: 'invest-long-term' }> => x.kind === 'invest-long-term')!
    const v = describeStep(invest, s.plan, s.objectives)
    assert.equal(v.title, '400,00 € al mes a largo plazo')
    assert.match(v.detail ?? '', /El 40 % de lo que te sobra/)
    assert.match(v.note ?? '', /menor de edad/)
    assert.equal(v.warning, undefined, 'es información, no un problema')
  })

  it('sin perfil: el último paso lleva a responderlo', () => {
    const v = views(setup(800_000, [CUSHION(300_000)]))
    assert.equal(v[v.length - 1].action?.kind, 'answer-profile')
  })

  it('bloqueado por líquido negativo: un solo paso, a Mi Dinero', () => {
    const v = views(setup(-50_000))
    assert.equal(v.length, 1)
    assert.equal(v[0].action?.kind, 'review-money')
  })

  it('ningún texto nombra productos concretos ni da timing', () => {
    const all = [setup(100_000), setup(800_000, [CUSHION(300_000)], PROFILE), setup(-50_000)]
      .flatMap((s) => views(s))
      .flatMap((v) => [v.title, v.detail ?? '', v.warning ?? ''])
      .concat(LONG_TERM_EXPLANATION, PLAN_DISCLAIMER)
      .join(' ')
    assert.doesNotMatch(all, /\b(etf|bitcoin|oro|compra ya|vende|aprovecha|buen momento)\b/i)
  })
})

describe('barra del reparto', () => {
  it('suma lo que se reparte y solo incluye importes positivos', () => {
    const s = setup(800_000, [CUSHION(300_000)], PROFILE)
    const segs = planSegments(s.plan)
    assert.deepEqual(
      segs.map((x) => [x.kind, x.cents]),
      [
        ['long-term', 40_000],
        ['objectives', 60_000],
      ],
    )
    assert.equal(segs.reduce((t, x) => t + x.cents, 0), s.plan.monthly?.savingsCents)
  })

  it('bloqueado: sin barra', () => {
    assert.deepEqual(planSegments(setup(-50_000).plan), [])
  })
})

describe('escrituras del plan (Dexie)', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
  })

  it('crear el «Fondo de emergencia» lo pone el primero; los demás conservan su orden', async () => {
    const viaje = await addObjective({ name: 'Viaje', targetCents: 50_000 })
    const moto = await addObjective({ name: 'Moto', targetCents: 90_000 })
    // Orden explícito: creados en el mismo milisegundo, el desempate sería por un id aleatorio.
    await db.objectives.update(viaje.id, { priority: 1 })
    await db.objectives.update(moto.id, { priority: 2 })
    const cushion = await addObjectiveFirst({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000 })
    const order = activeInOrder(await db.objectives.toArray()).map((o) => o.id)
    assert.deepEqual(order, [cushion.id, viaje.id, moto.id])
  })

  it('ponerlo el primero no cambia el orden relativo del resto', async () => {
    const a = await addObjective({ name: 'A', targetCents: 10_000 })
    const b = await addObjective({ name: 'B', targetCents: 10_000 })
    const c = await addObjective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 10_000 })
    await Promise.all([a, b, c].map((o, i) => db.objectives.update(o.id, { priority: i + 1 })))
    await moveObjectiveToFirst(c.id)
    assert.deepEqual(activeInOrder(await db.objectives.toArray()).map((o) => o.id), [c.id, a.id, b.id])
    // Ya el primero: no cambia nada.
    await moveObjectiveToFirst(c.id)
    assert.deepEqual(activeInOrder(await db.objectives.toArray()).map((o) => o.id), [c.id, a.id, b.id])
  })

  it('tras crearlo, el plan ya no propone crearlo ni moverlo', async () => {
    await addObjective({ name: 'Viaje', targetCents: 50_000 })
    await addObjectiveFirst({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000 })
    const objectives = await db.objectives.toArray()
    const { plan } = setup(100_000, objectives, PROFILE)
    assert.ok(!plan.steps.some((s) => s.kind === 'create-cushion' || s.kind === 'move-cushion-first'))
    assert.equal(plan.cushion?.isFirst, true)
  })
})
