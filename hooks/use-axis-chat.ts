'use client'

/**
 * Conversación con AXIS.
 *
 * - Historial y memorias viven en Dexie (persisten entre recargas; se
 *   borran con «Borrar todos los datos»).
 * - Cada consulta construye el contexto completo en el dispositivo
 *   (FinancialContext actual + mercado + memoria + ventana de conversación)
 *   y lo envía al endpoint seguro. Nada se persiste en el servidor.
 * - Ante cualquier fallo, sin conexión o sin cupo, responde el motor local
 *   y el mensaje queda marcado como tal. No se finge actividad: las fases
 *   reflejan trabajo real.
 * - Las propuestas de memoria solo se guardan si el usuario acepta.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { buildFinancialContext } from '@/lib/axis/context'
import { browserChatTransport } from '@/lib/axis/chat/browser-transport'
import { createChatEngine, type ChatPhase } from '@/lib/axis/chat/engine'
import { appendMessage, updateMessage, windowForModel } from '@/lib/axis/chat/history'
import { CHAT_LIMITS, type ChatMessage, type ConversationState, type UserMemory } from '@/lib/axis/chat/types'
import type { MarketContext } from '@/lib/axis/types'
import { clearConversation, getConversation, putConversation } from '@/lib/db/axis-conversation'
import { deleteUserMemory, listUserMemories, saveAcceptedProposal } from '@/lib/db/axis-memories'
import { getAxisMemory } from '@/lib/db/axis-memory'
import { newId } from '@/lib/db/db'
import type { FinancialOverview } from './use-financial-overview'

/**
 * preparing  cargando historial y memoria locales
 * idle       listo para una consulta
 * analyzing  construyendo el contexto y comprobando disponibilidad
 * responding llamada al proveedor en curso
 * error      la última consulta no pudo completarse ni con el motor local
 */
export type ChatStatus = 'preparing' | 'idle' | 'analyzing' | 'responding' | 'error'

export function useAxisChat(overview: FinancialOverview | undefined, market: MarketContext | null) {
  const stored = useLiveQuery(getConversation, [])
  const memories = useLiveQuery(listUserMemories, [], [] as UserMemory[])
  const [status, setStatus] = useState<ChatStatus>('preparing')
  const [online, setOnline] = useState(true)
  // Estado local espejo del persistido, para actualizar la UI sin esperar a Dexie.
  const [conversation, setConversation] = useState<ConversationState | null>(null)
  const busy = useRef(false)
  // Un motor por montaje: la disponibilidad de la IA se comprueba una vez y se recuerda.
  const [engine] = useState(() =>
    createChatEngine({
      transport: browserChatTransport,
      isOffline: () => typeof navigator !== 'undefined' && navigator.onLine === false,
      onPhase: (phase: ChatPhase) => setStatus(phase),
    }),
  )

  useEffect(() => {
    if (stored === undefined) return
    setConversation((current) => current ?? stored)
    setStatus((s) => (s === 'preparing' ? 'idle' : s))
  }, [stored])

  useEffect(() => {
    if (typeof navigator === 'undefined') return
    setOnline(navigator.onLine !== false)
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  const persist = useCallback(async (next: ConversationState) => {
    setConversation(next)
    await putConversation(next)
  }, [])

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.replace(/\s+/g, ' ').trim().slice(0, CHAT_LIMITS.MAX_MESSAGE_CHARS)
      if (!text || !overview || !conversation || busy.current) return
      busy.current = true
      const userMessage: ChatMessage = { id: newId(), role: 'user', text, createdAt: Date.now() }
      // El mensaje del usuario se guarda antes de la consulta: se conserva aunque falle.
      const withUser = appendMessage(conversation, userMessage)
      await persist(withUser)
      setStatus('analyzing')
      try {
        const { config, movements, objectives, positions } = overview
        const context = buildFinancialContext({ config, movements, objectives, positions })
        const memory = (await getAxisMemory()) ?? undefined
        const reply = await engine.ask({ context, market, memory, conversation: windowForModel(withUser), message: text })
        const axisMessage: ChatMessage = {
          id: newId(),
          role: 'axis',
          text: reply.text,
          createdAt: Date.now(),
          engine: reply.engine,
          ...(reply.fallbackReason ? { fallbackReason: reply.fallbackReason } : {}),
          ...(reply.nextStep ? { nextStep: reply.nextStep } : {}),
          ...(reply.memoryProposal ? { memoryProposal: { ...reply.memoryProposal, status: 'pending' as const } } : {}),
        }
        await persist(appendMessage(withUser, axisMessage))
        setStatus('idle')
      } catch {
        setStatus('error')
      } finally {
        busy.current = false
      }
    },
    [overview, conversation, market, persist, engine],
  )

  const resolveProposal = useCallback(
    async (messageId: string, accept: boolean) => {
      if (!conversation) return
      const message = conversation.messages.find((m) => m.id === messageId)
      const proposal = message?.memoryProposal
      if (!proposal || proposal.status !== 'pending') return
      let status: 'accepted' | 'rejected' = 'rejected'
      if (accept) {
        const outcome = await saveAcceptedProposal(proposal)
        status = outcome.action === 'rejected' ? 'rejected' : 'accepted'
      }
      await persist(updateMessage(conversation, messageId, (m) => ({ ...m, memoryProposal: { ...proposal, status } })))
    },
    [conversation, persist],
  )

  const clear = useCallback(async () => {
    if (busy.current) return
    await clearConversation()
    setConversation({ summary: null, messages: [] })
    setStatus('idle')
  }, [])

  const forget = useCallback((id: string) => deleteUserMemory(id), [])

  const messages = useMemo(() => conversation?.messages ?? [], [conversation])

  return { status, online, messages, memories: memories ?? [], send, resolveProposal, clear, forget }
}
