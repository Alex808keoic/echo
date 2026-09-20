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
 * Proveedor por variables de entorno (solo servidor; nunca `NEXT_PUBLIC_`):
 *   AXIS_AI_ENABLED               "false" desactiva la IA aunque haya proveedor
 *   AXIS_AI_PROVIDER              "gemini" | "groq" (sin valor → sin IA, AXIS local)
 *   GEMINI_API_KEY / GROQ_API_KEY clave del proveedor elegido
 *   AXIS_AI_MODEL                 modelo (opcional; por defecto el del proveedor)
 *   AXIS_AI_MAX_REQUESTS_PER_DAY  solo puede reducir el tope diario (por defecto 40)
 *   AXIS_DECISION_FIRST           "true": el modelo solo EXPRESA la AxisDecision (Decision First);
 *                                 en otro caso, comportamiento anterior (el modelo redacta el análisis completo)
 *
 * Cuentas siempre en free tier y sin billing: si la cuota se agota, el
 * proveedor devuelve 429 y el cliente usa el motor local.
 */
import { createGeminiProvider } from '../../../ai/providers/gemini'
import { createGroqProvider } from '../../../ai/providers/groq'
import type { MarketAIProvider } from '../../../ai/providers/types'
import { buildAIRequest } from '../prompt'
import { AIProviderError, type AIProvider } from '../provider'
import { parseAxisAnalysis } from '../../validate'
import { AI_ENGINE_INFO } from '../../ai-engine'
import { asLanguageModel, type AxisLanguageModel } from '../../language/model'
import { decide } from '../../core/decision'
import { buildExpressionRequest, mergeExpression, parseExpression } from '../../core/expression'
import { validateExpression } from '../../core/semantic'
import { buildChatRequest } from '../../chat/prompt'
import type { ChatInput, ChatReply } from '../../chat/types'
import { redactChatInput, redactMemory } from '../../chat/secrets'
import { validateChatReply } from '../../chat/semantic'
import { parseChatReply } from '../../chat/validate'
import type { AxisAnalysis, AxisEngineInfo, AxisInput, AxisMemory, FinancialContext, MarketContext } from '../../types'
import { AXIS_AI_LIMITS } from './limits'

export type AxisAiProviderId = 'gemini' | 'groq'

export type AnalysisMode = 'legacy' | 'decision-first'

export interface AIServerConfig {
  enabled: boolean
  provider: AxisAiProviderId | null
  apiKey?: string
  model?: string
  /** Decision First activo (`AXIS_DECISION_FIRST=true`). */
  decisionFirst: boolean
}

export function readAIServerConfig(env: Record<string, string | undefined> = process.env): AIServerConfig {
  const enabled = env.AXIS_AI_ENABLED?.trim().toLowerCase() !== 'false'
  const raw = env.AXIS_AI_PROVIDER?.trim().toLowerCase()
  const provider: AxisAiProviderId | null = raw === 'gemini' || raw === 'groq' ? raw : null
  const apiKey = (provider === 'gemini' ? env.GEMINI_API_KEY : provider === 'groq' ? env.GROQ_API_KEY : undefined)?.trim() || undefined
  const decisionFirst = env.AXIS_DECISION_FIRST?.trim().toLowerCase() === 'true'
  return { enabled, provider, apiKey, model: env.AXIS_AI_MODEL?.trim() || undefined, decisionFirst }
}

export const analysisModeOf = (config: AIServerConfig): AnalysisMode => (config.decisionFirst ? 'decision-first' : 'legacy')

/** Proveedor configurado, o `null` si falta el proveedor o su clave. */
export function providerFromConfig(config: AIServerConfig): MarketAIProvider | null {
  if (!config.enabled || !config.provider || !config.apiKey) return null
  const options = { apiKey: config.apiKey, model: config.model, timeoutMs: AXIS_AI_LIMITS.TIMEOUT_MS }
  return config.provider === 'gemini' ? createGeminiProvider(options) : createGroqProvider(options)
}

export function isAIAvailable(config: AIServerConfig): boolean {
  return providerFromConfig(config) !== null
}

/** Modelo de lenguaje o proveedor crudo: ambos se aceptan para no romper a los llamadores existentes. */
type Model = AxisLanguageModel | AIProvider | MarketAIProvider

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

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
  const engine = { ...AI_ENGINE_INFO, label: `IA de AXIS (${model.id})` }
  if (mode === 'decision-first') return analyzeDecisionFirst(model, input, engine, signal)
  const raw = await model.complete(buildAIRequest(input), { maxOutputTokens: AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS, signal })
  if (!isRecord(raw)) throw new AIProviderError('malformed', 'la salida no es un objeto')
  return parseAxisAnalysis({
    ...raw,
    engine,
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
  const raw = await model.complete(buildExpressionRequest(decision, input.memory), { maxOutputTokens: AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS, signal })
  const expression = parseExpression(raw)
  const verdict = validateExpression(decision, expression)
  if (!verdict.ok) {
    const summary = verdict.violations.map((v) => `${v.invariant}@${v.field}: ${v.detail}`).join(' | ')
    console.warn('[axis] decision-first: expresión rechazada:', summary)
    throw new AIProviderError('malformed', `expresión no válida (${verdict.violations.map((v) => v.invariant).join(', ')})`)
  }
  return parseAxisAnalysis(mergeExpression(decision, expression, engine))
}

/**
 * Conversación con un proveedor dado: mismo proveedor, mismos límites y misma
 * frontera de validación que el análisis (forma con `parseChatReply`, y
 * semántica con `validateChatReply`: sin certezas injustificadas). El contexto
 * solo vive en esta petición: no se persiste ni se registra nada en el servidor.
 * Un rechazo lanza: la ruta responde 502 y el cliente responde en local.
 */
export async function chatWithProvider(provider: Model, rawInput: ChatInput, signal?: AbortSignal): Promise<ChatReply> {
  const model = asLanguageModel(provider)
  // Defensa en profundidad: mensaje, conversación y memoria se redactan también aquí antes de construir el prompt.
  const input = redactChatInput(rawInput)
  const raw = await model.complete(buildChatRequest(input), { maxOutputTokens: AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS, signal })
  if (!isRecord(raw)) throw new AIProviderError('malformed', 'la salida no es un objeto')
  const reply = parseChatReply({
    ...raw,
    engine: { ...AI_ENGINE_INFO, label: `IA de AXIS (${model.id})` },
    generatedAt: new Date().toISOString(),
  })
  const verdict = validateChatReply(reply)
  if (!verdict.ok) {
    console.warn('[axis] chat: respuesta rechazada:', verdict.violations.map((v) => `${v.invariant}@${v.field}: ${v.detail}`).join(' | '))
    throw new AIProviderError('malformed', `respuesta no válida (${verdict.violations.map((v) => v.invariant).join(', ')})`)
  }
  return reply
}
