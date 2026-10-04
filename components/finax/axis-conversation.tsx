'use client'

/**
 * Conversación con AXIS, integrada en la pantalla AXIS.
 *
 * Mismos componentes, tipografía y colores que el resto de Finax: no es una
 * app de chat aparte. Muestra el hilo, un campo para escribir, los estados
 * reales de la consulta, un indicador discreto de si la respuesta la dio la
 * IA o el motor local, y las propuestas de memoria (Recordar / No recordar).
 */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { ChatMessage, MemoryProposal, UserMemory } from '@/lib/axis/chat/types'
import { CHAT_LIMITS } from '@/lib/axis/chat/types'
import type { AxisNextStep } from '@/lib/axis/types'
import { describeFact } from '@/lib/axis/profile/describe'
import { replacementFor } from '@/lib/axis/chat/memory'
import { RECURRING_INCOME_CATEGORIES, type MemoryFact } from '@/lib/axis/profile/types'
import { buildEditedProposal, draftFor, validationMessage, type ProposalDraft } from '@/lib/axis/chat/profile-proposal'
import { listObjectives } from '@/lib/db/objectives'
import { useLiveQuery } from 'dexie-react-hooks'
import type { ChatStatus } from '@/hooks/use-axis-chat'
import type { ScreenKey } from './bottom-navigation'
import { FinancialCard } from './card'
import { AmountInput, ChipGroup } from './field'
import { ArrowUpRight, ChevronRight, CloseIcon, LeafLogo, TrashIcon } from './icons'
import { cn } from '@/lib/utils'

type Navigate = (screen: ScreenKey) => void

interface AxisConversationProps {
  status: ChatStatus
  online: boolean
  messages: ChatMessage[]
  memories: UserMemory[]
  onSend: (text: string) => Promise<void>
  onResolveProposal: (messageId: string, accept: boolean, edited?: MemoryProposal) => Promise<void>
  onClear: () => Promise<void>
  onForget: (id: string) => Promise<void>
  onNavigate: Navigate
}

const SUGGESTIONS = ['¿Cómo ves mi situación este mes?', 'He gastado bastante este mes, ¿qué opinas?', '¿Crees que debería invertir parte de mi dinero?']

const STATUS_LABEL: Partial<Record<ChatStatus, string>> = {
  preparing: 'Preparando AXIS…',
  analyzing: 'Analizando tus datos…',
  responding: 'Respondiendo…',
  error: 'No he podido responder. Inténtalo de nuevo.',
}

const FALLBACK_LABEL: Record<NonNullable<ChatMessage['fallbackReason']>, string> = {
  unavailable: 'IA no disponible',
  offline: 'sin conexión',
  'rate-limited': 'sin cupo de IA por ahora',
  error: 'la IA no respondió',
  'no-data': 'sin datos suficientes',
}

function Paragraphs({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-line text-[13.5px] font-medium leading-snug text-grafito/85 text-pretty">
          {p}
        </p>
      ))}
    </div>
  )
}

function NextStepLink({ step, onNavigate }: { step: AxisNextStep; onNavigate: Navigate }) {
  return (
    <button
      type="button"
      onClick={() => step.to && onNavigate(step.to)}
      className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-bold text-axis-violet transition-colors hover:text-axis-indigo"
    >
      {step.label}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </button>
  )
}

function ProposalCard({ message, memories, onResolve }: { message: ChatMessage; memories: UserMemory[]; onResolve: (accept: boolean, edited?: MemoryProposal) => Promise<void> }) {
  const proposal = message.memoryProposal
  const [busy, setBusy] = useState(false)
  const objectives = useLiveQuery(listObjectives, [])
  // Dato editable (ingreso recurrente o liquidez mínima): importe y, en ingresos, categoría.
  const editable = proposal ? draftFor(proposal) : null
  const [draft, setDraft] = useState<ProposalDraft | null>(editable?.draft ?? null)
  // Sin categoría hay que elegirla: la tarjeta abre directamente los controles.
  const [editing, setEditing] = useState(Boolean(proposal?.incompleteFact))
  // Los avisos de validación solo aparecen cuando el usuario ya ha tocado importe o categoría.
  const [touched, setTouched] = useState(false)
  if (!proposal) return null
  if (proposal.status !== 'pending') {
    return (
      <p className="mt-2 text-[11.5px] font-semibold text-muted-foreground">
        {proposal.status === 'accepted' ? 'Guardado en mi memoria.' : 'No lo he guardado.'}
      </p>
    )
  }
  const { status: _status, ...original } = proposal
  void _status
  const describe = (fact: MemoryFact) => describeFact(fact, (id) => objectives?.find((o) => o.id === id)?.name)
  // Lo que se guardaría: la propuesta con lo revisado en la tarjeta, validado con las reglas del perfil.
  const built = draft ? buildEditedProposal(original, draft) : ({ ok: true, proposal: original } as const)
  const final = built.ok ? built.proposal : null
  const error = validationMessage(built, touched)
  const edit = (next: ProposalDraft) => {
    setDraft(next)
    setTouched(true)
  }
  // Lo mismo que hará `applyProposal` al aceptar: si sustituye un dato, se enseña antes de confirmar.
  const replaces = final ? replacementFor(final, memories).replacedFacts : []
  const resolve = async (accept: boolean) => {
    setBusy(true)
    try {
      await onResolve(accept, accept && final && draft ? final : undefined)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mt-3 rounded-2xl border border-axis-violet/15 bg-axis-soft p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-axis-indigo/70">Memoria</p>
      <p className="mt-1 text-[13px] font-medium leading-snug text-grafito/85 text-pretty">
        He entendido que {lowerFirst((final ?? original).content)} ¿Quieres que lo recuerde para futuras conversaciones?
      </p>
      {editable && draft && editing && (
        <div className="mt-2 space-y-2 rounded-xl bg-white/70 px-3 py-2.5">
          {editable.kind === 'recurringIncome' && (
            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-grafito/80">
                {draft.category ? 'Tipo de ingreso' : '¿Qué tipo de ingreso es?'}
              </p>
              <ChipGroup options={RECURRING_INCOME_CATEGORIES} value={draft.category} onChange={(category) => edit({ ...draft, category })} />
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-grafito/80">
              {editable.kind === 'recurringIncome' ? 'Importe al mes' : 'Mínimo disponible'}
            </span>
            <AmountInput value={draft.amount} onChange={(e) => edit({ ...draft, amount: e.target.value })} className="py-2 text-[16px]" />
          </label>
          {error && <p className="text-[12px] font-medium text-negative">{error}</p>}
        </div>
      )}
      {replaces.length > 0 ? (
        <div className="mt-2 space-y-1 rounded-xl bg-white/70 px-3 py-2 text-[12px] font-medium leading-snug text-grafito/80">
          {replaces.map((previous, i) => (
            <p key={i}>
              Antes: <span className="font-semibold text-grafito/70 line-through decoration-grafito/30">{describe(previous)}</span>
            </p>
          ))}
          <p>
            Ahora: <span className="font-bold text-axis-indigo">{final?.fact ? describe(final.fact) : 'sin dato estructurado'}</span>
          </p>
        </div>
      ) : (
        final?.fact &&
        !editing && (
          <p className="mt-2 rounded-xl bg-white/70 px-3 py-2 text-[12px] font-medium leading-snug text-grafito/80">
            <span className="font-bold text-axis-indigo">{describe(final.fact)}</span>
            {' · '}Lo tendré en cuenta al decidir qué te recomiendo.
          </p>
        )
      )}
      {editable && !editing && (
        <button type="button" onClick={() => setEditing(true)} className="mt-2 text-[12px] font-semibold text-axis-indigo underline-offset-2 hover:underline">
          Corregir el dato
        </button>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => resolve(false)}
          className="rounded-full border border-border bg-white px-3 py-2 text-[12.5px] font-semibold text-grafito transition-all hover:bg-muted disabled:opacity-50"
        >
          No recordar
        </button>
        <button
          type="button"
          disabled={busy || !final}
          onClick={() => resolve(true)}
          className="rounded-full bg-gradient-to-r from-axis-indigo via-axis-violet to-axis-blue px-3 py-2 text-[12.5px] font-semibold text-white transition-all hover:brightness-[1.05] disabled:opacity-50"
        >
          {replaces.length > 0 ? 'Recordar y sustituir' : 'Recordar'}
        </button>
      </div>
    </div>
  )
}

function lowerFirst(text: string): string {
  const t = text.trim().replace(/\.$/, '')
  return t ? `${t.charAt(0).toLowerCase()}${t.slice(1)}.` : t
}

function Message({ message, memories, onResolve, onNavigate }: { message: ChatMessage; memories: UserMemory[]; onResolve: (accept: boolean, edited?: MemoryProposal) => Promise<void>; onNavigate: Navigate }) {
  if (message.role === 'user') {
    return (
      <li className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-4 py-2.5 text-[13.5px] font-medium leading-snug text-grafito text-pretty">
          {message.text}
        </p>
      </li>
    )
  }
  const ai = message.engine?.isAI === true
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-axis-soft text-axis-violet">
        <LeafLogo className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <Paragraphs text={message.text} />
        {message.nextStep && <NextStepLink step={message.nextStep} onNavigate={onNavigate} />}
        <ProposalCard message={message} memories={memories} onResolve={onResolve} />
        <p className="mt-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground/80">
          <span className={cn('rounded-full px-1.5 py-0.5', ai ? 'bg-axis-soft text-axis-indigo' : 'bg-muted')}>{ai ? 'IA' : 'Motor local'}</span>
          {message.fallbackReason && <span className="normal-case tracking-normal">· {FALLBACK_LABEL[message.fallbackReason]}</span>}
        </p>
      </div>
    </li>
  )
}

function MemoriesList({ memories, onForget }: { memories: UserMemory[]; onForget: (id: string) => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const objectives = useLiveQuery(listObjectives, [])
  if (memories.length === 0) return null
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-1 text-left text-[12px] font-semibold text-muted-foreground"
      >
        <span className="flex-1">
          Lo que recuerdo · {memories.length} {memories.length === 1 ? 'nota' : 'notas'}
        </span>
        <ChevronRight className={cn('h-4 w-4 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {memories.map((m) => (
            <li key={m.id} className="flex items-start gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5">
              <span className="flex-1 text-[12.5px] font-medium leading-snug text-grafito/85 text-pretty">
                {m.content}
                {m.fact && (
                  <span className="mt-0.5 block text-[11.5px] font-semibold text-axis-indigo">
                    {describeFact(m.fact, (id) => objectives?.find((o) => o.id === id)?.name)}
                  </span>
                )}
              </span>
              <button
                type="button"
                aria-label="Olvidar"
                onClick={() => onForget(m.id)}
                className="shrink-0 rounded-full p-1 text-muted-foreground/70 transition-colors hover:bg-muted hover:text-negative"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function AxisConversation({ status, online, messages, memories, onSend, onResolveProposal, onClear, onForget, onNavigate }: AxisConversationProps) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const working = status === 'analyzing' || status === 'responding'
  const disabled = status === 'preparing' || working

  useEffect(() => {
    if (messages.length > 0) endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [messages.length, status])

  const submit = async (e?: FormEvent) => {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || disabled) return
    setDraft('')
    await onSend(text)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">Conversación</p>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => void onClear()}
            disabled={working}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-negative disabled:opacity-50"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Borrar
          </button>
        )}
      </div>

      <FinancialCard>
        {messages.length === 0 ? (
          <div>
            <p className="text-[13.5px] font-medium leading-snug text-grafito/85 text-pretty">
              Pregúntame sobre tu situación, tus objetivos o una decisión que estés valorando. Respondo con tus datos y recuerdo lo que
              me pidas recordar.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  onClick={() => void onSend(s)}
                  className="rounded-full bg-muted px-3.5 py-1.5 text-left text-xs font-semibold text-muted-foreground transition-all hover:bg-graylight/70 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <ul className="space-y-4">
            {messages.map((m) => (
              <Message key={m.id} message={m} memories={memories} onResolve={(accept, edited) => onResolveProposal(m.id, accept, edited)} onNavigate={onNavigate} />
            ))}
          </ul>
        )}

        {(STATUS_LABEL[status] || !online) && (
          <p
            className={cn(
              'mt-3 flex items-center gap-2 text-[12px] font-semibold',
              status === 'error' ? 'text-negative' : 'text-muted-foreground',
            )}
            aria-live="polite"
          >
            {working && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-axis-violet" />}
            {STATUS_LABEL[status] ?? (!online ? 'Sin conexión: responderé con el motor local.' : null)}
            {!online && STATUS_LABEL[status] && ' · Sin conexión'}
          </p>
        )}
        <div ref={endRef} />
      </FinancialCard>

      <form onSubmit={submit} className="sticky bottom-0 -mx-1 flex items-end gap-2 bg-background/95 px-1 pb-1 pt-2 backdrop-blur">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, CHAT_LIMITS.MAX_MESSAGE_CHARS))}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={status === 'preparing'}
          placeholder="Escribe a AXIS…"
          aria-label="Mensaje para AXIS"
          className="max-h-32 min-h-[46px] w-full resize-none rounded-2xl border border-border bg-card px-4 py-3 text-[14px] font-semibold text-grafito placeholder:font-medium placeholder:text-muted-foreground/70 focus:border-axis-violet focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          aria-label="Enviar"
          disabled={disabled || draft.trim().length === 0}
          className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-axis-indigo via-axis-violet to-axis-blue text-white shadow-[0_10px_24px_-8px_rgba(99,102,241,0.65)] transition-all active:scale-[0.98] disabled:opacity-40"
        >
          <ArrowUpRight className="h-5 w-5" />
        </button>
      </form>

      <MemoriesList memories={memories} onForget={onForget} />
    </section>
  )
}
