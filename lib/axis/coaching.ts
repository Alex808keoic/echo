/**
 * Tono de coach de AXIS (determinista). La IA no elige el tono: lo sugiere
 * Finax a partir de la decisión, igual en el servidor (prompt del chat) y en
 * el dispositivo (respuesta local).
 *
 *   firm       hay un problema que atender: directo con el problema y el primer
 *              paso, sin culpar ni dramatizar
 *   celebrate  un objetivo cumplido, cubierto o muy cerca: reconocer el logro concreto
 *   encourage  ahorra con margen: reforzar lo que va bien
 *   steady     el resto: claro y tranquilo
 *
 * Gana el primero que aplica, en ese orden: un problema siempre manda sobre un logro.
 */
import type { AxisDecision } from './types'

export type CoachingTone = 'firm' | 'celebrate' | 'encourage' | 'steady'

/** Señales que piden un tono firme (un problema que atender ya). */
const FIRM = new Set(['liquidity.negative', 'expenses.over-income', 'savings.falling', 'expenses.increase', 'objectives.overdue', 'liquidity.below-min'])
/** Logros. */
const CELEBRATE = new Set(['objectives.completed', 'objectives.covered', 'objectives.near'])
const ENCOURAGE = new Set(['savings.healthy'])

export function coachingTone(decision: AxisDecision): { tone: CoachingTone; signalId: string | null } {
  // Las señales de un objetivo llevan su id («objectives.covered:t-1»): se compara la clase.
  const pick = (set: ReadonlySet<string>) => decision.signals.find((s) => set.has(s.id.split(':')[0]))?.id ?? null
  for (const [tone, set] of [
    ['firm', FIRM],
    ['celebrate', CELEBRATE],
    ['encourage', ENCOURAGE],
  ] as const) {
    const id = pick(set)
    if (id) return { tone, signalId: id }
  }
  return { tone: 'steady', signalId: null }
}

/** Cómo se describe cada tono al modelo. */
export const TONE_GUIDE: Record<CoachingTone, string> = {
  firm: 'firme: ve directo al problema y al primer paso que toca, con claridad y respeto; sin culpar, sin dramatizar y sin rodeos',
  celebrate: 'celebrar: reconoce el logro concreto que ha conseguido (con su nombre y su cifra si están en los datos) y después lo siguiente',
  encourage: 'animar: refuerza lo que está haciendo bien con datos concretos, sin exagerar',
  steady: 'sereno: claro, tranquilo y práctico',
}

/** Frase de apertura de la respuesta local según el tono (sin IA). */
export const TONE_OPENER: Record<CoachingTone, string> = {
  firm: 'Hay algo que conviene atender ya.',
  celebrate: '¡Buenas noticias con tus objetivos!',
  encourage: 'Vas por buen camino.',
  steady: '',
}
