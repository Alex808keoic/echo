/**
 * «Cómo debería repartirse tu dinero»: el patrimonio de hoy repartido como lo
 * haría el plan, comparado con cómo lo tienes.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllocationPlan, CUSHION_OBJECTIVE_NAME } from '../plan/allocation'
import { idealSplit, splitHeadline } from '../plan/ideal-split'
import type { MemoryFact, RiskAttitude, Horizon } from '../profile/types'
import type { Movement, Objective, Position } from '../../types'
import { config, gasto, ingreso, objective, position, snapshot, TODAY } from './fixtures'

const history3 = (): Movement[] => [...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]), ingreso('2026-09-01', 200_000)]
const CUSHION = () => objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })
const profile = (riskAttitude: RiskAttitude, horizon: Horizon): MemoryFact[] => [{ kind: 'riskAttitude', value: riskAttitude }, { kind: 'horizon', value: horizon }]

function split(liquidCents: number, objectives: Objective[], facts: MemoryFact[], positions: Position[] = []) {
  const movements = history3()
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const ctx = buildFinancialContext(snapshot({ config: config(liquidCents - net), movements, objectives, positions }), TODAY)
  const decision = decide({ context: ctx, memory: { profileFacts: facts.map((fact, i) => ({ id: `mem-${i}`, updatedAt: i + 1, fact })) } })
  return idealSplit(buildAllocationPlan(decision), decision)
}
const ready = (s: ReturnType<typeof split>) => {
  assert.equal(s.kind, 'ready')
  return s as Extract<typeof s, { kind: 'ready' }>
}
const amounts = (s: ReturnType<typeof ready>) => Object.fromEntries(s.parts.map((p) => [p.key, p.cents]))

describe('idealSplit', () => {
  it('colchón primero y el resto con tu mezcla; los porcentajes suman 100', () => {
    const s = ready(split(1_000_000, [CUSHION()], profile('balanced', 'long')))
    assert.deepEqual(amounts(s), { cushion: 300_000, 'global-equity': 490_000, bonds: 210_000 })
    assert.equal(s.parts.reduce((t, p) => t + p.pct, 0), 100)
    assert.equal(s.totalCents, 1_000_000)
  })

  it('compara con lo que tienes y dice qué se aleja más', () => {
    const s = ready(split(1_000_000, [CUSHION()], profile('balanced', 'long')))
    const safe = s.comparison.find((c) => c.group === 'safe')!
    assert.deepEqual([safe.idealPct, safe.actualPct], [30, 100])
    assert.match(s.headline, /^Tienes el 100 % en tu cuenta y en ahorro seguro; lo recomendado es el 30 %./)
    assert.match(s.headline, /dinero quieto/)
  })

  it('objetivo cercano en cuenta; el lejano, invertido a largo plazo sin parte arriesgada', () => {
    const goals = [
      CUSHION(),
      objective({ name: 'Viaje', targetCents: 200_000, priority: 2, targetDate: '2027-06-01' }),
      objective({ name: 'Piso', targetCents: 400_000, priority: 3, targetDate: '2033-01-01' }),
    ]
    const s = ready(split(1_000_000, goals, profile('dynamic', 'long')))
    const a = amounts(s)
    assert.equal(a.cushion, 300_000)
    assert.equal(a.objectives, 200_000)
    assert.equal(a.risky ?? 0, 0)
    assert.equal(a['global-equity'], 500_000)
  })

  it('lo que tienes invertido cuenta por su tipo; el ahorro seguro, con la cuenta', () => {
    const s = ready(
      split(500_000, [CUSHION()], profile('balanced', 'long'), [
        position({ name: 'Fondo indexado global', valueCents: 300_000 }),
        position({ name: 'Depósito', valueCents: 200_000, assetType: 'safe' }),
      ]),
    )
    const actual = Object.fromEntries(s.comparison.map((c) => [c.group, c.actualCents]))
    assert.deepEqual(actual, { safe: 700_000, 'global-equity': 300_000, bonds: 0 })
  })

  it('con plazo corto, lo que sobra va a ahorro seguro', () => {
    const s = ready(split(1_000_000, [CUSHION()], profile('dynamic', 'short')))
    assert.deepEqual(amounts(s), { cushion: 300_000, 'safe-savings': 700_000 })
  })

  it('sin perfil o sin patrimonio no recomienda nada', () => {
    assert.equal(split(1_000_000, [CUSHION()], []).kind, 'no-profile')
    assert.equal(split(0, [CUSHION()], profile('balanced', 'long')).kind, 'empty')
  })

  it('cerca de lo recomendado, lo dice', () => {
    assert.match(splitHeadline([{ group: 'safe', label: 'En cuenta y ahorro seguro', idealPct: 30, actualPct: 33, actualCents: 0 }]), /bien repartido/)
  })

  it('demasiado en un tipo: nunca propone vender', () => {
    const h = splitHeadline([{ group: 'risky', label: 'Parte arriesgada', idealPct: 0, actualPct: 20, actualCents: 0 }])
    assert.match(h, /No hace falta vender/)
  })
})
