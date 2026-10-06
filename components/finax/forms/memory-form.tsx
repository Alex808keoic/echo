'use client'

import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { replacementFor } from '@/lib/axis/chat/memory'
import { editProposal, evictionPreview, inputFor, LEGACY_NOT_EDITABLE, manualProposal, type ManualInput, type ManualKind } from '@/lib/axis/chat/memory-editor'
import { CHAT_LIMITS, type UserMemory } from '@/lib/axis/chat/types'
import { describeFact } from '@/lib/axis/profile/describe'
import { RECURRING_INCOME_CATEGORIES, type MemoryFact } from '@/lib/axis/profile/types'
import { listObjectives } from '@/lib/db/objectives'
import { listUserMemories, resolveMemoryProposal } from '@/lib/db/axis-memories'
import { Button } from '../button'
import { AmountInput, ChipGroup, Field, TextArea } from '../field'

interface MemoryFormProps {
  /** Memoria a editar; sin ella, alta manual. */
  memory?: UserMemory
  /** Memorias actuales: para «Antes / Ahora» y para avisar antes de olvidar alguna. */
  memories: UserMemory[]
  onDone: () => void
}

const KIND_LABELS = ['Nota', 'Ingreso mensual', 'Liquidez mínima'] as const
type KindLabel = (typeof KIND_LABELS)[number]
const KIND_OF: Record<KindLabel, ManualKind> = { Nota: 'note', 'Ingreso mensual': 'recurringIncome', 'Liquidez mínima': 'minLiquidity' }
const LABEL_OF: Record<ManualKind, KindLabel> = { note: 'Nota', recurringIncome: 'Ingreso mensual', minLiquidity: 'Liquidez mínima' }

function emptyInput(kind: ManualKind): ManualInput {
  if (kind === 'note') return { kind, text: '' }
  return kind === 'recurringIncome' ? { kind, amount: '', category: null } : { kind, amount: '' }
}

/**
 * Alta y edición manual de memorias de AXIS. Guarda por la misma vía que el
 * chat (`resolveMemoryProposal` → `applyProposal`): mismas validaciones,
 * misma sustitución por hueco y ninguna memoria olvidada sin confirmarlo.
 */
export function MemoryForm({ memory, memories, onDone }: MemoryFormProps) {
  const initial = memory ? inputFor(memory) : emptyInput('note')
  const [input, setInput] = useState<ManualInput | null>(initial)
  const [touched, setTouched] = useState(false)
  const [evicting, setEvicting] = useState<UserMemory[] | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const objectives = useLiveQuery(listObjectives, [])
  const describe = (fact: MemoryFact) => describeFact(fact, (id) => objectives?.find((o) => o.id === id)?.name)

  if (!input) return <p className="text-[13.5px] font-medium text-muted-foreground">{LEGACY_NOT_EDITABLE}</p>

  const result = memory ? editProposal(memory, input) : manualProposal(input)
  const proposal = result.ok ? result.proposal : null
  const error = touched && !result.ok ? result.error : null
  // Lo mismo que hará `applyProposal`: si sustituye un dato, se enseña antes de guardar.
  const replaces = proposal ? replacementFor(proposal, memories).replacedFacts : []
  const update = (next: ManualInput) => {
    setInput(next)
    setTouched(true)
    setEvicting(null)
    setSaveError(null)
  }

  async function save(confirmed: readonly string[]) {
    if (!proposal) return
    setBusy(true)
    try {
      // La vista previa se calcula con las memorias guardadas AHORA (no con la lista de cuando se abrió el formulario).
      const evicted = evictionPreview(await listUserMemories(), proposal)
      if (evicted.some((m) => !confirmed.includes(m.id))) {
        setEvicting(evicted)
        return
      }
      const status = await resolveMemoryProposal(proposal, true, Date.now(), confirmed)
      if (status === 'accepted') onDone()
      else if (status === 'needs-confirmation') setEvicting(evictionPreview(await listUserMemories(), proposal))
      else setSaveError('No se ha podido guardar. Revisa el texto.')
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    void save([])
  }

  const saveLabel = replaces.length > 0 ? 'Guardar y sustituir' : memory ? 'Guardar cambios' : 'Guardar'

  return (
    <form onSubmit={submit} className="space-y-4">
      {!memory && (
        <Field label="Qué quieres que recuerde" group>
          <ChipGroup options={KIND_LABELS} value={LABEL_OF[input.kind]} onChange={(label) => update(emptyInput(KIND_OF[label]))} />
        </Field>
      )}

      {input.kind === 'note' ? (
        <Field label="Nota" hint={`${input.text.length}/${CHAT_LIMITS.MAX_MEMORY_CHARS} · Sin contraseñas, PIN ni números de cuenta.`}>
          <TextArea
            rows={3}
            value={input.text}
            maxLength={CHAT_LIMITS.MAX_MEMORY_CHARS}
            placeholder="Ej. Prefiere no tocar los ahorros del viaje hasta verano."
            onChange={(e) => update({ ...input, text: e.target.value })}
            autoFocus={!memory}
          />
        </Field>
      ) : (
        <>
          {input.kind === 'recurringIncome' && (
            <Field label="Tipo de ingreso" group>
              <ChipGroup options={RECURRING_INCOME_CATEGORIES} value={input.category} onChange={(category) => update({ ...input, category })} />
            </Field>
          )}
          <Field label={input.kind === 'recurringIncome' ? 'Importe al mes' : 'Mínimo de dinero líquido que quieres tener'}>
            <AmountInput value={input.amount} onChange={(e) => update({ ...input, amount: e.target.value })} />
          </Field>
          {proposal && (
            <p className="rounded-2xl bg-muted px-4 py-3 text-[12.5px] font-medium leading-snug text-grafito/80">
              Se guardará como: <span className="font-semibold text-grafito">«{proposal.content}»</span>
            </p>
          )}
        </>
      )}

      {error && <p className="text-[12.5px] font-medium text-negative">{error}</p>}

      {replaces.length > 0 && proposal?.fact && (
        <div className="space-y-1 rounded-2xl bg-axis-soft px-4 py-3 text-[12.5px] font-medium leading-snug text-grafito/80">
          {replaces.map((previous, i) => (
            <p key={i}>
              Antes: <span className="font-semibold text-grafito/70 line-through decoration-grafito/30">{describe(previous)}</span>
            </p>
          ))}
          <p>
            Ahora: <span className="font-bold text-axis-indigo">{describe(proposal.fact)}</span>
          </p>
        </div>
      )}

      {saveError && <p className="text-[12.5px] font-medium text-negative">{saveError}</p>}

      {evicting && evicting.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-negative/20 bg-card px-4 py-3">
          <p className="text-[13px] font-medium leading-snug text-grafito/85 text-pretty">
            AXIS guarda como máximo {CHAT_LIMITS.MAX_MEMORIES} memorias. Para guardar esta, olvidaré:
          </p>
          <ul className="space-y-0.5">
            {evicting.map((m) => (
              <li key={m.id} className="text-[12.5px] font-semibold text-grafito">«{m.fact ? describe(m.fact) : m.content}»</li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setEvicting(null)}>
              Cancelar
            </Button>
            <Button type="button" disabled={busy} className="bg-negative shadow-none hover:bg-negative/90" onClick={() => void save(evicting.map((m) => m.id))}>
              Guardar y olvidar
            </Button>
          </div>
        </div>
      ) : (
        <Button type="submit" fullWidth disabled={busy || !proposal}>
          {saveLabel}
        </Button>
      )}
    </form>
  )
}
