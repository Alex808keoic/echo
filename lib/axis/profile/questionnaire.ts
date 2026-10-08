/**
 * Cuestionario de perfil («Tu perfil»): cuatro preguntas con respuestas
 * cerradas que se guardan como memorias con hecho estructurado, por la misma
 * vía que el resto de memorias (`applyProposals` → `applyProposal`).
 *
 *   horizon          ¿Cuándo necesitarás el dinero que ahorras?
 *   riskAttitude     Si una inversión tuya bajara un 20 % en un año…
 *   irregularIncome  ¿Tus ingresos son parecidos cada mes?
 *   adult            ¿Eres mayor de edad?
 *
 * Nada se infiere: cada respuesta es un botón y produce exactamente un hecho.
 * Las preguntas sin responder no guardan nada; responder otra vez sustituye la
 * respuesta anterior (cada clase de hecho ocupa un solo hueco del perfil).
 */
import type { MemoryProposal } from '../chat/types'
import type { MemoryFact, UserProfile } from './types'

export type ProfileQuestionId = 'horizon' | 'riskAttitude' | 'irregularIncome' | 'adult'

export interface ProfileOption {
  label: string
  fact: Extract<MemoryFact, { kind: ProfileQuestionId }>
  /** Texto de la memoria, en tercera persona como el resto de memorias. */
  content: string
}

export interface ProfileQuestion {
  id: ProfileQuestionId
  title: string
  hint?: string
  options: readonly ProfileOption[]
}

export const PROFILE_QUESTIONS: readonly ProfileQuestion[] = [
  {
    id: 'horizon',
    title: '¿Cuándo crees que necesitarás el dinero que ahorras?',
    options: [
      { label: 'En menos de 2 años', fact: { kind: 'horizon', value: 'short' }, content: 'Espera necesitar el dinero que ahorra en menos de 2 años.' },
      { label: 'Entre 2 y 5 años', fact: { kind: 'horizon', value: 'medium' }, content: 'Espera necesitar el dinero que ahorra en un plazo de 2 a 5 años.' },
      { label: 'En más de 5 años', fact: { kind: 'horizon', value: 'long' }, content: 'Espera no necesitar el dinero que ahorra hasta dentro de más de 5 años.' },
    ],
  },
  {
    id: 'riskAttitude',
    title: 'Si una inversión tuya bajara un 20 % en un año, ¿cómo lo llevarías?',
    hint: 'Es normal que una inversión a largo plazo tenga años malos.',
    options: [
      { label: 'Me agobiaría: prefiero no arriesgar', fact: { kind: 'riskAttitude', value: 'conservative' }, content: 'Prefiere no arriesgar su dinero (perfil conservador).' },
      { label: 'Me preocuparía, pero esperaría', fact: { kind: 'riskAttitude', value: 'balanced' }, content: 'Acepta algunos altibajos si el plazo es largo (perfil equilibrado).' },
      { label: 'Tranquilidad: pienso a largo plazo', fact: { kind: 'riskAttitude', value: 'dynamic' }, content: 'Lleva bien los altibajos pensando a largo plazo (perfil dinámico).' },
    ],
  },
  {
    id: 'irregularIncome',
    title: '¿Tus ingresos son parecidos cada mes?',
    options: [
      { label: 'Sí, bastante estables', fact: { kind: 'irregularIncome', value: false }, content: 'Sus ingresos son parecidos cada mes.' },
      { label: 'No, cambian bastante', fact: { kind: 'irregularIncome', value: true }, content: 'Sus ingresos cambian bastante de un mes a otro.' },
    ],
  },
  {
    id: 'adult',
    title: '¿Eres mayor de edad?',
    hint: 'Solo sirve para explicarte bien la parte de inversión: si no lo eres, invertir lo hace un adulto a tu nombre.',
    options: [
      { label: 'Sí', fact: { kind: 'adult', value: true }, content: 'Es mayor de edad.' },
      { label: 'No', fact: { kind: 'adult', value: false }, content: 'Es menor de edad.' },
    ],
  },
]

/** Índice de la opción elegida por pregunta (`undefined` = sin responder). */
export type ProfileAnswers = Partial<Record<ProfileQuestionId, number>>

const valueOf = (profile: UserProfile, id: ProfileQuestionId): unknown => profile[id]

/** Respuestas actuales a partir del perfil derivado de las memorias. */
export function answersFromProfile(profile: UserProfile): ProfileAnswers {
  const answers: ProfileAnswers = {}
  for (const q of PROFILE_QUESTIONS) {
    const value = valueOf(profile, q.id)
    const index = q.options.findIndex((o) => o.fact.value === value)
    if (index >= 0) answers[q.id] = index
  }
  return answers
}

/** Cuántas preguntas tiene respondidas el perfil. */
export function answeredCount(profile: UserProfile): number {
  return Object.keys(answersFromProfile(profile)).length
}

/**
 * Memorias a guardar: una por respuesta que cambia respecto a `current`. Las
 * no respondidas o iguales no generan nada. Sin `replacesId`: la que ocupe el
 * mismo hueco del perfil se sustituye sola (`replacementFor`).
 */
export function profileProposals(answers: ProfileAnswers, current: ProfileAnswers): MemoryProposal[] {
  return PROFILE_QUESTIONS.flatMap((q) => {
    const index = answers[q.id]
    if (index === undefined || index === current[q.id]) return []
    const option = q.options[index]
    if (!option) return []
    return [
      {
        content: option.content,
        category: q.id === 'horizon' || q.id === 'riskAttitude' ? ('preference' as const) : ('context' as const),
        importance: 'high' as const,
        confidence: 1,
        replacesId: null,
        fact: option.fact,
        origin: 'manual' as const,
      },
    ]
  })
}
