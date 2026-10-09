/**
 * Contrato del modo conversacional de AXIS.
 *
 * La conversación es una capa encima del análisis: usa el mismo
 * `FinancialContext` (verdad actual), el mismo `MarketContext`, la misma
 * memoria y el mismo endpoint seguro. AXIS conversa, analiza y recomienda;
 * NUNCA ejecuta operaciones. Este módulo no depende de React ni de Dexie.
 *
 * Cuatro niveles de contexto, siempre separados (ver prompt.ts):
 *   DATOS ACTUALES → MEMORIA → CONVERSACIÓN ACTUAL → CONSULTA ACTUAL
 */
import type { MemoryFact } from '../profile/types'
import type { ChatAction } from './actions'
import type { ChatFinancialHistory } from './financial-history'
import type { IncompleteRecurringIncome } from '../profile/extract'
import type { AxisEngineInfo, AxisMemory, AxisNextStep, Confidence, FinancialContext, MarketContext } from '../types'

/* ================================ MEMORIA =============================== */

export const MEMORY_CATEGORIES = ['preference', 'goal', 'financial_plan', 'constraint', 'decision', 'context', 'other'] as const
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number]

export const MEMORY_IMPORTANCES = ['high', 'medium', 'low'] as const
export type MemoryImportance = (typeof MEMORY_IMPORTANCES)[number]

/**
 * Una memoria: algo que el usuario ha contado y ha aceptado guardar.
 * Es contexto (preferencias, decisiones, planes); nunca sustituye a los
 * datos de Finax. Se guarda en el dispositivo y se borra con «Borrar todos los datos».
 */
export type MemorySource = 'conversation' | 'manual'

export interface UserMemory {
  id: string
  /** Frase breve, en tercera persona, sin datos sensibles. */
  content: string
  category: MemoryCategory
  importance: MemoryImportance
  /** 0–1: seguridad con la que AXIS entendió la información. */
  confidence: number
  /** Origen: aceptada en una conversación o añadida a mano en «Lo que AXIS sabe de ti». No se envía al modelo. */
  source: MemorySource
  createdAt: number
  updatedAt: number
  /**
   * Hecho ESTRUCTURADO ligado a esta memoria (fase 2): solo existe si vino en la
   * propuesta aceptada y era válido. El texto libre nunca se convierte en hecho.
   * Campo opcional y sin índice: no exige versión nueva de Dexie.
   */
  fact?: MemoryFact
}

/** Propuesta de memoria que AXIS hace en una respuesta; solo se guarda si el usuario acepta. */
export interface MemoryProposal {
  content: string
  category: MemoryCategory
  importance: MemoryImportance
  confidence: number
  /** Memoria existente que esta propuesta actualiza o sustituye (evita duplicados y contradicciones). */
  replacesId: string | null
  /** Hecho estructurado propuesto (fase 2). Ausente o null = solo texto. Al actualizar una memoria, sustituye al anterior. */
  fact?: MemoryFact | null
  /**
   * Ingreso mensual reconocido por el extractor SIN categoría: la tarjeta
   * pide Paga / Regalos / Otros antes de poder guardar. Una propuesta con este
   * campo nunca es guardable tal cual (`isSavableProposal`).
   */
  incompleteFact?: IncompleteRecurringIncome
  /** Creada a mano por el usuario: al crearse se guarda con `source: 'manual'`. No se envía al modelo. */
  origin?: 'manual'
}

export type ProposalStatus = 'pending' | 'accepted' | 'rejected'

/* ============================== CONVERSACIÓN ============================ */

export type ChatRole = 'user' | 'axis'

export interface ChatMessage {
  id: string
  role: ChatRole
  text: string
  createdAt: number
  /** Solo en mensajes de AXIS: quién produjo la respuesta. */
  engine?: AxisEngineInfo
  /** Solo cuando la respuesta la dio el motor local en lugar de la IA. */
  fallbackReason?: FallbackReason
  nextStep?: AxisNextStep
  memoryProposal?: MemoryProposal & { status: ProposalStatus }
  /** Tarjetas de acción (chat/actions.ts). */
  actions?: ChatAction[]
}

/** Historial persistido: mensajes recientes íntegros + resumen de los antiguos. */
export interface ConversationState {
  summary: string | null
  messages: ChatMessage[]
}

/** Lo que se envía al modelo de la conversación: nunca el historial completo. */
export interface ConversationWindow {
  summary: string | null
  recent: Array<{ role: ChatRole; text: string }>
}

/* ================================ ENTRADA =============================== */

export interface ChatInput {
  /** DATOS ACTUALES. */
  context: FinancialContext
  market?: MarketContext | null
  /** MEMORIA. */
  memory?: AxisMemory
  /** CONVERSACIÓN ACTUAL. */
  conversation: ConversationWindow
  /** CONSULTA ACTUAL. */
  message: string
  /** Histórico compacto de movimientos reales (chat/financial-history.ts). Opcional: sin él, el chat no conoce meses anteriores. */
  history?: ChatFinancialHistory
}

/* ================================ SALIDA ================================ */

export type FallbackReason = 'unavailable' | 'offline' | 'rate-limited' | 'error' | 'no-data'

export interface ChatReply {
  text: string
  confidence: Confidence
  nextStep?: AxisNextStep
  memoryProposal: MemoryProposal | null
  engine: AxisEngineInfo
  fallbackReason?: FallbackReason
  generatedAt: string
  /** Tarjetas de acción calculadas por Finax en el dispositivo (chat/actions.ts); nunca las fija el modelo. */
  actions?: ChatAction[]
}

/** Límites de la conversación (cliente y servidor). Inmutables. */
export const CHAT_LIMITS = Object.freeze({
  /** Longitud máxima de un mensaje del usuario. */
  MAX_MESSAGE_CHARS: 1_000,
  /** Mensajes íntegros que se conservan en el dispositivo. */
  MAX_STORED_MESSAGES: 20,
  /** Mensajes recientes que se envían al modelo. */
  MAX_RECENT_FOR_MODEL: 8,
  /** Longitud máxima del resumen de conversaciones antiguas. */
  MAX_SUMMARY_CHARS: 1_500,
  /** Longitud de cada mensaje al comprimirlo en el resumen. */
  MAX_SUMMARY_ITEM_CHARS: 160,
  /** Memorias guardadas como máximo. */
  MAX_MEMORIES: 30,
  MAX_MEMORY_CHARS: 240,
  /** Longitud máxima de una respuesta de AXIS. */
  MAX_REPLY_CHARS: 2_000,
})
