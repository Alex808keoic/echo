/**
 * Extractor determinista de datos de perfil (fase 2 de la memoria de AXIS).
 *
 * Lee SOLO el mensaje actual del usuario (nunca la respuesta del modelo ni la
 * conversación) y reconoce dos declaraciones explícitas, en español:
 *
 *   recurringIncome  «Cada mes me van a dar 35 € de paga» → 3.500 céntimos, mensual, Paga
 *   minLiquidity     «Quiero tener siempre al menos 5.000 € disponibles» → 500.000 céntimos
 *
 * Es la AUTORIDAD sobre los datos estructurados: el modelo solo puede proponer
 * un dato que coincida con un candidato de aquí (`gateProposalFact`). Ante la
 * duda no hay candidato: se devuelve el motivo (`ambiguity`) y, como mucho,
 * una propuesta incompleta para que la tarjeta pregunte la categoría. Nunca
 * guarda nada: el usuario confirma siempre.
 */
import { parseAmountToCents } from '../../money'
import { isValidMemoryFact, type MemoryFact, type RecurringIncomeCategory, type RecurringIncomeFrequency } from './types'

export type ExtractedKind = 'recurringIncome' | 'minLiquidity'

export type AmbiguityReason =
  | 'no-category'
  | 'multiple-amounts'
  | 'approximate'
  | 'conditional'
  | 'negated'
  | 'past'
  | 'other-frequency'
  | 'question'
  | 'expense'
  | 'third-person'
  | 'multiple-facts'

/** Ingreso mensual reconocido sin categoría: la tarjeta la pregunta. */
export interface IncompleteRecurringIncome {
  kind: 'recurringIncome'
  cents: number
  frequency: RecurringIncomeFrequency
}

export interface Extraction {
  /** Cero o un candidato, siempre válido según `isValidMemoryFact`. */
  candidates: MemoryFact[]
  /** Por qué no hay candidato, cuando el mensaje sí hablaba de un importe declarable. */
  ambiguity: { kind: ExtractedKind | 'unknown'; reason: AmbiguityReason } | null
  /** Solo con `ambiguity.reason === 'no-category'`. */
  incomplete: IncompleteRecurringIncome | null
}

const NONE: Extraction = { candidates: [], ambiguity: null, incomplete: null }

/* ------------------------------- patrones ------------------------------- */
// Se aplican sobre el texto en minúsculas y sin tildes (`fold`), salvo los que dependen de la tilde.

/** Importe en euros: «35 €», «35€», «35 euros», «35,50 €», «35.50 €», «1.200 €». */
const EURO_AMOUNT = /(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?\b|eur\b)/g
/** Dos cifras unidas en rango: «entre 30 y 40 €», «30-40 €», «de 30 a 40 €». */
const RANGE = /\bentre\s+\d|\d\s*(?:-|–|\ba\b|\by\b|\bo\b)\s*\d+(?:[.,]\d+)?\s*(?:€|euros?\b)/

const MONTHLY = /\b(?:al mes|cada mes|por mes|mensual(?:es|mente)?|todos los meses|a fin de mes)\b|\/\s*mes\b/
const OTHER_FREQUENCY =
  /\b(?:a la semana|cada semana|semanal(?:es|mente)?|por semana|quincenal(?:es)?|cada (?:dos|tres|seis) meses|al ano|cada ano|anual(?:es|mente)?|por ano|al dia|cada dia|diari[oa]s?|trimestral(?:es)?|semestral(?:es)?|pagas? extras?)\b/

const PAGA = /\b(?:paga|me pagan|me paga|me van a pagar|sueldo|salario|nomina|cobro|cobrare|voy a cobrar)\b/
const REGALOS = /\b(?:regalos?|me regalan|me regala|me van a regalar)\b/
const OTROS = /\b(?:otros? ingresos?)\b/
/** Ingreso sin categoría: «me dan», «recibo», «me ingresan», «gano»… */
const GENERIC_INCOME = /\b(?:me dan|me da|me van a dar|me daran|recibo|recibire|voy a recibir|me ingresan|me ingresa|ingreso|ingresos|gano|me llega|me llegan)\b/

/** Mínimo disponible: «tener siempre…», «mantener al menos…», «colchón de…», «no bajar de…». */
const LIQUIDITY_VERB = /\b(?:tener|mantener|dejar|guardar)\b[^.!?\n]{0,30}\b(?:siempre|al menos|como minimo|minimo)\b/
const LIQUIDITY_FIXED = /\b(?:colchon|no bajar de|no quedarme con menos de)\b/
const SAVING_GOAL = /\b(?:ahorrar|ahorro)\b/

const EXPENSE = /\b(?:pago|pagar|pagamos|pague|gasto|gastar|gastamos|me cuesta|cuesta|cuota|suscripcion|alquiler|factura)\b/
const APPROXIMATE = /\b(?:unos|unas|aproximadamente|alrededor de|mas o menos|cerca de|casi|aprox)\b|~/
const CONDITIONAL = /\b(?:quizas?|a lo mejor|tal vez|me gustaria|ojala|podria|podrian|deberia|seria|serian|daria|darian|pagarian|cobraria)\b/
const NEGATED =
  /\b(?:ya no|nunca|dej(?:o|e|aron|ara|aran) de)\b|\bno\s+(?:me\s+|te\s+|le\s+)?(?:dan|da|daran|pagan|paga|pagaran|cobro|cobra|recibo|regalan|quiero|necesito|tengo)\b/
const PAST = /\b(?:me daban|me pagaban|cobraba|recibia|me regalaban|me ingresaban|ganaba)\b/
const RELATIVES =
  'hermano|hermana|hermanos|hermanas|hijo|hija|hijos|hijas|primo|prima|amigo|amiga|novio|novia|pareja|madre|padre|marido|mujer|esposo|esposa|sobrino|sobrina|abuelo|abuela|companero|companera|vecino|vecina|jefe|jefa'
/**
 * Frases sobre el dinero de otra persona: «a mi hermano le dan…», «la paga de
 * mi hijo…», «mi hija cobra / tiene…», «le pagan…». «Mi padre ME paga…» sí es
 * del usuario y no se excluye.
 */
const POSSESSIVE = '(?:mi|tu|su|mis|tus|sus)'
const THIRD_PERSON = new RegExp(
  [
    `\\b(?:a|de|para)\\s+${POSSESSIVE}\\s+(?:${RELATIVES})\\b`,
    `\\b${POSSESSIVE}\\s+(?:${RELATIVES})\\s+(?:\\p{L}+\\s+)?(?:tiene|tienen|cobra|cobran|recibe|reciben|gana|ganan|percibe)\\b`,
    `\\b(?:le|les)\\s+(?:van a\\s+)?(?:dan|da|dar|daran|pagan|paga|pagar|regalan|regala|ingresan|ingresa)\\b`,
    `\\b(?:cobra|cobran|recibe|reciben|gana|ganan|percibe)\\b`,
  ].join('|'),
  'u',
)

/** Minúsculas y sin tildes; conserva «¿?» y la puntuación. */
function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** «si» condicional (sin tilde), distinto de «sí» afirmativo: se mira en el texto con tildes. */
const CONDITIONAL_SI = /(^|[^\p{L}])si(?=[^\p{L}]|$)/u

/** La cifra está dentro de una pregunta: «¿…35 €…?». */
function insideQuestion(text: string, index: number): boolean {
  const open = text.lastIndexOf('¿', index)
  const closeBefore = text.lastIndexOf('?', index)
  if (open > closeBefore) return true
  // «Cada mes 35 € de paga?» sin «¿»: el «?» cierra la frase de la cifra. Con
  // «…35 € de paga, ¿lo recuerdas?» la pregunta es otra frase y no cuenta.
  const after = text.slice(index)
  const end = after.search(/[.!?\n]/)
  const nextOpen = after.indexOf('¿')
  return end >= 0 && after[end] === '?' && (nextOpen === -1 || nextOpen > end)
}

/**
 * Datos de perfil declarados explícitamente en `message`. Determinista y sin
 * efectos. Como mucho un candidato por mensaje (la respuesta lleva una sola
 * propuesta); con dos datos distintos, ninguno.
 */
export function extractProfileFacts(message: string): Extraction {
  const original = message.toLowerCase()
  const text = fold(message)
  const amounts = [...text.matchAll(EURO_AMOUNT)]
  if (amounts.length === 0) return NONE

  const isIncome = PAGA.test(text) || REGALOS.test(text) || OTROS.test(text) || GENERIC_INCOME.test(text)
  const isLiquidity = !isIncome && (LIQUIDITY_FIXED.test(text) || (LIQUIDITY_VERB.test(text) && !(SAVING_GOAL.test(text) && !/\bdisponibles?\b/.test(text))))
  const monthly = MONTHLY.test(text)
  const kind: ExtractedKind | 'unknown' = isIncome ? 'recurringIncome' : isLiquidity ? 'minLiquidity' : 'unknown'
  // Sin ninguna señal de ingreso, de mínimo ni de periodicidad, la cifra no es una declaración de perfil.
  if (kind === 'unknown' && !monthly) return NONE

  const ambiguous = (reason: AmbiguityReason): Extraction => ({ candidates: [], ambiguity: { kind, reason }, incomplete: null })

  if (THIRD_PERSON.test(text)) return ambiguous('third-person')
  if (EXPENSE.test(text)) return ambiguous('expense')
  if (insideQuestion(message, amounts[0].index ?? 0)) return ambiguous('question')
  if (NEGATED.test(text)) return ambiguous('negated')
  if (PAST.test(text)) return ambiguous('past')
  if (CONDITIONAL.test(text) || CONDITIONAL_SI.test(original)) return ambiguous('conditional')
  if (APPROXIMATE.test(text)) return ambiguous('approximate')
  if (OTHER_FREQUENCY.test(text)) return ambiguous('other-frequency')
  if (RANGE.test(text)) return ambiguous('multiple-amounts')
  const distinct = new Set(amounts.map((m) => parseAmountToCents(m[1])))
  if (distinct.size > 1 || distinct.has(null)) return ambiguous('multiple-amounts')
  const cents = [...distinct][0] as number

  if (kind === 'recurringIncome') {
    if (!monthly) return NONE
    if (LIQUIDITY_FIXED.test(text)) return ambiguous('multiple-facts')
    const categories: RecurringIncomeCategory[] = [
      ...(PAGA.test(text) ? (['Paga'] as const) : []),
      ...(REGALOS.test(text) ? (['Regalos'] as const) : []),
      ...(OTROS.test(text) ? (['Otros'] as const) : []),
    ]
    if (categories.length !== 1) {
      const incomplete: IncompleteRecurringIncome = { kind: 'recurringIncome', cents, frequency: 'monthly' }
      if (!isValidMemoryFact({ ...incomplete, category: 'Otros' })) return NONE
      return { candidates: [], ambiguity: { kind, reason: 'no-category' }, incomplete }
    }
    return valid({ kind: 'recurringIncome', cents, frequency: 'monthly', category: categories[0] })
  }

  if (kind === 'minLiquidity') {
    if (monthly) return ambiguous('multiple-facts')
    return valid({ kind: 'minLiquidity', cents })
  }

  return NONE
}

function valid(fact: MemoryFact): Extraction {
  return isValidMemoryFact(fact) ? { candidates: [fact], ambiguity: null, incomplete: null } : NONE
}

/** Etiqueta para los logs: solo el tipo o el motivo, nunca valores. */
export function extractionLabel(e: Extraction): string {
  if (e.candidates.length === 1) return e.candidates[0].kind
  if (e.ambiguity) return `ambiguous:${e.ambiguity.reason}`
  return 'none'
}
