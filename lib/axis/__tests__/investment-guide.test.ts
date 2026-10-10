/**
 * Guía para invertir: información general sobre TIPOS de producto y si un tipo
 * encaja con el plan del usuario, sin cruzar la línea del asesoramiento: nunca
 * marcas, productos ni entidades concretas, ni «cómpralo».
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { productFit } from '../guide/fit'
import { AUTHORIZED_SERVICES, matchProductTypes, OFFICIAL_LINKS, PRODUCT_TYPES, type ProductType } from '../guide/products'
import { buildAllocationPlan, CUSHION_OBJECTIVE_NAME } from '../plan/allocation'
import type { MemoryFact } from '../profile/types'
import type { Movement, Objective } from '../../types'
import { config, gasto, ingreso, objective, snapshot, TODAY } from './fixtures'

const history3 = (): Movement[] => [
  ...['06', '07', '08'].flatMap((m) => [ingreso(`2026-${m}-01`, 200_000), gasto(`2026-${m}-10`, 100_000)]),
  ingreso('2026-09-01', 200_000),
  gasto('2026-09-05', 50_000),
]
function setup(liquidCents: number, facts: MemoryFact[], objectives: Objective[] = [objective({ name: CUSHION_OBJECTIVE_NAME, targetCents: 300_000, priority: 1 })]) {
  const movements = history3()
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  const ctx = buildFinancialContext(snapshot({ config: config(liquidCents - net), movements, objectives }), TODAY)
  const decision = decide({ context: ctx, memory: { profileFacts: facts.map((fact, i) => ({ id: `m-${i}`, updatedAt: i + 1, fact })) } })
  return { plan: buildAllocationPlan(decision), profile: decision.profile.fields }
}
const PROFILE: MemoryFact[] = [
  { kind: 'horizon', value: 'long' },
  { kind: 'riskAttitude', value: 'balanced' },
]
const byId = (id: string) => PRODUCT_TYPES.find((p) => p.id === id) as ProductType
const verdict = (id: string, s: ReturnType<typeof setup>, fee?: number) => productFit(byId(id), s.plan, s.profile, fee).verdict

describe('encaje con el plan', () => {
  const ready = setup(800_000, PROFILE)

  it('colchón completo y perfil: un indexado o un ETF encajan con el largo plazo', () => {
    assert.equal(verdict('fondo-indexado', ready), 'fits')
    assert.equal(verdict('etf', ready), 'fits')
  })

  it('cuentas, depósitos y letras encajan con el colchón y lo cercano', () => {
    for (const id of ['cuenta-deposito', 'letras', 'fondo-monetario']) assert.equal(verdict(id, ready), 'fits-short-term', id)
  })

  it('acciones sueltas y gestión activa: solo en parte; oro y cripto: fuera del plan', () => {
    assert.equal(verdict('acciones', ready), 'partial')
    assert.equal(verdict('fondo-activo', ready), 'partial')
    assert.equal(verdict('oro', ready), 'outside-plan')
    assert.equal(verdict('cripto', ready), 'outside-plan')
  })

  it('colchón a medias: invertir aún no; una cuenta, sí', () => {
    const incomplete = setup(100_000, PROFILE)
    assert.equal(verdict('fondo-indexado', incomplete), 'not-now')
    assert.equal(verdict('cuenta-deposito', incomplete), 'fits-short-term')
  })

  it('horizonte corto: no es para ese dinero', () => {
    assert.equal(verdict('etf', setup(800_000, [{ kind: 'horizon', value: 'short' }, { kind: 'riskAttitude', value: 'dynamic' }])), 'not-for-horizon')
  })

  it('sin perfil: primero responderlo', () => {
    assert.equal(verdict('fondo-indexado', setup(800_000, [])), 'not-now')
  })

  it('plan bloqueado (líquido negativo): no ahora, ni siquiera una cuenta', () => {
    assert.equal(verdict('cuenta-deposito', setup(-50_000, PROFILE)), 'not-now')
  })

  it('comisión alta para el tipo: se avisa; baja: no', () => {
    const high = productFit(byId('fondo-indexado'), ready.plan, ready.profile, 1.2)
    assert.ok(high.reasons.some((r) => /comisión anual del 1,2 % es alta/.test(r)))
    const low = productFit(byId('fondo-indexado'), ready.plan, ready.profile, 0.2)
    assert.ok(!low.reasons.some((r) => /es alta/.test(r)))
  })

  it('menor de edad: el aviso del adulto (salvo en lo de poco riesgo)', () => {
    const minor = setup(800_000, [...PROFILE, { kind: 'adult', value: false }])
    assert.ok(productFit(byId('etf'), minor.plan, minor.profile).reasons.some((r) => /menor de edad/.test(r)))
    assert.ok(!productFit(byId('cuenta-deposito'), minor.plan, minor.profile).reasons.some((r) => /menor de edad/.test(r)))
  })

  it('siempre comprobar que la entidad está registrada', () => {
    for (const p of PRODUCT_TYPES) assert.ok(productFit(p, ready.plan, ready.profile).checks.some((c) => /registrada en la CNMV/.test(c)), p.id)
  })
})

describe('sin cruzar la línea', () => {
  const allText = JSON.stringify({ PRODUCT_TYPES, AUTHORIZED_SERVICES, OFFICIAL_LINKS }) + JSON.stringify(PRODUCT_TYPES.map((p) => productFit(p, setup(800_000, PROFILE).plan, setup(800_000, PROFILE).profile)))

  it('ninguna marca, gestora, bróker ni producto concreto', () => {
    // Palabras completas: «indexa» (una gestora) no es «indexado».
    assert.doesNotMatch(allText, /\b(vanguard|ishares|amundi|blackrock|indexa|myinvestor|finizens|trade republic|degiro|revolut|binance|coinbase|nasdaq)\b|s&p 500/i)
  })

  it('ninguna orden de compra o venta dirigida al usuario', () => {
    // «se compra y vende en bolsa» o «un fondo que invierte» describen; lo que no puede haber son órdenes.
    assert.doesNotMatch(allText, /cómpralo|véndelo|te recomiendo (comprar|invertir|vender)|deberías (comprar|invertir|vender)|\baprovecha\b|\bcompra ya\b/i)
  })

  it('solo enlaces a organismos oficiales', () => {
    assert.ok(OFFICIAL_LINKS.every((l) => /^https:\/\/www\.(cnmv|bde|fgd)\.es$/.test(l.url)))
  })
})

describe('reconocer tipos de producto en un texto', () => {
  it('por sus palabras completas', () => {
    assert.deepEqual(matchProductTypes('¿Qué es un ETF?').map((p) => p.id), ['etf'])
    assert.deepEqual(matchProductTypes('Estoy mirando un fondo indexado o un depósito').map((p) => p.id), ['cuenta-deposito', 'fondo-indexado'])
    assert.deepEqual(matchProductTypes('¿Merece la pena el bitcoin?').map((p) => p.id), ['cripto'])
    assert.deepEqual(matchProductTypes('¿Cómo voy este mes?'), [])
    // «oro» no es «ahorro»: solo palabras completas.
    assert.deepEqual(matchProductTypes('Quiero ahorrar más'), [])
  })
})
