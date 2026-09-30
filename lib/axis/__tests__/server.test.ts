import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeWithProvider, configuredProviders, isAIAvailable, providerFromConfig, readAIServerConfig } from '../ai/server/analyze'
import { languageModelFromConfig } from '../language/server'
import { AXIS_AI_LIMITS, dailyCap, emptyCounter, takeAxisAiSlot } from '../ai/server/limits'
import { buildFinancialContext } from '../context'
import { analyzeLocally } from '../local-engine'
import type { MarketAIProvider } from '../../ai/providers/types'
import { config, healthyMovements, NOW, snapshot, TODAY } from './fixtures'

describe('IA de AXIS · configuración del servidor', () => {
  it('sin AXIS_AI_PROVIDER no hay IA (AXIS local)', () => {
    assert.equal(providerFromConfig(readAIServerConfig({ GEMINI_API_KEY: 'k', GROQ_API_KEY: 'k' })), null)
    assert.equal(isAIAvailable(readAIServerConfig({})), false)
  })

  it('el proveedor solo existe con su clave; AXIS_AI_ENABLED=false lo desactiva', () => {
    assert.equal(providerFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'gemini' })), null)
    assert.equal(providerFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' }))?.id, 'gemini:gemini-2.5-flash-lite')
    assert.equal(providerFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', AXIS_AI_MODEL: 'gemini-3.5-flash-lite' }))?.id, 'gemini:gemini-3.5-flash-lite')
    assert.equal(providerFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'groq', GROQ_API_KEY: 'k' }))?.id, 'groq:openai/gpt-oss-120b')
    assert.equal(providerFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'groq', GROQ_API_KEY: 'k', AXIS_AI_ENABLED: 'false' })), null)
    assert.equal(providerFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'openai', GEMINI_API_KEY: 'k' })), null, 'proveedor desconocido → sin IA')
  })

  it('cloudflare es un proveedor válido con CF_ACCOUNT_ID + CF_API_TOKEN', () => {
    assert.equal(providerFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'cloudflare', CF_ACCOUNT_ID: 'a', CF_API_TOKEN: 't' }))?.id, 'cloudflare:@cf/google/gemma-4-26b-a4b-it')
    assert.equal(providerFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'Cloudflare ', CF_ACCOUNT_ID: 'a', CF_API_TOKEN: 't' }))?.id, 'cloudflare:@cf/google/gemma-4-26b-a4b-it', 'sin distinguir mayúsculas ni espacios')
    assert.equal(providerFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'cloudflare', CF_API_TOKEN: 't' })), null, 'sin cuenta')
  })
})

describe('IA de AXIS · configuración · fallback y modelos por proveedor', () => {
  const BOTH = { AXIS_AI_PROVIDER: 'cloudflare', AXIS_AI_FALLBACK_PROVIDER: 'groq', CF_ACCOUNT_ID: 'a', CF_API_TOKEN: 't', GROQ_API_KEY: 'g' }
  const ids = (env: Record<string, string>) => configuredProviders(readAIServerConfig(env)).map((p) => p.provider.id)

  it('la cadena es principal → fallback, en ese orden', () => {
    const c = readAIServerConfig(BOTH)
    assert.equal(c.provider, 'cloudflare')
    assert.equal(c.fallbackProvider, 'groq')
    assert.deepEqual(ids(BOTH), ['cloudflare:@cf/google/gemma-4-26b-a4b-it', 'groq:openai/gpt-oss-120b'])
  })

  it('un proveedor sin credenciales se omite: si faltan las de Cloudflare, Groq sigue solo', () => {
    assert.deepEqual(ids({ ...BOTH, CF_API_TOKEN: '' }), ['groq:openai/gpt-oss-120b'])
    assert.deepEqual(ids({ ...BOTH, GROQ_API_KEY: '' }), ['cloudflare:@cf/google/gemma-4-26b-a4b-it'])
    assert.equal(isAIAvailable(readAIServerConfig({ ...BOTH, CF_API_TOKEN: '', GROQ_API_KEY: '' })), false)
  })

  it('sin principal no hay IA aunque haya fallback; un fallback igual al principal o desconocido se ignora', () => {
    assert.deepEqual(ids({ AXIS_AI_FALLBACK_PROVIDER: 'groq', GROQ_API_KEY: 'g' }), [])
    assert.equal(readAIServerConfig({ AXIS_AI_PROVIDER: 'groq', AXIS_AI_FALLBACK_PROVIDER: 'groq', GROQ_API_KEY: 'g' }).fallbackProvider, null)
    assert.equal(readAIServerConfig({ ...BOTH, AXIS_AI_FALLBACK_PROVIDER: 'openai' }).fallbackProvider, null)
    assert.deepEqual(ids({ ...BOTH, AXIS_AI_ENABLED: 'false' }), [])
  })

  it('cada proveedor tiene su modelo; AXIS_AI_MODEL (heredada) solo vale para el principal', () => {
    assert.deepEqual(ids({ ...BOTH, AXIS_AI_MODEL_CLOUDFLARE: '@cf/x', AXIS_AI_MODEL_GROQ: 'openai/gpt-oss-20b' }), ['cloudflare:@cf/x', 'groq:openai/gpt-oss-20b'])
    assert.deepEqual(ids({ ...BOTH, AXIS_AI_MODEL: '@cf/heredado' }), ['cloudflare:@cf/heredado', 'groq:openai/gpt-oss-120b'], 'el fallback no hereda el modelo del principal')
    assert.deepEqual(ids({ AXIS_AI_PROVIDER: 'groq', GROQ_API_KEY: 'g', AXIS_AI_MODEL: 'openai/gpt-oss-20b' }), ['groq:openai/gpt-oss-20b'], 'la configuración actual de producción no cambia')
  })

  it('topes de salida por proveedor: Cloudflare 1.200, Groq 3.000', () => {
    assert.equal(AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS_BY_PROVIDER.cloudflare, 1_200)
    assert.equal(AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS_BY_PROVIDER.groq, 3_000)
  })

  it('las claves nunca aparecen en el id del modelo', () => {
    const model = languageModelFromConfig(readAIServerConfig({ ...BOTH, CF_ACCOUNT_ID: 'cuenta-secreta', CF_API_TOKEN: 'token-secreto', GROQ_API_KEY: 'clave-secreta' }))
    for (const s of ['cuenta-secreta', 'token-secreto', 'clave-secreta']) assert.ok(!model.id.includes(s))
  })
})

describe('IA de AXIS · análisis en el servidor', () => {
  it('analyzeWithProvider usa el tope de salida, la memoria y el mercado, y fija engine/demo', async () => {
    const context = buildFinancialContext(snapshot({ config: config(100_000, true), movements: healthyMovements() }), TODAY)
    const local = analyzeLocally({ context }, NOW)
    if (local.status !== 'analysis') throw new Error('unreachable')
    const seen: { maxOutputTokens?: number; user?: string } = {}
    const provider: MarketAIProvider = {
      id: 'mock',
      model: 'mock',
      async completeWithUsage(request, options) {
        seen.maxOutputTokens = options.maxOutputTokens
        seen.user = request.user
        const { engine, generatedAt, basedOnDemoData, ...rest } = local.analysis
        void engine
        void generatedAt
        void basedOnDemoData
        return { output: { ...rest, basedOnDemoData: false }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
      },
      complete: async () => ({}),
    }
    const memory = { previousConclusions: [{ generatedAt: '2026-09-01T00:00:00.000Z', summary: 'Lectura anterior' }] }
    const analysis = await analyzeWithProvider(provider, context, memory)
    assert.equal(seen.maxOutputTokens, AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS)
    assert.match(seen.user ?? '', /Lectura anterior/)
    assert.equal(analysis.engine.isAI, true)
    assert.match(analysis.engine.label, /mock/)
    assert.equal(analysis.basedOnDemoData, true, 'demo lo fija Finax, no el modelo')
  })
})

describe('IA de AXIS · límites del servidor', () => {
  it('consume cupo por día y por minuto; bloqueado → sin llamada', () => {
    let counter = emptyCounter(NOW)
    for (let i = 0; i < AXIS_AI_LIMITS.MAX_REQUESTS_PER_MINUTE; i++) {
      const d = takeAxisAiSlot(counter, NOW)
      assert.equal(d.allowed, true)
      counter = d.counter
    }
    const blocked = takeAxisAiSlot(counter, NOW)
    assert.equal(blocked.allowed, false)
    assert.match(blocked.allowed ? '' : blocked.reason, /minuto/)
    // Al minuto siguiente vuelve a permitir; el contador diario se conserva.
    const later = takeAxisAiSlot(counter, new Date(NOW.getTime() + 60_000))
    assert.equal(later.allowed, true)
    assert.equal(later.counter.dayCount, AXIS_AI_LIMITS.MAX_REQUESTS_PER_MINUTE + 1)
  })

  it('límite diario y reinicio al día siguiente', () => {
    let counter = emptyCounter(NOW)
    for (let i = 0; i < AXIS_AI_LIMITS.MAX_REQUESTS_PER_DAY; i++) {
      counter = takeAxisAiSlot(counter, new Date(NOW.getTime() + i * 60_000)).counter
    }
    const blocked = takeAxisAiSlot(counter, new Date(NOW.getTime() + 3_600_000))
    assert.equal(blocked.allowed, false)
    assert.match(blocked.allowed ? '' : blocked.reason, /diario/)
    assert.equal(takeAxisAiSlot(counter, new Date('2026-09-16T00:00:01Z')).allowed, true)
  })

  it('la variable de entorno solo puede reducir el tope diario, nunca ampliarlo', () => {
    assert.equal(dailyCap({}), AXIS_AI_LIMITS.MAX_REQUESTS_PER_DAY)
    assert.equal(dailyCap({ AXIS_AI_MAX_REQUESTS_PER_DAY: '5' }), 5)
    assert.equal(dailyCap({ AXIS_AI_MAX_REQUESTS_PER_DAY: '999' }), AXIS_AI_LIMITS.MAX_REQUESTS_PER_DAY)
    assert.equal(dailyCap({ AXIS_AI_MAX_REQUESTS_PER_DAY: 'muchas' }), AXIS_AI_LIMITS.MAX_REQUESTS_PER_DAY)
    assert.equal(takeAxisAiSlot(emptyCounter(NOW), NOW, 0).allowed, false)
  })
})
