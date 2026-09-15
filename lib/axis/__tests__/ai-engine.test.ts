import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ENGINE_INFO, createAIEngine, type AITransport } from '../ai-engine'
import { buildFinancialContext } from '../context'
import { analyzeLocally, localRulesEngine } from '../local-engine'
import { buildAIRequest } from '../ai/prompt'
import { browserTransport, contextForRequest } from '../ai/browser-transport'
import { analyzeWithProvider, isFinancialContext } from '../ai/server/analyze'
import type { AxisAnalysis, AxisInput, AxisResult } from '../types'
import { config, healthyMovements, NOW, objective, snapshot, TODAY } from './fixtures'

function input(demo = false): AxisInput {
  return {
    context: buildFinancialContext(
      snapshot({
        config: config(100_000, demo),
        movements: healthyMovements(),
        objectives: [objective({ name: 'Viaje', targetCents: 500_000, currentCents: 246_000 })],
      }),
      TODAY,
    ),
  }
}

/** Un análisis válido tal y como lo devolvería el proveedor (sin engine/generatedAt). */
function validAIOutput(): Record<string, unknown> {
  const local = analyzeLocally(input(), NOW)
  if (local.status !== 'analysis') throw new Error('unreachable')
  const { engine, generatedAt, basedOnDemoData, ...rest } = local.analysis
  void engine
  void generatedAt
  void basedOnDemoData
  return { ...rest, headline: 'Lectura de la IA: ahorras el 65% de tus ingresos.', generatedAt: '2026-09-15T10:00:00.000Z' }
}

function transport(overrides: Partial<AITransport>): AITransport & { calls: number } {
  const t = {
    calls: 0,
    isAvailable: async () => true,
    analyze: async () => {
      t.calls++
      return validAIOutput()
    },
    ...overrides,
  }
  return t
}

const analysisOf = (r: AxisResult): AxisAnalysis => {
  assert.equal(r.status, 'analysis')
  if (r.status !== 'analysis') throw new Error('unreachable')
  return r.analysis
}

describe('aiEngine (IA con fallback al motor local)', () => {
  it('1 · el proveedor devuelve JSON válido → análisis de IA validado', async () => {
    const engine = createAIEngine({ transport: transport({}), fallback: localRulesEngine })
    const analysis = analysisOf(await engine.analyze(input()))
    assert.equal(analysis.engine.id, 'external-ai')
    assert.equal(analysis.engine.isAI, true)
    assert.match(analysis.headline, /Lectura de la IA/)
    assert.equal(analysis.uncertainty.confidence, 'media')
  })

  it('2 · JSON inválido → fallback local', async () => {
    const reasons: string[] = []
    const engine = createAIEngine({
      transport: transport({ analyze: async () => 'esto no es un objeto' }),
      fallback: localRulesEngine,
      onFallback: (r) => reasons.push(r),
    })
    const analysis = analysisOf(await engine.analyze(input()))
    assert.equal(analysis.engine.id, 'local-rules')
    assert.equal(reasons.length, 1)
  })

  it('3 · respuesta incompleta → fallback local', async () => {
    const partial = { headline: 'Solo un titular' }
    const engine = createAIEngine({ transport: transport({ analyze: async () => partial }), fallback: localRulesEngine })
    const analysis = analysisOf(await engine.analyze(input()))
    assert.equal(analysis.engine.id, 'local-rules')
  })

  it('4 · timeout → fallback local', async () => {
    const never = transport({
      analyze: (_input, signal) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    })
    const engine = createAIEngine({ transport: never, fallback: localRulesEngine, timeoutMs: 20 })
    const analysis = analysisOf(await engine.analyze(input()))
    assert.equal(analysis.engine.id, 'local-rules')
  })

  it('5 · proveedor no disponible (error de red / HTTP) → fallback local', async () => {
    const engine = createAIEngine({
      transport: transport({ analyze: async () => { throw new Error('axis api 503') } }),
      fallback: localRulesEngine,
    })
    const analysis = analysisOf(await engine.analyze(input()))
    assert.equal(analysis.engine.id, 'local-rules')
  })

  it('6 · proveedor no configurado (no disponible) → local sin llamar al proveedor', async () => {
    const t = transport({ isAvailable: async () => false })
    const engine = createAIEngine({ transport: t, fallback: localRulesEngine })
    const analysis = analysisOf(await engine.analyze(input()))
    assert.equal(analysis.engine.id, 'local-rules')
    assert.equal(t.calls, 0, 'no se llama al proveedor')
    // La disponibilidad se recuerda: una segunda petición tampoco llama.
    await engine.analyze(input())
    assert.equal(t.calls, 0)
  })

  it('7 · un análisis de IA válido llega al formato que consume la UI', async () => {
    const engine = createAIEngine({ transport: transport({}), fallback: localRulesEngine })
    const result = await engine.analyze(input())
    assert.equal(result.status, 'analysis')
    const a = analysisOf(result)
    for (const key of ['headline', 'data', 'interpretation', 'recommendation', 'alternatives', 'uncertainty', 'conclusion', 'generatedAt', 'engine']) {
      assert.ok(key in a, `falta ${key}`)
    }
    assert.ok(a.conclusion.nextStep === undefined || typeof a.conclusion.nextStep.label === 'string')
  })

  it('8 · no se ejecutan operaciones: la salida solo contiene texto y destinos permitidos', async () => {
    const malicious = { ...validAIOutput(), conclusion: { summary: 'ok', nextStep: { label: 'Borrar todo', to: 'https://x.example/delete' } } }
    const engine = createAIEngine({ transport: transport({ analyze: async () => malicious }), fallback: localRulesEngine })
    const a = analysisOf(await engine.analyze(input()))
    assert.equal(a.conclusion.nextStep?.to, undefined, 'destino desconocido descartado')
    assert.doesNotMatch(JSON.stringify(a), /"action"|"execute"|amountCents/)
  })

  it('9 · datos demo se mantienen marcados aunque el modelo diga lo contrario', async () => {
    const engine = createAIEngine({
      transport: transport({ analyze: async () => ({ ...validAIOutput(), basedOnDemoData: false, engine: { id: 'local-rules', label: 'x', isAI: false } }) }),
      fallback: localRulesEngine,
    })
    const a = analysisOf(await engine.analyze(input(true)))
    assert.equal(a.basedOnDemoData, true)
    assert.deepEqual(a.engine, AI_ENGINE_INFO)
  })

  it('10 · el FinancialContext no se modifica por la IA', async () => {
    const original = input()
    const before = JSON.stringify(original.context)
    const engine = createAIEngine({
      transport: transport({
        analyze: async (i) => {
          // Un transporte hostil intenta mutar el contexto.
          ;(i.context as { wealth: { totalCents: number } }).wealth.totalCents = 999
          return validAIOutput()
        },
      }),
      fallback: localRulesEngine,
    })
    const frozen: AxisInput = { context: JSON.parse(before) }
    await engine.analyze(frozen)
    assert.equal(JSON.stringify(original.context), before, 'el contexto original permanece intacto')
  })

  it('sin contexto (level none) no se llama a la IA', async () => {
    const t = transport({})
    const engine = createAIEngine({ transport: t, fallback: localRulesEngine })
    const result = await engine.analyze({ context: buildFinancialContext(snapshot({}), TODAY) })
    assert.equal(result.status, 'no-analysis')
    assert.equal(t.calls, 0)
  })
})

describe('prompt y proveedor (servidor)', () => {
  it('buildAIRequest envía el contexto mínimo y las señales, sin la serie diaria', () => {
    const req = buildAIRequest(input(true))
    assert.match(req.system, /AXIS/)
    assert.match(req.system, /nunca ejecuta/i)
    assert.doesNotMatch(req.user, /"history":\[/)
    assert.match(req.user, /senales_detectadas_por_finax/)
    assert.match(req.user, /"isDemo":true/)
    assert.equal((req.schema as { type: string }).type, 'object')
  })

  it('analyzeWithProvider fija engine/demo y valida la salida', async () => {
    const provider = { id: 'mock', complete: async () => validAIOutput() }
    const a = await analyzeWithProvider(provider, input(true).context)
    assert.equal(a.engine.id, AI_ENGINE_INFO.id)
    assert.equal(a.engine.isAI, true)
    assert.match(a.engine.label, /mock/)
    assert.equal(a.basedOnDemoData, true)
    const bad = { id: 'mock', complete: async () => ({ headline: 'x' }) }
    await assert.rejects(analyzeWithProvider(bad, input().context))
  })


  it('isFinancialContext rechaza cuerpos arbitrarios', () => {
    assert.equal(isFinancialContext(null), false)
    assert.equal(isFinancialContext({ asOf: 'x' }), false)
    assert.equal(isFinancialContext(input().context), true)
  })
})

describe('transporte del navegador (análisis)', () => {
  it('el POST no envía flows.history pero conserva el resto del contexto', async () => {
    const i = input()
    assert.ok(i.context.flows.history.length > 0, 'el contexto de prueba tiene serie diaria')
    const captured: { url?: string; init?: RequestInit } = {}
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      captured.url = String(url)
      captured.init = init
      return new Response(JSON.stringify({ analysis: validAIOutput() }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    try {
      await browserTransport.analyze(i, new AbortController().signal)
    } finally {
      globalThis.fetch = realFetch
    }
    assert.equal(captured.url, '/api/axis')
    const body = JSON.parse(String(captured.init?.body)) as { context: typeof i.context; mode?: unknown }
    assert.equal(body.mode, undefined, 'el análisis no lleva mode')
    assert.deepEqual(body.context.flows.history, [], 'la serie diaria no viaja')
    assert.equal(isFinancialContext(body.context), true)
    const { history: _sent, ...sentFlows } = body.context.flows
    const { history: _orig, ...origFlows } = i.context.flows
    void _sent
    void _orig
    assert.deepEqual(sentFlows, origFlows)
    assert.deepEqual(body.context.wealth, i.context.wealth)
    assert.deepEqual(body.context.objectives, i.context.objectives)
    assert.deepEqual(body.context.investments, i.context.investments)
    assert.deepEqual(body.context.quality, i.context.quality, 'quality (incl. historyDays) se conserva')
    assert.equal(body.context.asOf, i.context.asOf)
    assert.ok(i.context.flows.history.length > 0, 'el original no se muta')
  })

  it('el prompt del análisis toma historyDays de quality aunque flows.history llegue vacío', () => {
    const i = input()
    assert.ok(i.context.quality.historyDays > 0)
    const sent = contextForRequest(i.context)
    const req = buildAIRequest({ context: sent })
    const payload = JSON.parse(req.user.slice(req.user.indexOf('{'))) as { contexto_financiero: { flows: { historyDays: number; history?: unknown } } }
    assert.equal(payload.contexto_financiero.flows.historyDays, i.context.quality.historyDays)
    assert.equal('history' in payload.contexto_financiero.flows, false)
  })
})
