/**
 * Perfil · `minLiquidityCents` (fase 2 · bloque 4 · paso 2).
 *
 * La regla `liquidity.below-min` es la única que existe por el perfil: su
 * hecho es la liquidez actual frente al mínimo declarado, el déficit lo
 * calcula AXIS y la acción es cerrada (`complete-cushion` / `cushion`).
 * Interacción aprobada: `savings.healthy` pierde «Mantener liquidez» cuando
 * completar el colchón ya es la recomendación. Todo lo demás queda igual.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { render } from '../compose'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { buildAllowedFigures, extractFigures } from '../core/figures'
import { knownEntities } from '../core/semantic'
import { LOCAL_RULES_ENGINE_INFO } from '../local-engine'
import { reconcileProfile } from '../profile/derive'
import { PROFILE_EFFECTS, type UserProfile } from '../profile/types'
import { detectSignals, RULES } from '../rules'
import { expenseRules } from '../rules/expenses'
import { incomeRules } from '../rules/income'
import { investmentRules } from '../rules/investments'
import { liquidityRules } from '../rules/liquidity'
import { marketRules } from '../rules/market'
import { objectiveRules } from '../rules/objectives'
import { savingsRules } from '../rules/savings'
import { liquidityShortfall, THRESHOLDS } from '../rules/shared'
import { ACTION_TARGETS, ACTION_VERBS, type AxisDecision, type AxisInput } from '../types'
import { parseAxisAnalysis } from '../validate'
import { checkAdvice, COMPATIBLE } from '../../text/advice'
import { config, gasto, healthyMovements, ingreso, NOW, objective, snapshot, TODAY } from './fixtures'
import { GOLDEN_SCENARIOS } from './golden-scenarios'

const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const withoutProfile = ({ profile: _p, ...rest }: AxisDecision) => {
  void _p
  return rest
}

/** Contexto sano: líquido 3.550 €, ahorro sólido (65 %), sin objetivos. */
const healthy = () => buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements() }), TODAY)
/** Contexto sano con un objetivo pendiente. */
const healthyWithObjective = () =>
  buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements(), objectives: [objective({ id: 'obj-viaje', name: 'Viaje', targetCents: 500_000, currentCents: 100_000 })] }), TODAY)
/** Contexto crítico: gastos (1.800 €) por encima de los ingresos (1.500 €). */
const critical = () =>
  buildFinancialContext(
    snapshot({ config: config(50_000), movements: [ingreso('2026-08-01', 200_000), gasto('2026-08-10', 50_000, 'Comida'), ingreso('2026-09-01', 150_000), gasto('2026-09-05', 120_000, 'Comida'), gasto('2026-09-08', 60_000, 'Salidas')] }),
    TODAY,
  )

const minProfile = (cents: number, sourceId = 'mem-liq'): UserProfile => ({ minLiquidityCents: cents, sources: { minLiquidityCents: sourceId }, conflicts: [] })

const LIQUID = 355_000

describe('AXIS · perfil · minLiquidityCents · activación', () => {
  it('el contexto sano tiene el líquido que asumen estos tests', () => {
    assert.equal(healthy().wealth.liquidCents, LIQUID)
    assert.equal(healthy().quality.hasInitialBalance, true)
  })

  it('sin perfil → decisión actual idéntica (los 13 escenarios) y ninguna señal de liquidez', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      const d = decide(input)
      assert.deepEqual(d, decide({ ...input }), name)
      assert.equal(d.signals.some((s) => s.id.startsWith('liquidity.')), false, name)
      assert.deepEqual(liquidityRules(input.context, input.market ?? null), [], name)
    }
  })

  it('mínimo por debajo de la liquidez (cubierto de sobra) → sin señal nueva', () => {
    const d = decide({ context: healthy(), profile: minProfile(1) })
    assert.equal(d.signals.some((s) => s.id === 'liquidity.below-min'), false)
    assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: healthy() })))
    assert.deepEqual(d.profile.influence, [])
  })

  it('liquidez exactamente en el mínimo → no activa', () => {
    const d = decide({ context: healthy(), profile: minProfile(LIQUID) })
    assert.equal(d.signals.some((s) => s.id === 'liquidity.below-min'), false)
    assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: healthy() })))
    assert.equal(liquidityShortfall(healthy(), reconcileProfile(minProfile(LIQUID), healthy())), null)
  })

  it('liquidez por encima del mínimo → no activa', () => {
    const d = decide({ context: healthy(), profile: minProfile(LIQUID - 1) })
    assert.equal(d.signals.some((s) => s.id === 'liquidity.below-min'), false)
    assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: healthy() })))
  })

  it('liquidez un céntimo por debajo del mínimo → señal high con el déficit calculado por AXIS', () => {
    const d = decide({ context: healthy(), profile: minProfile(LIQUID + 1) })
    const s = d.signals.find((x) => x.id === 'liquidity.below-min')
    assert.ok(s)
    assert.equal(s.priority, 'high')
    assert.equal(s.domain, 'savings')
    assert.match(s.fact, /3\.550,01 €/)
    assert.match(s.fact, /3\.550,00 €/)
    assert.match(s.fact, /faltan 0,01 €/)
    assert.equal(d.lead?.id, 'liquidity.below-min')
  })

  it('liquidez por debajo del mínimo → señal high, líder, con recomendación complete-cushion / cushion', () => {
    const d = decide({ context: healthy(), profile: minProfile(500_000) })
    const s = d.signals.find((x) => x.id === 'liquidity.below-min')!
    assert.equal(s.priority, 'high')
    assert.equal(d.lead?.id, 'liquidity.below-min')
    assert.equal(s.fact, 'Quieres mantener al menos 5.000,00 € líquidos y hoy tienes 3.550,00 €: faltan 1.450,00 €.')
    assert.deepEqual(d.recommendation, s.recommendation)
    assert.deepEqual(d.recommendation?.action, { verb: 'complete-cushion', target: 'cushion' })
    assert.deepEqual(d.nextStep, { label: 'Ver Mi Dinero', to: 'dinero' })
    assert.equal('alternative' in s, false, 'sin objetivo pendiente no hay alternativa que ofrecer')
    assert.equal('uncertainty' in s, false)
  })

  it('el déficit y el mínimo son cifras permitidas para el modelo (licenciadas por el texto de la decisión)', () => {
    const d = decide({ context: healthy(), profile: minProfile(500_000) })
    const s = d.signals.find((x) => x.id === 'liquidity.below-min')!
    const allowed = buildAllowedFigures(d)
    for (const f of extractFigures(s.fact)) assert.ok(allowed.keys.has(f.key), f.raw)
    assert.ok(allowed.keys.has('m:5000.00'), 'mínimo declarado')
    assert.ok(allowed.keys.has('m:1450.00'), 'déficit calculado por AXIS')
    // Ninguna cifra del perfil se cuela como cifra de contexto: viene del texto de la decisión.
    assert.equal(allowed.figures.find((f) => f.key === 'm:5000.00')?.source, 'decision-text')
  })
})

describe('AXIS · perfil · minLiquidityCents · validez y trazabilidad', () => {
  it('sin saldo inicial la liquidez no es calculable de forma válida: no se inventa la comparación', () => {
    const ctx = buildFinancialContext(snapshot({ config: null, movements: healthyMovements() }), TODAY)
    assert.equal(ctx.quality.hasInitialBalance, false)
    assert.notEqual(ctx.quality.level, 'none')
    const profile = minProfile(99_999_900)
    assert.equal(liquidityShortfall(ctx, reconcileProfile(profile, ctx)), null)
    const d = decide({ context: ctx, profile })
    assert.equal(d.signals.some((s) => s.id === 'liquidity.below-min'), false)
    assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: ctx })))
  })

  it('un mínimo sin memoria de origen no existe: sin trazabilidad no hay hecho', () => {
    const profile: UserProfile = { minLiquidityCents: 500_000, sources: {}, conflicts: [] }
    const d = decide({ context: healthy(), profile })
    assert.equal(d.signals.some((s) => s.id === 'liquidity.below-min'), false)
    assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: healthy() })))
  })

  it('la señal lleva profileInfluence trazable (campo, memoria real de origen, señal, efecto cerrado)', () => {
    const d = decide({ context: healthy(), profile: minProfile(500_000, 'mem-42') })
    const s = d.signals.find((x) => x.id === 'liquidity.below-min')!
    assert.deepEqual(s.profileInfluence, [{ field: 'minLiquidityCents', sourceMemoryId: 'mem-42', signalId: 'liquidity.below-min', effect: 'added-signal' }])
    for (const i of s.profileInfluence!) {
      assert.ok(PROFILE_EFFECTS.includes(i.effect))
      assert.equal(i.sourceMemoryId, d.profile.fields.sources.minLiquidityCents)
      assert.equal('from' in i, false)
      assert.equal('to' in i, false)
    }
    // La decisión agrega la influencia de todas las señales, en su orden: primero la señal nueva.
    assert.deepEqual(d.profile.influence[0], s.profileInfluence![0])
    assert.ok(d.profile.influence.every((i) => i.sourceMemoryId === 'mem-42' && i.field === 'minLiquidityCents'))
  })

  it('profileInfluence solo aparece cuando el perfil ha cambiado la decisión', () => {
    for (const cents of [1, LIQUID - 1, LIQUID]) {
      const d = decide({ context: healthy(), profile: minProfile(cents) })
      for (const s of d.signals) assert.equal('profileInfluence' in s, false, `${cents}: ${s.id}`)
      assert.deepEqual(d.profile.influence, [])
    }
  })

  it('la acción es cerrada y propiedad de AXIS: verbo y destino existen, la matriz de consejos la conoce y la validación la conserva', () => {
    const d = decide({ context: healthy(), profile: minProfile(500_000) })
    const action = d.recommendation!.action
    assert.ok(ACTION_VERBS.includes(action.verb))
    assert.ok(ACTION_TARGETS.includes(action.target))
    assert.ok(COMPATIBLE[action.verb].size > 0)
    const local = render(d, LOCAL_RULES_ENGINE_INFO, NOW)
    assert.equal(local.status, 'analysis')
    if (local.status !== 'analysis') return
    const parsed = parseAxisAnalysis(local.analysis)
    assert.deepEqual(parsed.recommendation?.action, action)
    assert.equal(parsed.recommendation?.what, d.recommendation!.what)
  })

  it('la propia redacción de la señal está licenciada por su propia acción (ningún consejo no decidido)', () => {
    for (const ctx of [healthy(), healthyWithObjective()]) {
      const d = decide({ context: ctx, profile: minProfile(500_000) })
      const local = render(d, LOCAL_RULES_ENGINE_INFO, NOW)
      if (local.status !== 'analysis') throw new Error('sin análisis')
      const a = local.analysis
      const texts = [a.headline, a.interpretation.summary, ...a.interpretation.signals.map((s) => s.text), a.recommendation?.what ?? '', a.recommendation?.why ?? '', ...a.alternatives.map((x) => x.summary), a.conclusion.summary]
      const license = { stance: 'recommend' as const, action: d.recommendation!.action, alternatives: d.alternatives.map((x) => x.name) }
      for (const t of texts) assert.deepEqual(checkAdvice(t, knownEntities(d), license), [], t)
    }
  })
})

describe('AXIS · perfil · minLiquidityCents · interacciones aprobadas', () => {
  it('savings.healthy + liquidez por debajo del mínimo → pierde únicamente «Mantener liquidez», con influencia trazada', () => {
    const plain = decide({ context: healthy() })
    const d = decide({ context: healthy(), profile: minProfile(500_000, 'mem-liq') })
    const before = plain.signals.find((s) => s.id === 'savings.healthy')!
    const after = d.signals.find((s) => s.id === 'savings.healthy')!
    assert.deepEqual(before.alternative, { name: 'Mantener liquidez', summary: 'Conservar el excedente como colchón si todavía no tienes un fondo de emergencia claro.' })
    assert.equal(after.alternative, undefined)
    assert.deepEqual(after.profileInfluence, [{ field: 'minLiquidityCents', sourceMemoryId: 'mem-liq', signalId: 'savings.healthy', effect: 'alternative-removed' }])
    // Todo lo demás de la señal es idéntico: id, prioridad, hecho, interpretación, recomendación.
    const { alternative: _a, profileInfluence: _p, ...afterRest } = after
    const { alternative: _b, ...beforeRest } = before
    void _a
    void _p
    void _b
    assert.deepEqual(afterRest, beforeRest)
    assert.equal(d.alternatives.some((x) => x.name === 'Mantener liquidez'), false)
  })

  it('la señal de liquidez coexiste con savings.healthy: ambas en la decisión, liquidez líder por prioridad', () => {
    const d = decide({ context: healthy(), profile: minProfile(500_000) })
    const ids = d.signals.map((s) => s.id)
    assert.ok(ids.includes('liquidity.below-min') && ids.includes('savings.healthy'))
    assert.equal(ids.indexOf('liquidity.below-min') < ids.indexOf('savings.healthy'), true)
    assert.equal(d.lead?.id, 'liquidity.below-min')
    assert.deepEqual(d.profile.influence.map((i) => [i.signalId, i.effect]), [['liquidity.below-min', 'added-signal'], ['savings.healthy', 'alternative-removed']])
  })

  it('con un objetivo pendiente, la señal ofrece «Aportar al objetivo antes que al colchón» como alternativa visible', () => {
    const d = decide({ context: healthyWithObjective(), profile: minProfile(500_000) })
    const s = d.signals.find((x) => x.id === 'liquidity.below-min')!
    assert.equal(s.alternative?.name, 'Aportar al objetivo antes que al colchón')
    assert.match(s.alternative!.summary, /«Viaje»/)
    assert.deepEqual(d.alternatives.map((a) => a.name), ['Aportar al objetivo antes que al colchón'])
    // savings.healthy sigue recomendando el objetivo en su propia señal, pero la decisión recomienda el colchón.
    assert.equal(d.signals.find((x) => x.id === 'savings.healthy')?.recommendation?.action.verb, 'allocate')
    assert.equal(d.recommendation?.action.verb, 'complete-cushion')
  })

  it('una situación critical existente conserva su precedencia sobre la señal de liquidez', () => {
    const ctx = critical()
    const plain = decide({ context: ctx })
    assert.equal(plain.lead?.id, 'expenses.over-income')
    const d = decide({ context: ctx, profile: minProfile(1_000_000) })
    assert.equal(d.lead?.id, 'expenses.over-income')
    assert.deepEqual(d.recommendation, plain.recommendation, 'la recomendación sigue siendo la del gasto crítico')
    const liquidity = d.signals.find((s) => s.id === 'liquidity.below-min')
    assert.equal(liquidity?.priority, 'high')
    // A igual prioridad y dominio, una señal objetiva ya existente (savings.falling, high) va por delante de la del perfil.
    const ids = d.signals.map((s) => s.id)
    assert.ok(ids.indexOf('savings.falling') < ids.indexOf('liquidity.below-min'))
    assert.deepEqual(ids.filter((id) => id !== 'liquidity.below-min'), plain.signals.map((s) => s.id), 'el resto de señales y su orden no cambian')
  })

  it('el mínimo se compara con el líquido total, con o sin inversiones', () => {
    const invested = buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements(), positions: [{ id: 'p1', name: 'Fondo', investedCents: 150_000, valueCents: 158_000, date: '2026-05-01', createdAt: 1, updatedAt: 1 }] }), TODAY)
    assert.equal(invested.wealth.liquidCents, LIQUID)
    assert.ok(invested.wealth.totalCents > LIQUID)
    const d = decide({ context: invested, profile: minProfile(400_000) })
    assert.equal(d.signals.find((s) => s.id === 'liquidity.below-min')?.fact, 'Quieres mantener al menos 4.000,00 € líquidos y hoy tienes 3.550,00 €: faltan 450,00 €.')
  })
})

describe('AXIS · perfil · minLiquidityCents · nada más cambia', () => {
  it('perfil sin minLiquidityCents (campos inertes: ingresos regulares, prioridad sobre el único objetivo) → comportamiento anterior', () => {
    // irregularIncome: true (paso 3), priorities que reordenan (paso 4) y horizon/riskAttitude (paso 5, solo texto)
    // tienen su propio comportamiento y sus propios tests; aquí solo valores inertes.
    const profile: UserProfile = { irregularIncome: false, priorities: ['obj-viaje'], sources: { irregularIncome: 'c', priorities: 'd' }, conflicts: [] }
    for (const ctx of [healthy(), healthyWithObjective(), critical()]) {
      const d = decide({ context: ctx, profile })
      assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: ctx })))
      assert.deepEqual(d.profile.influence, [])
    }
  })

  it('con el mínimo por debajo activo, los campos inertes del perfil siguen sin cambiar nada', () => {
    const only = minProfile(500_000)
    const all: UserProfile = { ...only, irregularIncome: false, priorities: ['obj-viaje'], sources: { ...only.sources, irregularIncome: 'c', priorities: 'd' } }
    for (const ctx of [healthy(), healthyWithObjective(), critical()]) {
      assert.deepEqual(withoutProfile(decide({ context: ctx, profile: all })), withoutProfile(decide({ context: ctx, profile: only })))
    }
  })

  it('las reglas fuera de la matriz (income, expenses, objectives, investments, market) no ven el perfil', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      const market = input.market ?? null
      const below = reconcileProfile(minProfile(99_999_900), input.context)
      for (const rule of [incomeRules, expenseRules, objectiveRules, investmentRules, marketRules]) {
        assert.deepEqual(rule(input.context, market, below), rule(input.context, market), `${name} · ${rule.name}`)
      }
    }
  })

  it('savingsRules solo cambia en la alternativa de savings.healthy; el resto de sus señales es idéntico', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      if (input.context.quality.level === 'none') continue
      const below = reconcileProfile(minProfile(99_999_900), input.context)
      const plain = savingsRules(input.context, null)
      const withProfile = savingsRules(input.context, null, below)
      assert.equal(withProfile.length, plain.length, name)
      for (let i = 0; i < plain.length; i++) {
        const { alternative: a1, profileInfluence: p1, ...r1 } = withProfile[i]
        const { alternative: a2, ...r2 } = plain[i]
        assert.deepEqual(r1, r2, `${name} · ${plain[i].id}`)
        if (plain[i].id === 'savings.healthy' && a2 && input.context.quality.hasInitialBalance) {
          assert.equal(a1, undefined, name)
          assert.equal(p1?.[0]?.effect, 'alternative-removed', name)
        } else {
          assert.deepEqual(a1, a2, name)
          assert.equal(p1, undefined, name)
        }
      }
    }
  })

  it('la regla de liquidez nunca produce más de una señal ni una prioridad distinta de high', () => {
    for (const { input } of GOLDEN_SCENARIOS) {
      for (const cents of [1, 100_000, 355_000, 355_001, 99_999_900]) {
        const out = liquidityRules(input.context, input.market ?? null, reconcileProfile(minProfile(cents), input.context))
        assert.ok(out.length <= 1)
        for (const s of out) {
          assert.equal(s.priority, 'high')
          assert.equal(s.id, 'liquidity.below-min')
          assert.ok(input.context.wealth.liquidCents < cents)
        }
      }
    }
  })

  it('los umbrales existentes no han cambiado y la regla no añade ninguno', () => {
    assert.deepEqual(THRESHOLDS, {
      significantChangePct: 20,
      extraordinaryIncomePct: 50,
      categoryConcentrationPct: 50,
      healthySavingsRatePct: 20,
      objectiveNearPct: 90,
      objectiveStaleDays: 30,
      positionConcentrationPct: 70,
      lowLiquidityInvestedPct: 80,
    })
    assert.deepEqual(RULES.map((r) => r.name), ['incomeRules', 'expenseRules', 'savingsRules', 'liquidityRules', 'objectiveRules', 'investmentRules', 'marketRules'])
    assert.deepEqual(detectSignals(healthy(), null), decide({ context: healthy() }).signals)
  })

  it('con el mínimo activo la decisión sigue siendo determinista, serializable sin pérdida y no muta la entrada', () => {
    for (const ctx of [healthy(), healthyWithObjective(), critical()]) {
      const input: AxisInput = { context: ctx, profile: minProfile(500_000) }
      const before = roundTrip(input)
      const a = decide(input)
      const b = decide(input)
      assert.deepEqual(a, b)
      const s = a.signals.find((x) => x.id === 'liquidity.below-min')!
      assert.deepEqual(roundTrip(s), s, 'la señal no tiene claves undefined')
      assert.deepEqual(roundTrip(a.profile), a.profile)
      assert.deepEqual(roundTrip(input), before)
    }
  })
})
