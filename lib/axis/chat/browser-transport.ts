/**
 * Transporte del navegador para la conversación: mismo endpoint seguro que
 * el análisis (`/api/axis`, `mode: 'chat'`). El navegador nunca habla con
 * el proveedor ni conoce su clave; envía solo el contexto necesario.
 *
 * El servidor responde `{ reply: ChatReply }`: la salida del modelo ya pasó por
 * `parseChatReply` allí. Aquí solo se comprueba la forma y se entrega tal cual.
 */
import { browserTransport, contextForRequest } from '../ai/browser-transport'
import { ChatTransportError, type ChatTransport } from './engine'
import type { ChatInput } from './types'
import { isChatReply } from './validate'

export const browserChatTransport: ChatTransport = {
  isAvailable: () => browserTransport.isAvailable(),

  async ask(input: ChatInput, signal: AbortSignal) {
    const res = await fetch('/api/axis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'chat',
        context: contextForRequest(input.context),
        market: input.market ?? undefined,
        memory: input.memory,
        conversation: input.conversation,
        message: input.message,
      }),
      signal,
    })
    if (res.status === 429) throw new ChatTransportError('rate-limited', 'axis api 429')
    if (res.status === 503) throw new ChatTransportError('unavailable', 'axis api 503')
    if (!res.ok) throw new ChatTransportError('error', `axis api ${res.status}`)
    const body: unknown = await res.json()
    const reply = typeof body === 'object' && body !== null ? (body as { reply?: unknown }).reply : undefined
    if (!isChatReply(reply)) throw new ChatTransportError('error', 'axis api: respuesta sin reply')
    return reply
  },
}
