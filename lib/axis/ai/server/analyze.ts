/**
 * SOLO SERVIDOR. Orquestación del análisis con IA:
 *
 *   contexto recibido → comprobación de forma y tamaño → límite de la instancia
 *   → buildAIRequest → AxisLanguageModel → parseAxisAnalysis → AxisAnalysis
 *
 * El modelo de lenguaje es intercambiable (lib/axis/language): aquí solo se
 * lee la configuración y se orquesta; ningún proveedor concreto se nombra
 * fuera de `providerFromConfig`.
 *
 * Proveedores por variables de entorno (solo servidor; nunca `NEXT_PUBLIC_`):
 *   AXIS_AI_ENABLED               "false" desactiva la IA aunque haya proveedor
 *   AXIS_AI_PROVIDER              principal: "cloudflare" | "groq" | "gemini" (sin valor → sin IA, AXIS local)
 *   AXIS_AI_FALLBACK_PROVIDER     opcional: proveedor que se prueba si el principal falla
 *   CF_ACCOUNT_ID + CF_API_TOKEN  credenciales de Cloudflare Workers AI
 *   GROQ_API_KEY / GEMINI_API_KEY clave de Groq / Gemini
 *   AXIS_AI_MODEL_CLOUDFLARE / AXIS_AI_MODEL_GROQ / AXIS_AI_MODEL_GEMINI
 *                                 modelo de cada proveedor (opcional; por defecto el del proveedor)
 *   AXIS_AI_MODEL                 heredada: modelo del proveedor PRINCIPAL si no tiene variable propia
 *   AXIS_AI_MAX_REQUESTS_PER_DAY  solo puede reducir el tope diario (por defecto 40)
 *   AXIS_DECISION_FIRST           "true": el modelo solo EXPRESA la AxisDecision (Decision First);
 *                                 en otro caso, comportamiento anterior (el modelo redacta el análisis completo)
 *
 * Cuentas siempre en free tier y sin billing: si la cuota se agota, el
 * proveedor devuelve 429 y el cliente usa el motor local.
 */
import { createCloudflareProvider } from '../../../ai/providers/cloudflare'
import { createGeminiProvider } from '../../../ai/providers/gemini'
import { createGroqProvider } from '../../../ai/providers/groq'
import type { MarketAIProvider } from '../../../ai/providers/types'
import { buildAIRequest } from '../prompt'
import { AIProviderError, type AIProvider, type AIRequest, type ProviderDiagnostics } from '../provider'
import { parseAxisAnalysis } from '../../validate'
import { AI_ENGINE_INFO } from '../../ai-engine'
import { asLanguageModel, errorKindOf, type AttemptReport, type AxisLanguageModel } from '../../language/model'
import { decide } from '../../core/decision'
import { buildExpressionRequest, mergeExpression, parseExpression } from '../../core/expression'
import { validateExpression } from '../../core/semantic'
import { buildChatRequest } from '../../chat/prompt'
import type { ChatInput, ChatReply } from '../../chat/types'
import { redactChatInput, redactMemory } from '../../chat/secrets'
import { buildChatGuard, validateChatReply } from '../../chat/semantic'
import { diagnoseProposal, parseChatReply } from '../../chat/validate'
import { withProfileProposal } from '../../chat/profile-proposal'
import { extractionLabel } from '../../profile/extract'
import type { AxisAnalysis, AxisEngineInfo, AxisInput, AxisMemory, FinancialContext, MarketContext } from '../../types'
import { AXIS_AI_LIMITS } from './limits'

export type AxisAiProviderId = 'cloudflare' | 'gemini' | 'groq'

const PROVIDER_IDS: readonly AxisAiProviderId[] = ['cloudflare', 'gemini', 'groq']

/** Variable del modelo de cada proveedor. */
const MODEL_VARS: Record<AxisAiProviderId, string> = {
  cloudflare: 'AXIS_AI_MODEL_CLOUDFLARE',
  gemini: 'AXIS_AI_MODEL_GEMINI',
  groq: 'AXIS_AI_MODEL_GROQ',
}

export type AnalysisMode = 'legacy' | 'decision-first'

/** Un proveedor de la cadena con sus credenciales y su modelo. Solo servidor: contiene claves. */
export interface ProviderSettings {
  id: AxisAiProviderId
  model?: string
  apiKey?: string
  /** Solo Cloudflare. */
  accountId?: string
}

export interface AIServerConfig {
  enabled: boolean
  /** Proveedor principal (`AXIS_AI_PROVIDER`). */
  provider: AxisAiProviderId | null
  /** Proveedor de fallback (`AXIS_AI_FALLBACK_PROVIDER`), distinto del principal. */
  fallbackProvider: AxisAiProviderId | null
  /** La cadena en orden (principal, fallback), con o sin credenciales. */
  providers: ProviderSettings[]
  /** Decision First activo (`AXIS_DECISION_FIRST=true`). */
  decisionFirst: boolean
}

const clean = (v: string | undefined) => v?.trim() || undefined

function providerIdOf(raw: string | undefined): AxisAiProviderId | null {
  const v = raw?.trim().toLowerCase()
  return PROVIDER_IDS.find((id) => id === v) ?? null
}

function settingsOf(id: AxisAiProviderId, env: Record<string, string | undefined>, primary: boolean): ProviderSettings {
  // `AXIS_AI_MODEL` es la variable antigua (un solo proveedor): solo vale para el principal.
  const model = clean(env[MODEL_VARS[id]]) ?? (primary ? clean(env.AXIS_AI_MODEL) : undefined)
  if (id === 'cloudflare') return { id, model, accountId: clean(env.CF_ACCOUNT_ID), apiKey: clean(env.CF_API_TOKEN) }
  return { id, model, apiKey: clean(id === 'groq' ? env.GROQ_API_KEY : env.GEMINI_API_KEY) }
}

export function readAIServerConfig(env: Record<string, string | undefined> = process.env): AIServerConfig {
  const enabled = env.AXIS_AI_ENABLED?.trim().toLowerCase() !== 'false'
  const provider = providerIdOf(env.AXIS_AI_PROVIDER)
  const fallback = provider ? providerIdOf(env.AXIS_AI_FALLBACK_PROVIDER) : null
  const fallbackProvider = fallback !== provider ? fallback : null
  const providers = [provider, fallbackProvider].filter((id): id is AxisAiProviderId => id !== null).map((id, i) => settingsOf(id, env, i === 0))
  const decisionFirst = env.AXIS_DECISION_FIRST?.trim().toLowerCase() === 'true'
  return { enabled, provider, fallbackProvider, providers, decisionFirst }
}

export const analysisModeOf = (config: AIServerConfig): AnalysisMode => (config.decisionFirst ? 'decision-first' : 'legacy')

const hasCredentials = (s: ProviderSettings) => Boolean(s.apiKey) && (s.id !== 'cloudflare' || Boolean(s.accountId))

function createProvider(s: ProviderSettings): MarketAIProvider {
  const common = { model: s.model, timeoutMs: AXIS_AI_LIMITS.TIMEOUT_MS }
  if (s.id === 'cloudflare') return createCloudflareProvider({ ...common, accountId: s.accountId as string, apiToken: s.apiKey as string })
  if (s.id === 'groq') return createGroqProvider({ ...common, apiKey: s.apiKey as string })
  return createGeminiProvider({ ...common, apiKey: s.apiKey as string })
}

/**
 * Proveedores utilizables de la cadena, en orden. Uno sin credenciales se
 * omite: si faltan las de Cloudflare, el fallback sigue funcionando solo.
 */
export function configuredProviders(config: AIServerConfig): Array<{ id: AxisAiProviderId; provider: MarketAIProvider }> {
  if (!config.enabled) return []
  return config.providers.filter(hasCredentials).map((s) => ({ id: s.id, provider: createProvider(s) }))
}

/** Primer proveedor utilizable de la cadena, o `null` si no hay ninguno. */
export function providerFromConfig(config: AIServerConfig): MarketAIProvider | null {
  return configuredProviders(config)[0]?.provider ?? null
}

export function isAIAvailable(config: AIServerConfig): boolean {
  return configuredProviders(config).length > 0
}

/** Modelo de lenguaje o proveedor crudo: ambos se aceptan para no romper a los llamadores existentes. */
type Model = AxisLanguageModel | AIProvider | MarketAIProvider

/* ------------------------------ diagnóstico ------------------------------ */

export type AxisCallKind = 'analysis-legacy' | 'analysis-decision-first' | 'chat'

const NUMERIC_FIELDS = ['status', 'promptTokens', 'completionTokens', 'totalTokens', 'neurons', 'limit', 'used', 'requested'] as const
const TEXT_FIELDS = ['finishReason', 'limitType', 'retryAfter', 'limitRequests', 'limitTokens', 'remainingRequests', 'remainingTokens', 'resetRequests', 'resetTokens'] as const

/** Solo los campos de diagnóstico conocidos y con su tipo: cualquier otra cosa no llega a los logs. */
export function safeDiagnostics(d: ProviderDiagnostics | undefined): ProviderDiagnostics {
  const out: Record<string, number | string> = {}
  if (!d) return out
  for (const f of NUMERIC_FIELDS) if (typeof d[f] === 'number' && Number.isFinite(d[f])) out[f] = d[f] as number
  for (const f of TEXT_FIELDS) if (typeof d[f] === 'string') out[f] = (d[f] as string).slice(0, 32)
  return out
}

export interface AxisCallLog {
  kind: AxisCallKind
  /** `proveedor:modelo` del intento. */
  model: string
  /** 1 = proveedor principal; 2 o más = fallback. */
  attempt: number
  fallback: boolean
  /** `skipped`: el fallback no se intentó porque no quedaba tiempo en el plazo de la cadena. */
  outcome: 'ok' | 'error' | 'skipped'
  /** Tamaño de lo enviado (instrucciones + mensaje + esquema), en caracteres: para comparar con los tokens reales. */
  requestChars: number
  maxOutputTokens: number
  errorKind?: string
  diagnostics: ProviderDiagnostics
}

/**
 * Una línea por intento contra un proveedor en los logs del servidor
 * (`[axis] llamada:`): tipo, modelo, intento, resultado, tamaño, uso de tokens
 * y límites. Sin textos del modelo ni del usuario, sin cifras financieras y sin claves.
 */
export function logAxisCall(entry: AxisCallLog): void {
  console.info('[axis] llamada:', JSON.stringify({ ...entry, diagnostics: safeDiagnostics(entry.diagnostics) }))
}

/**
 * Llama al modelo y deja constancia de cada intento, haya respondido o no
 * (una línea por proveedor probado). Devuelve también qué modelo respondió.
 * No cambia el resultado ni el error.
 */
async function completeLogged(model: AxisLanguageModel, request: AIRequest, kind: AxisCallKind, signal?: AbortSignal): Promise<{ raw: unknown; answeredBy: string }> {
  const maxOutputTokens = AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS
  const requestChars = request.system.length + request.user.length + JSON.stringify(request.schema).length
  let reported = 0
  let answeredBy = model.id
  const onAttempt = (r: AttemptReport) => {
    reported++
    if (r.outcome === 'ok') answeredBy = r.model
    logAxisCall({ kind, model: r.model, attempt: r.attempt, fallback: r.attempt > 1, outcome: r.outcome, requestChars, maxOutputTokens: r.maxOutputTokens, errorKind: r.errorKind, diagnostics: r.diagnostics })
  }
  // Un modelo que no informa de sus intentos (mocks, implementaciones propias) deja igualmente una línea.
  const single = { kind, model: model.id, attempt: 1, fallback: false, requestChars, maxOutputTokens: model.maxOutputTokens ?? maxOutputTokens }
  try {
    const raw = await model.complete(request, { maxOutputTokens, signal, onAttempt })
    if (reported === 0) logAxisCall({ ...single, outcome: 'ok', diagnostics: {} })
    return { raw, answeredBy }
  } catch (error) {
    if (reported === 0) logAxisCall({ ...single, outcome: 'error', errorKind: errorKindOf(error), diagnostics: error instanceof AIProviderError ? (error.diagnostics ?? {}) : {} })
    throw error
  }
}

const aiEngine = (modelId: string): AxisEngineInfo => ({ ...AI_ENGINE_INFO, label: `IA de AXIS (${modelId})` })

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Elimina cualquier `action` que el modelo haya devuelto en una recomendación (solo AXIS decide acciones). */
function withoutModelAction(v: unknown): unknown {
  if (!isRecord(v)) return v
  const { action: _model, ...rest } = v
  void _model
  return rest
}

/** Comprobación de forma del contexto recibido del cliente: lo justo para no procesar basura. */
export function isFinancialContext(v: unknown): v is FinancialContext {
  return (
    isRecord(v) &&
    typeof v.asOf === 'string' &&
    isRecord(v.wealth) &&
    isRecord(v.flows) &&
    isRecord(v.flows.current) &&
    isRecord(v.flows.previous) &&
    Array.isArray(v.objectives) &&
    isRecord(v.investments) &&
    isRecord(v.quality) &&
    typeof (v.quality as Record<string, unknown>).level === 'string'
  )
}

/**
 * Ejecuta el análisis con un modelo dado. Lanza si el resultado no es válido.
 * `mode`: 'legacy' (el modelo redacta el análisis completo) o 'decision-first'
 * (AXIS decide, el modelo expresa; ver `analyzeDecisionFirst`).
 */
export async function analyzeWithProvider(
  provider: Model,
  context: FinancialContext,
  memory?: AxisMemory,
  signal?: AbortSignal,
  market: MarketContext | null = null,
  mode: AnalysisMode = 'legacy',
): Promise<AxisAnalysis> {
  const model = asLanguageModel(provider)
  // Defensa en profundidad: la memoria (texto escrito por personas) se redacta también en el servidor.
  const input: AxisInput = { context, memory: memory ? redactMemory(memory) : memory, market }
  if (mode === 'decision-first') return analyzeDecisionFirst(model, input, aiEngine(model.id), signal)
  const { raw, answeredBy } = await completeLogged(model, buildAIRequest(input), 'analysis-legacy', signal)
  if (!isRecord(raw)) throw new AIProviderError('malformed', 'la salida no es un objeto')
  return parseAxisAnalysis({
    ...raw,
    // La acción es de AXIS: en modo legacy el modelo redacta la recomendación y no puede fabricar una.
    recommendation: withoutModelAction(raw.recommendation),
    engine: aiEngine(answeredBy),
    generatedAt: new Date().toISOString(),
    basedOnDemoData: context.quality.isDemo,
  })
}

/**
 * DECISION FIRST. AXIS decide (`decide`), el modelo solo expresa
 * (`buildExpressionRequest` → `parseExpression`), la expresión se valida
 * (`validateExpression`) y se fusiona con la decisión (`mergeExpression`),
 * que aporta todo lo decisorio. Cualquier fallo lanza: la ruta responde 502 y
 * el cliente muestra `render(decide(input))`, la MISMA decisión en local.
 */
export async function analyzeDecisionFirst(model: AxisLanguageModel, input: AxisInput, engine: AxisEngineInfo, signal?: AbortSignal): Promise<AxisAnalysis> {
  const decision = decide(input)
  if (decision.level === 'none') throw new AIProviderError('malformed', 'sin datos suficientes para decidir')
  const { raw, answeredBy } = await completeLogged(model, buildExpressionRequest(decision, input.memory), 'analysis-decision-first', signal)
  const expression = parseExpression(raw)
  const verdict = validateExpression(decision, expression)
  if (!verdict.ok) {
    const summary = verdict.violations.map((v) => `${v.invariant}@${v.field}: ${v.detail}`).join(' | ')
    console.warn('[axis] decision-first: expresión rechazada:', summary)
    throw new AIProviderError('malformed', `expresión no válida (${verdict.violations.map((v) => v.invariant).join(', ')})`)
  }
  // Si respondió el fallback de la cadena, la etiqueta dice cuál.
  return parseAxisAnalysis(mergeExpression(decision, expression, answeredBy === model.id ? engine : aiEngine(answeredBy)))
}

/**
 * Conversación con un proveedor dado: mismo proveedor, mismos límites y misma
 * frontera de validación que el análisis (forma con `parseChatReply`, y
 * semántica con `validateChatReply` frente a la decisión de AXIS: certeza,
 * cifras, previsiones, ejecución, aportación manual y contradicción). El contexto
 * solo vive en esta petición: no se persiste ni se registra nada en el servidor.
 * Un rechazo lanza: la ruta responde 502 y el cliente responde en local.
 */
export async function chatWithProvider(provider: Model, rawInput: ChatInput, signal?: AbortSignal): Promise<ChatReply> {
  const model = asLanguageModel(provider)
  // Defensa en profundidad: mensaje, conversación y memoria se redactan también aquí antes de construir el prompt.
  const input = redactChatInput(rawInput)
  const { raw, answeredBy } = await completeLogged(model, buildChatRequest(input), 'chat', signal)
  if (!isRecord(raw)) throw new AIProviderError('malformed', 'la salida no es un objeto')
  // Qué propuso el modelo, qué reconoció el extractor y qué hizo la puerta: solo etiquetas, nunca valores.
  const diagnosis = diagnoseProposal(raw)
  const logProposal = (extractor: string, gate: string) => console.info('[axis] chat: propuesta:', JSON.stringify({ ...diagnosis, extractor, gate }))
  let parsed: ChatReply
  try {
    parsed = parseChatReply({
      ...raw,
      engine: aiEngine(answeredBy),
      generatedAt: new Date().toISOString(),
    })
  } catch (error) {
    logProposal('not-reached', 'not-reached')
    throw error
  }
  // El dato estructurado sale del mensaje del usuario, no del modelo (misma puerta que las respuestas locales).
  const { reply, outcome, extraction } = withProfileProposal(parsed, input.message)
  logProposal(extractionLabel(extraction), outcome)
  // Misma frontera que el análisis: la respuesta se juzga frente a la decisión determinista de AXIS.
  const verdict = validateChatReply(reply, buildChatGuard(input))
  if (!verdict.ok) {
    console.warn('[axis] chat: respuesta rechazada:', verdict.violations.map((v) => `${v.invariant}@${v.field}: ${v.detail}`).join(' | '))
    throw new AIProviderError('malformed', `respuesta no válida (${verdict.violations.map((v) => v.invariant).join(', ')})`)
  }
  return reply
}
