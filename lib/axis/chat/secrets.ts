/**
 * Información que NUNCA debe guardarse como memoria de AXIS, persistirse en
 * el historial ni salir del dispositivo hacia el proveedor: credenciales,
 * claves, tokens, números de tarjeta o cuenta. Es una barrera por patrones
 * (no infalible), aplicada en el servidor (al validar la propuesta) y en el
 * cliente (antes de guardar y antes de enviar).
 *
 *   looksLikeSecret(text)  → ¿hay algo detectable?  (rechazar una propuesta de memoria)
 *   redactSecrets(text)    → mismo texto con cada secreto sustituido por
 *                            «[dato sensible omitido]»; sin secretos, idéntico.
 *
 * Dónde se redacta (cada punto es independiente; ninguno confía en los otros):
 *   - hooks/use-axis-chat.ts: el mensaje del usuario, antes de persistirlo y de enviarlo.
 *   - chat/history.ts (windowForModel): resumen y mensajes recientes, al construir la ventana.
 *   - chat/browser-transport.ts: todo el ChatInput, justo antes de salir del dispositivo.
 *   - ai/server/analyze.ts: mensaje, conversación y memoria, antes de construir el prompt.
 */
import type { AxisMemory } from '../types'
import type { ChatInput, ConversationWindow } from './types'

export const REDACTED = '[dato sensible omitido]'

/**
 * Patrones. Los que anuncian una credencial («contraseña», «PIN es») no capturan
 * el valor: al redactar se elimina desde la palabra hasta el final de la frase,
 * porque el valor suele venir justo después. Los de formato (claves, IBAN,
 * tarjeta) capturan el propio secreto.
 */
const ANNOUNCERS: RegExp[] = [
  /\b(contrase[ñn]a|password|passwd|clave (?:de acceso|secreta|del banco)|c[oó]digo (?:pin|de seguridad)|cvv|cvc|api[\s_-]?key|access[\s_-]?token|secret)\b/i,
  /\bpin\b\s*(?:es|:|=)\s*\d/i,
]
const FORMATS: RegExp[] = [
  // Claves con formato conocido (Google, OpenAI, Groq, GitHub, AWS…).
  /\b(AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9_-]{16,}|gsk_[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/,
  // IBAN.
  /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}\b/,
  // Números de tarjeta (13–19 dígitos, con o sin separadores). La puntuación final («…1111.», «…1111,») no
  // impide la detección; solo se excluye la continuación numérica (la parte decimal de «-6.666666666666667»).
  /(?<!\d)(?<!\d[.,])\b(?:\d[ -]?){13,19}\b(?![.,]?\d)/,
]

const PATTERNS: RegExp[] = [...ANNOUNCERS, ...FORMATS]

export function looksLikeSecret(text: string): boolean {
  return PATTERNS.some((p) => p.test(text))
}

/** Fin de la frase en la que empieza `from` (o del texto), para tapar el valor que sigue a un anunciador. */
function sentenceEnd(text: string, from: number): number {
  const m = /[.;,!?\n¿¡]|$/.exec(text.slice(from))
  return from + (m?.index ?? text.length - from)
}

/** Sustituye cada secreto detectable por `REDACTED`. Sin secretos, devuelve el mismo texto (misma referencia). */
export function redactSecrets(text: string): { text: string; redacted: number } {
  if (!looksLikeSecret(text)) return { text, redacted: 0 }
  let out = text
  let redacted = 0
  for (const re of ANNOUNCERS) {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
    let m: RegExpExecArray | null
    while ((m = global.exec(out)) !== null) {
      const end = sentenceEnd(out, m.index)
      out = `${out.slice(0, m.index)}${REDACTED}${out.slice(end)}`
      global.lastIndex = m.index + REDACTED.length
      redacted++
    }
  }
  for (const re of FORMATS) {
    const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
    out = out.replace(global, () => {
      redacted++
      return REDACTED
    })
  }
  return { text: out, redacted }
}

const redactText = (t: string) => redactSecrets(t).text

export function redactWindow(window: ConversationWindow): ConversationWindow {
  const summary = window.summary === null ? null : redactText(window.summary)
  const recent = window.recent.map((m) => (looksLikeSecret(m.text) ? { ...m, text: redactText(m.text) } : m))
  return summary === window.summary && recent.every((m, i) => m === window.recent[i]) ? window : { summary, recent }
}

export function redactMemory(memory: AxisMemory): AxisMemory {
  const userMemories = memory.userMemories?.map((m) => (looksLikeSecret(m.content) ? { ...m, content: redactText(m.content) } : m))
  const previousConclusions = memory.previousConclusions?.map((c) => (looksLikeSecret(c.summary) ? { ...c, summary: redactText(c.summary) } : c))
  const unchanged = (userMemories ?? []).every((m, i) => m === memory.userMemories?.[i]) && (previousConclusions ?? []).every((c, i) => c === memory.previousConclusions?.[i])
  if (unchanged) return memory
  return { ...memory, ...(userMemories ? { userMemories } : {}), ...(previousConclusions ? { previousConclusions } : {}) }
}

/** Todo lo que un ChatInput lleva escrito por personas: mensaje, conversación y memoria. El contexto financiero (cifras) no se toca. */
export function redactChatInput(input: ChatInput): ChatInput {
  const message = redactText(input.message)
  const conversation = redactWindow(input.conversation)
  const memory = input.memory ? redactMemory(input.memory) : input.memory
  if (message === input.message && conversation === input.conversation && memory === input.memory) return input
  return { ...input, message, conversation, memory }
}
