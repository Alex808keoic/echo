/**
 * Plomería del perfil hasta `decide()` y las reglas (fase 2 · bloque 4).
 *
 * `AxisInput.profile` se reconcilia una vez en `decide()`, llega a cada regla
 * como tercer parámetro y queda registrado en `decision.profile`. Estos tests
 * fijan la plomería y los perfiles que, por diseño, NO cambian nada: vacío,
 * mínimo de liquidez CUBIERTO, `irregularIncome: false` y prioridades que ya
 * coinciden con el orden del contexto. Cada comportamiento se prueba aparte:
 * `minLiquidityCents` (paso 2, `liquidity.test.ts`), `irregularIncome` (paso 3,
 * `irregular-income.test.ts`), `priorities` (paso 4, `priorities.test.ts`) y
 * `horizon`/`riskAttitude` (paso 5, `horizon-risk.test.ts`; solo texto, así
 * que no forman parte de la rejilla inerte).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { decide } from '../core/decision'
import { EMPTY_RECONCILED_PROFILE, reconcileProfile } from '../profile/derive'
import { EMPTY_PROFILE, type ReconciledProfile, type UserProfile } from '../profile/types'
import { detectSignals, RULES } from '../rules'
import type { AxisDecision, AxisInput, Signal } from '../types'
import { GOLDEN_SCENARIOS } from './golden-scenarios'

const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/**
 * Perfil inerte «completo»: prioridad al primer objetivo del contexto (si lo
 * hay: priorizar el que ya va primero no cambia nada), mínimo de liquidez
 * igual al líquido actual (cubierto) e ingresos declarados regulares. Sin
 * horizon ni riskAttitude: esas preferencias cambian el texto de
 * `investments.none` / `investments.concentration` siempre que existen.
 */
function fullProfile(input: AxisInput): UserProfile {
  const objectiveId = input.context.objectives[0]?.id ?? 'obj-inexistente'
  return {
    minLiquidityCents: Math.max(1, input.context.wealth.liquidCents),
    irregularIncome: false,
    priorities: [objectiveId],
    sources: { minLiquidityCents: 'm-l', irregularIncome: 'm-i', priorities: 'm-p' },
    conflicts: [{ kind: 'horizon', winnerId: 'm-h', loserIds: ['m-h-old'] }],
  }
}

/** Perfiles inertes: vacío, mínimo cubierto, ingresos regulares, prioridades que no reordenan, y todos juntos. */
function profileGrid(input: AxisInput): Array<[string, UserProfile]> {
  const full = fullProfile(input)
  return [
    ['vacío', EMPTY_PROFILE],
    ['minLiquidity (1 céntimo)', { minLiquidityCents: 1, sources: { minLiquidityCents: 'a' }, conflicts: [] }],
    ['minLiquidity (igual al líquido)', { minLiquidityCents: Math.max(1, input.context.wealth.liquidCents), sources: { minLiquidityCents: 'a' }, conflicts: [] }],
    ['irregularIncome=false', { irregularIncome: false, sources: { irregularIncome: 'a' }, conflicts: [] }],
    ['priorities (el primer objetivo, ya primero)', { priorities: full.priorities!, sources: { priorities: 'a' }, conflicts: [] }],
    ['completo', full],
  ]
}

const withoutProfile = ({ profile: _p, ...rest }: AxisDecision) => {
  void _p
  return rest
}

describe('AXIS · perfil · plomería hasta decide() y campos sin comportamiento', () => {
  it('detectSignals(ctx, market) ≡ detectSignals(ctx, market, EMPTY_RECONCILED_PROFILE)', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      const market = input.market ?? null
      assert.deepEqual(detectSignals(input.context, market, EMPTY_RECONCILED_PROFILE), detectSignals(input.context, market), name)
    }
  })

  it('decision.profile.fields es exactamente reconcileProfile(input.profile, ctx), una sola reconciliación', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      for (const [label, profile] of profileGrid(input)) {
        const expected = reconcileProfile(profile, input.context)
        const d = decide({ ...input, profile })
        assert.deepEqual(d.profile.fields, expected, `${name} · ${label}`)
        assert.deepEqual(reconcileProfile(d.profile.fields, input.context), d.profile.fields, `${name} · ${label}: reconciliar lo aplicado no cambia nada (idempotente)`)
      }
    }
  })

  it('PERFILES INERTES: irregularIncome=false, un mínimo cubierto y prioridades que no reordenan producen la misma decisión que sin perfil, salvo profile.fields', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      const baseline = withoutProfile(decide(input))
      for (const [label, profile] of profileGrid(input)) {
        const d = decide({ ...input, profile })
        assert.deepEqual(withoutProfile(d), baseline, `${name} · ${label}`)
        assert.deepEqual(d.profile.influence, [], `${name} · ${label}: la influencia empieza vacía`)
      }
    }
  })

  it('ninguna regla, ejecutada por separado con el perfil inerte completo, cambia sus señales ni produce profileInfluence', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      const market = input.market ?? null
      const full = reconcileProfile(fullProfile(input), input.context)
      for (const rule of RULES) {
        const plain: Signal[] = rule(input.context, market)
        const withProfile: Signal[] = rule(input.context, market, full)
        assert.deepEqual(withProfile, plain, `${name} · ${rule.name}`)
        for (const s of withProfile) assert.equal('profileInfluence' in s, false, `${name} · ${rule.name} · ${s.id}`)
      }
    }
  })

  it('la reconciliación se refleja en la decisión: prioridades sobre objetivos inexistentes o completados se descartan y se explican', () => {
    const scenario = GOLDEN_SCENARIOS.find((s) => s.name === 'objetivo-conseguido')!
    const completedId = scenario.input.context.objectives[0].id
    const profile: UserProfile = { priorities: ['no-existe', completedId], sources: { priorities: 'm-p' }, conflicts: [] }
    const d = decide({ ...scenario.input, profile })
    assert.equal(d.profile.fields.priorities, undefined)
    assert.equal(d.profile.fields.sources.priorities, undefined)
    assert.deepEqual(d.profile.fields.droppedPriorities, [
      { objectiveId: 'no-existe', reason: 'missing' },
      { objectiveId: completedId, reason: 'completed' },
    ])
    assert.deepEqual(withoutProfile(d), withoutProfile(decide(scenario.input)))
  })

  it('sin datos (level none) el perfil se reconcilia y se registra, y el resultado es idéntico al actual', () => {
    const scenario = GOLDEN_SCENARIOS.find((s) => s.name === 'sin-datos')!
    const d = decide({ ...scenario.input, profile: fullProfile(scenario.input) })
    assert.equal(d.level, 'none')
    assert.deepEqual(d.profile.influence, [])
    assert.deepEqual(d.profile.fields.droppedPriorities, [{ objectiveId: 'obj-inexistente', reason: 'missing' }])
    assert.deepEqual(withoutProfile(d), withoutProfile(decide(scenario.input)))
  })

  it('con perfil, la decisión sigue siendo determinista, serializable sin pérdida y no muta la entrada', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      const profile = fullProfile(input)
      const withProfile: AxisInput = { ...input, profile }
      const before = roundTrip(withProfile)
      const a = decide(withProfile)
      const b = decide(withProfile)
      assert.deepEqual(a, b, `${name}: determinista`)
      assert.deepEqual(roundTrip(a.profile), a.profile, `${name}: profile sin claves undefined`)
      assert.deepEqual(roundTrip(withProfile), before, `${name}: entrada intacta`)
      // El perfil aplicado no comparte referencias con la entrada.
      assert.notEqual(a.profile.fields, profile)
      assert.notEqual(a.profile.fields.priorities, profile.priorities)
    }
  })

  it('el perfil por defecto de las reglas es el vacío reconciliado, y está congelado', () => {
    const empty: ReconciledProfile = EMPTY_RECONCILED_PROFILE
    assert.deepEqual(empty, { sources: {}, conflicts: [], droppedPriorities: [] })
    assert.ok(Object.isFrozen(EMPTY_RECONCILED_PROFILE))
    assert.ok(Object.isFrozen(EMPTY_PROFILE))
  })
})
