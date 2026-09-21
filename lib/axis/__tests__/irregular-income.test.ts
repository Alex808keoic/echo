/**
 * Perfil · `irregularIncome` (fase 2 · bloque 4 · paso 3).
 *
 * Hecho declarado sobre los datos, no preferencia: con ingresos irregulares,
 * comparar un mes con el anterior por el lado de los ingresos es menos
 * fiable. Matriz aprobada:
 *
 *   income.drop            high → medium · incertidumbre sustituida
 *   income.none            high → medium (solo si el mes pasado hubo ingresos) · interpretación
 *   savings.falling        high → medium (solo si la caída viene de los ingresos) · incertidumbre sustituida
 *   income.extraordinary   solo interpretación
 *   objectives.pace        solo incertidumbre (mismo título)
 *
 * Nada más: ni critical, ni expenses.*, ni savings.tight/healthy, ni
 * recomendaciones nuevas, ni señales eliminadas, ni confianza.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { PROFILE_EFFECTS, type UserProfile } from '../profile/types'
import { irregularIncomeOf } from '../rules/shared'
import type { AxisDecision, AxisInput, FinancialContext, Priority, Signal } from '../types'
import { config, gasto, healthyMovements, ingreso, objective, snapshot, TODAY } from './fixtures'
import { GOLDEN_SCENARIOS } from './golden-scenarios'

const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const withoutProfile = ({ profile: _p, ...rest }: AxisDecision) => {
  void _p
  return rest
}
const ctxOf = (movements: ReturnType<typeof gasto>[], extra: Partial<Parameters<typeof snapshot>[0]> = {}) => buildFinancialContext(snapshot({ config: config(100_000), movements, ...extra }), TODAY)

const irregular = (sourceId = 'mem-irr'): UserProfile => ({ irregularIncome: true, sources: { irregularIncome: sourceId }, conflicts: [] })
const regular = (): UserProfile => ({ irregularIncome: false, sources: { irregularIncome: 'mem-irr' }, conflicts: [] })

/* --------------------------------- contextos -------------------------------- */

/** Solo caída de ingresos (−25 %); el ahorro sigue sano (66 %) y no cae a la mitad. */
const dropOnly = () => ctxOf([ingreso('2026-08-01', 200_000), gasto('2026-08-10', 50_000), ingreso('2026-09-01', 150_000), gasto('2026-09-10', 50_000)])
/** Caída de ingresos (−40 %) y del ahorro (1.500 € → 600 €) por los ingresos. */
const fallingFromIncome = () => ctxOf([ingreso('2026-08-01', 200_000), gasto('2026-08-10', 50_000), ingreso('2026-09-01', 120_000), gasto('2026-09-10', 60_000)])
/** Mismos ingresos; el ahorro cae (1.500 € → 200 €) por el gasto. Margen ajustado (10 %). */
const fallingFromExpenses = () => ctxOf([ingreso('2026-08-01', 200_000), gasto('2026-08-10', 50_000), ingreso('2026-09-01', 200_000), gasto('2026-09-10', 100_000, 'Comida'), gasto('2026-09-12', 80_000, 'Salidas')])
/** Gastos por encima de los ingresos (critical) + caída de ingresos + caída del ahorro por ingresos. */
const critical = () => ctxOf([ingreso('2026-08-01', 200_000), gasto('2026-08-10', 50_000), ingreso('2026-09-01', 150_000), gasto('2026-09-05', 120_000, 'Comida'), gasto('2026-09-08', 60_000, 'Salidas')])
/** Sin ingresos este mes, con ingresos el mes pasado. */
const noneWithPrevious = () => ctxOf([ingreso('2026-08-01', 200_000), gasto('2026-08-10', 50_000), gasto('2026-09-10', 30_000)])
/** Sin ingresos este mes ni el anterior (solo un mes de datos). */
const noneWithoutPrevious = () => ctxOf([gasto('2026-09-03', 20_000)])
/** Ingresos +100 % respecto al mes anterior. */
const extraordinary = () => ctxOf([ingreso('2026-08-01', 100_000), gasto('2026-08-10', 20_000), ingreso('2026-09-01', 200_000), gasto('2026-09-10', 20_000)])
/** Objetivo con fecha cuyo ritmo necesario no lo cubre el ahorro del mes. */
const pace = () => ctxOf(healthyMovements(), { objectives: [objective({ id: 'obj-coche', name: 'Coche', targetCents: 1_000_000, currentCents: 100_000, targetDate: '2027-03-15' })] })
/** Contexto sano: ninguna señal de la matriz. */
const healthy = () => ctxOf(healthyMovements())

const ALL_CONTEXTS: Array<[string, FinancialContext]> = [
  ['dropOnly', dropOnly()],
  ['fallingFromIncome', fallingFromIncome()],
  ['fallingFromExpenses', fallingFromExpenses()],
  ['critical', critical()],
  ['noneWithPrevious', noneWithPrevious()],
  ['noneWithoutPrevious', noneWithoutPrevious()],
  ['extraordinary', extraordinary()],
  ['pace', pace()],
  ['healthy', healthy()],
  ...GOLDEN_SCENARIOS.map(({ name, input }) => [`golden:${name}`, input.context] as [string, FinancialContext]),
]

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 }
const LOWERABLE = new Set(['income.drop', 'income.none', 'savings.falling'])
const TEXT_ONLY_INTERPRETATION = new Set(['income.none', 'income.extraordinary'])
const TEXT_ONLY_UNCERTAINTY = (id: string) => id === 'income.drop' || id === 'savings.falling' || id.startsWith('objectives.pace:')

const pair = (ctx: FinancialContext, market: AxisInput['market'] = null) => ({ plain: decide({ context: ctx, market }), irr: decide({ context: ctx, market, profile: irregular() }) })
const byId = (signals: Signal[]) => new Map(signals.map((s) => [s.id, s]))

describe('AXIS · perfil · irregularIncome · sin efecto cuando no procede', () => {
  it('irregularIncome ausente → comportamiento actual (los 13 escenarios y todos los contextos)', () => {
    for (const [name, ctx] of ALL_CONTEXTS) {
      const d = decide({ context: ctx, profile: { sources: {}, conflicts: [] } })
      assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: ctx })), name)
      assert.deepEqual(d.profile.influence, [], name)
    }
  })

  it('irregularIncome=false → comportamiento actual', () => {
    for (const [name, ctx] of ALL_CONTEXTS) {
      const d = decide({ context: ctx, profile: regular() })
      assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: ctx })), name)
      assert.deepEqual(d.profile.influence, [], name)
    }
  })

  it('irregularIncome=true sin memoria de origen no existe', () => {
    const profile: UserProfile = { irregularIncome: true, sources: {}, conflicts: [] }
    assert.equal(irregularIncomeOf({ ...profile, droppedPriorities: [] }), null)
    for (const [name, ctx] of ALL_CONTEXTS) {
      assert.deepEqual(withoutProfile(decide({ context: ctx, profile })), withoutProfile(decide({ context: ctx })), name)
    }
  })

  it('en un contexto sano (sin señales de la matriz) no cambia nada ni hay influencia', () => {
    const { plain, irr } = pair(healthy())
    assert.deepEqual(withoutProfile(irr), withoutProfile(plain))
    assert.deepEqual(irr.profile.influence, [])
  })
})

describe('AXIS · perfil · irregularIncome · cambios permitidos, señal a señal', () => {
  it('income.drop: high → medium, incertidumbre sustituida, todo lo demás idéntico', () => {
    const { plain, irr } = pair(dropOnly())
    const before = byId(plain.signals).get('income.drop')!
    const after = byId(irr.signals).get('income.drop')!
    assert.equal(before.priority, 'high')
    assert.equal(after.priority, 'medium')
    assert.deepEqual(before.uncertainty, { title: 'Puede ser temporal', detail: 'Con un solo mes de comparación no se puede saber si la caída de ingresos es puntual o estable.' })
    assert.deepEqual(after.uncertainty, { title: 'Ingresos irregulares', detail: 'Has indicado que tus ingresos son irregulares: un mes por debajo del anterior no indica por sí solo una caída estable.' })
    assert.equal(after.fact, before.fact)
    assert.equal(after.interpretation, before.interpretation)
    assert.deepEqual(after.recommendation, before.recommendation)
    assert.deepEqual(after.alternative, before.alternative)
    assert.deepEqual(after.profileInfluence, [
      { field: 'irregularIncome', sourceMemoryId: 'mem-irr', signalId: 'income.drop', effect: 'priority-lowered', from: 'high', to: 'medium' },
      { field: 'irregularIncome', sourceMemoryId: 'mem-irr', signalId: 'income.drop', effect: 'uncertainty' },
    ])
    // La caída sigue liderando (medium > low) y su recomendación sigue siendo la de la decisión.
    assert.equal(irr.lead?.id, 'income.drop')
    assert.deepEqual(irr.recommendation, plain.recommendation)
    assert.ok(irr.uncertainties.some((u) => u.title === 'Ingresos irregulares'))
    assert.ok(!irr.uncertainties.some((u) => u.title === 'Puede ser temporal'))
  })

  it('income.drop junto a una situación critical: critical sigue siendo critical y sigue liderando', () => {
    const { plain, irr } = pair(critical())
    assert.equal(plain.lead?.id, 'expenses.over-income')
    assert.equal(irr.lead?.id, 'expenses.over-income')
    assert.equal(byId(irr.signals).get('expenses.over-income')?.priority, 'critical')
    assert.deepEqual(byId(irr.signals).get('expenses.over-income'), byId(plain.signals).get('expenses.over-income'), 'la señal crítica es idéntica')
    assert.deepEqual(irr.recommendation, plain.recommendation)
    assert.equal(byId(irr.signals).get('income.drop')?.priority, 'medium')
    assert.equal(byId(irr.signals).get('savings.falling')?.priority, 'medium')
    assert.deepEqual(byId(irr.signals).get('expenses.increase'), byId(plain.signals).get('expenses.increase'), 'expenses.increase no cambia')
  })

  it('income.none con ingresos el mes pasado: high → medium e interpretación; recomendación intacta', () => {
    const { plain, irr } = pair(noneWithPrevious())
    const before = byId(plain.signals).get('income.none')!
    const after = byId(irr.signals).get('income.none')!
    assert.equal(before.priority, 'high')
    assert.equal(after.priority, 'medium')
    assert.equal(after.interpretation, 'Con ingresos irregulares, un mes sin ingresos puede ser normal; aun así conviene comprobar si falta registrar alguno.')
    assert.equal(after.fact, before.fact)
    assert.deepEqual(after.recommendation, before.recommendation)
    assert.equal(after.recommendation?.action.verb, 'register')
    assert.deepEqual(after.profileInfluence, [
      { field: 'irregularIncome', sourceMemoryId: 'mem-irr', signalId: 'income.none', effect: 'priority-lowered', from: 'high', to: 'medium' },
      { field: 'irregularIncome', sourceMemoryId: 'mem-irr', signalId: 'income.none', effect: 'interpretation' },
    ])
  })

  it('income.none sin ingresos el mes pasado: ya era medium → no cambia ni hay influencia', () => {
    const { plain, irr } = pair(noneWithoutPrevious())
    const before = byId(plain.signals).get('income.none')!
    const after = byId(irr.signals).get('income.none')!
    assert.equal(before.priority, 'medium')
    assert.deepEqual(after, before)
    assert.equal('profileInfluence' in after, false)
  })

  it('savings.falling por ingresos menores: high → medium, incertidumbre sustituida y trazable', () => {
    const { plain, irr } = pair(fallingFromIncome())
    const before = byId(plain.signals).get('savings.falling')!
    const after = byId(irr.signals).get('savings.falling')!
    assert.equal(before.priority, 'high')
    assert.equal(after.priority, 'medium')
    assert.equal(after.interpretation, 'La caída viene, al menos en parte, de unos ingresos menores.')
    assert.equal(after.interpretation, before.interpretation)
    assert.equal(after.fact, before.fact)
    assert.deepEqual(after.uncertainty, { title: 'Ingresos irregulares', detail: 'Has indicado que tus ingresos son irregulares: un mes con menos ahorro por menos ingresos no marca tendencia por sí solo.' })
    assert.equal('recommendation' in after, false)
    assert.deepEqual(after.profileInfluence, [
      { field: 'irregularIncome', sourceMemoryId: 'mem-irr', signalId: 'savings.falling', effect: 'priority-lowered', from: 'high', to: 'medium' },
      { field: 'irregularIncome', sourceMemoryId: 'mem-irr', signalId: 'savings.falling', effect: 'uncertainty' },
    ])
    // Dos señales rebajadas con la misma incertidumbre: la decisión la muestra una sola vez.
    assert.equal(irr.uncertainties.filter((u) => u.title === 'Ingresos irregulares').length, 1)
  })

  it('savings.falling por el gasto (ingresos iguales): NO se rebaja ni cambia', () => {
    const { plain, irr } = pair(fallingFromExpenses())
    const before = byId(plain.signals).get('savings.falling')!
    const after = byId(irr.signals).get('savings.falling')!
    assert.equal(before.priority, 'high')
    assert.deepEqual(after, before)
    assert.equal('profileInfluence' in after, false)
    assert.deepEqual(irr.profile.influence, [], 'ninguna señal de la matriz cambia en este contexto')
    assert.deepEqual(withoutProfile(irr), withoutProfile(plain))
  })

  it('savings.tight y expenses.increase (y expenses.concentration) no cambian', () => {
    const { plain, irr } = pair(fallingFromExpenses())
    for (const id of ['savings.tight', 'expenses.increase', 'expenses.concentration']) {
      assert.ok(byId(plain.signals).has(id), `${id} existe en el contexto`)
      assert.deepEqual(byId(irr.signals).get(id), byId(plain.signals).get(id), id)
    }
  })

  it('savings.healthy no cambia (con y sin otras señales de la matriz)', () => {
    for (const ctx of [healthy(), dropOnly(), extraordinary(), pace()]) {
      const { plain, irr } = pair(ctx)
      assert.ok(byId(plain.signals).has('savings.healthy'))
      assert.deepEqual(byId(irr.signals).get('savings.healthy'), byId(plain.signals).get('savings.healthy'))
    }
  })

  it('income.extraordinary: solo cambia la interpretación; prioridad, alternativa y ausencia de recomendación intactas', () => {
    const { plain, irr } = pair(extraordinary())
    const before = byId(plain.signals).get('income.extraordinary')!
    const after = byId(irr.signals).get('income.extraordinary')!
    assert.equal(after.priority, before.priority)
    assert.equal(after.priority, 'low')
    assert.equal(after.fact, before.fact)
    assert.equal(after.interpretation, 'Con ingresos irregulares, un mes alto entra dentro de lo esperable; conviene no tomarlo como el nivel habitual.')
    assert.notEqual(after.interpretation, before.interpretation)
    assert.deepEqual(after.alternative, before.alternative)
    assert.equal('recommendation' in after, false)
    assert.equal('uncertainty' in after, false)
    assert.deepEqual(after.profileInfluence, [{ field: 'irregularIncome', sourceMemoryId: 'mem-irr', signalId: 'income.extraordinary', effect: 'interpretation' }])
    assert.deepEqual(irr.recommendation, plain.recommendation)
  })

  it('objectives.pace: solo cambia el detalle de la incertidumbre (mismo título); prioridad, recomendación y alternativa intactas', () => {
    const { plain, irr } = pair(pace())
    const before = byId(plain.signals).get('objectives.pace:obj-coche')!
    const after = byId(irr.signals).get('objectives.pace:obj-coche')!
    assert.equal(before.priority, 'high', 'el ritmo no es alcanzable con el ahorro del mes')
    assert.equal(after.priority, before.priority)
    assert.equal(after.fact, before.fact)
    assert.equal(after.interpretation, before.interpretation)
    assert.deepEqual(after.recommendation, before.recommendation)
    assert.deepEqual(after.alternative, before.alternative)
    assert.equal(after.uncertainty?.title, 'Ritmo basado en un solo mes')
    assert.equal(after.uncertainty?.title, before.uncertainty?.title)
    assert.equal(after.uncertainty?.detail, 'La aportación mensual necesaria se compara con el ahorro de este mes; con ingresos irregulares, un solo mes es aún menos representativo.')
    assert.deepEqual(after.profileInfluence, [{ field: 'irregularIncome', sourceMemoryId: 'mem-irr', signalId: 'objectives.pace:obj-coche', effect: 'uncertainty' }])
    assert.deepEqual(irr.recommendation, plain.recommendation)
  })
})

describe('AXIS · perfil · irregularIncome · invariantes sobre todos los contextos', () => {
  it('ninguna señal desaparece ni aparece; dominio y hecho de cada señal se conservan', () => {
    for (const [name, ctx] of ALL_CONTEXTS) {
      const { plain, irr } = pair(ctx)
      assert.deepEqual(irr.signals.map((s) => s.id).sort(), plain.signals.map((s) => s.id).sort(), name)
      for (const s of irr.signals) {
        const p = byId(plain.signals).get(s.id)!
        assert.equal(s.domain, p.domain, `${name} · ${s.id}`)
        assert.equal(s.fact, p.fact, `${name} · ${s.id}`)
      }
    }
  })

  it('las prioridades solo bajan un nivel (high → medium) y solo en income.drop / income.none / savings.falling; critical nunca cambia', () => {
    for (const [name, ctx] of ALL_CONTEXTS) {
      const { plain, irr } = pair(ctx)
      for (const s of irr.signals) {
        const p = byId(plain.signals).get(s.id)!
        if (s.priority === p.priority) continue
        assert.ok(LOWERABLE.has(s.id), `${name} · ${s.id}: prioridad cambiada fuera de la matriz`)
        assert.equal(p.priority, 'high', `${name} · ${s.id}`)
        assert.equal(s.priority, 'medium', `${name} · ${s.id}`)
        assert.equal(PRIORITY_RANK[s.priority] - PRIORITY_RANK[p.priority], 1)
      }
      for (const p of plain.signals) if (p.priority === 'critical') assert.equal(byId(irr.signals).get(p.id)?.priority, 'critical', `${name} · ${p.id}`)
    }
  })

  it('no aparece ninguna recomendación nueva ni cambia ninguna existente; ninguna alternativa cambia', () => {
    for (const [name, ctx] of ALL_CONTEXTS) {
      const { plain, irr } = pair(ctx)
      for (const s of irr.signals) {
        const p = byId(plain.signals).get(s.id)!
        assert.deepEqual(s.recommendation, p.recommendation, `${name} · ${s.id}`)
        assert.deepEqual(s.alternative, p.alternative, `${name} · ${s.id}`)
      }
      if (irr.recommendation === null) assert.equal(plain.recommendation, null, `${name}: no desaparece la recomendación`)
      else assert.ok(plain.signals.some((s) => JSON.stringify(s.recommendation) === JSON.stringify(irr.recommendation)), `${name}: la recomendación de la decisión es una de las que ya existían`)
    }
  })

  it('interpretación e incertidumbre solo cambian donde la matriz lo permite', () => {
    for (const [name, ctx] of ALL_CONTEXTS) {
      const { plain, irr } = pair(ctx)
      for (const s of irr.signals) {
        const p = byId(plain.signals).get(s.id)!
        if (s.interpretation !== p.interpretation) assert.ok(TEXT_ONLY_INTERPRETATION.has(s.id), `${name} · ${s.id}: interpretación cambiada fuera de la matriz`)
        if (JSON.stringify(s.uncertainty) !== JSON.stringify(p.uncertainty)) assert.ok(TEXT_ONLY_UNCERTAINTY(s.id), `${name} · ${s.id}: incertidumbre cambiada fuera de la matriz`)
      }
    }
  })

  it('confidence, level, missing, basedOnDemoData y facts no cambian por la irregularidad', () => {
    for (const [name, ctx] of ALL_CONTEXTS) {
      const { plain, irr } = pair(ctx)
      assert.equal(irr.confidence, plain.confidence, `${name}: confidence`)
      assert.equal(irr.level, plain.level, name)
      assert.deepEqual(irr.missing, plain.missing, name)
      assert.equal(irr.basedOnDemoData, plain.basedOnDemoData, name)
      // Mismos hechos; el orden sigue a la prioridad, así que una señal rebajada puede ceder su sitio (p. ej. savings.falling tras expenses.increase).
      assert.deepEqual([...irr.facts].sort(), [...plain.facts].sort(), `${name}: los hechos son los mismos`)
    }
  })

  it('profileInfluence es trazable y aparece si y solo si la señal ha cambiado de verdad', () => {
    for (const [name, ctx] of ALL_CONTEXTS) {
      const { plain, irr } = pair(ctx)
      for (const s of irr.signals) {
        const p = byId(plain.signals).get(s.id)!
        const { profileInfluence, ...rest } = s
        const changed = JSON.stringify(rest) !== JSON.stringify(p)
        assert.equal(profileInfluence !== undefined, changed, `${name} · ${s.id}: influencia ⇔ cambio real`)
        if (!profileInfluence) continue
        assert.ok(profileInfluence.length > 0)
        for (const i of profileInfluence) {
          assert.equal(i.field, 'irregularIncome')
          assert.equal(i.sourceMemoryId, 'mem-irr')
          assert.equal(i.signalId, s.id)
          assert.ok(PROFILE_EFFECTS.includes(i.effect))
          if (i.effect === 'priority-lowered') assert.deepEqual([i.from, i.to], [p.priority, s.priority])
          else assert.equal('from' in i || 'to' in i, false, `${name} · ${s.id}: from/to solo con cambio de prioridad`)
        }
        const effects = new Set(profileInfluence.map((i) => i.effect))
        assert.equal(effects.has('priority-lowered'), s.priority !== p.priority, `${name} · ${s.id}`)
        assert.equal(effects.has('interpretation'), s.interpretation !== p.interpretation, `${name} · ${s.id}`)
        assert.equal(effects.has('uncertainty'), JSON.stringify(s.uncertainty) !== JSON.stringify(p.uncertainty), `${name} · ${s.id}`)
      }
      assert.deepEqual(irr.profile.influence, irr.signals.flatMap((s) => s.profileInfluence ?? []), name)
    }
  })

  it('los campos inertes del perfil siguen siéndolo junto a irregularIncome (horizon/riskAttitude: solo texto, ver horizon-risk.test.ts)', () => {
    const only = irregular()
    const all: UserProfile = { ...only, minLiquidityCents: 1, priorities: ['obj-coche'], sources: { ...only.sources, minLiquidityCents: 'a', priorities: 'c' } }
    for (const [name, ctx] of ALL_CONTEXTS) {
      assert.deepEqual(withoutProfile(decide({ context: ctx, profile: all })), withoutProfile(decide({ context: ctx, profile: only })), name)
    }
  })

  it('determinismo, serialización sin pérdida y no mutación con irregularIncome', () => {
    for (const [name, ctx] of ALL_CONTEXTS) {
      const input: AxisInput = { context: ctx, profile: irregular() }
      const before = roundTrip(input)
      const a = decide(input)
      const b = decide(input)
      assert.deepEqual(a, b, name)
      for (const s of a.signals) if (s.profileInfluence) assert.deepEqual(roundTrip(s), s, `${name} · ${s.id}: sin claves undefined nuevas`)
      assert.deepEqual(roundTrip(a.profile), a.profile, name)
      assert.deepEqual(roundTrip(input), before, name)
    }
  })
})
