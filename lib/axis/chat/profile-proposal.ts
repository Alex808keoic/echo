/**
 * Puerta de los datos de perfil en las propuestas de memoria (fase 2).
 *
 * El extractor determinista (`extractProfileFacts`) es la autoridad: un dato
 * estructurado del modelo solo sobrevive si coincide con su candidato. La
 * misma función se aplica en el servidor (respuestas con IA) y en el
 * navegador (respuestas locales), así que el resultado no depende del camino.
 * Nada de esto guarda: la tarjeta pide confirmación y `applyProposal` valida.
 *
 *   modelo                    extractor          resultado
 *   fact = candidato          candidato          kept-model         (se conserva)
 *   fact ≠ candidato          candidato          replaced-model     (dato y texto del extractor)
 *   sin fact                  candidato          attached-extractor (dato y texto del extractor)
 *   sin propuesta             candidato          created-extractor
 *   cualquiera                sin categoría      incomplete         (la tarjeta pide Paga/Regalos/Otros)
 *   con fact                  nada / ambiguo     dropped-model      (queda solo el texto del modelo)
 *   sin fact / sin propuesta  nada / ambiguo     none
 */
import { formatCents, parseAmountToCents } from '../../money'
import { extractProfileFacts, type Extraction, type IncompleteRecurringIncome } from '../profile/extract'
import { isValidMemoryFact, RECURRING_INCOME_CATEGORIES, type MemoryFact, type RecurringIncomeCategory } from '../profile/types'
import { factEquals } from './memory'
import type { ChatReply, MemoryProposal } from './types'

export type GateOutcome = 'none' | 'kept-model' | 'replaced-model' | 'attached-extractor' | 'created-extractor' | 'incomplete' | 'dropped-model'

/** Tipos que el extractor reconoce y la tarjeta permite editar. */
export type EditableFact = Extract<MemoryFact, { kind: 'recurringIncome' | 'minLiquidity' }>

export function isEditableFact(fact: MemoryFact | null | undefined): fact is EditableFact {
  return fact?.kind === 'recurringIncome' || fact?.kind === 'minLiquidity'
}

const INCOME_WORDS: Record<RecurringIncomeCategory, string> = { Paga: 'de paga', Regalos: 'en regalos', Otros: 'de otros ingresos' }

/** Texto de la memoria a partir del dato, en tercera persona: texto y dato dicen siempre lo mismo. */
export function contentForFact(fact: EditableFact): string {
  return fact.kind === 'recurringIncome'
    ? `Recibe ${formatCents(fact.cents)} ${INCOME_WORDS[fact.category]} cada mes.`
    : `Quiere tener siempre al menos ${formatCents(fact.cents)} líquidos.`
}

function contentForIncomplete(i: IncompleteRecurringIncome): string {
  return `Recibe ${formatCents(i.cents)} cada mes.`
}

/** Propuesta generada por el extractor cuando el modelo no propone nada (o propone otra cosa). */
export function proposalFromFact(fact: EditableFact): MemoryProposal {
  return {
    content: contentForFact(fact),
    category: fact.kind === 'recurringIncome' ? 'financial_plan' : 'constraint',
    importance: 'high',
    confidence: 1,
    replacesId: null,
    fact,
  }
}

function incompleteProposal(i: IncompleteRecurringIncome): MemoryProposal {
  return { content: contentForIncomplete(i), category: 'financial_plan', importance: 'high', confidence: 1, replacesId: null, incompleteFact: { ...i } }
}

/** Quita `fact` e `incompleteFact` sin dejar claves vacías. */
function textOnly(p: MemoryProposal): MemoryProposal {
  const { fact: _f, incompleteFact: _i, ...rest } = p
  void _f
  void _i
  return rest
}

export function gateProposalFact(proposal: MemoryProposal | null, extraction: Extraction): { proposal: MemoryProposal | null; outcome: GateOutcome } {
  const candidate = extraction.candidates.length === 1 && isEditableFact(extraction.candidates[0]) ? extraction.candidates[0] : undefined
  const modelFact = proposal?.fact ?? undefined

  if (candidate) {
    if (proposal && modelFact && factEquals(modelFact, candidate)) return { proposal: textOnlyWith(proposal, candidate), outcome: 'kept-model' }
    // El dato manda; el texto se genera a partir de él para que no diga otra cosa.
    if (proposal) return { proposal: proposalFromFact(candidate), outcome: modelFact ? 'replaced-model' : 'attached-extractor' }
    return { proposal: proposalFromFact(candidate), outcome: 'created-extractor' }
  }
  if (extraction.incomplete) return { proposal: incompleteProposal(extraction.incomplete), outcome: 'incomplete' }
  if (proposal && (modelFact || proposal.incompleteFact)) return { proposal: textOnly(proposal), outcome: 'dropped-model' }
  return { proposal, outcome: 'none' }
}

/**
 * «Guardar solo como nota»: el mismo texto, sin dato estructurado ni candidato
 * parcial, y como memoria nueva (sin `replacesId`), para que una nota nunca
 * sustituya ni borre un dato estructurado ya guardado. AXIS no la usa para decidir.
 */
export function noteOnlyProposal(p: MemoryProposal): MemoryProposal {
  return { ...textOnly(p), replacesId: null }
}

/** La tarjeta ofrece «Guardar solo como nota» solo cuando hay algo estructurado que dejar fuera. */
export function offersNoteOnly(p: MemoryProposal): boolean {
  return Boolean(p.fact || p.incompleteFact)
}

function textOnlyWith(p: MemoryProposal, fact: MemoryFact): MemoryProposal {
  return { ...textOnly(p), fact }
}

/** La puerta aplicada a una respuesta: el dato sale solo del mensaje del usuario. */
export function withProfileProposal(reply: ChatReply, message: string): { reply: ChatReply; outcome: GateOutcome; extraction: Extraction } {
  const extraction = extractProfileFacts(message)
  const gated = gateProposalFact(reply.memoryProposal, extraction)
  return { reply: { ...reply, memoryProposal: gated.proposal }, outcome: gated.outcome, extraction }
}

/* ------------------------------ tarjeta editable ------------------------------ */

/** Lo que la tarjeta deja editar: el importe (texto, como en los formularios) y, en ingresos, la categoría. */
export interface ProposalDraft {
  amount: string
  category: RecurringIncomeCategory | null
}

/** Valores iniciales de la tarjeta, o `null` si la propuesta no tiene un dato editable. */
export function draftFor(p: MemoryProposal): { kind: EditableFact['kind']; draft: ProposalDraft } | null {
  if (p.incompleteFact) return { kind: 'recurringIncome', draft: { amount: centsToText(p.incompleteFact.cents), category: null } }
  if (!isEditableFact(p.fact)) return null
  return { kind: p.fact.kind, draft: { amount: centsToText(p.fact.cents), category: p.fact.kind === 'recurringIncome' ? p.fact.category : null } }
}

function centsToText(cents: number): string {
  return `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, '0')}`
}

/**
 * Mensaje de validación que enseña la tarjeta. Antes de que el usuario toque
 * importe o categoría no se muestra ninguno (una propuesta incompleta abre ya
 * preguntando la categoría, no con un error); el botón de guardar depende solo
 * de `result.ok`, se haya tocado o no.
 */
export function validationMessage(result: ReturnType<typeof buildEditedProposal>, touched: boolean): string | null {
  return touched && !result.ok ? result.error : null
}

/**
 * Propuesta final a partir de lo que el usuario ha revisado en la tarjeta.
 * Valida importe y categoría con las mismas reglas que el perfil. Si el dato
 * no cambia, conserva el texto original; si cambia, lo regenera.
 */
export function buildEditedProposal(original: MemoryProposal, draft: ProposalDraft): { ok: true; proposal: MemoryProposal } | { ok: false; error: string } {
  const initial = draftFor(original)
  if (!initial) return { ok: true, proposal: original }
  const cents = parseAmountToCents(draft.amount)
  if (cents === null) return { ok: false, error: 'Introduce un importe mayor que cero.' }
  let fact: EditableFact
  if (initial.kind === 'recurringIncome') {
    if (!draft.category || !RECURRING_INCOME_CATEGORIES.includes(draft.category)) return { ok: false, error: 'Elige si es paga, regalos u otros ingresos.' }
    fact = { kind: 'recurringIncome', cents, frequency: 'monthly', category: draft.category }
  } else {
    fact = { kind: 'minLiquidity', cents }
  }
  if (!isValidMemoryFact(fact)) return { ok: false, error: 'Ese importe no es válido.' }
  const unchanged = !original.incompleteFact && factEquals(original.fact ?? undefined, fact)
  return { ok: true, proposal: { ...textOnly(original), content: unchanged ? original.content : contentForFact(fact), fact } }
}
