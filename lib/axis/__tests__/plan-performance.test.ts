/**
 * Caídas y subidas en el plan (decidido con el usuario el 2026-11-02): cómo va
 * cada inversión con los valores apuntados, la parte arriesgada que se hunde y
 * el reequilibrio a partir de 5 puntos. Siempre con los valores que apunta el
 * usuario: Finax no consulta cotizaciones.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan, CUSHION_OBJECTIVE_NAME, type AllocationPlan, type PlanOptions, type PlanStep } from '../plan/allocation'
import { describeStep } from '../plan/describe'
import { monthChecklist } from '../plan/checklist'
import { stepReasons } from '../plan/why'
import { heldBySleeve, needsRebalance } from '../plan/mix'
import { positionPerformance, RISKY_DROP_PCT } from '../plan/performance'
import { chatPlanOf } from '../plan/chat'
import { planProposesMoves } from '../chat/semantic'
import type { MemoryFact, RiskAttitude, Horizon } from '../profile/types'
import type { Movement, Objective, Position } from '../../types'
import { config, gasto, ingreso, objective, position, snapshot, TODAY } from './fixtures'

const history3 = (): Movement[] => [...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]), ingreso('2026-09-01', 200_000)]
const CUSHION = () => objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })
const COCHE = () => objective({ name: 'Coche', targetCents: 2_000_000, priority: 2 })
const profile = (riskAttitude: RiskAttitude, horizon: Horizon, extra: MemoryFact[] = []): MemoryFact[] => [{ kind: 'riskAttitude', value: riskAttitude }, { kind: 'horizon', value: horizon }, ...extra]
/** Valor apuntado hoy: el plan no avisa de valores viejos. */
const fresh = (input: Partial<Position> & { name: string; valueCents: number }) => position({ valueHistory: [{ date: TODAY, valueCents: input.valueCents }], ...input })

function setup(liquidCents: number, objectives: Objective[], facts: MemoryFact[], positions: Position[] = [], options: PlanOptions = {}) {
  const movements = history3()
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const ctx = buildFinancialContext(snapshot({ config: config(liquidCents - net), movements, objectives, positions }), TODAY)
  const decision = decide({ context: ctx, memory: { profileFacts: facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) } })
  return { plan: buildAllocationPlan(decision, options), objectives: decision.context.objectives, decision }
}
const step = <K extends PlanStep['kind']>(p: AllocationPlan, kind: K) => p.steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)

describe('cómo va cada inversión', () => {
  it('sobre lo aportado, el último mes y el último año, con los valores apuntados', () => {
    const perf = positionPerformance(
      {
        investedCents: 100_000,
        valueCents: 90_000,
        date: '2025-08-01',
        valueHistory: [
          { date: '2025-09-10', valueCents: 80_000 },
          { date: '2026-08-10', valueCents: 100_000 },
          { date: '2026-09-15', valueCents: 90_000 },
        ],
      },
      TODAY,
    )
    assert.equal(perf.changePct, -10)
    assert.equal(perf.monthChangePct, -10, 'frente al valor de hace 36 días')
    assert.equal(perf.yearChangePct, 12.5, 'frente al valor de hace 370 días')
    assert.equal(perf.staleDays, 0)
  })

  it('sin un valor apuntado en la ventana, no inventa el cambio del mes ni del año', () => {
    const perf = positionPerformance({ investedCents: 100_000, valueCents: 110_000, date: '2026-09-01', valueHistory: [{ date: '2026-09-01', valueCents: 100_000 }, { date: '2026-09-15', valueCents: 110_000 }] }, TODAY)
    assert.equal(perf.monthChangePct, null)
    assert.equal(perf.yearChangePct, null)
  })

  it('cuenta los días desde el último valor apuntado', () => {
    assert.equal(positionPerformance({ investedCents: 1, valueCents: 1, date: '2026-08-01', valueHistory: [{ date: '2026-08-01', valueCents: 1 }] }, TODAY).staleDays, 45)
  })

  it('el contexto de AXIS lleva cómo va cada inversión', () => {
    const ctx = buildFinancialContext(snapshot({ positions: [fresh({ name: 'Bitcoin', investedCents: 100_000, valueCents: 60_000 })] }), TODAY)
    const [p] = ctx.investments.positions
    assert.equal(p.changePct, -40)
    assert.equal(p.valueAgeDays, 0)
  })
})

describe('la parte arriesgada que se hunde', () => {
  const dynamicIdle = profile('dynamic', 'long', [{ kind: 'investingExperience', value: 'some' }])

  it(`una caída del ${RISKY_DROP_PCT} % o más: se revisa y la parte arriesgada no recibe dinero nuevo`, () => {
    const crypto = fresh({ name: 'Bitcoin', investedCents: 100_000, valueCents: 65_000, assetType: 'risky' })
    const fund = fresh({ name: 'Fondo indexado global', valueCents: 900_000 })
    const s = setup(1_000_000, [CUSHION()], dynamicIdle, [crypto, fund])
    const drop = step(s.plan, 'risky-drop')!
    assert.deepEqual([drop.name, drop.changePct], ['Bitcoin', -35])
    assert.match(describeStep(drop, s.plan, s.objectives).title, /«Bitcoin» ha caído un 35 %/)
    assert.ok(!step(s.plan, 'invest-long-term')!.mix.some((p) => p.key === 'risky'), 'nada nuevo a la parte arriesgada')
    assert.ok(monthChecklist(s.plan, s.objectives).some((i) => i.id === `risky-drop:${crypto.id}`))
    assert.ok(stepReasons(drop, s.plan, s.decision.profile.fields).some((w) => w.includes('puede no volver a subir')))
  })

  it('sin la caída, el mismo perfil sí tiene parte arriesgada', () => {
    const crypto = fresh({ name: 'Bitcoin', investedCents: 100_000, valueCents: 90_000, assetType: 'risky' })
    const fund = fresh({ name: 'Fondo indexado global', valueCents: 900_000 })
    const s = setup(1_000_000, [CUSHION()], dynamicIdle, [crypto, fund])
    assert.equal(step(s.plan, 'risky-drop'), undefined)
    assert.ok(step(s.plan, 'invest-long-term')!.mix.some((p) => p.key === 'risky'))
  })

  it('lo diversificado que cae no se marca: una caída de un índice mundial no es motivo para revisar', () => {
    const fund = fresh({ name: 'Fondo indexado global', investedCents: 1_000_000, valueCents: 600_000 })
    assert.equal(step(setup(800_000, [CUSHION(), COCHE()], profile('dynamic', 'long'), [fund]).plan, 'risky-drop'), undefined)
  })
})

describe('reequilibrar a partir de 5 puntos', () => {
  it('una caída del 30 % de la renta variable en un 70/30 ya mueve el dinero nuevo (62/38: 8 puntos)', () => {
    const held = heldBySleeve([{ valueCents: 490_000, assetType: 'global-equity' }, { valueCents: 300_000, assetType: 'bonds' }])
    assert.equal(needsRebalance(held, { 'global-equity': 70, bonds: 30, risky: 0 }), true)
  })

  it('a 4 puntos todavía no', () => {
    const held = heldBySleeve([{ valueCents: 660_000, assetType: 'global-equity' }, { valueCents: 340_000, assetType: 'bonds' }])
    assert.equal(needsRebalance(held, { 'global-equity': 70, bonds: 30, risky: 0 }), false)
  })
})

describe('vender solo cuando el descuadre es grande', () => {
  const dynamicIdle = profile('dynamic', 'long', [{ kind: 'investingExperience', value: 'some' }])

  it('la parte arriesgada se dispara (30 %): recoger beneficios hasta el 10 %, hacia lo diversificado', () => {
    const crypto = fresh({ name: 'Bitcoin', investedCents: 100_000, valueCents: 300_000, assetType: 'risky' })
    const fund = fresh({ name: 'Fondo indexado global', valueCents: 700_000 })
    const s = setup(1_000_000, [CUSHION()], dynamicIdle, [crypto, fund])
    const trim = step(s.plan, 'trim-risky')!
    assert.equal(trim.sellCents, 200_000)
    assert.deepEqual(trim.to.map((p) => [p.key, p.cents]), [['global-equity', 200_000]])
    assert.equal(trim.gainCents, 200_000)
    const v = describeStep(trim, s.plan, s.objectives)
    assert.match(v.title, /Tu parte arriesgada ya es el 30 % de lo invertido/)
    assert.match(v.detail!, /recoger beneficios.*vender unos 2\.000,00 € de la parte arriesgada/)
    assert.match(v.note!, /traspaso.*no pagas impuestos.*tributa/)
    assert.equal(step(s.plan, 'invest-long-term')!.rebalance, undefined, 'después de vender ya está en su mezcla')
  })

  it('renta fija muy por encima y el dinero nuevo de un año no basta: pasar lo que sobra a renta variable', () => {
    const equity = fresh({ name: 'Fondo indexado global', valueCents: 300_000 })
    const bonds = fresh({ name: 'Fondo de renta fija', valueCents: 700_000, assetType: 'bonds' })
    const s = setup(800_000, [CUSHION(), COCHE()], profile('balanced', 'long'), [equity, bonds])
    const sell = step(s.plan, 'rebalance-sell')!
    assert.deepEqual([sell.from, sell.sellCents, sell.to[0].key], ['bonds', 400_000, 'global-equity'])
    const v = describeStep(sell, s.plan, s.objectives)
    assert.equal(v.title, 'Pasa 4.000,00 € de la renta fija a la renta variable global')
    assert.match(v.detail!, /Ahora tienes 30 % renta variable global y 70 % renta fija, y tu mezcla es 70 % renta variable global y 30 % renta fija/)
    assert.ok(monthChecklist(s.plan, s.objectives).some((i) => i.id === 'rebalance-sell:bonds'))
    assert.ok(stepReasons(sell, s.plan, s.decision.profile.fields).some((w) => w.includes('diferencias pequeñas')))
  })

  it('si el dinero nuevo lo corrige en menos de un año, no se vende: lo nuevo va a lo que falta', () => {
    const equity = fresh({ name: 'Fondo indexado global', valueCents: 600_000 })
    const bonds = fresh({ name: 'Fondo de renta fija', valueCents: 400_000, assetType: 'bonds' })
    const s = setup(800_000, [CUSHION(), COCHE()], profile('balanced', 'long'), [equity, bonds])
    assert.equal(step(s.plan, 'rebalance-sell'), undefined)
    assert.ok(step(s.plan, 'invest-long-term')!.rebalance)
  })

  it('el chat de AXIS puede explicar la venta sin que cuente como contradicción', () => {
    const equity = fresh({ name: 'Fondo indexado global', valueCents: 300_000 })
    const bonds = fresh({ name: 'Fondo de renta fija', valueCents: 700_000, assetType: 'bonds' })
    const s = setup(800_000, [CUSHION(), COCHE()], profile('balanced', 'long'), [equity, bonds])
    assert.equal(planProposesMoves(chatPlanOf(s.decision)), true)
    assert.equal(planProposesMoves(chatPlanOf(setup(800_000, [CUSHION(), COCHE()], profile('balanced', 'long')).decision)), false)
  })
})
