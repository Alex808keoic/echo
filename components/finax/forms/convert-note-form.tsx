'use client'

import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { replacementFor } from '@/lib/axis/chat/memory'
import { conversionProposal, suggestConversion, type ConversionInput, type ConversionKind } from '@/lib/axis/chat/note-conversion'
import type { UserMemory } from '@/lib/axis/chat/types'
import { describeFact } from '@/lib/axis/profile/describe'
import { PROFILE_QUESTIONS } from '@/lib/axis/profile/questionnaire'
import { RECURRING_INCOME_CATEGORIES, type MemoryFact } from '@/lib/axis/profile/types'
import { deleteUserMemory, resolveMemoryProposal } from '@/lib/db/axis-memories'
import { listObjectives } from '@/lib/db/objectives'
import { writeErrorMessage } from '@/lib/db/storage-errors'
import { Button } from '../button'
import { AmountInput, ChipGroup, Field } from '../field'
import { ObjectiveForm } from './objective-form'

interface ConvertNoteFormProps {
  /** Nota (memoria sin dato) a convertir. */
  note: UserMemory
  /** Memorias actuales: para enseñar qué dato se sustituye. */
  memories: UserMemory[]
  onDone: () => void
}

const KIND_LABELS: Record<ConversionKind, string> = {
  recurringIncome: 'Ingreso mensual',
  minLiquidity: 'Liquidez mínima',
  horizon: 'Plazo',
  riskAttitude: 'Riesgo',
  irregularIncome: 'Ingresos estables',
  adult: 'Edad',
  work: 'Situación',
  dependents: 'Personas a tu cargo',
  investingExperience: 'Experiencia',
  lossCapacity: 'Pérdidas',
  priorities: 'Prioridad',
  objective: 'Objetivo',
}
const KINDS = Object.keys(KIND_LABELS) as ConversionKind[]
const LABELS = KINDS.map((k) => KIND_LABELS[k])
const kindOf = (label: string) => KINDS.find((k) => KIND_LABELS[k] === label) ?? null

function emptyInput(kind: ConversionKind, amount: string | null): ConversionInput | null {
  switch (kind) {
    case 'recurringIncome':
      return { kind, amount: amount ?? '', category: null }
    case 'minLiquidity':
      return { kind, amount: amount ?? '' }
    case 'priorities':
      return { kind, objectiveId: null }
    case 'objective':
      return null
    default:
      return { kind, option: null }
  }
}

/**
 * «Usar en tu plan»: convierte una nota de texto libre en un dato que el plan
 * usa con reglas (ingreso, mínimo líquido, plazo, riesgo, prioridad…) o en un
 * objetivo. AXIS sugiere el tipo; el usuario elige y confirma. El dato sustituye
 * a la nota por la vía de siempre (`resolveMemoryProposal`).
 */
export function ConvertNoteForm({ note, memories, onDone }: ConvertNoteFormProps) {
  const [suggestion] = useState(() => suggestConversion(note))
  const [kind, setKind] = useState<ConversionKind | null>(suggestion.kind)
  const [input, setInput] = useState<ConversionInput | null>(suggestion.kind ? emptyInput(suggestion.kind, suggestion.amount) : null)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const objectives = useLiveQuery(listObjectives, [])
  const active = (objectives ?? []).filter((o) => o.achievedAt === undefined)
  const objectiveName = (id: string) => objectives?.find((o) => o.id === id)?.name
  const describe = (fact: MemoryFact) => describeFact(fact, objectiveName)

  const result = input ? conversionProposal(note, input, objectiveName) : null
  const proposal = result?.ok ? result.proposal : null
  const error = touched && result && !result.ok ? result.error : null
  const replaces = proposal ? replacementFor(proposal, memories).replacedFacts : []

  const choose = (label: string) => {
    const next = kindOf(label)
    setKind(next)
    setInput(next ? emptyInput(next, suggestion.amount) : null)
    setTouched(false)
    setSaveError(null)
  }
  const update = (next: ConversionInput) => {
    setInput(next)
    setTouched(true)
    setSaveError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!proposal) return
    setBusy(true)
    try {
      const status = await resolveMemoryProposal(proposal, true)
      if (status === 'accepted') onDone()
      else setSaveError('No se ha podido guardar.')
    } catch (err) {
      console.error('Finax: la nota no se ha convertido', err)
      setSaveError(writeErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const question = input && 'option' in input ? PROFILE_QUESTIONS.find((q) => q.id === input.kind) : undefined

  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-muted px-4 py-3 text-[13px] font-medium leading-snug text-grafito/85 text-pretty">
        Tu nota: <span className="font-semibold text-grafito">«{note.content}»</span>
      </p>

      <Field label="¿Qué dato es?" hint={suggestion.kind ? `AXIS cree que es «${KIND_LABELS[suggestion.kind]}». Cámbialo si no es así.` : 'Elige qué tipo de dato es.'} group>
        <ChipGroup options={LABELS} value={kind ? KIND_LABELS[kind] : null} onChange={choose} />
      </Field>

      {kind === 'objective' ? (
        <>
          <p className="text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">
            Al crear el objetivo, la nota se borra: el objetivo ya lo dice y el reparto automático le irá llevando dinero.
          </p>
          <ObjectiveForm initial={{ target: suggestion.amount ?? '' }} onCreated={() => deleteUserMemory(note.id)} onDone={onDone} />
        </>
      ) : (
        input && (
          <form onSubmit={submit} className="space-y-4">
            {input.kind === 'recurringIncome' && (
              <>
                <Field label="Tipo de ingreso" group>
                  <ChipGroup options={RECURRING_INCOME_CATEGORIES} value={input.category} onChange={(category) => update({ ...input, category })} />
                </Field>
                <Field label="Importe al mes">
                  <AmountInput value={input.amount} onChange={(e) => update({ ...input, amount: e.target.value })} />
                </Field>
              </>
            )}
            {input.kind === 'minLiquidity' && (
              <Field label="Mínimo de dinero líquido que quieres tener">
                <AmountInput value={input.amount} onChange={(e) => update({ ...input, amount: e.target.value })} />
              </Field>
            )}
            {question && 'option' in input && (
              <Field label={question.title} hint={question.hint} group>
                <ChipGroup
                  options={question.options.map((o) => o.label)}
                  value={input.option !== null ? (question.options[input.option]?.label ?? null) : null}
                  onChange={(label) => update({ ...input, option: question.options.findIndex((o) => o.label === label) })}
                />
              </Field>
            )}
            {input.kind === 'priorities' &&
              (active.length === 0 ? (
                <p className="text-[12.5px] font-medium text-muted-foreground">Aún no tienes objetivos. Crea uno primero o elige «Objetivo».</p>
              ) : (
                <Field label="¿Qué objetivo es tu prioridad?" hint="El plan te avisará si no va el primero del reparto; el orden lo cambias tú en Objetivos." group>
                  <ChipGroup
                    options={active.map((o) => o.name)}
                    value={input.objectiveId ? (objectiveName(input.objectiveId) ?? null) : null}
                    onChange={(name) => update({ ...input, objectiveId: active.find((o) => o.name === name)?.id ?? null })}
                  />
                </Field>
              ))}

            {proposal && (
              <p className="rounded-2xl bg-muted px-4 py-3 text-[12.5px] font-medium leading-snug text-grafito/80">
                Se guardará como: <span className="font-semibold text-grafito">«{proposal.content}»</span>
              </p>
            )}
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
            {error && <p className="text-[12.5px] font-medium text-negative">{error}</p>}
            {saveError && <p className="text-[12.5px] font-medium text-negative">{saveError}</p>}

            <Button type="submit" fullWidth disabled={busy || !proposal}>
              {replaces.length > 0 ? 'Convertir y sustituir' : 'Convertir en dato'}
            </Button>
          </form>
        )
      )}
    </div>
  )
}
