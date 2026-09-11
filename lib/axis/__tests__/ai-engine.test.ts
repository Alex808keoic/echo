import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ENGINE_INFO, createAIEngine, type AITransport } from '../ai-engine'
import { buildFinancialContext } from '../context'
import { analyzeLocally, localRulesEngine } from '../local-engine'
import { buildAIRequest } from '../ai/prompt'
import { extractJSON } from '../ai/server/anthropic-provider'
import { analyzeWithProvider, isFinancialContext, readAIServerConfig, isAIAvailable, providerFromConfig } from '../ai/server/analyze'
import { AIProviderError } from '../ai/provider'
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

  it('6 · API key ausente (no disponible) → local sin llamar al proveedor', async () => {
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

  it('extractJSON parsea el bloque de texto y clasifica refusal/truncado', () => {
    const msg = (stop: string, text?: string) =>
      ({ stop_reason: stop, content: text === undefined ? [] : [{ type: 'text', text }] }) as never
    assert.deepEqual(extractJSON(msg('end_turn', '{"a":1}')), { a: 1 })
    assert.throws(() => extractJSON(msg('refusal', '{}')), (e: unknown) => e instanceof AIProviderError && e.kind === 'refusal')
    assert.throws(() => extractJSON(msg('max_tokens', '{')), (e: unknown) => e instanceof AIProviderError && e.kind === 'malformed')
    assert.throws(() => extractJSON(msg('end_turn', 'no json')), (e: unknown) => e instanceof AIProviderError && e.kind === 'malformed')
  })

  it('analyzeWithProvider fija engine/demo y valida la salida', async () => {
    const provider = { id: 'mock', complete: async () => validAIOutput() }
    const a = await analyzeWithProvider(provider, input(true).context)
    assert.deepEqual(a.engine, AI_ENGINE_INFO)
    assert.equal(a.basedOnDemoData, true)
    const bad = { id: 'mock', complete: async () => ({ headline: 'x' }) }
    await assert.rejects(analyzeWithProvider(bad, input().context))
  })

  it('configuración: sin clave → IA no disponible; AXIS_AI_ENABLED=false la desactiva', () => {
    assert.equal(isAIAvailable(readAIServerConfig({})), false)
    assert.equal(providerFromConfig(readAIServerConfig({})), null)
    assert.equal(isAIAvailable(readAIServerConfig({ ANTHROPIC_API_KEY: 'k' })), true)
    assert.equal(isAIAvailable(readAIServerConfig({ ANTHROPIC_API_KEY: 'k', AXIS_AI_ENABLED: 'false' })), false)
    const provider = providerFromConfig(readAIServerConfig({ ANTHROPIC_API_KEY: 'k', AXIS_AI_MODEL: 'claude-opus-5' }))
    assert.equal(provider?.id, 'anthropic:claude-opus-5')
  })

  it('isFinancialContext rechaza cuerpos arbitrarios', () => {
    assert.equal(isFinancialContext(null), false)
    assert.equal(isFinancialContext({ asOf: 'x' }), false)
    assert.equal(isFinancialContext(input().context), true)
  })
})
