/**
 * Validación semántica de una respuesta conversacional (SOLO servidor).
 *
 * `parseChatReply` comprueba la forma y limpia el texto; esto comprueba lo que
 * el texto AFIRMA. Hoy: certeza injustificada («garantiza», «va a subir»,
 * «sin duda»…), con el mismo detector por cláusulas que usa Decision First y
 * el Market Research (`lib/text/certainty.ts`). Antes el chat no tenía ninguna
 * comprobación de certeza y una promesa podía llegar al usuario.
 *
 * Si falla, la respuesta NO se muestra: `chatWithProvider` lanza, la ruta
 * responde 502 y el cliente responde con el motor local (`composeLocalReply`).
 */
import { findCertainty } from '../../text/certainty'
import type { SemanticVerdict, Violation } from '../core/semantic'
import type { ChatReply } from './types'

export function validateChatReply(reply: ChatReply): SemanticVerdict {
  const violations: Violation[] = []
  const certainty = findCertainty(reply.text)
  if (certainty) violations.push({ invariant: 'certainty', field: 'reply', detail: `«${certainty.match}» (${certainty.kind})` })
  return violations.length === 0 ? { ok: true } : { ok: false, violations }
}
