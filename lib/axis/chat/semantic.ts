/**
 * Validación semántica de una respuesta conversacional (SOLO servidor).
 *
 * `parseChatReply` comprueba la forma y limpia el texto; esto comprueba lo que
 * el texto AFIRMA, con la misma frontera que el análisis (Decision First):
 *
 *   certainty   ninguna certeza indebida ni incertidumbre negada (lib/text/certainty.ts)
 *   figures     toda cifra escrita ∈ cifras permitidas: contexto, decisión de AXIS,
 *               previsiones, lo que el usuario escribió y derivadas cerradas
 *               (core/figures.ts); nunca una cifra inventada o alterada
 *   forecast    una cifra o un plazo que SOLO existen como previsión (ingresos
 *               recurrentes declarados) van en una frase que los presenta como
 *               previsión: nunca como dinero disponible ni como hecho
 *   execution   ninguna afirmación de haber hecho (o ir a hacer) una operación
 *   objectives  ninguna aportación manual a un objetivo (B3: el reparto es automático)
 *   advice      ningún activo o producto externo recomendado, y nada que contradiga
 *               de forma explícita la acción que AXIS acaba de decidir
 *
 * No intenta juzgar toda la prosa: un consejo prudente, negado o condicionado
 * («no te recomendaría invertir todavía», «cuando completes el colchón,
 * podrías…») pasa. Si algo falla, la respuesta NO se muestra: `chatWithProvider`
 * lanza, la ruta responde 502 y el cliente responde con el motor local.
 */
import { extractAdvice, type AdviceClause, type AdviceVerbClass } from '../../text/advice'
import { findCertainty, normalizeForMatching } from '../../text/certainty'
import { decide } from '../core/decision'
import { buildAllowedFigures, checkFigures, checkForecastPresentation, contextFigures, extractFigures, forecastFigures, FORECAST_MARKER, messageFigures, moneyFigure, splitSentences, type AllowedFigureSet } from '../core/figures'
import { EXECUTION_PATTERNS, knownEntities, type SemanticVerdict, type Violation } from '../core/semantic'
import type { KnownEntities } from '../../text/advice'
import type { AxisAction, AxisDecision } from '../types'
import type { ChatInput, ChatReply } from './types'
import { historyFigures, monthsWithHistory } from './financial-history'
import { chatPlanOf, planFigures, type ChatPlan } from '../plan/chat'
import { toolResultFigures } from './tools'

/** Lo que la validación necesita del turno: la decisión de AXIS y las cifras que existen. */
export interface ChatGuard {
  decision: AxisDecision
  allowed: AllowedFigureSet
  entities: KnownEntities
  /** Meses (`YYYY-MM`) de los que hay datos de movimientos: el actual, el anterior y los cerrados del histórico. */
  monthsWithData: ReadonlySet<string>
  /** Plan de reparto de este turno (fase 2d): sus cifras se pueden citar; si no invierte, no se puede proponer invertir. */
  plan: ChatPlan
}

/**
 * La decisión se construye con la MISMA ruta determinista que el análisis
 * (`decide`), con el mismo contexto, mercado y memoria que recibe el modelo.
 * Cifras permitidas: las del análisis + lo que el usuario escribió en este
 * mensaje y en los anteriores de la conversación + el mínimo de liquidez que
 * declaró (dato de su perfil) + el histórico compacto de movimientos reales
 * (fuente `history`). Las respuestas anteriores del modelo NO aportan cifras:
 * manda el contexto actual.
 */
export function buildChatGuard(input: ChatInput): ChatGuard {
  const decision = decide({ context: input.context, market: input.market ?? null, memory: input.memory })
  const base = buildAllowedFigures(decision, { message: input.message })
  const earlierUserTexts = input.conversation.recent.filter((m) => m.role === 'user').map((m) => m.text)
  const extra = [
    ...earlierUserTexts.flatMap((t) => messageFigures(t)),
    ...(decision.profile.fields.minLiquidityCents !== undefined ? [moneyFigure('Mínimo de liquidez que quieres mantener', decision.profile.fields.minLiquidityCents, 'context')] : []),
    ...historyFigures(input.history),
    // Resultado de la consulta que pidió el modelo (parte 4c): calculado por Finax en el dispositivo.
    ...toolResultFigures(input.toolResults),
  ]
  // El plan sale de la misma decisión: sus importes (los de «Tu plan») se pueden citar.
  const plan = chatPlanOf(decision)
  const figures = [...base.figures, ...extra, ...planFigures(plan)]
  return {
    decision,
    allowed: { figures, keys: new Set(figures.map((f) => f.key)) },
    entities: knownEntities(decision),
    monthsWithData: monthsWithHistory(input.history, input.context.flows.current.key, input.context.flows.previous.key),
    plan,
  }
}

/* ------------------------------ meses del histórico ------------------------------ */

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTH_NAME = new RegExp(`\\b(${MONTHS.join('|')}|setiembre)(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`, 'g')
/** Afirmaciones en pasado sobre lo que ocurrió (gastos, ingresos, ahorro de un mes). */
const PAST_FACT = /\b(?:gastaste|ingresaste|cobraste|recibiste|pagaste|ahorraste|tuviste|hiciste|ganaste|se fueron|entraron|salieron)\b/

/** `YYYY-MM` de un mes citado sin año: el más reciente que no sea posterior al mes de `asOf`. */
function monthKeyFor(name: string, year: string | undefined, asOf: string): string {
  const index = name === 'setiembre' ? 8 : MONTHS.indexOf(name)
  const nowYear = Number(asOf.slice(0, 4))
  const nowMonth = Number(asOf.slice(5, 7)) - 1
  const y = year ? Number(year) : index <= nowMonth ? nowYear : nowYear - 1
  return `${y}-${String(index + 1).padStart(2, '0')}`
}

/**
 * «En marzo gastaste 1.200 €» solo vale si Finax tiene movimientos de marzo:
 * un mes que no está en el histórico (inventado, demasiado antiguo o futuro,
 * p. ej. una previsión contada como hecho) no puede llevar cifras como pasado.
 * Las frases que se presentan como previsión no se juzgan aquí.
 */
function monthsWithoutData(text: string, guard: ChatGuard, asOf: string): string[] {
  const out: string[] = []
  for (const sentence of splitSentences(text)) {
    if (FORECAST_MARKER.test(sentence)) continue
    const normalized = normalizeForMatching(sentence)
    if (!PAST_FACT.test(normalized) || !extractFigures(sentence).some((f) => f.kind === 'money')) continue
    for (const m of normalized.matchAll(MONTH_NAME)) {
      const key = monthKeyFor(m[1], m[2], asOf)
      if (!guard.monthsWithData.has(key)) out.push(`${m[0]} (${key})`)
    }
  }
  return out
}

/* -------------------------------- ejecución ------------------------------ */

/** Además de las del análisis: lo que un chat suele afirmar haber hecho con los datos del usuario. */
const CHAT_EXECUTION_PATTERNS: RegExp[] = [
  ...EXECUTION_PATTERNS,
  /\b(?:he|hemos)\s+(?:añadido|cambiado|marcado|configurado|ajustado|apartado|reservado|destinado|asignado|enviado|pagado|cancelado|quitado|activado|desactivado|reactivado|ingresado|anotado|reordenado|subido|bajado)\b/i,
  /\b(?:voy|vamos)\s+a\s+(?:añadir|cambiar|marcar|configurar|ajustar|apartar|reservar|destinar|asignar|enviar|pagar|cancelar|quitar|activar|reactivar|ingresar|anotar|reordenar)\b/i,
  /\bya\s+(?:est[áa]n?|queda(?:n)?)\s+(?:añadid[oa]s?|cambiad[oa]s?|marcad[oa]s?|eliminad[oa]s?|borrad[oa]s?|configurad[oa]s?|actualizad[oa]s?|transferid[oa]s?|reservad[oa]s?|apartad[oa]s?|destinad[oa]s?)\b/i,
]

/** La frase (del texto original) que contiene un fragmento, hasta donde empieza ese fragmento. */
function sentenceHead(text: string, fragment: string): string {
  const sentence = splitSentences(text).find((x) => x.includes(fragment)) ?? fragment
  const at = sentence.indexOf(fragment)
  return normalizeForMatching(at >= 0 ? sentence.slice(0, at) : '')
}

/* ------------------------- objetivos: sin aportación manual ------------------------- */

/** Verbos de aportación manual (B3). «Ahorrar» no: ahorrar sube el líquido y el reparto lo asigna solo. */
const MANUAL_ALLOCATION_VERBS = /^(?:destin|aport|asign|mete|met[ei]|dedic|reserv|apart|guard)/
/** «Añade/ingresa X a tu objetivo»: no está en el léxico de consejos. */
const ADD_TO_OBJECTIVE = /\b(?:añade|añadir|añadas|añadiria|ingresa|ingresar|ingreses)\b[^.!?\n]{0,60}\b(?:objetivos?|meta)\b/i

function manualAllocations(text: string, clauses: AdviceClause[]): string[] {
  const found = clauses
    .filter((c) => !c.negated && c.target.kind === 'objective' && MANUAL_ALLOCATION_VERBS.test(normalizeForMatching(c.verb)))
    .map((c) => c.clause)
  const add = text.match(ADD_TO_OBJECTIVE)
  if (add && !/\b(?:no|sin|nunca|ni)\b/.test(sentenceHead(text, add[0]))) found.push(add[0])
  return found
}

/* ------------------------------- consejos ------------------------------- */

/**
 * Qué clases de consejo contradicen cada acción decidida por AXIS. Solo la
 * contradicción explícita: invertir o comprar cuando AXIS protege la liquidez
 * o pide ajustar gastos; además vender cuando decide mantener.
 */
const OPPOSES: Partial<Record<AxisAction['verb'], ReadonlySet<AdviceVerbClass>>> = {
  'complete-cushion': new Set(['invest', 'buy']),
  reserve: new Set(['invest', 'buy']),
  allocate: new Set(['invest', 'buy']),
  adjust: new Set(['invest', 'buy']),
  hold: new Set(['invest', 'buy', 'sell']),
}

/** Un consejo condicionado a que antes se cumpla algo («cuando…», «una vez…») no contradice la prioridad actual. */
const CONDITIONAL = /\b(?:cuando|una vez|despues de|mas adelante|en el futuro|mas tarde|si ya|si antes|antes de nada)\b/

/**
 * El plan dice que este mes NO toca invertir (y por qué): bloqueado por líquido
 * negativo, gasto o falta de ahorro; o colchón incompleto, horizonte corto o
 * sin margen. Sin datos suficientes o sin perfil, el plan no lo sabe: no prohíbe.
 */
function planForbidsInvesting({ plan }: ChatPlan): boolean {
  if (plan.status === 'blocked') return plan.blocker !== 'insufficient-data'
  return plan.longTerm.reason === 'cushion-incomplete' || plan.longTerm.reason === 'short-horizon' || plan.longTerm.reason === 'no-room'
}

function adviceViolations(text: string, clauses: AdviceClause[], decision: AxisDecision, plan?: ChatPlan): string[] {
  const out: string[] = []
  for (const c of clauses) {
    if (c.negated) continue
    if (c.target.kind === 'external') {
      out.push(`destino externo «${c.target.text}»: ${c.clause}`)
      continue
    }
    // Si el plan tiene un motivo firme para no invertir este mes, proponer invertir lo contradice.
    const conditional = CONDITIONAL.test(sentenceHead(text, c.clause) + ' ' + normalizeForMatching(c.clause))
    if (plan && planForbidsInvesting(plan) && (c.verbClass === 'invest' || c.verbClass === 'buy') && !conditional) {
      out.push(`contradice tu plan (no invierte este mes): ${c.clause}`)
      continue
    }
    const action = decision.recommendation?.action
    if (!action || !OPPOSES[action.verb]?.has(c.verbClass)) continue
    if (CONDITIONAL.test(sentenceHead(text, c.clause) + ' ' + normalizeForMatching(c.clause))) continue
    out.push(`contradice la decisión de AXIS (${action.verb}): ${c.clause}`)
  }
  return out
}

/* ------------------------------- previsiones ------------------------------- */

/** Plazos («en 9 meses») que solo existen como previsión, escritos sin presentarlos como previsión. */
function forecastCountsAsFact(text: string, decision: AxisDecision): string[] {
  const real = new Set(contextFigures(decision.context).filter((f) => f.kind === 'count').map((f) => f.key))
  const onlyForecast = new Set(forecastFigures(decision).filter((f) => f.kind === 'count' && !real.has(f.key)).map((f) => f.key))
  if (onlyForecast.size === 0) return []
  const out: string[] = []
  for (const sentence of splitSentences(text)) {
    if (FORECAST_MARKER.test(sentence)) continue
    for (const f of extractFigures(sentence)) if (f.kind === 'count' && onlyForecast.has(f.key)) out.push(f.raw.trim())
  }
  return out
}

/** Plazos genéricos («dentro de 3 meses», «en 2 días») no son cifras financieras: no se exigen en la lista. */
const TIME_SPAN = /\b(?:mes|meses|d[ií]as?)\b/i

/* -------------------------------- veredicto -------------------------------- */

export function validateChatReply(reply: ChatReply, guard?: ChatGuard): SemanticVerdict {
  const violations: Violation[] = []
  const text = reply.text
  const certainty = findCertainty(text)
  if (certainty) violations.push({ invariant: 'certainty', field: 'reply', detail: `«${certainty.match}» (${certainty.kind})` })
  if (!guard) return violations.length === 0 ? { ok: true } : { ok: false, violations }

  for (const f of checkFigures(text, guard.allowed)) {
    if (f.key.startsWith('c:') && TIME_SPAN.test(f.raw)) continue
    violations.push({ invariant: 'figures', field: 'reply', detail: `${f.reason === 'bare-number' ? 'número sin unidad no permitido' : 'cifra no permitida'} «${f.raw.trim()}»` })
  }
  for (const raw of [...checkForecastPresentation(text, guard.decision), ...forecastCountsAsFact(text, guard.decision)]) {
    violations.push({ invariant: 'figures', field: 'reply', detail: `previsión presentada como hecho «${raw}»` })
  }
  for (const month of monthsWithoutData(text, guard, guard.decision.context.asOf)) {
    violations.push({ invariant: 'figures', field: 'reply', detail: `cifra atribuida a un mes sin datos: ${month}` })
  }
  const execution = CHAT_EXECUTION_PATTERNS.find((re) => re.test(text))
  if (execution) violations.push({ invariant: 'execution', field: 'reply', detail: `«${text.match(execution)?.[0]}»` })

  const clauses = extractAdvice(text, guard.entities)
  for (const m of manualAllocations(text, clauses)) violations.push({ invariant: 'advice', field: 'reply', detail: `aportación manual a un objetivo: ${m}` })
  for (const a of adviceViolations(text, clauses, guard.decision, guard.plan)) violations.push({ invariant: 'advice', field: 'reply', detail: a })

  return violations.length === 0 ? { ok: true } : { ok: false, violations }
}
