/**
 * La conclusión de AXIS es coherente con su recomendación: si AXIS recomienda
 * una acción, ninguna parte del análisis dice que no hace falta actuar; si no
 * recomienda nada, la conclusión no propone cambios. Vale para la redacción
 * local (`render`) y para la expresión del modelo (`validateExpression`).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { render } from '../compose'
import { INACTION_PATTERNS, validateExpression } from '../core/semantic'
import type { Expression } from '../core/expression'
import type { AxisAnalysis, AxisDecision, AxisInput } from '../types'
import { LOCAL_RULES_ENGINE_INFO } from '../local-engine'
import { GOLDEN_SCENARIOS } from './golden-scenarios'
import { config, healthyMovements, objective, snapshot, TODAY } from './fixtures'

const NOW = new Date('2026-09-15T10:00:00.000Z')
const analysisOf = (d: AxisDecision): AxisAnalysis => {
  const r = render(d, LOCAL_RULES_ENGINE_INFO, NOW)
  assert.equal(r.status, 'analysis')
  return (r as { analysis: AxisAnalysis }).analysis
}
const saysNoAction = (text: string) => INACTION_PATTERNS.some((re) => re.test(text))
/** Una conclusión sin recomendación no puede proponer un cambio ni remitir a una recomendación. */
const PROPOSES_CHANGE = /\bajuste\b|\bconviene actuar\b|\bte recomiendo\b/i

/** «Viaje» cubierto (el reparto llega a su meta) y «Moto» en curso: AXIS recomienda marcar «Viaje» como conseguido. */
const coveredContext = () =>
  buildFinancialContext(
    snapshot({
      config: config(0),
      movements: healthyMovements(),
      objectives: [
        objective({ id: 'obj-viaje', name: 'Viaje', targetCents: 200_000, createdAt: Date.parse('2025-12-01') }),
        objective({ id: 'obj-moto', name: 'Moto', targetCents: 900_000, createdAt: Date.parse('2026-01-01') }),
      ],
    }),
    TODAY,
  )

const inputs: Array<readonly [string, AxisInput]> = [
  ...GOLDEN_SCENARIOS.map((s) => [s.name, s.input] as const),
  ['objetivo cubierto', { context: coveredContext() }],
]

describe('conclusión · coherente con la recomendación (motor local)', () => {
  it('caso A · objetivo que debe marcarse como conseguido: la conclusión no dice que no haga falta actuar', () => {
    const d = decide({ context: coveredContext() })
    const a = analysisOf(d)
    assert.match(a.recommendation?.what ?? '', /márcalo como conseguido/)
    assert.equal(d.lead?.recommendation, undefined, 'la recomendación viene de otra señal, no de la líder')
    assert.ok(!saysNoAction(a.conclusion.summary), a.conclusion.summary)
    assert.equal(a.conclusion.summary, 'Situación estable con los datos disponibles. No hay nada urgente; el único paso pendiente es el que te recomiendo.')
  })

  it('con recomendación, ninguna parte del análisis dice que no haga falta actuar (todos los escenarios)', () => {
    let withRecommendation = 0
    for (const [name, input] of inputs) {
      const d = decide(input)
      if (d.level === 'none' || !d.recommendation) continue
      withRecommendation++
      const a = analysisOf(d)
      for (const text of [a.headline, a.interpretation.summary, ...a.interpretation.signals.map((s) => s.text), a.conclusion.summary]) {
        assert.ok(!saysNoAction(text), `${name}: «${text}»`)
      }
    }
    assert.ok(withRecommendation >= 8, `escenarios con recomendación: ${withRecommendation}`)
  })

  it('caso B · sin recomendación, la conclusión no propone cambios', () => {
    let without = 0
    for (const [name, input] of inputs) {
      const d = decide(input)
      if (d.level === 'none' || d.recommendation) continue
      without++
      assert.doesNotMatch(analysisOf(d).conclusion.summary, PROPOSES_CHANGE, name)
    }
    assert.ok(without >= 1)
  })

  it('cada rama de la conclusión según prioridad de la líder y origen de la recomendación', () => {
    const base = decide({ context: coveredContext() })
    const rec = base.recommendation!
    const withLead = (priority: 'high' | 'medium' | 'low', leadRecommends: boolean, recommendation: typeof rec | null): AxisDecision => {
      const lead = { ...base.lead!, priority, ...(leadRecommends ? { recommendation: rec } : {}) }
      if (!leadRecommends) delete (lead as { recommendation?: unknown }).recommendation
      return { ...base, lead, recommendation }
    }
    const cases: Array<[string, AxisDecision, RegExp]> = [
      ['alta, recomienda ella', withLead('high', true, rec), /^Conviene actuar sobre este punto este mes/],
      ['alta, recomienda otra', withLead('high', false, rec), /^Conviene vigilar este punto el mes que viene; el único paso pendiente es el que te recomiendo\.$/],
      ['alta, sin recomendación', withLead('high', false, null), /^Conviene vigilar este punto el mes que viene antes de hacer cambios importantes\.$/],
      ['media, recomienda ella', withLead('medium', true, rec), /^Situación estable\. Un ajuste moderado/],
      ['media, recomienda otra', withLead('medium', false, rec), /el único paso pendiente es el que te recomiendo\.$/],
      ['media, sin recomendación', withLead('medium', false, null), /por ahora no hace falta cambiar nada\.$/],
      ['baja, con recomendación', withLead('low', false, rec), /No hay nada urgente; el único paso pendiente es el que te recomiendo\.$/],
      ['baja, sin recomendación', withLead('low', false, null), /No hace falta actuar; mantén el ritmo\.$/],
    ]
    for (const [name, d, expected] of cases) {
      const summary = analysisOf(d).conclusion.summary
      assert.match(summary, expected, name)
      assert.equal(saysNoAction(summary), d.recommendation === null && /baja|media, sin/.test(name), `${name}: «${summary}»`)
    }
  })

  it('casos que ya eran coherentes: misma conclusión exacta', () => {
    const conclusionOf = (name: string) => analysisOf(decide(GOLDEN_SCENARIOS.find((s) => s.name === name)!.input)).conclusion.summary
    assert.equal(conclusionOf('multiples-senales'), 'Prioridad: volver a un balance mensual positivo antes de plantear ahorro o inversión.')
    assert.equal(conclusionOf('objetivo-con-fecha'), 'Conviene actuar sobre este punto este mes; el resto puede esperar.')
    assert.equal(conclusionOf('mercado-fresh'), 'Situación estable. Un ajuste moderado en el punto señalado mejoraría tu margen.')
    assert.equal(conclusionOf('objetivo-en-progreso'), 'Situación estable con los datos disponibles. No hace falta actuar; mantén el ritmo.')
  })
})

describe('conclusión · coherente con la recomendación (expresión del modelo)', () => {
  const expressionOf = (d: AxisDecision, conclusion: string): Expression => ({
    headline: d.lead?.fact ?? 'Situación estable.',
    interpretation: { summary: d.lead?.interpretation ?? 'Situación estable.', signals: d.relevant.map((s) => ({ id: s.id, text: s.interpretation })) },
    recommendationWhy: d.recommendation ? d.recommendation.why : null,
    alternatives: d.alternatives.map((a) => ({ name: a.name, summary: a.summary })),
    uncertainties: d.uncertainties.map((u) => ({ title: u.title, detail: u.detail })),
    conclusion,
  })

  it('con recomendación, «no hace falta actuar» en la conclusión invalida la expresión (stance)', () => {
    const d = decide({ context: coveredContext() })
    const verdict = validateExpression(d, expressionOf(d, 'Todo va bien: no hace falta actuar.'))
    assert.equal(verdict.ok, false)
    assert.ok(!verdict.ok && verdict.violations.some((v) => v.invariant === 'stance' && v.field === 'conclusion'), JSON.stringify(verdict))
    assert.deepEqual(validateExpression(d, expressionOf(d, 'Márcalo como conseguido cuando lo hayas logrado y seguirá el reparto.')), { ok: true })
  })

  it('sin recomendación, decir que no hace falta actuar es válido', () => {
    const input = GOLDEN_SCENARIOS.find((s) => s.name === 'objetivo-en-progreso')!.input
    const d = decide(input)
    assert.equal(d.recommendation, null)
    const verdict = validateExpression(d, expressionOf(d, 'Situación estable: no hace falta actuar ahora.'))
    assert.ok(verdict.ok || !verdict.violations.some((v) => v.invariant === 'stance'), JSON.stringify(verdict))
  })

  it('los patrones detectan las formas habituales y no confunden el seguimiento', () => {
    for (const t of ['No hace falta actuar.', 'no necesitas hacer nada', 'No hay que cambiar nada.', 'No es necesario actuar ahora.', 'Nada que cambiar por ahora.']) assert.ok(saysNoAction(t), t)
    for (const t of ['Conviene vigilar este punto el mes que viene.', 'No hay nada urgente; el único paso pendiente es el que te recomiendo.', 'No hace falta cambiar la meta si aplazas la fecha.']) assert.ok(!saysNoAction(t), t)
  })
})
