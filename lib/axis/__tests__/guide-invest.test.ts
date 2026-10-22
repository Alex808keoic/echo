/**
 * La guía con tus números (2026-10-21): cuánto deberías invertir, tu mezcla
 * parte por parte y comparar la comisión de dos opciones. Todo sale de «Tu
 * plan»; siempre tipos de producto.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { feeComparison, investEstimate, monthlyForType, sleeveGuide } from '../guide/invest'
import { PRODUCT_TYPES, type ProductType } from '../guide/products'
import { buildAllocationPlan, CUSHION_OBJECTIVE_NAME, type AllocationPlan, type PlanStep } from '../plan/allocation'
import type { MemoryFact } from '../profile/types'
import type { Movement } from '../../types'
import { config, gasto, ingreso, objective, position, snapshot, TODAY } from './fixtures'

// 3 meses cerrados: 2.000 € de ingresos y 1.000 € de gasto (1.000 € de ahorro al mes).
const history3 = (): Movement[] => [...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]), ingreso('2026-09-01', 200_000)]
const LONG_BALANCED: MemoryFact[] = [
  { kind: 'horizon', value: 'long' },
  { kind: 'riskAttitude', value: 'balanced' },
]

function setup(liquidCents: number, facts: MemoryFact[]) {
  const movements = history3()
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const objectives = [objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })]
  const ctx = buildFinancialContext(snapshot({ config: config(liquidCents - net), movements, objectives }), TODAY)
  const decision = decide({ context: ctx, memory: { profileFacts: facts.map((fact, i) => ({ id: `m-${i}`, updatedAt: i + 1, fact })) } })
  return { decision, plan: buildAllocationPlan(decision) }
}
const step = <K extends PlanStep['kind']>(p: AllocationPlan, kind: K) => p.steps.find((s): s is Extract<PlanStep, { kind: K }> => s.kind === kind)
const byId = (id: string) => PRODUCT_TYPES.find((p) => p.id === id) as ProductType

describe('cuánto deberías invertir', () => {
  it('con el colchón completo: lo de cada mes y el dinero sin destino, sacados de tu plan', () => {
    const { decision, plan } = setup(800_000, LONG_BALANCED)
    const e = investEstimate(decision, plan)
    assert.equal(e.kind, 'now')
    if (e.kind !== 'now') return
    assert.equal(e.monthlyCents, step(plan, 'invest-long-term')!.monthlyCents)
    assert.ok(e.monthlyCents > 0)
    assert.equal(e.lumpCents, step(plan, 'idle-money')!.idleCents)
    assert.equal(e.yearCents, e.monthlyCents * 12 + e.lumpCents)
    assert.equal(e.keptCents, 800_000 - e.lumpCents, 'lo que se queda es tu líquido menos lo que no tiene destino')
  })

  it('sin el colchón completo: ahora nada, cuánto falta y lo que invertirías después', () => {
    const { decision, plan } = setup(100_000, LONG_BALANCED)
    const e = investEstimate(decision, plan)
    assert.equal(e.kind, 'later')
    if (e.kind !== 'later') return
    assert.equal(e.reason, 'cushion')
    assert.equal(e.months, 2)
    // Lo de después es lo que invertiría el plan con el colchón justo completo (y nada sin destino).
    const full = setup(300_000, LONG_BALANCED)
    assert.equal(e.thenMonthlyCents, step(full.plan, 'invest-long-term')!.monthlyCents)
  })

  it('sin perfil no hay cifra: pide responder «Tu perfil»', () => {
    const { decision, plan } = setup(800_000, [])
    assert.deepEqual(investEstimate(decision, plan), { kind: 'none', reason: 'no-profile' })
  })

  it('con plazo corto: nada, el dinero sin destino va a ahorro seguro', () => {
    const { decision, plan } = setup(800_000, [{ kind: 'horizon', value: 'short' }, { kind: 'riskAttitude', value: 'balanced' }])
    assert.deepEqual(investEstimate(decision, plan), { kind: 'none', reason: 'short-horizon' })
  })
})

describe('tu mezcla, parte por parte', () => {
  const { decision, plan } = setup(800_000, LONG_BALANCED)
  const sleeves = sleeveGuide(plan, decision.profile.fields)

  it('una parte por cada tipo de la mezcla del plan, con sus importes', () => {
    assert.deepEqual(sleeves.map((s) => s.key), ['global-equity', 'bonds'])
    const invest = step(plan, 'invest-long-term')!
    for (const s of sleeves) assert.equal(s.monthlyCents, invest.mix.find((p) => p.key === s.key)!.cents)
  })

  it('los tipos que sirven para cada parte, y nada fuera de ella', () => {
    assert.deepEqual(sleeves[0].types.map((t) => t.type.id), ['fondo-indexado', 'etf'])
    assert.ok(sleeves[1].types.some((t) => t.type.id === 'fondo-renta-fija'))
    for (const s of sleeves) for (const t of s.types) assert.equal(t.fit.verdict, 'fits')
  })

  it('el porcentaje es el de tu mezcla también cuando el mes reequilibra', () => {
    assert.deepEqual(sleeves.map((s) => [s.pct, s.rebalancing]), [[70, false], [30, false]])
    const withFund = buildAllocationPlan(
      decide({
        context: buildFinancialContext(
          snapshot({ config: config(800_000 - 500_000), movements: history3(), objectives: [objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })], positions: [position({ name: 'Fondo indexado global', valueCents: 1_000_000 })] }),
          TODAY,
        ),
        memory: { profileFacts: LONG_BALANCED.map((fact, i) => ({ id: `m-${i}`, updatedAt: i + 1, fact })) },
      }),
    )
    const rebalanced = sleeveGuide(withFund, decision.profile.fields)
    assert.ok(rebalanced.every((s) => s.rebalancing))
    assert.equal(rebalanced.find((s) => s.key === 'bonds')?.pct, 30)
  })

  it('la aportación de un tipo es la de su parte; un tipo fuera de la mezcla no tiene', () => {
    assert.equal(monthlyForType(byId('fondo-indexado'), plan), sleeves[0].monthlyCents)
    assert.equal(monthlyForType(byId('cripto'), plan), null)
  })
})

describe('comparar la comisión de dos opciones', () => {
  const indexado = byId('fondo-indexado')

  it('la más barata te deja más; la diferencia es lo que se lleva la comisión', () => {
    const c = feeComparison(indexado, 10_000, 0.2, 1)!
    assert.equal(c.cheaper, 'a')
    assert.ok(c.aCents > c.bCents)
    assert.equal(c.diffCents, c.aCents - c.bCents)
    assert.equal(c.contributedCents, 10_000 * 12 * 20)
    assert.deepEqual([c.aHigh, c.bHigh], [false, true], 'por encima del 0,5 % es alta para un indexado')
  })

  it('con la misma comisión, ninguna es más barata', () => {
    const c = feeComparison(indexado, 10_000, 0.3, 0.3)!
    assert.equal(c.cheaper, null)
    assert.equal(c.diffCents, 0)
  })

  it('sin un crecimiento razonable que suponer, o con datos raros, no hay cuenta', () => {
    assert.equal(feeComparison(byId('cripto'), 10_000, 0.2, 1), null)
    assert.equal(feeComparison(indexado, 10_000, -1, 1), null)
    assert.equal(feeComparison(indexado, 0, 0.2, 1), null)
  })
})

describe('cómo reconocer uno bueno', () => {
  it('los tipos de tu mezcla y del ahorro seguro lo tienen', () => {
    for (const id of ['fondo-indexado', 'etf', 'fondo-renta-fija', 'etf-bonos', 'cuenta-deposito', 'letras', 'fondo-monetario']) assert.ok((byId(id).choose ?? []).length >= 3, id)
  })
})
