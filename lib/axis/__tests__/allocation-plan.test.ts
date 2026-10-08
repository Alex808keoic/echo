/**
 * Plan de reparto (fase 2b): qué hacer cada mes con lo que ahorras, sobre la
 * decisión de AXIS. Colchón primero, objetivos a corto plazo, un porcentaje a
 * largo plazo según el perfil (solo categoría) y el resto a los objetivos.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildMarketContext } from '../../market/relevance'
import { history, research } from '../../market/__tests__/fixtures'
import { buildAllocationPlan, CUSHION_OBJECTIVE_NAME, LONG_TERM_CATEGORY, type AllocationPlan, type PlanStep } from '../plan/allocation'
import type { MemoryFact } from '../profile/types'
import type { AxisMemory, MarketContext } from '../types'
import type { Movement, Objective } from '../../types'
import { config, gasto, healthyMovements, ingreso, NOW, objective, snapshot, TODAY } from './fixtures'

/** Junio, julio y agosto cerrados: 2.000 € de ingresos y 1.000 € de gastos cada mes; septiembre (en curso): +1.500 €. */
function history3(): Movement[] {
  return [
    ...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]),
    ingreso('2026-09-01', 200_000),
    gasto('2026-09-05', 50_000),
  ]
}
const NET = 450_000

interface Scenario {
  liquidCents?: number
  objectives?: Objective[]
  facts?: MemoryFact[]
  movements?: Movement[]
  market?: MarketContext | null
}
function decisionFor(s: Scenario = {}) {
  const movements = s.movements ?? history3()
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const ctx = buildFinancialContext(snapshot({ config: config((s.liquidCents ?? 800_000) - net), movements, objectives: s.objectives ?? [] }), TODAY)
  const memory: AxisMemory | undefined = s.facts ? { profileFacts: s.facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) } : undefined
  return decide({ context: ctx, ...(memory ? { memory } : {}), market: s.market ?? null })
}
const planFor = (s: Scenario = {}) => buildAllocationPlan(decisionFor(s))
const kinds = (p: AllocationPlan) => p.steps.map((s) => s.kind)
const step = <K extends PlanStep['kind']>(p: AllocationPlan, kind: K) => p.steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)

const CUSHION = (targetCents: number, priority = 1) => objective({ name: CUSHION_OBJECTIVE_NAME, targetCents, priority })
const PROFILE: MemoryFact[] = [
  { kind: 'horizon', value: 'long' },
  { kind: 'riskAttitude', value: 'balanced' },
]

describe('bloqueos: lo que AXIS ya ha decidido que va primero', () => {
  it('menos de 3 meses cerrados → registrar datos, sin reparto', () => {
    const p = planFor({ movements: healthyMovements() })
    assert.equal(p.status, 'blocked')
    assert.equal(p.blocker, 'insufficient-data')
    assert.deepEqual(p.steps, [{ kind: 'register-data', monthsNeeded: 2 }])
  })

  it('líquido negativo → volver a positivo, nada más', () => {
    const p = planFor({ liquidCents: -50_000 })
    assert.equal(p.blocker, 'negative-liquidity')
    assert.deepEqual(kinds(p), ['fix-negative-liquidity'])
  })

  it('gastas más de lo que ingresas este mes → ajustar el gasto', () => {
    const movements = [...history3(), gasto('2026-09-12', 300_000)]
    const p = planFor({ movements })
    assert.equal(p.blocker, 'overspending')
    assert.deepEqual(kinds(p), ['reduce-spending'])
  })

  it('ahorro habitual ≤ 0 → ajustar el gasto', () => {
    const movements = [...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 100_000), gasto(`2026-${m}-10`, 110_000)]), ingreso('2026-09-01', 100_000)]
    const p = planFor({ movements })
    assert.equal(p.blocker, 'no-surplus')
    assert.equal(p.monthly?.savingsCents, 0)
  })
})

describe('colchón: el «Fondo de emergencia», el primero del reparto', () => {
  it('sin objetivo → propone crearlo con 3 meses de gasto habitual', () => {
    const p = planFor({ liquidCents: 100_000 })
    assert.deepEqual(p.monthly, { savingsCents: 100_000, spendingCents: 100_000, months: 3 })
    assert.deepEqual(step(p, 'create-cushion'), { kind: 'create-cushion', targetCents: 300_000 })
    assert.equal(p.cushion?.source, 'months')
    assert.equal(p.cushion?.months, 3)
  })

  it('con ingresos irregulares, 6 meses', () => {
    const p = planFor({ liquidCents: 100_000, facts: [{ kind: 'irregularIncome', value: true }] })
    assert.equal(p.cushion?.targetCents, 600_000)
    assert.equal(p.cushion?.months, 6)
  })

  it('con un mínimo líquido declarado, ese mínimo', () => {
    const p = planFor({ liquidCents: 100_000, facts: [{ kind: 'minLiquidity', cents: 250_000 }] })
    assert.equal(p.cushion?.source, 'min-liquidity')
    assert.equal(p.cushion?.targetCents, 250_000)
  })

  it('la meta del objetivo es editable: si existe, manda (salvo que el mínimo declarado sea mayor)', () => {
    assert.equal(planFor({ objectives: [CUSHION(150_000)] }).cushion?.targetCents, 150_000)
    const both = planFor({ objectives: [CUSHION(150_000)], facts: [{ kind: 'minLiquidity', cents: 900_000 }] })
    assert.equal(both.cushion?.source, 'min-liquidity')
    assert.equal(both.cushion?.targetCents, 900_000)
  })

  it('si no es el primero del reparto, el primer paso es moverlo', () => {
    const p = planFor({ objectives: [objective({ name: 'Viaje', targetCents: 50_000, priority: 1 }), CUSHION(300_000, 2)] })
    assert.equal(p.steps[0].kind, 'move-cushion-first')
    assert.equal(p.cushion?.isFirst, false)
  })

  it('incompleto: todo el ahorro va al colchón y no se invierte', () => {
    const p = planFor({ liquidCents: 100_000, objectives: [CUSHION(300_000)], facts: PROFILE })
    assert.deepEqual(step(p, 'fill-cushion'), { kind: 'fill-cushion', monthlyCents: 100_000, remainingCents: 200_000, months: 2 })
    assert.equal(p.longTerm.reason, 'cushion-incomplete')
    assert.equal(step(p, 'invest-long-term'), undefined)
  })
})

describe('con el colchón completo', () => {
  const full = (extra: Scenario = {}) => planFor({ liquidCents: 800_000, objectives: [CUSHION(300_000), ...(extra.objectives ?? [])], facts: extra.facts ?? PROFILE })

  it('perfil equilibrado: 40 % a largo plazo como categoría y el resto a los objetivos', () => {
    const p = full()
    assert.deepEqual(p.longTerm, { pct: 40, monthlyCents: 40_000, reason: 'ok' })
    assert.deepEqual(step(p, 'invest-long-term'), { kind: 'invest-long-term', monthlyCents: 40_000, pct: 40, category: LONG_TERM_CATEGORY, adult: null })
    assert.deepEqual(step(p, 'rest-to-objectives'), { kind: 'rest-to-objectives', monthlyCents: 60_000 })
  })

  it('20 / 40 / 60 % según el perfil de riesgo', () => {
    for (const [value, pct] of [['conservative', 20], ['balanced', 40], ['dynamic', 60]] as const) {
      assert.equal(full({ facts: [{ kind: 'horizon', value: 'long' }, { kind: 'riskAttitude', value }] }).longTerm.pct, pct)
    }
  })

  it('sin perfil → no invierte y pide responder «Tu perfil»', () => {
    const p = full({ facts: [] })
    assert.equal(p.longTerm.reason, 'no-profile')
    assert.equal(p.steps[p.steps.length - 1].kind, 'answer-profile')
    assert.deepEqual(step(p, 'rest-to-objectives'), { kind: 'rest-to-objectives', monthlyCents: 100_000 })
  })

  it('horizonte corto → no invierte', () => {
    assert.equal(full({ facts: [{ kind: 'horizon', value: 'short' }, { kind: 'riskAttitude', value: 'dynamic' }] }).longTerm.reason, 'short-horizon')
  })

  it('objetivos con fecha en ≤ 24 meses: primero lo que necesitan; se invierte solo de lo que sobra', () => {
    const viaje = objective({ name: 'Viaje', targetCents: 650_000, targetDate: '2027-09-15', priority: 2 })
    const p = full({ objectives: [viaje] })
    const short = step(p, 'short-term-objectives')
    assert.ok(short && short.monthlyCents > 0 && short.objectiveIds.length === 1)
    const room = 100_000 - short.monthlyCents
    assert.equal(p.longTerm.monthlyCents, Math.floor((room * 0.4) / 100) * 100)
  })

  it('si los objetivos a corto plazo se llevan todo, no se invierte y se avisa', () => {
    const urgente = objective({ name: 'Matrícula', targetCents: 2_000_000, targetDate: '2026-12-15', priority: 2 })
    const p = full({ objectives: [urgente] })
    assert.equal(step(p, 'short-term-objectives')?.atRisk, true)
    assert.equal(p.longTerm.reason, 'no-room')
  })

  it('menor de edad: la inversión sigue como categoría, marcada para hacerla con un adulto', () => {
    assert.equal(step(full({ facts: [...PROFILE, { kind: 'adult', value: false }] }), 'invest-long-term')?.adult, false)
  })
})

describe('coherencia con AXIS', () => {
  it('si AXIS recomienda completar el colchón, el plan empieza por el colchón', () => {
    const d = decisionFor({ liquidCents: 100_000, facts: [{ kind: 'minLiquidity', cents: 300_000 }] })
    assert.equal(d.recommendation?.action.verb, 'complete-cushion')
    const first = buildAllocationPlan(d).steps[0].kind
    assert.ok(['create-cushion', 'move-cushion-first', 'fill-cushion'].includes(first), first)
  })

  it('el mercado no cambia el plan (ni con prudencia de mercado)', () => {
    const caution = { key: 'equity-global', label: 'Renta variable global', aliases: ['global'], note: 'Valoraciones exigentes.', stance: 'caution' as const }
    const market = buildMarketContext(research({ assetClasses: [caution] }), history, [], NOW)
    const base = { liquidCents: 800_000, objectives: [CUSHION(300_000)], facts: PROFILE }
    assert.deepEqual(planFor({ ...base, market }), planFor(base))
  })
})

describe('invariantes', () => {
  const scenarios: Scenario[] = [
    {},
    { liquidCents: 100_000 },
    { liquidCents: 800_000, objectives: [CUSHION(300_000)], facts: PROFILE },
    { liquidCents: 800_000, objectives: [CUSHION(300_000), objective({ name: 'Viaje', targetCents: 650_000, targetDate: '2027-09-15', priority: 2 })], facts: [...PROFILE, { kind: 'riskAttitude', value: 'dynamic' }] },
    { liquidCents: 50_000, facts: [{ kind: 'irregularIncome', value: true }] },
  ]

  it('importes en euros enteros y nunca más de lo que ahorras', () => {
    for (const s of scenarios) {
      const p = planFor(s)
      const monthly = p.steps.flatMap((x) => ('monthlyCents' in x ? [x.monthlyCents] : []))
      assert.ok(monthly.every((c) => c >= 0 && c % 100 === 0), JSON.stringify(monthly))
      assert.ok(monthly.reduce((a, b) => a + b, 0) <= (p.monthly?.savingsCents ?? 0))
    }
  })

  it('solo una categoría de inversión, nunca un producto', () => {
    for (const s of scenarios) {
      const text = JSON.stringify(planFor(s))
      assert.doesNotMatch(text, /etf|bitcoin|oro|acciones de|fondo indexado [A-Z]/i)
    }
  })

  it('determinista', () => {
    for (const s of scenarios) assert.deepEqual(planFor(s), planFor(s))
  })
})
