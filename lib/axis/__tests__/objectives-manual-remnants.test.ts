/**
 * Fase B3: sin restos del modelo de aportaciones manuales a objetivos.
 *
 * Los objetivos reciben dinero solo por el reparto automático, en el orden de
 * Finax: ninguna señal propone aportar, reservar o destinar a mano, y la
 * memoria `priorities` ya no se crea desde la conversación ni ordena nada.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { parseChatReply } from '../chat/validate'
import { AXIS_CHAT_SCHEMA } from '../chat/schema'
import { AXIS_CHAT_SYSTEM_PROMPT } from '../prompts'
import type { AxisDecision, AxisInput, AxisMemory } from '../types'
import { AI_ENGINE_INFO } from '../ai-engine'
import { GOLDEN_SCENARIOS } from './golden-scenarios'
import { config, gasto, healthyMovements, ingreso, objective, snapshot, TODAY } from './fixtures'
import * as objectivesDb from '../../db/objectives'

const MANUAL = /\b(?:[Aa]porta(?:r|le|lo)?|[Aa]portación|[Rr]eserva(?:r)? los|[Dd]estina(?:r)? parte|apartado para este objetivo)\b/

const healthy = (objectives = [objective({ id: 'obj-a', name: 'Viaje', targetCents: 500_000 }), objective({ id: 'obj-b', name: 'Moto', targetCents: 300_000 })]) =>
  buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements(), objectives }), TODAY)

/** Todo lo que AXIS puede decir de una decisión: señales, recomendación y alternativas. */
const textsOf = (d: AxisDecision) => JSON.stringify({ signals: d.signals, recommendation: d.recommendation, alternatives: d.alternatives })

describe('B3 · liquidity.below-min sin aportación manual', () => {
  it('con un objetivo pendiente y el colchón sin cubrir, la alternativa explica el reparto automático', () => {
    const d = decide({ context: healthy(), profile: { minLiquidityCents: 500_000, sources: { minLiquidityCents: 'mem-liq' }, conflicts: [] } })
    const s = d.signals.find((x) => x.id === 'liquidity.below-min')!
    assert.equal(s.alternative?.name, 'Dejar el reparto como está')
    assert.match(s.alternative!.summary, /siguen recibiendo dinero automáticamente según su orden \(ahora «Viaje»\), pero el reparto no aparta tu colchón/)
    assert.doesNotMatch(JSON.stringify(s), MANUAL)
    assert.deepEqual(d.recommendation?.action, { verb: 'complete-cushion', target: 'cushion' }, 'la lógica financiera de la señal no cambia')
  })
})

describe('B3 · memoria priorities', () => {
  it('una memoria antigua sigue leyéndose, pero no reordena objetivos ni cambia nada', () => {
    const ctx = healthy()
    const old: AxisMemory = { profileFacts: [{ id: 'mem-prio', updatedAt: 1, fact: { kind: 'priorities', objectiveIds: ['obj-b'] } }] }
    const withOld = decide({ context: ctx, memory: old })
    assert.deepEqual(withOld.profile.fields.priorities, ['obj-b'], 'se conserva como histórico (compatibilidad)')
    const { profile: _a, ...a } = withOld
    const { profile: _b, ...b } = decide({ context: ctx })
    void _a
    void _b
    assert.deepEqual(a, b)
    assert.deepEqual(withOld.profile.influence, [])
    assert.deepEqual(ctx.objectives.map((o) => o.id), ['obj-a', 'obj-b'], 'el orden es el del reparto')
  })

  it('una conversación nueva no crea un hecho priorities: queda como nota de texto sin efecto', () => {
    const reply = parseChatReply({
      engine: AI_ENGINE_INFO,
      generatedAt: '2026-09-15T10:00:00.000Z',
      reply: 'Entendido, lo tendré en cuenta.',
      confidence: 'media',
      nextStep: null,
      memoryProposal: { content: 'Quiere priorizar la moto antes que el viaje.', category: 'financial_plan', importance: 'high', confidence: 0.9, replacesId: null, fact: { kind: 'priorities', objectiveIds: ['obj-b', 'obj-a'] } },
    })
    assert.ok(reply.memoryProposal, 'la nota se puede guardar')
    assert.equal(reply.memoryProposal.fact, undefined, 'sin hecho estructurado de prioridades')
  })

  it('el esquema y el prompt del chat ya no ofrecen «priorities» como dato de perfil', () => {
    assert.doesNotMatch(JSON.stringify(AXIS_CHAT_SCHEMA), /"priorities"/)
    assert.doesNotMatch(AXIS_CHAT_SYSTEM_PROMPT, /«priorities»/)
    assert.match(AXIS_CHAT_SYSTEM_PROMPT, /El orden de sus objetivos no es un dato de perfil: se cambia en Finax\./)
  })
})

describe('B3 · ninguna acción de objetivo usa el flujo manual', () => {
  const contexts: Array<readonly [string, AxisInput]> = [
    ...GOLDEN_SCENARIOS.map((s) => [s.name, s.input] as const),
    ['dos objetivos sanos', { context: healthy() }] as const,
    ['con colchón sin cubrir', { context: healthy(), profile: { minLiquidityCents: 500_000, sources: { minLiquidityCents: 'mem-liq' }, conflicts: [] } }],
    ['ingreso extraordinario', { context: buildFinancialContext(snapshot({ config: config(100_000), movements: [ingreso('2026-08-01', 100_000), gasto('2026-08-05', 50_000), ingreso('2026-09-01', 300_000), gasto('2026-09-05', 50_000)], objectives: [objective({ name: 'Viaje', targetCents: 900_000 })] }), TODAY) }] as const,
  ]

  it('ninguna señal recomienda allocate/reserve ni habla de aportar, reservar o destinar a mano', () => {
    for (const [name, input] of contexts) {
      const d = decide(input)
      for (const s of d.signals) {
        assert.ok(!s.recommendation || !['allocate', 'reserve'].includes(s.recommendation.action.verb), `${name} · ${s.id}`)
      }
      assert.doesNotMatch(textsOf(d), MANUAL, name)
    }
  })

  it('la capa de datos ya no expone una aportación manual a objetivos', () => {
    assert.equal('contributeToObjective' in objectivesDb, false)
  })
})
