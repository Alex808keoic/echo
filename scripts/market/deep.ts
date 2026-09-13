/**
 * Investigación profunda.
 *
 * Orden estricto (ver docs/MARKET_RESEARCH.md §3):
 *   1 kill switch → 2 secret → 3 presupuesto → 4 fuentes → 5 compactar →
 *   6 estimar tokens → 7 presupuesto → 8 registrar intento → 9 proveedor →
 *   validar → (fallback una vez, con 7-8 de nuevo) → 10 publicar.
 *
 * Si algo bloquea o todo falla: NO se llama a nadie más; se conserva la
 * última investigación (su frescura se degrada sola) y se anota el motivo.
 * Esta función no lee `process.env` ni toca la red por sí misma: recibe
 * dependencias, para poder probarla sin Internet.
 */
import type { AIRequest, AIProviderError } from '../../lib/axis/ai/provider'
import { MARKET_SYNTHESIS_SCHEMA } from '../../lib/market/schema'
import type { MarketResearch } from '../../lib/market/types'
import { parseMarketResearch } from '../../lib/market/validate'
import { assertBudget, emptyLedger, isoWeek, recordAttempt, recordUsage, type BudgetLedger } from './budget'
import { estimateTokens, LIMITS } from './limits'
import { compactMaterial, MARKET_SYSTEM_PROMPT } from './material'
import type { MarketAIProvider } from './providers/types'
import { publishResearch } from './publish'
import type { CollectedMaterial } from './sources'
import type { DataStore } from './store'

export interface DeepDeps {
  store: DataStore
  collect: () => Promise<CollectedMaterial>
  providers: { primary: MarketAIProvider | null; fallback: MarketAIProvider | null }
  env: Record<string, string | undefined>
  now?: Date
  reason: 'scheduled' | 'event' | 'manual'
  log?: (line: string) => void
}

export type DeepOutcome =
  | { status: 'published'; research: MarketResearch; provider: string }
  | { status: 'skipped'; reason: string }
  | { status: 'blocked'; reason: string }
  | { status: 'failed'; reason: string; attempts: string[] }

/** Material acotado también para el TPM del fallback (Groq ≈ 8K tokens/min). */
const MAX_MATERIAL_CHARS = 20_000
const FALLBACK_KINDS: ReadonlySet<AIProviderError['kind']> = new Set(['rate-limit', 'timeout', 'http', 'malformed', 'unavailable'])

function periodFor(now: Date): { coversFrom: string; coversTo: string } {
  const to = now.toISOString().slice(0, 10)
  const from = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
  return { coversFrom: from, coversTo: to }
}

function researchId(now: Date, reason: DeepDeps['reason'], existing: MarketResearch | null): string {
  const week = isoWeek(now)
  if (reason !== 'event' || !existing || !existing.id.startsWith(week)) return week
  // Segunda investigación en la misma semana (por evento): sufijo incremental.
  const n = Number(existing.id.split('-')[2] ?? '1')
  return `${week}-${n + 1}`
}

export async function runDeepResearch(deps: DeepDeps): Promise<DeepOutcome> {
  const now = deps.now ?? new Date()
  const log = deps.log ?? (() => {})
  const { store, env } = deps

  // 1. Kill switch (la variable de repositorio debe ser exactamente "true").
  if (env.MARKET_AI_ENABLED !== 'true') return { status: 'skipped', reason: 'MARKET_AI_ENABLED no es "true"' }
  // 2. Secret / proveedor disponible.
  const primary = deps.providers.primary
  if (!primary) return { status: 'skipped', reason: 'sin proveedor principal (falta GEMINI_API_KEY)' }

  // 3. Presupuesto (antes de gastar nada, ni siquiera red hacia las fuentes).
  const stored = await store.readLedger()
  if (stored === null) return { status: 'blocked', reason: 'ledger de presupuesto corrupto' }
  let ledger: BudgetLedger = stored ?? emptyLedger(now)
  const latest = await store.readLatest()
  const isEvent = deps.reason === 'event'
  const check = { estimatedInputTokens: 0, newDeepResearch: true, eventResearch: isEvent }
  const pre = assertBudget(ledger, check, now)
  if (!pre.allowed) return { status: 'blocked', reason: pre.reason }

  // 4. Fuentes. 5. Compactar. 6. Estimar tokens.
  const material = await deps.collect()
  if (material.indicators.length === 0 && material.headlines.length === 0) {
    return { status: 'failed', reason: 'ninguna fuente disponible', attempts: [] }
  }
  const period = periodFor(now)
  const user = `Sintetiza el siguiente material y devuelve el JSON del esquema.\n\n${compactMaterial(material, { maxChars: MAX_MATERIAL_CHARS, ...period })}`
  const request: AIRequest = { system: MARKET_SYSTEM_PROMPT, user, schema: MARKET_SYNTHESIS_SCHEMA as unknown as Record<string, unknown> }
  const estimated = estimateTokens(request.system + request.user)
  log(`material: ${material.indicators.length} indicadores, ${material.headlines.length} titulares, ~${estimated} tokens; caídas: ${material.failed.join(', ') || 'ninguna'}`)

  const id = researchId(now, deps.reason, latest)
  const attempts: string[] = []
  const candidates = [primary, deps.providers.fallback].filter((p): p is MarketAIProvider => p !== null).slice(0, 1 + LIMITS.MAX_RETRIES)

  for (const provider of candidates) {
    // 7. Presupuesto de nuevo, con la estimación real (también para el fallback).
    const decision = assertBudget(ledger, { ...check, estimatedInputTokens: estimated, newDeepResearch: attempts.length === 0 }, now)
    if (!decision.allowed) {
      log(`bloqueado antes de ${provider.id}: ${decision.reason}`)
      return attempts.length === 0 ? { status: 'blocked', reason: decision.reason } : { status: 'failed', reason: decision.reason, attempts }
    }
    // 8. Registrar el intento ANTES de llamar y persistirlo.
    ledger = recordAttempt(ledger, { provider: provider.id, reason: deps.reason, newDeepResearch: attempts.length === 0, eventResearch: isEvent && attempts.length === 0 }, now)
    await store.writeLedger(ledger)
    attempts.push(provider.id)

    // 9. Llamada + validación.
    try {
      const completion = await provider.completeWithUsage(request, { maxOutputTokens: LIMITS.MAX_OUTPUT_TOKENS })
      ledger = recordUsage(ledger, { ok: true, totalTokens: completion.usage.totalTokens })
      await store.writeLedger(ledger)
      const synthesis = typeof completion.output === 'object' && completion.output !== null ? (completion.output as Record<string, unknown>) : {}
      const research = parseMarketResearch({
        ...synthesis,
        id,
        kind: 'deep',
        generatedAt: now.toISOString(),
        coversFrom: period.coversFrom,
        coversTo: period.coversTo,
        region: 'eurozone',
        indicators: material.indicators,
        sources: material.sources,
        failedSources: material.failed,
        provider: { id: provider.id, model: provider.model },
        budget: { monthCalls: ledger.monthCalls, monthLimit: LIMITS.MAX_AI_REQUESTS_PER_MONTH },
      })
      // 10. Publicar.
      await publishResearch(store, research)
      log(`publicada ${research.id} con ${provider.id}`)
      return { status: 'published', research, provider: provider.id }
    } catch (error) {
      const kind = (error as AIProviderError).kind
      const message = error instanceof Error ? error.message : 'error desconocido'
      log(`fallo con ${provider.id}: ${message}`)
      ledger = recordUsage(ledger, { ok: false, totalTokens: 0 })
      await store.writeLedger(ledger)
      // Solo se prueba el fallback ante fallos recuperables (o respuesta inválida).
      if (kind !== undefined && !FALLBACK_KINDS.has(kind)) break
    }
  }
  return { status: 'failed', reason: 'todos los proveedores fallaron; se conserva la última investigación', attempts }
}
