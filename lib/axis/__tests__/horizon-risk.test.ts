/**
 * Perfil · `horizon` y `riskAttitude` (fase 2 · bloque 4 · paso 5).
 *
 * Preferencias declaradas: solo cambian la LECTURA, nunca la decisión.
 *   horizon       → interpretación de `investments.none`
 *   riskAttitude  → interpretación de `investments.concentration`
 * Ni prioridad, ni hechos, ni recomendación/acción, ni alternativas, ni
 * confianza, ni nivel, ni ninguna otra señal. La única fuente válida es el
 * perfil reconciliado (nunca `AxisMemory.preferences.riskAttitude`).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { render } from '../compose'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { knownEntities } from '../core/semantic'
import { LOCAL_RULES_ENGINE_INFO } from '../local-engine'
import { HORIZONS, PROFILE_EFFECTS, RISK_ATTITUDES, type Horizon, type RiskAttitude, type UserProfile } from '../profile/types'
import { horizonOf, riskAttitudeOf } from '../rules/shared'
import type { AxisDecision, AxisInput, AxisMemory, FinancialContext, Signal } from '../types'
import { checkAdvice } from '../../text/advice'
import { config, gasto, healthyMovements, ingreso, NOW, objective, position, snapshot, TODAY } from './fixtures'
import { GOLDEN_SCENARIOS } from './golden-scenarios'

const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const withoutProfile = ({ profile: _p, ...rest }: AxisDecision) => {
  void _p
  return rest
}
const byId = (signals: Signal[]) => new Map(signals.map((s) => [s.id, s]))

const TEXT_SIGNALS = new Set(['investments.none', 'investments.concentration'])
const TEXT_FIELDS = new Set(['horizon', 'riskAttitude'])

/**
 * Forma de una decisión SIN lo único que horizon/riskAttitude pueden cambiar:
 * la interpretación de las dos señales de texto (allá donde aparezcan), sus
 * entradas de influencia por esos campos, y los propios campos del perfil.
 */
function stripTextPreferences(d: AxisDecision) {
  const strip = (s: Signal): Signal => {
    const influence = (s.profileInfluence ?? []).filter((i) => !TEXT_FIELDS.has(i.field))
    const { profileInfluence: _p, ...rest } = s
    void _p
    return { ...rest, ...(TEXT_SIGNALS.has(s.id) ? { interpretation: '<texto>' } : {}), ...(influence.length > 0 ? { profileInfluence: influence } : {}) }
  }
  const { horizon: _h, riskAttitude: _r, sources, ...fields } = d.profile.fields
  void _h
  void _r
  const { horizon: _sh, riskAttitude: _sr, ...restSources } = sources
  void _sh
  void _sr
  return {
    ...d,
    signals: d.signals.map(strip),
    lead: d.lead ? strip(d.lead) : null,
    relevant: d.relevant.map(strip),
    profile: { fields: { ...fields, sources: restSources }, influence: d.profile.influence.filter((i) => !TEXT_FIELDS.has(i.field)) },
  }
}

/* --------------------------------- contextos -------------------------------- */

const A = () => objective({ id: 'obj-a', name: 'Alfa', targetCents: 500_000, currentCents: 100_000 })
const B = () => objective({ id: 'obj-b', name: 'Beta', targetCents: 400_000, currentCents: 50_000 })
const ctxOf = (extra: Partial<Parameters<typeof snapshot>[0]> = {}, movements = healthyMovements()) => buildFinancialContext(snapshot({ config: config(100_000), movements, ...extra }), TODAY)
/** Sin posiciones → `investments.none`. */
const noPositions = () => ctxOf({ objectives: [A(), B()] })
/** Dos posiciones, 80 % / 20 % → `investments.concentration` (+ `investments.manual-values`). */
const concentrated = () => ctxOf({ objectives: [A(), B()], positions: [position({ id: 'p-big', name: 'Grande', investedCents: 400_000, valueCents: 400_000 }), position({ id: 'p-small', name: 'Pequeña', investedCents: 100_000, valueCents: 100_000 })] })
/** Dos posiciones repartidas 50/50 → ni none ni concentration. */
const balanced = () => ctxOf({ positions: [position({ id: 'p1', name: 'Uno', investedCents: 100_000, valueCents: 100_000 }), position({ id: 'p2', name: 'Dos', investedCents: 100_000, valueCents: 100_000 })] })
/** Critical (gastos > ingresos) con concentración y caída de ingresos. */
const critical = () =>
  ctxOf({ objectives: [A(), B()], positions: [position({ id: 'p-big', name: 'Grande', investedCents: 400_000, valueCents: 400_000 }), position({ id: 'p-small', name: 'Pequeña', investedCents: 100_000, valueCents: 100_000 })] }, [ingreso('2026-08-01', 200_000), gasto('2026-08-10', 50_000), ingreso('2026-09-01', 150_000), gasto('2026-09-05', 120_000, 'Comida'), gasto('2026-09-08', 60_000, 'Salidas')])

const CONTEXTS: Array<[string, FinancialContext]> = [
  ['sin posiciones', noPositions()],
  ['concentrada', concentrated()],
  ['equilibrada', balanced()],
  ['critical + concentrada', critical()],
  ...GOLDEN_SCENARIOS.map(({ name, input }) => [`golden:${name}`, input.context] as [string, FinancialContext]),
]

const withHorizon = (value: Horizon, sourceId = 'mem-h'): UserProfile => ({ horizon: value, sources: { horizon: sourceId }, conflicts: [] })
const withRisk = (value: RiskAttitude, sourceId = 'mem-r'): UserProfile => ({ riskAttitude: value, sources: { riskAttitude: sourceId }, conflicts: [] })

const NONE_DEFAULT = 'Eso no es bueno ni malo por sí mismo; depende de para qué es el dinero y de cuándo lo necesitas.'
const CONCENTRATION_DEFAULT = 'La evolución de tu parte invertida depende casi por completo de una sola posición.'

/** Todo lo que NO es la interpretación: debe ser idéntico. */
const exceptInterpretation = (s: Signal) => {
  const { interpretation: _i, profileInfluence: _p, ...rest } = s
  void _i
  void _p
  return rest
}

describe('AXIS · perfil · horizon', () => {
  it('sin horizon (ausente, o sin memoria de origen) → comportamiento actual', () => {
    for (const [name, ctx] of CONTEXTS) {
      const plain = decide({ context: ctx })
      for (const profile of [{ sources: {}, conflicts: [] }, { horizon: 'long', sources: {}, conflicts: [] }] as UserProfile[]) {
        const d = decide({ context: ctx, profile })
        assert.deepEqual(withoutProfile(d), withoutProfile(plain), name)
        assert.deepEqual(d.profile.influence, [], name)
      }
    }
    assert.equal(horizonOf({ horizon: 'long', sources: {}, conflicts: [], droppedPriorities: [] }), null)
  })

  it('cada horizon válido cambia SOLO la interpretación de investments.none, con influencia trazable', () => {
    const ctx = noPositions()
    const plain = decide({ context: ctx })
    const before = byId(plain.signals).get('investments.none')!
    assert.equal(before.interpretation, NONE_DEFAULT)
    const seen = new Set<string>()
    for (const h of HORIZONS) {
      const d = decide({ context: ctx, profile: withHorizon(h, `mem-h-${h}`) })
      const after = byId(d.signals).get('investments.none')!
      assert.notEqual(after.interpretation, NONE_DEFAULT, h)
      assert.match(after.interpretation, /horizonte/, h)
      assert.ok(!seen.has(after.interpretation), `${h}: texto distinto por horizonte`)
      seen.add(after.interpretation)
      assert.deepEqual(exceptInterpretation(after), exceptInterpretation(before), `${h}: todo lo demás idéntico`)
      assert.equal(after.priority, 'low')
      assert.equal('recommendation' in after, false)
      assert.deepEqual(after.profileInfluence, [{ field: 'horizon', sourceMemoryId: `mem-h-${h}`, signalId: 'investments.none', effect: 'interpretation' }])
      // Solo esa señal cambia.
      for (const s of d.signals) if (s.id !== 'investments.none') assert.deepEqual(s, byId(plain.signals).get(s.id), `${h} · ${s.id}`)
      assert.deepEqual(d.profile.influence, after.profileInfluence)
      assert.deepEqual(d.recommendation, plain.recommendation, h)
      assert.equal(d.confidence, plain.confidence, h)
    }
  })

  it('horizon no toca investments.concentration ni nada cuando no hay investments.none', () => {
    for (const ctx of [concentrated(), balanced(), critical()]) {
      const plain = decide({ context: ctx })
      for (const h of HORIZONS) {
        const d = decide({ context: ctx, profile: withHorizon(h) })
        assert.deepEqual(withoutProfile(d), withoutProfile(plain), h)
        assert.deepEqual(d.profile.influence, [], h)
      }
    }
  })
})

describe('AXIS · perfil · riskAttitude', () => {
  it('sin riskAttitude (ausente, o sin memoria de origen) → comportamiento actual', () => {
    for (const [name, ctx] of CONTEXTS) {
      const plain = decide({ context: ctx })
      const d = decide({ context: ctx, profile: { riskAttitude: 'conservative', sources: {}, conflicts: [] } })
      assert.deepEqual(withoutProfile(d), withoutProfile(plain), name)
      assert.deepEqual(d.profile.influence, [], name)
    }
    assert.equal(riskAttitudeOf({ riskAttitude: 'dynamic', sources: {}, conflicts: [], droppedPriorities: [] }), null)
  })

  it('cada riskAttitude válido cambia SOLO la interpretación de investments.concentration, con influencia trazable', () => {
    const ctx = concentrated()
    const plain = decide({ context: ctx })
    const before = byId(plain.signals).get('investments.concentration')!
    assert.equal(before.interpretation, CONCENTRATION_DEFAULT)
    assert.equal(before.priority, 'medium')
    const seen = new Set<string>()
    for (const r of RISK_ATTITUDES) {
      const d = decide({ context: ctx, profile: withRisk(r, `mem-r-${r}`) })
      const after = byId(d.signals).get('investments.concentration')!
      assert.notEqual(after.interpretation, CONCENTRATION_DEFAULT, r)
      assert.match(after.interpretation, /actitud/, r)
      assert.ok(!seen.has(after.interpretation), `${r}: texto distinto por actitud`)
      seen.add(after.interpretation)
      assert.deepEqual(exceptInterpretation(after), exceptInterpretation(before), `${r}: todo lo demás idéntico`)
      assert.equal(after.priority, 'medium')
      assert.deepEqual(after.recommendation, before.recommendation)
      assert.deepEqual(after.recommendation?.action, { verb: 'decide', target: 'position', targetId: 'p-big' })
      assert.deepEqual(after.profileInfluence, [{ field: 'riskAttitude', sourceMemoryId: `mem-r-${r}`, signalId: 'investments.concentration', effect: 'interpretation' }])
      for (const s of d.signals) if (s.id !== 'investments.concentration') assert.deepEqual(s, byId(plain.signals).get(s.id), `${r} · ${s.id}`)
      assert.deepEqual(d.profile.influence, after.profileInfluence)
      assert.deepEqual(d.recommendation, plain.recommendation, r)
      assert.deepEqual(d.alternatives, plain.alternatives, r)
      assert.equal(d.confidence, plain.confidence, r)
    }
  })

  it('riskAttitude no toca investments.none ni nada cuando no hay concentración', () => {
    for (const ctx of [noPositions(), balanced()]) {
      const plain = decide({ context: ctx })
      for (const r of RISK_ATTITUDES) {
        const d = decide({ context: ctx, profile: withRisk(r) })
        assert.deepEqual(withoutProfile(d), withoutProfile(plain), r)
        assert.deepEqual(d.profile.influence, [], r)
      }
    }
  })

  it('AxisMemory.preferences.riskAttitude no es fuente: decide() no lee la memoria', () => {
    const ctx = concentrated()
    const memory: AxisMemory = { preferences: { riskAttitude: 'muy conservador', notes: ['Prefiere liquidez.'] } }
    assert.deepEqual(decide({ context: ctx, memory }), decide({ context: ctx }))
    assert.deepEqual(decide({ context: ctx, memory, profile: withRisk('dynamic') }), decide({ context: ctx, profile: withRisk('dynamic') }))
  })

  it('la redacción con preferencias sigue licenciada por su propia acción (ningún consejo no decidido)', () => {
    for (const [ctx, profile] of [
      [noPositions(), { ...withHorizon('long'), riskAttitude: 'conservative' as const, sources: { horizon: 'h', riskAttitude: 'r' } }],
      [concentrated(), { ...withRisk('conservative'), horizon: 'short' as const, sources: { horizon: 'h', riskAttitude: 'r' } }],
      [concentrated(), withRisk('balanced')],
      [concentrated(), withRisk('dynamic')],
    ] as Array<[FinancialContext, UserProfile]>) {
      const d = decide({ context: ctx, profile })
      const local = render(d, LOCAL_RULES_ENGINE_INFO, NOW)
      if (local.status !== 'analysis') throw new Error('sin análisis')
      const a = local.analysis
      const texts = [a.headline, a.interpretation.summary, ...a.interpretation.signals.map((s) => s.text), a.recommendation?.what ?? '', a.recommendation?.why ?? '', ...a.alternatives.map((x) => x.summary), a.conclusion.summary]
      const license = { stance: d.recommendation ? ('recommend' as const) : ('inform' as const), action: d.recommendation?.action, alternatives: d.alternatives.map((x) => x.name) }
      for (const t of texts) assert.deepEqual(checkAdvice(t, knownEntities(d), license), [], t)
    }
  })
})

describe('AXIS · perfil · horizon × riskAttitude × minLiquidityCents × irregularIncome × priorities', () => {
  const HORIZON_OPTIONS: Array<Horizon | undefined> = [undefined, ...HORIZONS]
  const RISK_OPTIONS: Array<RiskAttitude | undefined> = [undefined, ...RISK_ATTITUDES]
  const MIN_OPTIONS = (ctx: FinancialContext): Array<number | undefined> => [undefined, Math.max(1, ctx.wealth.liquidCents), ctx.wealth.liquidCents + 100_000]
  const IRREGULAR_OPTIONS: Array<boolean | undefined> = [undefined, false, true]
  const PRIORITY_OPTIONS = (ctx: FinancialContext): Array<string[] | undefined> => {
    const pending = ctx.objectives.filter((o) => !o.completed).map((o) => o.id)
    return pending.length >= 2 ? [undefined, [pending[pending.length - 1]]] : [undefined]
  }

  function build(h: Horizon | undefined, r: RiskAttitude | undefined, min: number | undefined, irr: boolean | undefined, prio: string[] | undefined): UserProfile {
    const p: UserProfile = { sources: {}, conflicts: [] }
    if (h !== undefined) (p.horizon = h), (p.sources.horizon = 'mem-h')
    if (r !== undefined) (p.riskAttitude = r), (p.sources.riskAttitude = 'mem-r')
    if (min !== undefined) (p.minLiquidityCents = min), (p.sources.minLiquidityCents = 'mem-l')
    if (irr !== undefined) (p.irregularIncome = irr), (p.sources.irregularIncome = 'mem-i')
    if (prio !== undefined) (p.priorities = prio), (p.sources.priorities = 'mem-p')
    return p
  }

  it('INVARIANTE: horizon/riskAttitude no cambian NADA salvo las dos interpretaciones y sus profileInfluence, para cualquier combinación de los otros campos', () => {
    let combos = 0
    for (const [name, ctx] of [CONTEXTS[0], CONTEXTS[1], CONTEXTS[2], CONTEXTS[3], ...CONTEXTS.filter(([n]) => n === 'golden:inversion' || n === 'golden:multiples-senales' || n === 'golden:objetivo-con-fecha')]) {
      for (const min of MIN_OPTIONS(ctx)) {
        for (const irr of IRREGULAR_OPTIONS) {
          for (const prio of PRIORITY_OPTIONS(ctx)) {
            const base = decide({ context: ctx, profile: build(undefined, undefined, min, irr, prio) })
            const baseShape = stripTextPreferences(base)
            for (const h of HORIZON_OPTIONS) {
              for (const r of RISK_OPTIONS) {
                combos++
                const d = decide({ context: ctx, profile: build(h, r, min, irr, prio) })
                const label = `${name} · h=${h} r=${r} min=${min} irr=${irr} prio=${prio?.join(',')}`
                // 1. Fuera de las dos interpretaciones y su influencia, la decisión es la misma.
                assert.deepEqual(stripTextPreferences(d), baseShape, label)
                // 2. Las dos interpretaciones cambian si y solo si la preferencia existe y la señal existe; con influencia exacta.
                const none = byId(d.signals).get('investments.none')
                const conc = byId(d.signals).get('investments.concentration')
                if (none) {
                  assert.equal(none.interpretation !== NONE_DEFAULT, h !== undefined, `${label}: investments.none`)
                  const inf = (none.profileInfluence ?? []).filter((i) => i.field === 'horizon')
                  assert.deepEqual(inf, h !== undefined ? [{ field: 'horizon', sourceMemoryId: 'mem-h', signalId: 'investments.none', effect: 'interpretation' }] : [], label)
                }
                if (conc) {
                  assert.equal(conc.interpretation !== CONCENTRATION_DEFAULT, r !== undefined, `${label}: investments.concentration`)
                  const inf = (conc.profileInfluence ?? []).filter((i) => i.field === 'riskAttitude')
                  assert.deepEqual(inf, r !== undefined ? [{ field: 'riskAttitude', sourceMemoryId: 'mem-r', signalId: 'investments.concentration', effect: 'interpretation' }] : [], label)
                }
                // 3. Ninguna otra señal lleva influencia de horizon/riskAttitude; ningún efecto distinto de 'interpretation'.
                for (const s of d.signals) {
                  for (const i of s.profileInfluence ?? []) {
                    if (!TEXT_FIELDS.has(i.field)) continue
                    assert.ok(TEXT_SIGNALS.has(s.id), `${label}: influencia de ${i.field} en ${s.id}`)
                    assert.equal(i.effect, 'interpretation')
                    assert.ok(PROFILE_EFFECTS.includes(i.effect))
                    assert.equal('from' in i || 'to' in i, false)
                  }
                }
                // 4. Lo explícito: prioridades, recomendación/acción, alternativas, confianza, nivel, hechos, ids.
                assert.deepEqual(d.signals.map((s) => [s.id, s.priority]), base.signals.map((s) => [s.id, s.priority]), label)
                assert.deepEqual(d.recommendation, base.recommendation, label)
                assert.deepEqual(d.alternatives, base.alternatives, label)
                assert.equal(d.confidence, base.confidence, label)
                assert.equal(d.level, base.level, label)
                assert.deepEqual(d.facts, base.facts, label)
                assert.deepEqual(d.uncertainties, base.uncertainties, label)
                assert.deepEqual(d.nextStep, base.nextStep, label)
              }
            }
          }
        }
      }
    }
    assert.ok(combos >= 500, `combinaciones probadas: ${combos}`)
  })

  it('minLiquidityCents, irregularIncome y priorities mantienen exactamente su comportamiento con y sin preferencias de texto', () => {
    const ctx = critical()
    const min = ctx.wealth.liquidCents + 100_000
    const only = build(undefined, undefined, min, true, ['obj-b'])
    const all = build('long', 'conservative', min, true, ['obj-b'])
    const a = decide({ context: ctx, profile: only })
    const b = decide({ context: ctx, profile: all })
    assert.deepEqual(stripTextPreferences(b), stripTextPreferences(a))
    // Y lo que esos tres campos hacen sigue ahí en ambos casos.
    for (const d of [a, b]) {
      assert.equal(byId(d.signals).get('liquidity.below-min')?.priority, 'high')
      assert.equal(byId(d.signals).get('income.drop')?.priority, 'medium')
      assert.equal(byId(d.signals).get('expenses.over-income')?.priority, 'critical')
      assert.equal(d.lead?.id, 'expenses.over-income')
      assert.ok(byId(d.signals).get('objectives.no-date:obj-b')?.profileInfluence?.some((i) => i.field === 'priorities'))
    }
    // Las influencias de los otros campos son idénticas; las de texto se añaden sin reordenar las demás.
    const others = (d: AxisDecision) => d.profile.influence.filter((i) => !TEXT_FIELDS.has(i.field))
    assert.deepEqual(others(b), others(a))
    assert.deepEqual(b.profile.influence.filter((i) => TEXT_FIELDS.has(i.field)).map((i) => [i.field, i.signalId]), [['riskAttitude', 'investments.concentration']])
  })

  it('determinismo, serialización sin pérdida y no mutación con preferencias de texto', () => {
    for (const [name, ctx] of CONTEXTS) {
      const input: AxisInput = { context: ctx, profile: build('medium', 'balanced', undefined, undefined, undefined) }
      const before = roundTrip(input)
      const a = decide(input)
      assert.deepEqual(a, decide(input), name)
      for (const s of a.signals) if (s.profileInfluence) assert.deepEqual(roundTrip(s), s, `${name} · ${s.id}`)
      assert.deepEqual(roundTrip(a.profile), a.profile, name)
      assert.deepEqual(roundTrip(input), before, name)
    }
  })
})
