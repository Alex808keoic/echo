/**
 * Convertir una nota de AXIS (memoria de texto libre) en un dato que el plan
 * puede usar. El texto libre nunca decide nada por sí solo: AXIS sugiere, con
 * reglas fijas, qué tipo de dato parece ser, y el usuario elige y confirma.
 *
 * La conversión sustituye a la nota (`replacesId`) por la misma vía que el
 * resto de memorias (`applyProposal`): si ya había un dato de ese tipo, lo
 * sustituye y la pantalla lo enseña antes de guardar. Pasar la nota a un
 * objetivo no es una memoria: lo hace la pantalla (crear objetivo y borrar la nota).
 */
import { centsToInputValue } from '../../money'
import { extractFigures } from '../core/figures'
import { PROFILE_QUESTIONS, type ProfileQuestionId } from '../profile/questionnaire'
import { manualProposal, type EditorResult } from './memory-editor'
import { isSavableProposal } from './memory'
import type { RecurringIncomeCategory } from '../profile/types'
import type { MemoryProposal, UserMemory } from './types'

export type ConversionKind = 'recurringIncome' | 'minLiquidity' | ProfileQuestionId | 'priorities' | 'objective'

export type ConversionInput =
  | { kind: 'recurringIncome'; amount: string; category: RecurringIncomeCategory | null }
  | { kind: 'minLiquidity'; amount: string }
  | { kind: ProfileQuestionId; option: number | null }
  | { kind: 'priorities'; objectiveId: string | null }

export interface ConversionSuggestion {
  kind: ConversionKind | null
  /** Importe de la nota, si tiene exactamente uno («1.200,00»), para rellenar el formulario. */
  amount: string | null
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Reglas en orden: la primera que encaja gana. Solo sugieren; nunca guardan nada. */
const RULES: ReadonlyArray<{ kind: ConversionKind; test: RegExp; needsAmount?: boolean }> = [
  { kind: 'recurringIncome', test: /\b(cada mes|al mes|mensual\w*|paga|sueldo|nomina|cobra\w*|le dan)\b/, needsAmount: true },
  { kind: 'minLiquidity', test: /\b(siempre|minimo|colchon|disponible\w*|reserva)\b/, needsAmount: true },
  { kind: 'irregularIncome', test: /\b(irregular\w*|variable\w*|depende|cambian?|no siempre)\b.*\bingres\w*|\bingres\w*.*\b(irregular\w*|variable\w*|cambian?)\b/ },
  { kind: 'lossCapacity', test: /\b(no (me )?puedo permitirme perder|no me lo puedo permitir|necesito ese dinero|lo necesito para vivir)\b/ },
  { kind: 'investingExperience', test: /\b(nunca he invertido|no he invertido nunca|he invertido|tengo (acciones|fondos)|experiencia invirtiendo)\b/ },
  { kind: 'riskAttitude', test: /\b(riesgo\w*|arriesga\w*|perder|bolsa|altibajos|seguro|segura)\b/ },
  { kind: 'dependents', test: /\b(hij[oa]s?|bebe|embarazad[oa]|a mi cargo|mantengo a|dependen de mi)\b/ },
  { kind: 'work', test: /\b(autonom[oa]|freelance|por mi cuenta|en paro|desemplead[oa]|jubilad[oa]|estudiante|trabajo en|trabaja en)\b/ },
  { kind: 'adult', test: /\b(menor de edad|mayor de edad|\d{1,2} anos)\b/ },
  { kind: 'horizon', test: /\b(plazo|largo|corto|dentro de|en \d+ anos|ano que viene|proximo ano|jubila\w*)\b/ },
  { kind: 'priorities', test: /\b(prioridad\w*|lo primero|antes que nada|mas importante)\b/ },
  { kind: 'objective', test: /\b(comprar\w*|ahorrar para|viaje|coche|moto|piso|casa|movil|ordenador|consola|regalo|estudios|carnet)\b/ },
]

/** Qué tipo de dato parece la nota. Determinista; ante la duda, `null` (elige el usuario). */
export function suggestConversion(note: Pick<UserMemory, 'content' | 'category'>): ConversionSuggestion {
  const text = fold(note.content)
  const money = extractFigures(note.content).filter((f) => f.kind === 'money')
  const amount = money.length === 1 ? centsToInputValue(Math.round(Number(money[0].key.slice(2)) * 100)) : null
  const rule = RULES.find((r) => r.test.test(text) && (!r.needsAmount || amount !== null))
  if (rule) return { kind: rule.kind, amount }
  return { kind: note.category === 'goal' ? 'objective' : null, amount }
}

const PRIORITY_CONTENT = (name: string) => `Su prioridad es el objetivo «${name}».`

/**
 * Propuesta que sustituye a `note` por un dato. Mismas validaciones que el resto
 * de memorias; el texto se genera a partir del dato para que nunca lo contradiga.
 */
export function conversionProposal(note: UserMemory, input: ConversionInput, objectiveName: (id: string) => string | undefined): EditorResult {
  if (note.fact !== undefined) return { ok: false, error: 'Esta memoria ya es un dato.' }
  const replacing = (p: MemoryProposal): EditorResult =>
    isSavableProposal(p) ? { ok: true, proposal: { ...p, replacesId: note.id } } : { ok: false, error: 'No se puede guardar tal como está.' }

  switch (input.kind) {
    case 'recurringIncome':
    case 'minLiquidity': {
      const built = manualProposal(input)
      return built.ok ? replacing(built.proposal) : built
    }
    case 'priorities': {
      const name = input.objectiveId ? objectiveName(input.objectiveId) : undefined
      if (!input.objectiveId || !name) return { ok: false, error: 'Elige el objetivo que es tu prioridad.' }
      return replacing({
        content: PRIORITY_CONTENT(name),
        category: 'financial_plan',
        importance: 'high',
        confidence: 1,
        replacesId: null,
        fact: { kind: 'priorities', objectiveIds: [input.objectiveId] },
        origin: 'manual',
      })
    }
    default: {
      const question = PROFILE_QUESTIONS.find((q) => q.id === input.kind)
      const option = question && input.option !== null ? question.options[input.option] : undefined
      if (!question || !option) return { ok: false, error: 'Elige una respuesta.' }
      return replacing({
        content: option.content,
        category: question.id === 'horizon' || question.id === 'riskAttitude' || question.id === 'lossCapacity' ? 'preference' : 'context',
        importance: 'high',
        confidence: 1,
        replacesId: null,
        fact: option.fact,
        origin: 'manual',
      })
    }
  }
}
