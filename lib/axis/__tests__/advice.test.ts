/**
 * recommendation.action + licencia determinista de consejos (fase 2 · bloque 3).
 *
 * AXIS decide la acción (reglas); el modelo solo puede expresarla. Un consejo
 * que AXIS no ha decidido es una violación `advice` y provoca el mismo
 * fallback local que cualquier otra invariante de Decision First.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AI_ENGINE_INFO } from '../ai-engine'
import { AXIS_OUTPUT_SCHEMA } from '../ai/schema'
import { AXIS_EXPRESSION_SCHEMA } from '../ai/schema-expression'
import { analyzeWithProvider } from '../ai/server/analyze'
import { AXIS_CHAT_SCHEMA } from '../chat/schema'
import { render } from '../compose'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { mergeExpression, type Expression } from '../core/expression'
import { knownEntities, validateExpression } from '../core/semantic'
import { LOCAL_RULES_ENGINE_INFO } from '../local-engine'
import { ACTION_TARGETS, ACTION_VERBS, type AxisAction, type AxisDecision } from '../types'
import { parseAxisAnalysis } from '../validate'
import type { MarketAIProvider } from '../../ai/providers/types'
import { checkAdvice, COMPATIBLE, EXECUTABLE_CLASSES, extractAdvice, licenseAdvice, type AdviceVerbClass, type KnownEntities } from '../../text/advice'
import { config, healthyMovements, NOW, objective, snapshot, TODAY } from './fixtures'

const entities: KnownEntities = { objectives: [{ id: 'obj-viaje', name: 'Viaje' }, { id: 'obj-coche', name: 'Coche' }], positions: [{ id: 'p1', name: 'Fondo indexado' }], categories: ['Restaurantes', 'Comida'] }
const allocateViaje = { stance: 'recommend' as const, action: { verb: 'allocate', target: 'objective', targetId: 'obj-viaje' } as AxisAction, alternatives: ['Mantener liquidez'] }
const reserveCushion = { stance: 'recommend' as const, action: { verb: 'complete-cushion', target: 'cushion' } as AxisAction, alternatives: [] }
const inform = { stance: 'inform' as const, alternatives: [] }

const input = () => ({ context: buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements(), objectives: [objective({ id: 'obj-viaje', name: 'Viaje', targetCents: 500_000, currentCents: 246_000 })] }), TODAY) })

function goodExpression(d: AxisDecision, conclusion = 'Con esto, la lectura queda clara; sigue registrando movimientos.'): Expression {
  return {
    headline: `Lectura de AXIS: ${d.lead?.fact ?? 'situación estable'}`,
    interpretation: { summary: `Con los datos disponibles, ${d.lead?.interpretation ?? 'nada que atender'}`, signals: d.relevant.map((s) => ({ id: s.id, text: `Dicho de otro modo: ${s.interpretation}` })) },
    recommendationWhy: d.recommendation ? `Tiene sentido porque ${d.recommendation.why}` : null,
    alternatives: d.alternatives.map((a) => ({ name: a.name, summary: `Otra opción: ${a.summary}` })),
    uncertainties: d.uncertainties.map((u) => ({ title: u.title, detail: `Conviene tenerlo presente: ${u.detail}` })),
    conclusion,
  }
}

describe('AXIS · consejos · licencia frente a la acción de AXIS', () => {
  it('Viaje + allocate → destinar/aportar/ahorrar para el Viaje o al objetivo: permitido', () => {
    for (const t of ['Destina parte del excedente al Viaje.', 'Yo destinaría parte del margen al Viaje.', 'Ahorra para el Viaje.', 'Aporta al objetivo.', 'Deberías aportar algo al Viaje este mes.']) {
      assert.deepEqual(checkAdvice(t, entities, allocateViaje), [], t)
    }
  })

  it('Viaje + allocate → «compra Tesla» y equivalentes: rechazado', () => {
    for (const t of ['Compra Tesla.', 'Yo compraría acciones de Tesla.', 'Deberías invertir en un fondo indexado.', 'Mejor invertir ese dinero en bolsa.', 'Vende el Fondo indexado y aporta al Viaje.']) {
      const v = checkAdvice(t, entities, allocateViaje)
      assert.ok(v.length >= 1, t)
      assert.ok(v.every((c) => ['buy', 'invest', 'sell'].includes(c.verbClass)), t)
    }
  })

  it('objetivo incorrecto → rechazado; objetivo genérico o sin destino → permitido', () => {
    assert.deepEqual(checkAdvice('Aporta a Coche.', entities, allocateViaje).map((c) => [c.verbClass, c.target.kind, 'name' in c.target ? c.target.name : '']), [['allocate', 'objective', 'Coche']])
    assert.deepEqual(checkAdvice('Aporta al objetivo.', entities, allocateViaje), [])
    assert.deepEqual(checkAdvice('Yo aportaría algo más este mes.', entities, allocateViaje), [])
    assert.ok(checkAdvice('Aporta al colchón.', entities, allocateViaje).length === 1, 'destino de otra clase (cushion) no coincide con objective')
  })

  it('reserve/complete-cushion → cushion + mantener/guardar liquidez: permitido', () => {
    for (const t of ['Mantén ese dinero como colchón.', 'Guarda ese dinero como colchón.', 'Yo reservaría esa parte como liquidez.']) assert.deepEqual(checkAdvice(t, entities, reserveCushion), [], t)
    assert.ok(checkAdvice('Invierte ese colchón en un ETF.', entities, reserveCushion).length === 1)
  })

  it('consejo negativo sobre Tesla → permitido (disuadir no crea una acción)', () => {
    for (const t of ['No compres Tesla.', 'Yo no invertiría en Tesla ahora.', 'No vendas el Fondo indexado.', 'Yo no lo movería.']) {
      assert.deepEqual(checkAdvice(t, entities, inform), [], t)
      const advice = extractAdvice(t, entities)
      assert.ok(advice.length >= 1 && advice.every((a) => a.negated), t)
    }
  })

  it('stance=inform + «deberías ahorrar» → rechazado; consejos blandos y prosa sin consejo → permitidos', () => {
    assert.deepEqual(checkAdvice('Deberías ahorrar más.', entities, inform).map((c) => c.verbClass), ['save'])
    assert.deepEqual(checkAdvice('Registra los movimientos del mes.', entities, inform).map((c) => c.verbClass), ['register'])
    for (const t of ['Yo vigilaría ese gasto durante los próximos meses.', 'Ahora mismo estás ahorrando bastante, así que tienes margen.', 'Con lo que sabemos ahora, no tenemos suficiente información para estar seguros.', 'Yo esperaría a ver el mes que viene.']) {
      assert.deepEqual(checkAdvice(t, entities, inform), [], t)
    }
    assert.ok(checkAdvice('Mantén Tesla en cartera.', entities, inform).length === 1, 'blando pero con destino externo')
  })

  it('invest/buy/sell positivos no son licenciables por ninguna acción de AXIS', () => {
    const never: AdviceVerbClass[] = ['invest', 'buy', 'sell']
    for (const verb of ACTION_VERBS) for (const cls of never) assert.equal(COMPATIBLE[verb].has(cls), false, `${verb} no licencia ${cls}`)
    for (const cls of never) assert.equal(EXECUTABLE_CLASSES.has(cls), true)
    const clauses = extractAdvice('Invierte en el Viaje. Compra el Viaje. Vende el Viaje.', entities)
    assert.equal(clauses.length, 3)
    for (const verb of ACTION_VERBS) {
      for (const target of ACTION_TARGETS) {
        const licensed = licenseAdvice(clauses, { stance: 'recommend', action: { verb, target, targetId: 'obj-viaje' }, alternatives: [] })
        assert.ok(licensed.every((c) => !c.licensed), `${verb}/${target}`)
      }
    }
  })

  it('citar una alternativa de AXIS es expresar la decisión, no crear otra', () => {
    assert.deepEqual(checkAdvice('Si prefieres, mantén la liquidez y no aportes todavía.', entities, allocateViaje), [])
    assert.deepEqual(checkAdvice('Guarda el excedente como colchón.', entities, { ...allocateViaje, alternatives: [] }).map((c) => c.verbClass), ['save'], 'sin la alternativa declarada, ahorrar al colchón no coincide con allocate→objective')
    assert.deepEqual(checkAdvice('Ahorra para Navidad.', entities, allocateViaje).map((c) => c.target.kind), ['external'], 'un nombre propio que no es objetivo del usuario es un destino externo')
  })
})

describe('AXIS · consejos · Decision First', () => {
  it('cada regla que recomienda declara una acción determinista (los 13 escenarios dorados)', () => {
    const dir = join(process.cwd(), 'lib', 'axis', '__tests__', '__snapshots__')
    let withRecommendation = 0
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const g = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { local: { analysis?: { recommendation: { action?: AxisAction } | null } } }
      const r = g.local.analysis?.recommendation
      if (!r) continue
      withRecommendation++
      assert.ok(r.action, `${f}: recomendación sin acción`)
      assert.ok(ACTION_VERBS.includes(r.action.verb) && ACTION_TARGETS.includes(r.action.target), f)
    }
    assert.ok(withRecommendation >= 10)
  })

  it('la propia redacción local de AXIS está licenciada por su propia acción (corpus)', () => {
    const dir = join(process.cwd(), 'lib', 'axis', '__tests__', '__snapshots__')
    const scenarios = readdirSync(dir).filter((x) => x.endsWith('.json'))
    assert.ok(scenarios.length >= 13)
    // Reconstruimos decisión + textos locales desde el escenario dorado «sano» y variantes reales.
    const inputs = [input(), { context: buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements() }), TODAY) }]
    for (const i of inputs) {
      const d = decide(i)
      const local = render(d, LOCAL_RULES_ENGINE_INFO, NOW)
      if (local.status !== 'analysis') continue
      const a = local.analysis
      const texts = [a.headline, a.interpretation.summary, ...a.interpretation.signals.map((s) => s.text), a.recommendation?.what ?? '', a.recommendation?.why ?? '', ...a.alternatives.map((x) => x.summary), ...a.uncertainty.items.map((u) => u.detail), a.conclusion.summary]
      const license = { stance: d.recommendation ? ('recommend' as const) : ('inform' as const), action: d.recommendation?.action, alternatives: d.alternatives.map((x) => x.name) }
      for (const t of texts) assert.deepEqual(checkAdvice(t, knownEntities(d), license), [], t)
    }
  })

  it('validateExpression: un consejo no decidido provoca la violación «advice» (→ fallback local)', async () => {
    const i = input()
    const d = decide(i)
    assert.deepEqual(d.recommendation?.action, { verb: 'allocate', target: 'objective', targetId: 'obj-viaje' })
    assert.deepEqual(validateExpression(d, goodExpression(d, 'Yo destinaría parte de ese margen al Viaje y vigilaría el gasto.')), { ok: true })
    for (const bad of ['Yo compraría acciones de Tesla con ese margen.', 'Deberías invertir ese dinero en un fondo indexado.', 'Aporta a Coche, que es más urgente.']) {
      const verdict = validateExpression(d, goodExpression(d, bad))
      assert.equal(verdict.ok, false, bad)
      if (!verdict.ok) assert.deepEqual(verdict.violations.map((v) => [v.invariant, v.field]), [['advice', 'conclusion']], bad)
    }
    // Y en el flujo completo, la misma violación produce el mismo fallo controlado que las demás.
    const raw = { headline: 'x', interpretation: { summary: 'y', signals: d.relevant.map((s) => ({ id: s.id, text: s.interpretation })) }, recommendation_why: 'Porque sí.', alternatives: d.alternatives, uncertainties: d.uncertainties, conclusion: 'Compra Tesla.' }
    const provider: MarketAIProvider = { id: 'mock', model: 'mock', completeWithUsage: async () => ({ output: raw, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }), complete: async () => raw }
    await assert.rejects(() => analyzeWithProvider(provider, i.context, undefined, undefined, null, 'decision-first'), /advice/)
  })

  it('sin recomendación (stance inform), el modelo no puede recomendar nada ejecutable', () => {
    const d = decide(input())
    const noRec: AxisDecision = { ...d, recommendation: null, nextStep: undefined }
    const e = { ...goodExpression(noRec, 'Deberías ahorrar más cada mes.'), recommendationWhy: null }
    const verdict = validateExpression(noRec, e)
    assert.equal(verdict.ok, false)
    if (!verdict.ok) assert.ok(verdict.violations.some((v) => v.invariant === 'advice' && v.field === 'conclusion'))
    assert.deepEqual(validateExpression(noRec, { ...e, conclusion: 'Yo vigilaría el gasto y esperaría al mes que viene.' }), { ok: true })
  })

  it('action no existe en ningún esquema de salida del modelo', () => {
    for (const [name, schema] of [
      ['expresión', AXIS_EXPRESSION_SCHEMA],
      ['legacy', AXIS_OUTPUT_SCHEMA],
      ['chat', AXIS_CHAT_SCHEMA],
    ] as const) {
      assert.equal(JSON.stringify(schema).includes('"action"'), false, name)
    }
  })

  it('el modelo no puede fabricar action: merge la inyecta de AXIS y el modo legacy la descarta', async () => {
    const i = input()
    const d = decide(i)
    const fake: AxisAction = { verb: 'review', target: 'none' }
    // Decision First: aunque el modelo cuele una acción, la fusión usa la de la decisión.
    const rawDF = { headline: 'x', interpretation: { summary: 'y', signals: d.relevant.map((s) => ({ id: s.id, text: s.interpretation })) }, recommendation_why: 'Porque sí.', recommendation: { what: 'Invierte', action: fake }, alternatives: d.alternatives, uncertainties: d.uncertainties, conclusion: 'Sigue así.' }
    const dfProvider: MarketAIProvider = { id: 'mock', model: 'mock', completeWithUsage: async () => ({ output: rawDF, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }), complete: async () => rawDF }
    const analysis = await analyzeWithProvider(dfProvider, i.context, undefined, undefined, null, 'decision-first')
    assert.deepEqual(analysis.recommendation?.action, d.recommendation?.action)
    assert.deepEqual(mergeExpression(d, goodExpression(d), AI_ENGINE_INFO, NOW).recommendation?.action, d.recommendation?.action)
    // Legacy: el modelo redacta la recomendación; cualquier acción que devuelva se elimina antes de validar.
    const legacyRaw = { headline: 'h', data: { facts: ['f'] }, interpretation: { summary: 's', signals: [] }, recommendation: { what: 'w', why: 'y', action: fake }, alternatives: [], uncertainty: { items: [], confidence: 'media' }, conclusion: { summary: 'c' } }
    const legacyProvider: MarketAIProvider = { id: 'mock', model: 'mock', completeWithUsage: async () => ({ output: legacyRaw, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }), complete: async () => legacyRaw }
    const legacy = await analyzeWithProvider(legacyProvider, i.context, undefined, undefined, null, 'legacy')
    assert.equal(legacy.recommendation?.action, undefined)
    // parseAxisAnalysis conserva solo acciones con forma cerrada y nunca inventa una.
    const parsed = parseAxisAnalysis({ ...legacyRaw, recommendation: { what: 'w', why: 'y', action: { verb: 'buy', target: 'objective' } }, engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() })
    assert.equal(parsed.recommendation?.action, undefined)
    const kept = parseAxisAnalysis({ ...legacyRaw, recommendation: { what: 'w', why: 'y', action: d.recommendation!.action }, engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() })
    assert.deepEqual(kept.recommendation?.action, d.recommendation?.action)
  })
})
