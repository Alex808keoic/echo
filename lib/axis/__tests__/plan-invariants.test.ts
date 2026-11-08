/**
 * Las reglas de asesor (plan/invariants.ts) sobre cientos de situaciones generadas al azar: menores y
 * adultos, con y sin deudas, objetivos cercanos, lejanos y «sigue creciendo», inversiones ya hechas,
 * perfiles de todo tipo. La semilla es fija: si algo falla, el mismo caso vuelve a salir y el mensaje
 * dice cuál es. Cada fallo nuevo encontrado revisando casos reales debe acabar como una regla más.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan } from '../plan/allocation'
import { checkPlan } from '../plan/invariants'
import { HORIZONS, INVESTING_EXPERIENCE, LOSS_CAPACITIES, RISK_ATTITUDES, type MemoryFact } from '../profile/types'
import type { Debt, Movement, Objective, Position } from '../../types'
import { config, gasto, ingreso, objective, position, snapshot, TODAY } from './fixtures'

/** Generador pseudoaleatorio con semilla (mulberry32): mismos casos en cada ejecución. */
function rng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)],
    chance: (p: number) => next() < p,
  }
}

const monthsFromToday = (m: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + m)
  return d.toISOString().slice(0, 10)
}

interface Case {
  seed: number
  label: string
  run: () => ReturnType<typeof checkPlan>
}

function makeCase(seed: number): Case {
  const r = rng(seed)
  const minor = r.chance(0.3)
  const income = minor ? r.pick([2_000, 3_500, 5_000, 8_000]) : r.int(80, 400) * 1_000
  const spendRatio = r.pick([0.3, 0.6, 0.8, 0.95, 1.1])
  const spend = Math.round((income * spendRatio) / 100) * 100
  const movements: Movement[] = ['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, income), gasto(`2026-${m}-10`, spend, r.pick(['Supermercado', 'Restaurantes', 'Ropa'] as const))])
  const liquid = r.pick([0, 50_000, 110_000, 500_000, 2_000_000]) * (minor ? 0.2 : 1)

  const objectives: Objective[] = []
  const nGoals = r.int(0, 3)
  for (let i = 0; i < nGoals; i++) {
    const months = r.pick([6, 18, 30, 48, 70, 120])
    objectives.push(
      objective({
        id: `goal-${i}`,
        name: `Objetivo ${i + 1}`,
        targetCents: r.pick([100_000, 500_000, 2_000_000]),
        ...(r.chance(0.85) ? { targetDate: monthsFromToday(months) } : {}),
        ...(r.chance(0.35) ? { keepGrowing: true } : {}),
        priority: i + 2,
      }),
    )
  }
  if (r.chance(0.4)) objectives.push(objective({ id: 'cushion', name: 'Fondo de emergencia', targetCents: Math.max(spend * 6, 10_000), priority: 1 }))

  const debts: Debt[] = []
  if (!minor && r.chance(0.3))
    debts.push({ id: 'debt-1', name: 'Préstamo', balanceCents: r.pick([200_000, 1_000_000]), aprBp: r.pick([300, 650, 1_200, 2_200]), monthlyPaymentCents: r.pick([10_000, 25_000]), createdAt: 1, updatedAt: 1 } as Debt)

  const positions: Position[] = []
  if (r.chance(0.3)) positions.push(position({ name: 'Fondo indexado mundial', valueCents: r.pick([50_000, 300_000]), investedCents: 40_000, assetType: 'global-equity' } as Partial<Position> & { name: string; valueCents: number }))

  const facts: MemoryFact[] = []
  if (r.chance(0.9)) facts.push({ kind: 'riskAttitude', value: r.pick(RISK_ATTITUDES) })
  if (r.chance(0.9)) facts.push({ kind: 'horizon', value: r.pick(HORIZONS) })
  facts.push({ kind: 'adult', value: !minor })
  if (r.chance(0.6)) facts.push({ kind: 'irregularIncome', value: r.chance(0.5) })
  if (r.chance(0.6)) facts.push({ kind: 'lossCapacity', value: r.pick(LOSS_CAPACITIES) })
  if (r.chance(0.6)) facts.push({ kind: 'investingExperience', value: r.pick(INVESTING_EXPERIENCE) })
  if (r.chance(0.3)) facts.push({ kind: 'dependents', value: r.chance(0.5) })

  const label = `semilla ${seed}: ${minor ? 'menor' : 'adulto'}, ingreso ${income / 100} €, gasto ${spend / 100} €, líquido ${liquid / 100} €, ${objectives.length} objetivos${objectives.some((o) => o.keepGrowing) ? ' (con «sigue creciendo»)' : ''}, ${debts.length} deudas, ${positions.length} inversiones, perfil ${facts.map((f) => `${f.kind}=${String((f as { value?: unknown }).value)}`).join(' ')}`
  return {
    seed,
    label,
    run: () => {
      const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
      const ctx = buildFinancialContext(snapshot({ config: config(Math.round(liquid) - net), movements, objectives, positions, debts }), TODAY)
      const decision = decide({ context: ctx, memory: { profileFacts: facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) } })
      return checkPlan(buildAllocationPlan(decision), decision)
    },
  }
}

const CASES = 600

describe('reglas de asesor sobre situaciones generadas al azar', () => {
  it(`${CASES} situaciones: ningún plan incumple una regla`, () => {
    const failures: string[] = []
    for (let seed = 1; seed <= CASES; seed++) {
      const c = makeCase(seed)
      const violations = c.run()
      if (violations.length > 0) failures.push(`${c.label}\n    → ${violations.map((v) => `[${v.rule}] ${v.message}`).join('\n    → ')}`)
    }
    assert.equal(failures.length, 0, `${failures.length} de ${CASES} planes incumplen alguna regla:\n${failures.slice(0, 8).join('\n')}`)
  })
})

describe('reglas de asesor sobre casos reales revisados', () => {
  it('2026-11-08: menor, 35 € de paga, 24 € de gasto, 1.100 €, objetivo «sigue creciendo» a 2 años y medio', () => {
    const movements: Movement[] = ['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 3_500), gasto(`2026-${m}-10`, 2_400)])
    const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
    const objectives = [objective({ id: 'patrimonio', name: 'Patrimonio ideal 18 años', targetCents: 500_000, targetDate: '2029-03-15', keepGrowing: true })]
    const facts: MemoryFact[] = [
      { kind: 'riskAttitude', value: 'balanced' },
      { kind: 'horizon', value: 'medium' },
      { kind: 'irregularIncome', value: true },
      { kind: 'adult', value: false },
      { kind: 'lossCapacity', value: 'high' },
      { kind: 'investingExperience', value: 'some' },
      { kind: 'dependents', value: false },
      { kind: 'work', value: 'student' },
    ]
    const ctx = buildFinancialContext(snapshot({ config: config(109_937 - net), movements, objectives }), TODAY)
    const decision = decide({ context: ctx, memory: { profileFacts: facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) } })
    assert.deepEqual(checkPlan(buildAllocationPlan(decision), decision), [])
  })
})
