/**
 * Finax como consultor (2026-10-17): «Tu decisión del mes», tu mezcla real
 * frente a la del plan (reequilibrar sin vender, caídas) y el porqué de cada
 * paso con tus respuestas. Siempre tipos de inversión, nunca productos.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan, CUSHION_OBJECTIVE_NAME, type AllocationPlan, type PlanStep } from '../plan/allocation'
import { describeStep } from '../plan/describe'
import { guessAssetType, heldBySleeve, needsRebalance, rebalanceSplit } from '../plan/mix'
import { stepReasons } from '../plan/why'
import { monthChecklist } from '../plan/checklist'
import { chatPlanOf, planForPrompt, planLocalReply } from '../plan/chat'
import type { MemoryFact, RiskAttitude, Horizon } from '../profile/types'
import type { Movement, Objective, Position } from '../../types'
import { db } from '../../db/db'
import { clearAllData, parseBackup, BACKUP_FORMAT } from '../../db/backup'
import { getPlanChecks, setPlanCheck } from '../../db/plan-checks'
import { config, gasto, ingreso, objective, position, snapshot, TODAY } from './fixtures'

const history3 = (): Movement[] => [...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]), ingreso('2026-09-01', 200_000)]
const CUSHION = () => objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })
const COCHE = () => objective({ name: 'Coche', targetCents: 2_000_000, priority: 2 })
const profile = (riskAttitude: RiskAttitude, horizon: Horizon, extra: MemoryFact[] = []): MemoryFact[] => [{ kind: 'riskAttitude', value: riskAttitude }, { kind: 'horizon', value: horizon }, ...extra]

function setup(liquidCents: number, objectives: Objective[], facts: MemoryFact[], positions: Position[] = []) {
  const movements = history3()
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  // Posiciones que no salen del líquido: el líquido es exactamente `liquidCents`.
  const ctx = buildFinancialContext(snapshot({ config: config(liquidCents - net), movements, objectives, positions }), TODAY)
  const decision = decide({ context: ctx, memory: { profileFacts: facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) } })
  return { plan: buildAllocationPlan(decision), objectives: decision.context.objectives, decision }
}
const step = <K extends PlanStep['kind']>(p: AllocationPlan, kind: K) => p.steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)

describe('tipo de cada inversión', () => {
  it('se deduce del nombre con las palabras de la Guía; sin pistas, «other»', () => {
    assert.equal(guessAssetType('Fondo indexado global'), 'global-equity')
    assert.equal(guessAssetType('Bitcoin'), 'risky')
    assert.equal(guessAssetType('Letras del Tesoro'), 'safe')
    assert.equal(guessAssetType('Mi hucha'), 'other')
  })

  it('el contexto lleva el tipo guardado o, si no hay, el deducido', () => {
    const ctx = buildFinancialContext(snapshot({ positions: [position({ name: 'Bitcoin', valueCents: 10_000 }), position({ name: 'Mi hucha', valueCents: 10_000, assetType: 'bonds' })] }), TODAY)
    assert.deepEqual(ctx.investments.positions.map((p) => p.assetType).sort(), ['bonds', 'risky'])
  })

  it('la copia de seguridad acepta los tipos válidos y rechaza el resto', () => {
    const file = (assetType: unknown) =>
      JSON.stringify({ format: BACKUP_FORMAT, version: 2, exportedAt: '2026-10-04T10:00:00.000Z', config: null, movements: [], objectives: [], memories: [], positions: [{ id: 'p', name: 'X', investedCents: 1, valueCents: 1, date: TODAY, assetType, createdAt: 1, updatedAt: 1 }] })
    assert.equal(parseBackup(file('bonds')).positions[0].assetType, 'bonds')
    assert.throws(() => parseBackup(file('acciones')))
  })
})

describe('tu mezcla real frente a la del plan', () => {
  it('cerca de tu mezcla (< 10 puntos): se reparte con los pesos de siempre', () => {
    const held = heldBySleeve([{ valueCents: 700_000, assetType: 'global-equity' }, { valueCents: 300_000, assetType: 'bonds' }])
    assert.equal(needsRebalance(held, { 'global-equity': 70, bonds: 30, risky: 0 }), false)
  })

  it('lejos de tu mezcla: lo nuevo va a lo que falta, sin vender (lo que sobra no recibe nada)', () => {
    const held = heldBySleeve([{ valueCents: 1_000_000, assetType: 'global-equity' }])
    const parts = rebalanceSplit(100_000, { 'global-equity': 70, bonds: 30, risky: 0 }, held)
    assert.deepEqual(parts.map((p) => [p.key, p.cents]), [['bonds', 100_000]])
  })

  it('reequilibrar nunca manda a la parte arriesgada más de su peso de la aportación', () => {
    const held = heldBySleeve([{ valueCents: 400_000, assetType: 'global-equity' }])
    const parts = rebalanceSplit(90_000, { 'global-equity': 90, bonds: 0, risky: 10 }, held)
    assert.deepEqual(Object.fromEntries(parts.map((p) => [p.key, p.cents])), { 'global-equity': 81_000, risky: 9_000 })
    assert.equal(parts.reduce((t, p) => t + p.cents, 0), 90_000)
  })

  it('el ahorro seguro y «otro» no cuentan en la mezcla', () => {
    assert.deepEqual(heldBySleeve([{ valueCents: 5_000, assetType: 'safe' }, { valueCents: 5_000, assetType: 'other' }]), { 'global-equity': 0, bonds: 0, risky: 0 })
  })

  it('en el plan: lo dice con tu mezcla real y la del plan', () => {
    const s = setup(800_000, [CUSHION(), COCHE()], profile('balanced', 'long'), [position({ name: 'Fondo indexado global', valueCents: 1_000_000 })])
    const invest = step(s.plan, 'invest-long-term')!
    assert.deepEqual(invest.rebalance, { heldPct: { 'global-equity': 100, bonds: 0, risky: 0 }, targetPct: { 'global-equity': 70, bonds: 30, risky: 0 } })
    assert.deepEqual(invest.mix.map((p) => p.key), ['bonds'])
    assert.match(describeStep(invest, s.plan, s.objectives).detail!, /Ahora tienes 100 % renta variable global, y tu mezcla es 70 % renta variable global y 30 % renta fija: por eso este mes va a lo que falta, sin vender nada/)
  })

  it('una caída fuerte de tus inversiones se comenta con calma; el plan no cambia', () => {
    const fund = position({ name: 'Fondo indexado global', investedCents: 1_000_000, valueCents: 800_000 })
    const s = setup(800_000, [CUSHION(), COCHE()], profile('dynamic', 'long'), [fund])
    const invest = step(s.plan, 'invest-long-term')!
    assert.equal(invest.drawdownPct, 20)
    assert.match(describeStep(invest, s.plan, s.objectives).note!, /valen un 20 % menos.*el plan no cambia por una caída/)
    assert.equal(invest.pct, 60, 'el porcentaje es el mismo que sin caída')
  })
})

describe('el porqué de cada paso', () => {
  it('cita tus respuestas del cuestionario', () => {
    const s = setup(800_000, [CUSHION(), COCHE()], profile('conservative', 'long'))
    const why = stepReasons(step(s.plan, 'invest-long-term')!, s.plan, s.decision.profile.fields)
    assert.ok(why.some((w) => w.includes('«Me agobiaría: prefiero no arriesgar»') && w.includes('más renta fija')))
    assert.ok(why.some((w) => w.includes('«En más de 5 años»')))
    assert.ok(why.some((w) => w.includes('objetivos pendientes')))
  })

  it('el colchón explica de dónde sale su tamaño', () => {
    const s = setup(100_000, [], profile('balanced', 'long', [{ kind: 'irregularIncome', value: true }]))
    const why = stepReasons(step(s.plan, 'create-cushion')!, s.plan, s.decision.profile.fields)
    assert.match(why[0], /«No, cambian bastante».*6 meses de gasto y no 3/)
  })
})

describe('lo que el plan sabe de ti (situación, personas a cargo, experiencia y pérdidas)', () => {
  // 3 meses cerrados con 1.000 € de gasto: el colchón por meses es gasto × meses.
  const cushionOf = (extra: MemoryFact[]) => setup(100_000, [], profile('balanced', 'long', extra)).plan.cushion!

  it('el colchón: 3 meses; 6 por tu cuenta o sin trabajo; 3 más con personas a cargo', () => {
    assert.equal(cushionOf([]).months, 3)
    assert.equal(cushionOf([{ kind: 'work', value: 'employee' }]).months, 3)
    assert.equal(cushionOf([{ kind: 'work', value: 'self-employed' }]).months, 6)
    assert.equal(cushionOf([{ kind: 'work', value: 'unemployed' }]).months, 6)
    assert.equal(cushionOf([{ kind: 'dependents', value: true }]).months, 6)
    assert.equal(cushionOf([{ kind: 'irregularIncome', value: true }, { kind: 'dependents', value: true }]).months, 9)
    assert.equal(cushionOf([{ kind: 'work', value: 'self-employed' }, { kind: 'dependents', value: true }]).targetCents, 900_000)
  })

  it('el porqué del colchón cita tu situación y las personas a tu cargo', () => {
    const s = setup(100_000, [], profile('balanced', 'long', [{ kind: 'work', value: 'self-employed' }, { kind: 'dependents', value: true }]))
    const why = stepReasons(step(s.plan, 'create-cushion')!, s.plan, s.decision.profile.fields)
    assert.ok(why.some((w) => w.includes('«Trabajo por mi cuenta»') && w.includes('6 meses')))
    assert.ok(why.some((w) => w.includes('3 meses más') && w.includes('9 en total')))
  })

  it('si una caída te obligaría a cambiar tus planes, dinámico se invierte como equilibrado', () => {
    const dynamic = step(setup(800_000, [CUSHION(), COCHE()], profile('dynamic', 'long')).plan, 'invest-long-term')!
    const s = setup(800_000, [CUSHION(), COCHE()], profile('dynamic', 'long', [{ kind: 'lossCapacity', value: 'low' }]))
    const capped = step(s.plan, 'invest-long-term')!
    assert.equal(dynamic.pct, 60)
    assert.equal(capped.pct, 40, 'el porcentaje de equilibrado')
    assert.ok(capped.mix.some((p) => p.key === 'bonds'), 'con renta fija, como equilibrado')
    const why = stepReasons(capped, s.plan, s.decision.profile.fields)
    assert.ok(why.some((w) => w.includes('«Sí, me obligaría a cambiar cosas»') && w.includes('equilibrada')))
  })

  it('con capacidad de asumir pérdidas, el perfil no cambia', () => {
    const s = setup(800_000, [CUSHION(), COCHE()], profile('dynamic', 'long', [{ kind: 'lossCapacity', value: 'high' }]))
    assert.equal(step(s.plan, 'invest-long-term')!.pct, 60)
  })

  it('sin experiencia invirtiendo no hay parte arriesgada, aunque se cumpla todo lo demás', () => {
    // Sin objetivos pendientes y con mucho dinero parado: con perfil dinámico y plazo largo habría parte arriesgada.
    const withRisky = step(setup(3_000_000, [CUSHION()], profile('dynamic', 'long')).plan, 'invest-long-term')!
    assert.ok(withRisky.mix.some((p) => p.key === 'risky'))
    const s = setup(3_000_000, [CUSHION()], profile('dynamic', 'long', [{ kind: 'investingExperience', value: 'none' }]))
    const invest = step(s.plan, 'invest-long-term')!
    assert.equal(invest.mix.some((p) => p.key === 'risky'), false)
    assert.ok(stepReasons(invest, s.plan, s.decision.profile.fields).some((w) => w.includes('«Nunca»') && w.includes('no hay parte arriesgada')))
  })

  it('el chat recibe el porqué y la respuesta sin IA lo incluye', () => {
    const { decision } = setup(800_000, [CUSHION(), COCHE()], profile('balanced', 'long'))
    const chat = chatPlanOf(decision)
    const invest = planForPrompt(chat).pasos.find((p) => p.titulo.includes('largo plazo'))
    assert.ok(invest?.porque && invest.porque.length > 0)
    assert.match(planLocalReply(chat), /Por qué: Sobre el riesgo respondiste/)
  })
})

describe('Tu decisión del mes', () => {
  it('una línea concreta por paso y una por cada tipo de inversión, con importes', () => {
    const s = setup(800_000, [CUSHION(), COCHE()], profile('balanced', 'long'))
    const items = monthChecklist(s.plan, s.objectives)
    assert.deepEqual(items.map((i) => i.id), ['invest:global-equity', 'invest:bonds', 'rest-to-objectives'])
    assert.equal(items[0].text, 'Invierte 280,00 € en renta variable global diversificada y de bajo coste')
    assert.deepEqual(items[0].invest, { sleeve: 'global-equity', cents: 28_000 })
    assert.equal(items[2].text, 'Deja 600,00 € en tu cuenta para tus objetivos')
  })

  it('sin colchón, lo primero es crearlo', () => {
    assert.equal(monthChecklist(setup(100_000, [], profile('balanced', 'long')).plan, [])[0].text, `Crea tu «${CUSHION_OBJECTIVE_NAME}» de 3.000,00 €`)
  })

  it('dinero parado: dice las dos formas', () => {
    const s = setup(800_000, [CUSHION()], profile('balanced', 'long'))
    assert.ok(monthChecklist(s.plan, s.objectives).some((i) => i.text === 'Decide qué hacer con tus 5.000,00 € sin destino: de una vez o 833,00 € al mes durante 6 meses'))
  })

  describe('lo marcado (Dexie)', () => {
    beforeEach(async () => {
      if (!db.isOpen()) await db.open()
      await clearAllData()
    })

    it('se marca y desmarca por mes, y «Borrar todos los datos» lo borra', async () => {
      await setPlanCheck('2026-10', 'invest:bonds', true)
      await setPlanCheck('2026-10', 'invest:bonds', true)
      await setPlanCheck('2026-10', 'rest-to-objectives', true)
      assert.deepEqual(await getPlanChecks('2026-10'), ['invest:bonds', 'rest-to-objectives'])
      assert.deepEqual(await getPlanChecks('2026-11'), [], 'cada mes empieza de cero')
      await setPlanCheck('2026-10', 'invest:bonds', false)
      assert.deepEqual(await getPlanChecks('2026-10'), ['rest-to-objectives'])
      await clearAllData()
      assert.deepEqual(await getPlanChecks('2026-10'), [])
    })
  })
})
