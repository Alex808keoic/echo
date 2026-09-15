/**
 * Transporte del navegador para la conversación: mismo endpoint seguro que
 * el análisis (`/api/axis`, `mode: 'chat'`). El navegador nunca habla con
 * el proveedor ni conoce su clave; envía solo el contexto necesario.
 */
import { browserTransport } from '../ai/browser-transport'
import { ChatTransportError, type ChatTransport } from './engine'
import type { ChatInput } from './types'

export const browserChatTransport: ChatTransport = {
  isAvailable: () => browserTransport.isAvailable(),

  async ask(input: ChatInput, signal: AbortSignal) {
    const res = await fetch('/api/axis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: 'chat',
        context: input.context,
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
    if (typeof body !== 'object' || body === null || !('reply' in body)) throw new ChatTransportError('error', 'axis api: respuesta sin reply')
    return (body as { reply: unknown }).reply
  },
}
