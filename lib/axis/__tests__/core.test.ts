import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinancialContext } from '../context'
import { render } from '../compose'
import { decide } from '../core/decision'
import { rememberAvailability, withFallback, withTimeout } from '../core/fallback'
import { analyzeLocally, LOCAL_RULES_ENGINE_INFO } from '../local-engine'
import { asLanguageModel, fromProvider, noModel } from '../language/model'
import { languageModelFromConfig } from '../language/server'
import { readAIServerConfig } from '../ai/server/analyze'
import { AIProviderError, type AIProvider } from '../ai/provider'
import type { MarketAIProvider } from '../../ai/providers/types'
import { config, gasto, healthyMovements, ingreso, NOW, objective, snapshot, TODAY } from './fixtures'

const ctx = (partial: Parameters<typeof snapshot>[0]) => buildFinancialContext(snapshot(partial), TODAY)

describe('AXIS · decisión (core/decision.ts)', () => {
  it('es determinista y serializable; render(decide()) es el motor local', () => {
    const input = { context: ctx({ config: config(100_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents: 500_000, currentCents: 246_000 })] }) }
    const a = decide(input)
    const b = decide(input)
    assert.deepEqual(a, b)
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a, 'serializable sin pérdida')
    const rendered = render(a, LOCAL_RULES_ENGINE_INFO, NOW)
    assert.deepEqual(rendered, analyzeLocally(input, NOW))
  })

  it('la recomendación, las alternativas y las incertidumbres salen solo de las reglas y del contexto', () => {
    const d = decide({ context: ctx({ config: config(100_000), movements: healthyMovements() }) })
    assert.equal(d.level, 'sufficient')
    assert.ok(d.lead && d.lead.id === d.signals[0].id)
    assert.ok(d.relevant.length <= 4 && d.facts.length <= 5 && d.alternatives.length <= 2 && d.uncertainties.length <= 3)
    if (d.recommendation) assert.ok(d.signals.some((s) => s.recommendation === d.recommendation), 'la recomendación es la de una señal')
    for (const a of d.alternatives) assert.ok(d.relevant.some((s) => s.alternative === a))
    assert.equal(d.missing.length, 0)
    assert.equal(d.basedOnDemoData, false)
  })

  it('sin datos: no hay señales ni recomendación, y dice qué falta', () => {
    const d = decide({ context: ctx({}) })
    assert.equal(d.level, 'none')
    assert.deepEqual(d.signals, [])
    assert.equal(d.lead, null)
    assert.equal(d.recommendation, null)
    assert.ok(d.missing.length >= 2)
    assert.equal(d.nextStep?.to, 'dinero', 'sin saldo inicial, el siguiente paso es configurarlo')
    assert.equal(decide({ context: ctx({ config: config(1_000) }) }).nextStep?.to, 'movimientos')
  })

  it('«no actuar» es una decisión: recomendación null cuando ninguna señal la trae', () => {
    const d = decide({ context: ctx({ config: config(0), movements: [ingreso('2026-09-01', 100_000), gasto('2026-09-03', 20_000)] }) })
    assert.equal(d.level, 'limited')
    assert.equal(d.confidence, 'baja')
    assert.ok(d.uncertainties.some((u) => u.title === 'Sin mes anterior'))
  })
})

describe('AXIS · modelo de lenguaje (language/)', () => {
  const request = { system: 's', user: 'u', schema: {} }

  it('fromProvider envuelve un proveedor con uso de tokens sin tocarlo', async () => {
    const seen: { max?: number; signal?: AbortSignal } = {}
    const provider: MarketAIProvider = {
      id: 'gemini:mock',
      model: 'mock',
      async completeWithUsage(_r, options) {
        seen.max = options.maxOutputTokens
        seen.signal = options.signal
        return { output: { ok: true }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
      },
      complete: async () => ({ ok: false }),
    }
    const model = fromProvider(provider)
    const signal = new AbortController().signal
    assert.equal(model.id, 'gemini:mock')
    assert.equal(model.available, true)
    assert.deepEqual(await model.complete(request, { maxOutputTokens: 123, signal }), { ok: true })
    assert.equal(seen.max, 123)
    assert.equal(seen.signal, signal)
  })

  it('fromProvider envuelve un AIProvider simple; asLanguageModel acepta ambos', async () => {
    const provider: AIProvider = { id: 'simple', complete: async () => ({ simple: true }) }
    assert.deepEqual(await fromProvider(provider).complete(request, { maxOutputTokens: 1 }), { simple: true })
    assert.equal(asLanguageModel(provider).id, 'simple')
    assert.equal(asLanguageModel(noModel), noModel)
  })

  it('noModel no está disponible y nunca llama a nada', async () => {
    assert.equal(noModel.available, false)
    await assert.rejects(() => noModel.complete(request, { maxOutputTokens: 1 }), (e: unknown) => e instanceof AIProviderError && e.kind === 'unavailable')
  })

  it('languageModelFromConfig: sin configuración → noModel; con Gemini/Groq → el proveedor envuelto', () => {
    assert.equal(languageModelFromConfig(readAIServerConfig({})), noModel)
    assert.equal(languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', AXIS_AI_MODEL: 'gemini-3.5-flash-lite' })).id, 'gemini:gemini-3.5-flash-lite')
    assert.equal(languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'groq', GROQ_API_KEY: 'k' })).id, 'groq:openai/gpt-oss-120b')
    assert.equal(languageModelFromConfig(readAIServerConfig({ AXIS_AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', AXIS_AI_ENABLED: 'false' })).available, false)
  })
})

describe('AXIS · fallback común (core/fallback.ts)', () => {
  it('rememberAvailability comprueba una vez y trata un fallo como no disponible', async () => {
    let calls = 0
    const ok = rememberAvailability(async () => {
      calls++
      return true
    })
    assert.equal(await ok(), true)
    assert.equal(await ok(), true)
    assert.equal(calls, 1)
    const failing = rememberAvailability(async () => {
      throw new Error('red')
    })
    assert.equal(await failing(), false)
  })

  it('withFallback: no disponible → local sin intento; fallo → local con el error; éxito → resultado', async () => {
    let attempts = 0
    const plan = (available: boolean, fail: boolean) => ({
      isAvailable: async () => available,
      timeoutMs: 1_000,
      attempt: async () => {
        attempts++
        if (fail) throw new Error('boom')
        return 'ai'
      },
      whenUnavailable: () => 'local:unavailable',
      whenFailed: (e: unknown) => `local:${e instanceof Error ? e.message : 'unknown'}`,
    })
    assert.equal(await withFallback(plan(false, false)), 'local:unavailable')
    assert.equal(attempts, 0)
    assert.equal(await withFallback(plan(true, true)), 'local:boom')
    assert.equal(await withFallback(plan(true, false)), 'ai')
  })

  it('withTimeout aborta la señal al vencer el plazo', async () => {
    await assert.rejects(
      () =>
        withTimeout(10, (signal) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))))),
      /aborted/,
    )
    assert.equal(await withTimeout(1_000, async () => 'rápido'), 'rápido')
  })
})
