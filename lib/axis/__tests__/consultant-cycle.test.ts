/**
 * El ciclo del consultor (2026-10-17): inflación en el plan, proyección del
 * patrimonio, revisión del mes que acaba y recordatorios.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan, CUSHION_OBJECTIVE_NAME, type AllocationPlan, type PlanStep } from '../plan/allocation'
import { describeStep } from '../plan/describe'
import { stepReasons } from '../plan/why'
import { chatPlanOf, planForPrompt } from '../plan/chat'
import { INFLATION_ASSUMPTION_PCT, inflationFrom, todayValueCents, yearlyLossCents, type InflationRef } from '../plan/inflation'
import { projectWealth } from '../plan/projection'
import { reviewMonth } from '../plan/review'
import { dueReminders } from '../../reminders'
import type { MarketContext } from '../../market/types'
import type { MemoryFact } from '../profile/types'
import type { Movement, Objective, Position } from '../../types'
import { db } from '../../db/db'
import { clearAllData } from '../../db/backup'
import { getPlanMonth, savePlannedMonth, setPlanCheck } from '../../db/plan-checks'
import { config, gasto, ingreso, objective, position, snapshot, TODAY } from './fixtures'

const history3 = (): Movement[] => [...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]), ingreso('2026-09-01', 200_000)]
const CUSHION = () => objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })
const COCHE = () => objective({ name: 'Coche', targetCents: 2_000_000, priority: 2 })
const PROFILE: MemoryFact[] = [
  { kind: 'riskAttitude', value: 'balanced' },
  { kind: 'horizon', value: 'long' },
]
const IPC: InflationRef = { pct: 4.9, source: 'ine', asOf: '2026-09' }

function setup(liquidCents: number, objectives: Objective[], facts: MemoryFact[], inflation?: InflationRef, positions: Position[] = []) {
  const movements = history3()
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const ctx = buildFinancialContext(snapshot({ config: config(liquidCents - net), movements, objectives, positions }), TODAY)
  const decision = decide({ context: ctx, memory: { profileFacts: facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) } })
  return { plan: buildAllocationPlan(decision, inflation ? { inflation } : {}), objectives: decision.context.objectives, decision, ctx }
}
const step = <K extends PlanStep['kind']>(p: AllocationPlan, kind: K) => p.steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)

const market = (freshness: 'fresh' | 'stale'): Pick<MarketContext, 'keyIndicators'> => ({
  keyIndicators: [{ key: 'ine-ipc', label: 'IPC España (interanual)', group: 'inflation', value: 4.9, unit: '%', asOf: '2026-09', changePct: 0.6, source: 'INE', fetchedAt: '2026-10-17T10:00:00Z', freshness }],
})

describe('inflación', () => {
  it('usa el IPC del INE solo si está vigente; si no, el objetivo del BCE, dicho como supuesto', () => {
    assert.deepEqual(inflationFrom(market('fresh')), { pct: 4.9, source: 'ine', asOf: '2026-09' })
    assert.deepEqual(inflationFrom(market('stale')), { pct: INFLATION_ASSUMPTION_PCT, source: 'assumption' })
    assert.deepEqual(inflationFrom(null), { pct: INFLATION_ASSUMPTION_PCT, source: 'assumption' })
  })

  it('cuentas: pérdida de poder de compra en un año y valor en euros de hoy', () => {
    assert.equal(yearlyLossCents(1_100_000, IPC), 53_900)
    assert.equal(todayValueCents(1_000_000, 10, { pct: 2, source: 'assumption' }), 820_348)
  })

  it('el dinero parado dice cuánto pierde al año con la inflación', () => {
    const s = setup(800_000, [CUSHION()], PROFILE, IPC)
    const idle = step(s.plan, 'idle-money')!
    assert.match(describeStep(idle, s.plan, s.objectives).detail!, /Quieto en la cuenta, con una inflación del 4,9 % \(IPC de España, INE\), pierde unos 245,00 € de poder de compra al año\./)
  })

  it('el colchón propone una cuenta remunerada o Letras, y el porqué de invertir menciona la inflación', () => {
    const fill = setup(100_000, [CUSHION()], PROFILE, IPC)
    assert.match(describeStep(step(fill.plan, 'fill-cushion')!, fill.plan, fill.objectives).note!, /cuenta remunerada o en Letras del Tesoro/)
    const s = setup(800_000, [CUSHION(), COCHE()], PROFILE, IPC)
    assert.ok(stepReasons(step(s.plan, 'invest-long-term')!, s.plan, s.decision.profile.fields).some((w) => /crecer más que la inflación/.test(w)))
  })

  it('sin inflación dada, los textos son los de siempre (y los importes nunca cambian)', () => {
    const without = setup(800_000, [CUSHION()], PROFILE)
    const withIpc = setup(800_000, [CUSHION()], PROFILE, IPC)
    assert.doesNotMatch(describeStep(step(without.plan, 'idle-money')!, without.plan, without.objectives).detail!, /inflación/)
    assert.deepEqual(withIpc.plan.steps, without.plan.steps)
  })

  it('el chat recibe la inflación con el mercado', () => {
    const { decision } = setup(800_000, [CUSHION()], PROFILE)
    const idle = planForPrompt(chatPlanOf(decision, market('fresh') as MarketContext)).pasos.find((p) => p.titulo.includes('sin destino'))
    assert.match(idle?.detalle ?? '', /4,9 %/)
  })
})

describe('proyección del patrimonio', () => {
  it('normal entre «si va mal» y «si va bien»; invertir crece más que lo aportado', () => {
    const s = setup(800_000, [CUSHION(), COCHE()], PROFILE, IPC)
    const p = projectWealth(s.plan, s.ctx, 10, IPC)!
    assert.ok(p.badCents < p.midCents && p.midCents < p.goodCents)
    assert.ok(p.midCents > p.contributedCents)
    assert.equal(p.contributedCents, 800_000 + 100_000 * 120)
  })

  it('en euros de hoy, lo que se queda quieto pierde valor', () => {
    const s = setup(800_000, [CUSHION(), COCHE()], PROFILE, IPC)
    const p = projectWealth(s.plan, s.ctx, 10, IPC)!
    assert.ok(p.stillTodayCents < p.contributedCents)
    assert.equal(p.stillTodayCents, Math.round(todayValueCents(p.contributedCents, 10, IPC) / 100) * 100)
  })

  it('sin parte invertida (sin perfil), lo normal es lo aportado: el líquido no crece', () => {
    const s = setup(800_000, [CUSHION(), COCHE()], [], IPC)
    const p = projectWealth(s.plan, s.ctx, 5, IPC)!
    assert.equal(p.midCents, p.contributedCents)
    assert.equal(p.badCents, p.goodCents)
  })

  it('un plan bloqueado no se proyecta', () => {
    assert.equal(projectWealth(setup(-50_000, [], PROFILE).plan, setup(-50_000, [], PROFILE).ctx, 10, IPC), null)
  })
})

describe('revisión del mes que acaba', () => {
  // Hoy (fixtures) es 2026-09-15: se revisa agosto.
  const snap = (positions: Position[] = []) => ({ config: config(500_000), movements: history3(), positions })
  const planned = { savingsCents: 100_000, investCents: 40_000, items: 3 }

  it('según el plan: ahorró lo previsto e invirtió lo que tocaba', () => {
    const r = reviewMonth({ snapshot: snap([position({ name: 'Fondo', valueCents: 40_000, date: '2026-08-12' })]), asOf: TODAY, planned, currentPlanned: planned, doneCount: 3, inflation: IPC })!
    assert.equal(r.month, '2026-08')
    assert.equal(r.verdict, 'on-track')
    assert.ok(r.lines.includes('Ahorraste 1.000,00 €; tu plan contaba con unos 1.000,00 €.'))
    assert.ok(r.lines.includes('Invertiste 400,00 € de los 400,00 € que proponía el plan.'))
    assert.ok(r.lines.includes('Marcaste 3 de 3 pasos de «Tu decisión del mes».'))
    assert.equal(r.next, 'Vas según tu plan: sigue igual este mes.')
    assert.equal(r.usesCurrentPlan, false)
  })

  it('sin inversión apuntada: «en parte», y lo siguiente es invertir', () => {
    const r = reviewMonth({ snapshot: snap(), asOf: TODAY, planned, currentPlanned: planned, doneCount: 1, inflation: IPC })!
    assert.equal(r.verdict, 'partial')
    assert.ok(r.lines.includes('No apuntaste ninguna inversión; el plan proponía 400,00 €.'))
    assert.match(r.next, /intenta hacer la inversión/)
  })

  it('cuenta el dinero líquido del mes y lo que le costó la inflación', () => {
    const r = reviewMonth({ snapshot: snap(), asOf: TODAY, planned, currentPlanned: planned, doneCount: 0, inflation: IPC })!
    assert.ok(r.lines.includes('Tu dinero líquido pasó de 7.000,00 € a 8.000,00 €.'))
    assert.ok(r.lines.some((l) => /perdió unos 3\d,00 € de poder de compra este mes/.test(l)))
  })

  it('sin foto del plan de ese mes, compara con el actual y lo dice', () => {
    assert.equal(reviewMonth({ snapshot: snap(), asOf: TODAY, planned: null, currentPlanned: planned, doneCount: 0, inflation: IPC })!.usesCurrentPlan, true)
  })

  it('sin movimientos ese mes, no hay revisión', () => {
    assert.equal(reviewMonth({ snapshot: { config: null, movements: [], positions: [] }, asOf: TODAY, planned, currentPlanned: planned, doneCount: 0, inflation: IPC }), null)
  })

  describe('foto del plan (Dexie)', () => {
    beforeEach(async () => {
      if (!db.isOpen()) await db.open()
      await clearAllData()
    })

    it('guardar la foto conserva lo marcado, y marcar conserva la foto', async () => {
      await setPlanCheck('2026-10', 'invest:bonds', true)
      await savePlannedMonth('2026-10', { savingsCents: 1, investCents: 2, mix: [], items: 3 })
      await setPlanCheck('2026-10', 'rest-to-objectives', true)
      const entry = await getPlanMonth('2026-10')
      assert.deepEqual(entry?.done, ['invest:bonds', 'rest-to-objectives'])
      assert.deepEqual(entry?.planned, { savingsCents: 1, investCents: 2, mix: [], items: 3 })
    })
  })
})

describe('recordatorios', () => {
  const base = { checklist: { items: 4, done: 0 }, hasRecurringIncome: false, incomeThisMonth: 0, positionsUpdatedAt: [] as number[], now: Date.parse('2026-10-17T10:00:00Z') }
  const ids = (today: string, extra: Partial<typeof base> = {}) => dueReminders({ ...base, ...extra, today }).map((r) => r.id)

  it('días 1–3: tu decisión del mes está lista (si no has marcado nada)', () => {
    assert.deepEqual(ids('2026-10-02'), ['month-ready'])
    assert.deepEqual(ids('2026-10-02', { checklist: { items: 4, done: 1 } }), [])
    assert.deepEqual(ids('2026-10-05'), [])
  })

  it('desde el día 10, ingreso fijo declarado y ningún ingreso: recuerda registrarlo', () => {
    assert.ok(ids('2026-10-12', { hasRecurringIncome: true }).includes('income-missing'))
    assert.ok(!ids('2026-10-12', { hasRecurringIncome: true, incomeThisMonth: 3_500 }).includes('income-missing'))
    assert.ok(!ids('2026-10-08', { hasRecurringIncome: true }).includes('income-missing'))
  })

  it('inversiones sin actualizar más de 30 días', () => {
    const old = Date.parse('2026-09-01T10:00:00Z')
    const recent = Date.parse('2026-10-10T10:00:00Z')
    const r = dueReminders({ ...base, today: '2026-10-17', positionsUpdatedAt: [old, recent] })
    assert.deepEqual(r.map((x) => x.text), ['Una inversión lleva más de 30 días sin actualizar su valor.'])
  })

  it('desde el día 25, pasos pendientes de tu decisión del mes', () => {
    assert.deepEqual(dueReminders({ ...base, today: '2026-10-26', checklist: { items: 4, done: 3 } }).map((r) => r.text), ['Te queda 1 paso de tu decisión del mes.'])
    assert.deepEqual(ids('2026-10-26', { checklist: { items: 4, done: 4 } }), [])
  })
})
