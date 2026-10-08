'use client'

import { useState, type FormEvent } from 'react'
import { evictionPreviewAll } from '@/lib/axis/chat/memory-editor'
import { CHAT_LIMITS, type UserMemory } from '@/lib/axis/chat/types'
import { deriveProfile } from '@/lib/axis/profile/derive'
import { describeFact } from '@/lib/axis/profile/describe'
import { answersFromProfile, PROFILE_QUESTIONS, profileProposals, type ProfileAnswers } from '@/lib/axis/profile/questionnaire'
import { listUserMemories, saveMemoryProposals } from '@/lib/db/axis-memories'
import { writeErrorMessage } from '@/lib/db/storage-errors'
import { cn } from '@/lib/utils'
import { Button } from '../button'

interface ProfileFormProps {
  memories: UserMemory[]
  onDone: () => void
}

/**
 * Cuestionario «Tu perfil»: cuatro preguntas con respuesta cerrada. Se guardan
 * como memorias por la misma vía que el resto (todo o nada, sin olvidar
 * memorias sin confirmarlo). Ninguna pregunta es obligatoria.
 */
export function ProfileForm({ memories, onDone }: ProfileFormProps) {
  const current = answersFromProfile(deriveProfile(memories))
  const [answers, setAnswers] = useState<ProfileAnswers>(current)
  const [evicting, setEvicting] = useState<UserMemory[] | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const proposals = profileProposals(answers, current)
  const choose = (id: keyof ProfileAnswers, index: number) => {
    // Actualización funcional: dos pulsaciones seguidas no se pisan.
    setAnswers((prev) => ({ ...prev, [id]: index }))
    setEvicting(null)
    setSaveError(null)
  }

  async function save(confirmed: readonly string[]) {
    if (proposals.length === 0) return
    setBusy(true)
    try {
      // Vista previa con las memorias guardadas AHORA, no con las de cuando se abrió el cuestionario.
      const evicted = evictionPreviewAll(await listUserMemories(), proposals)
      if (evicted.some((m) => !confirmed.includes(m.id))) {
        setEvicting(evicted)
        return
      }
      const outcome = await saveMemoryProposals(proposals, Date.now(), confirmed)
      if (outcome.action === 'saved') onDone()
      else if (outcome.action === 'needs-confirmation') setEvicting(outcome.evicted)
      else setSaveError('No se han podido guardar las respuestas.')
    } catch (error) {
      console.error('Finax: el perfil no se ha guardado', error)
      setSaveError(writeErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    void save([])
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">
        Con esto AXIS podrá ajustar a ti lo que te propone. Puedes dejar sin responder lo que prefieras y cambiarlo cuando quieras.
      </p>
      {PROFILE_QUESTIONS.map((q) => (
        <fieldset key={q.id} className="space-y-2">
          <legend className="mb-2 text-[13.5px] font-bold leading-snug text-grafito text-pretty">{q.title}</legend>
          {q.hint && <p className="-mt-1 text-[12px] font-medium leading-snug text-muted-foreground text-pretty">{q.hint}</p>}
          <div className="grid gap-2">
            {q.options.map((o, index) => {
              const active = answers[q.id] === index
              return (
                <button
                  key={o.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => choose(q.id, index)}
                  className={cn(
                    'min-h-11 rounded-2xl border px-4 py-2.5 text-left text-[13px] font-semibold leading-snug transition-colors',
                    active ? 'border-finax-dark bg-finax-dark text-white' : 'border-border bg-card text-grafito hover:bg-muted',
                  )}
                >
                  {o.label}
                </button>
              )
            })}
          </div>
        </fieldset>
      ))}

      {saveError && <p className="text-[12.5px] font-medium text-negative">{saveError}</p>}

      {evicting && evicting.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-negative/20 bg-card px-4 py-3">
          <p className="text-[13px] font-medium leading-snug text-grafito/85 text-pretty">
            AXIS guarda como máximo {CHAT_LIMITS.MAX_MEMORIES} memorias. Para guardar tus respuestas, olvidaré:
          </p>
          <ul className="space-y-0.5">
            {evicting.map((m) => (
              <li key={m.id} className="text-[12.5px] font-semibold text-grafito">«{m.fact ? describeFact(m.fact) : m.content}»</li>
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
        <Button type="submit" fullWidth disabled={busy || proposals.length === 0}>
          Guardar respuestas
        </Button>
      )}
    </form>
  )
}
