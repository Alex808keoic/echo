/**
 * Perfil · `priorities` (memoria antigua de AXIS).
 *
 * Desde la fase B2 de objetivos automáticos, el orden lo decide la prioridad
 * del objetivo en Finax, que es el que usa el reparto (`allocateObjectives`).
 * La memoria `priorities` se sigue leyendo y reconciliando (descarta
 * objetivos que no existen o ya no tienen nada pendiente), pero ya no reordena
 * señales ni elige el destino de `savings.healthy`: AXIS nunca pone por
 * delante un objetivo distinto del que Finax alimenta primero.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { reconcileProfile } from '../profile/derive'
import { PROFILE_EFFECTS, type UserProfile } from '../profile/types'
import { objectiveRules } from '../rules/objectives'
import { prioritiesOf, rankByPriorities } from '../rules/shared'
import type { AxisDecision, AxisInput, FinancialContext, Signal } from '../types'
import { config, gasto, healthyMovements, ingreso, objective, snapshot, TODAY } from './fixtures'
import { GOLDEN_SCENARIOS } from './golden-scenarios'

const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const withoutProfile = ({ profile: _p, ...rest }: AxisDecision) => {
  void _p
  return rest
}
const byId = (signals: Signal[]) => new Map(signals.map((s) => [s.id, s]))
const objectiveIdOf = (s: Signal) => s.id.slice(s.id.indexOf(':') + 1)

const prio = (ids: string[], sourceId = 'mem-prio'): UserProfile => ({ priorities: ids, sources: { priorities: sourceId }, conflicts: [] })

/* --------------------------------- contextos -------------------------------- */

// Progreso por reparto automático (líquido 355.000, en cascada por fecha de creación e id); «Hecho» marcado como conseguido.
const A = () => objective({ id: 'obj-a', name: 'Alfa', targetCents: 500_000 })
const B = () => objective({ id: 'obj-b', name: 'Beta', targetCents: 400_000 })
const C = () => objective({ id: 'obj-c', name: 'Gamma', targetCents: 300_000 })
const DONE = () => objective({ id: 'obj-done', name: 'Hecho', targetCents: 100_000, achievedAt: Date.parse('2026-09-01') })
const OVERDUE = () => objective({ id: 'obj-over', name: 'Vencido', targetCents: 800_000, targetDate: '2026-01-15' })
/** Ritmo insuficiente para los dos: en cascada, Fi suma lo que le falta a Épsilon; ambos ≫ ahorro del mes (1.300 €). */
const PACE_E = () => objective({ id: 'obj-e', name: 'Épsilon', targetCents: 1_500_000, targetDate: '2027-03-15' })
const PACE_F = () => objective({ id: 'obj-f', name: 'Fi', targetCents: 1_500_000, targetDate: '2027-03-15' })

const ctxWith = (objectives: ReturnType<typeof objective>[], movements = healthyMovements()) => buildFinancialContext(snapshot({ config: config(100_000), movements, objectives }), TODAY)
const criticalMovements = () => [ingreso('2026-08-01', 200_000), gasto('2026-08-10', 50_000), ingreso('2026-09-01', 150_000), gasto('2026-09-05', 120_000, 'Comida'), gasto('2026-09-08', 60_000, 'Salidas')]

/** Sano, tres objetivos pendientes sin fecha (equivalentes: los tres `objectives.no-date`, low). */
const three = () => ctxWith([A(), B(), C()])

describe('AXIS · perfil · priorities · sin efecto cuando no procede', () => {
  it('sin priorities → comportamiento anterior (todos los escenarios)', () => {
    for (const { name, input } of GOLDEN_SCENARIOS) {
      const d = decide({ ...input, profile: { sources: {}, conflicts: [] } })
      assert.deepEqual(withoutProfile(d), withoutProfile(decide(input)), name)
    }
    const d = decide({ context: three(), profile: { sources: {}, conflicts: [] } })
    assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: three() })))
    assert.deepEqual(d.profile.influence, [])
  })

  it('prioridades vacías (o sin memoria de origen) → comportamiento anterior', () => {
    const ctx = three()
    const plain = withoutProfile(decide({ context: ctx }))
    for (const profile of [prio([]), { priorities: ['obj-b'], sources: {}, conflicts: [] } as UserProfile]) {
      const d = decide({ context: ctx, profile })
      assert.deepEqual(withoutProfile(d), plain)
      assert.deepEqual(d.profile.influence, [])
    }
    assert.equal(prioritiesOf(reconcileProfile(prio([]), ctx)), null)
  })

  it('priorizar el objetivo que ya va primero no cambia nada ni genera influencia', () => {
    const ctx = three()
    const d = decide({ context: ctx, profile: prio(['obj-a']) })
    assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: ctx })))
    assert.deepEqual(d.profile.influence, [])
    for (const s of d.signals) assert.equal('profileInfluence' in s, false, s.id)
  })

  it('prioridad a un objetivo inexistente → ya reconciliada (dropped) y sin efecto', () => {
    const ctx = three()
    const d = decide({ context: ctx, profile: prio(['no-existe']) })
    assert.deepEqual(d.profile.fields.droppedPriorities, [{ objectiveId: 'no-existe', reason: 'missing' }])
    assert.equal(d.profile.fields.priorities, undefined)
    assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: ctx })))
    assert.deepEqual(d.profile.influence, [])
  })

  it('prioridad a un objetivo completado → dropped, no influye, y su señal «conseguido» sigue ahí', () => {
    const ctx = ctxWith([A(), DONE()])
    const d = decide({ context: ctx, profile: prio(['obj-done']) })
    assert.deepEqual(d.profile.fields.droppedPriorities, [{ objectiveId: 'obj-done', reason: 'completed' }])
    assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: ctx })))
    assert.ok(byId(d.signals).has('objectives.completed:obj-done'))
    assert.deepEqual(d.profile.influence, [])
  })
})

describe('AXIS · perfil · priorities · no contradice el orden del reparto', () => {
  it('una prioridad de memoria distinta del orden real no reordena ni cambia el destino del excedente', () => {
    const ctx = three()
    const plain = decide({ context: ctx })
    const d = decide({ context: ctx, profile: prio(['obj-b']) })
    assert.deepEqual(withoutProfile(d), withoutProfile(plain))
    assert.deepEqual(d.profile.influence, [])
    // El orden es el del reparto: Alfa recibe primero; el excedente se asigna solo, sin «destinar» a mano.
    assert.deepEqual(d.signals.filter((s) => s.domain === 'objectives').map(objectiveIdOf), ['obj-a', 'obj-b', 'obj-c'])
    assert.equal(d.recommendation, null)
    assert.match(byId(d.signals).get('savings.healthy')!.interpretation, /ahora va a «Alfa»/)
  })

  it('varias prioridades → mismo resultado que sin ellas; el helper de orden sigue disponible pero no se aplica', () => {
    const ctx = three()
    const d = decide({ context: ctx, profile: prio(['obj-c', 'obj-b']) })
    assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: ctx })))
    assert.deepEqual(d.profile.influence, [])
    assert.deepEqual(rankByPriorities(ctx.objectives, ['obj-c', 'obj-b']).map((o) => o.id), ['obj-c', 'obj-b', 'obj-a'])
  })

  it('con dos ritmos insuficientes, lidera y se recomienda ajustar el primero del reparto aunque la memoria priorice el otro', () => {
    const ctx = ctxWith([PACE_E(), PACE_F()])
    const plain = decide({ context: ctx })
    assert.equal(plain.lead?.id, 'objectives.pace:obj-e')
    assert.equal(plain.recommendation?.action.targetId, 'obj-e')
    const d = decide({ context: ctx, profile: prio(['obj-f']) })
    assert.deepEqual(withoutProfile(d), withoutProfile(plain))
    assert.equal(d.lead?.id, 'objectives.pace:obj-e')
    assert.deepEqual(d.recommendation?.action, { verb: 'adjust', target: 'objective', targetId: 'obj-e' })
    assert.deepEqual(d.profile.influence, [])
  })
})

describe('AXIS · perfil · priorities · lo que nunca cambia', () => {
  it('un objetivo vencido sigue vencido (high, misma recomendación) esté o no priorizado', () => {
    const ctx = ctxWith([A(), OVERDUE()])
    const plain = decide({ context: ctx })
    const over = byId(plain.signals).get('objectives.overdue:obj-over')!
    assert.equal(over.priority, 'high')
    for (const ids of [['obj-a'], ['obj-over'], ['obj-a', 'obj-over'], ['obj-over', 'obj-a']]) {
      const d = decide({ context: ctx, profile: prio(ids) })
      const after = byId(d.signals).get('objectives.overdue:obj-over')!
      assert.equal(after.priority, 'high', ids.join())
      assert.deepEqual(after.recommendation, over.recommendation, ids.join())
      assert.equal(after.fact, over.fact)
      assert.equal(d.lead?.id, 'objectives.overdue:obj-over', `${ids.join()}: el vencido lidera igual (high > low)`)
      assert.deepEqual(d.recommendation, plain.recommendation, `${ids.join()}: la recomendación de la decisión es ajustar el vencido`)
      assert.equal('profileInfluence' in after, false, `${ids.join()}: priorizar (o no) el vencido no cambia nada en su señal`)
    }
  })

  it('objectives.pace no desaparece por prioridades', () => {
    const ctx = ctxWith([A(), PACE_E()])
    for (const ids of [['obj-a'], ['obj-e'], ['obj-e', 'obj-a']]) {
      const d = decide({ context: ctx, profile: prio(ids) })
      const pace = byId(d.signals).get('objectives.pace:obj-e')
      assert.ok(pace, ids.join())
      assert.equal(pace.priority, 'high')
      assert.equal(d.lead?.id, 'objectives.pace:obj-e')
      assert.equal(d.recommendation?.action.targetId, 'obj-e', 'ajustar Épsilon sigue siendo la recomendación (high)')
    }
  })

  it('priorities no modifica critical', () => {
    const ctx = ctxWith([A(), B()], criticalMovements())
    const plain = decide({ context: ctx })
    assert.equal(plain.lead?.id, 'expenses.over-income')
    const d = decide({ context: ctx, profile: prio(['obj-b']) })
    assert.equal(d.lead?.id, 'expenses.over-income')
    assert.deepEqual(byId(d.signals).get('expenses.over-income'), byId(plain.signals).get('expenses.over-income'))
    assert.deepEqual(d.recommendation, plain.recommendation)
    assert.equal(byId(d.signals).has('savings.healthy'), false)
    assert.deepEqual(d.profile.influence, [], 'la memoria de prioridades ya no reordena nada')
  })

  it('priorities no modifica minLiquidityCents ni su señal', () => {
    const ctx = ctxWith([A(), B()])
    const min: UserProfile = { minLiquidityCents: 500_000, sources: { minLiquidityCents: 'mem-liq' }, conflicts: [] }
    const both: UserProfile = { ...min, priorities: ['obj-b'], sources: { ...min.sources, priorities: 'mem-prio' } }
    const onlyMin = decide({ context: ctx, profile: min })
    const d = decide({ context: ctx, profile: both })
    assert.deepEqual(byId(d.signals).get('liquidity.below-min'), byId(onlyMin.signals).get('liquidity.below-min'), 'la señal de liquidez es idéntica (su alternativa sigue nombrando el primer pendiente del contexto)')
    assert.equal(d.lead?.id, 'liquidity.below-min')
    assert.deepEqual(d.recommendation, onlyMin.recommendation)
    // savings.healthy solo lleva la influencia de la liquidez mínima; priorities ya no elige destino.
    assert.deepEqual(byId(d.signals).get('savings.healthy')?.profileInfluence, [
      { field: 'minLiquidityCents', sourceMemoryId: 'mem-liq', signalId: 'savings.healthy', effect: 'alternative-removed' },
    ])
  })

  it('los campos inertes del perfil siguen siéndolo junto a priorities (horizon/riskAttitude: solo texto, ver horizon-risk.test.ts)', () => {
    const only = prio(['obj-b'])
    const all: UserProfile = { ...only, irregularIncome: false, minLiquidityCents: 1, sources: { ...only.sources, irregularIncome: 'c', minLiquidityCents: 'd' } }
    for (const ctx of [three(), ctxWith([A(), OVERDUE()]), ctxWith([PACE_E(), PACE_F()])]) {
      assert.deepEqual(withoutProfile(decide({ context: ctx, profile: all })), withoutProfile(decide({ context: ctx, profile: only })))
    }
  })

  it('savings.healthy mantiene el resto de su comportamiento (define objetivo sin objetivos; sin recomendación con solo completados)', () => {
    const none = decide({ context: ctxWith([]), profile: prio(['x']) })
    assert.equal(byId(none.signals).get('savings.healthy')?.recommendation?.action.verb, 'define')
    const onlyDone = decide({ context: ctxWith([DONE()]), profile: prio(['obj-done']) })
    assert.equal(byId(onlyDone.signals).get('savings.healthy')?.recommendation, undefined)
    assert.deepEqual(withoutProfile(onlyDone), withoutProfile(decide({ context: ctxWith([DONE()]) })))
  })
})

describe('AXIS · perfil · priorities · invariante: solo selección entre equivalentes', () => {
  const permutations = <T>(items: T[]): T[][] => (items.length <= 1 ? [items] : items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [x, ...rest])))
  const subsets = <T>(items: T[]): T[][] => items.reduce<T[][]>((acc, x) => [...acc, ...acc.map((s) => [...s, x])], [[]])

  const CONTEXTS: Array<[string, FinancialContext]> = [
    ['tres sin fecha', three()],
    ['vencido + pendiente', ctxWith([A(), OVERDUE()])],
    ['dos ritmos insuficientes + uno sin fecha', ctxWith([PACE_E(), PACE_F(), A()])],
    ['critical con dos objetivos', ctxWith([A(), B()], criticalMovements())],
    ['completado + dos pendientes', ctxWith([DONE(), A(), B()])],
  ]

  it('cambiar el orden de priorities no cambia el conjunto de señales ni sus prioridades; solo puede cambiar el orden entre iguales y el destino elegido', () => {
    for (const [name, ctx] of CONTEXTS) {
      const plain = decide({ context: ctx })
      const pending = ctx.objectives.filter((o) => !o.completed).map((o) => o.id)
      const orderings = subsets(pending).flatMap((s) => permutations(s)).filter((ids) => ids.length > 0)
      for (const ids of orderings) {
        const d = decide({ context: ctx, profile: prio(ids) })
        const label = `${name} · [${ids.join(', ')}]`
        // Mismas señales (multiconjunto de ids), misma prioridad, hecho, interpretación, alternativa e incertidumbre por señal.
        assert.deepEqual(d.signals.map((s) => s.id).sort(), plain.signals.map((s) => s.id).sort(), label)
        for (const s of d.signals) {
          const p = byId(plain.signals).get(s.id)!
          const { profileInfluence, recommendation, ...rest } = s
          const { recommendation: plainRecommendation, ...plainRest } = p
          assert.deepEqual(rest, plainRest, `${label} · ${s.id}: la señal es la misma`)
          if (s.id === 'savings.healthy' && recommendation && plainRecommendation && recommendation.action.targetId !== plainRecommendation.action.targetId) {
            // Único cambio permitido: el destino (objetivo pendiente priorizado); mismo verbo, mismo target, mismo siguiente paso.
            assert.equal(recommendation.action.verb, plainRecommendation.action.verb, label)
            assert.equal(recommendation.action.target, 'objective', label)
            assert.deepEqual(recommendation.nextStep, plainRecommendation.nextStep, label)
            assert.ok(ids.includes(recommendation.action.targetId!), `${label}: destino priorizado`)
            assert.ok(profileInfluence?.some((i) => i.effect === 'target-selected' && i.to === recommendation.action.targetId), label)
          } else {
            assert.deepEqual(recommendation, plainRecommendation, `${label} · ${s.id}: misma recomendación`)
          }
          if (profileInfluence) {
            for (const i of profileInfluence) {
              assert.equal(i.field, 'priorities')
              assert.equal(i.sourceMemoryId, 'mem-prio')
              assert.equal(i.signalId, s.id)
              assert.equal(i.effect, 'target-selected')
              assert.ok(PROFILE_EFFECTS.includes(i.effect))
              assert.ok(ids.includes(i.to!), `${label}: el elegido está priorizado`)
              assert.notEqual(i.from, i.to)
            }
          }
        }
        // critical/high/medium/low: cada nivel conserva exactamente las mismas señales.
        for (const level of ['critical', 'high', 'medium', 'low'] as const) {
          assert.deepEqual(d.signals.filter((s) => s.priority === level).map((s) => s.id).sort(), plain.signals.filter((s) => s.priority === level).map((s) => s.id).sort(), `${label} · ${level}`)
        }
        // La recomendación de la decisión: mismo verbo que sin prioridades; el destino, si cambia, es un pendiente priorizado.
        assert.equal(d.recommendation?.action.verb, plain.recommendation?.action.verb, label)
        if (d.recommendation?.action.targetId !== plain.recommendation?.action.targetId) {
          assert.ok(ids.includes(d.recommendation!.action.targetId!), `${label}: destino elegido entre los priorizados`)
        }
        assert.equal(d.confidence, plain.confidence, label)
        // Los hechos (vista acotada a 4 señales relevantes / 5 hechos) solo pueden diferir en hechos de
        // señales EQUIVALENTES (misma prioridad): reordenar entre iguales decide cuáles entran en el tope.
        const changed = [...d.facts.filter((f) => !plain.facts.includes(f)), ...plain.facts.filter((f) => !d.facts.includes(f))]
        const priorities = new Set(changed.map((f) => plain.signals.find((x) => x.fact === f)?.priority ?? 'desconocida'))
        assert.ok(priorities.size <= 1 && !priorities.has('desconocida'), `${label}: hechos distintos solo entre señales equivalentes (${[...priorities].join(', ')})`)
      }
    }
  })

  it('un solo objetivo pendiente: ninguna permutación de prioridades cambia nada', () => {
    const ctx = ctxWith([A(), DONE()])
    for (const ids of [['obj-a'], ['obj-done', 'obj-a'], ['obj-a', 'obj-done']]) {
      const d = decide({ context: ctx, profile: prio(ids) })
      assert.deepEqual(withoutProfile(d), withoutProfile(decide({ context: ctx })), ids.join())
      assert.deepEqual(d.profile.influence, [], ids.join())
    }
  })

  it('la influencia aparece si y solo si la señal ha cambiado de sitio entre sus iguales o de destino', () => {
    for (const [name, ctx] of CONTEXTS) {
      const plainObjs = objectiveRules(ctx, null)
      const pending = ctx.objectives.filter((o) => !o.completed).map((o) => o.id)
      for (const ids of permutations(pending)) {
        const ranked = objectiveRules(ctx, null, reconcileProfile(prio(ids), ctx))
        const label = `${name} · [${ids.join(', ')}]`
        for (const s of ranked) {
          const same = (list: Signal[]) => list.filter((t) => t.priority === s.priority).map((t) => t.id)
          const moved = same(ranked).indexOf(s.id) < same(plainObjs).indexOf(s.id)
          assert.equal('profileInfluence' in s, moved, `${label} · ${s.id}: influencia ⇔ adelanta a una equivalente`)
        }
      }
    }
  })

  it('determinismo, serialización sin pérdida y no mutación', () => {
    for (const [name, ctx] of CONTEXTS) {
      const input: AxisInput = { context: ctx, profile: prio(ctx.objectives.filter((o) => !o.completed).map((o) => o.id).reverse()) }
      const before = roundTrip(input)
      const a = decide(input)
      assert.deepEqual(a, decide(input), name)
      for (const s of a.signals) if (s.profileInfluence) assert.deepEqual(roundTrip(s), s, `${name} · ${s.id}`)
      assert.deepEqual(roundTrip(a.profile), a.profile, name)
      assert.deepEqual(roundTrip(input), before, name)
      assert.deepEqual(ctx.objectives.map((o) => o.id), before.context.objectives.map((o) => o.id), `${name}: el contexto no se reordena`)
    }
  })
})
