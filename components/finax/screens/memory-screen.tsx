'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { groupMemories, memoryDate, type MemoryView } from '@/lib/axis/chat/memory-editor'
import type { UserMemory } from '@/lib/axis/chat/types'
import { describeFact } from '@/lib/axis/profile/describe'
import type { MemoryFact } from '@/lib/axis/profile/types'
import { deleteUserMemory, listUserMemories } from '@/lib/db/axis-memories'
import { listObjectives } from '@/lib/db/objectives'
import { SubPageHeader, IconButton } from '../page-header'
import { FinancialCard } from '../card'
import { EmptyState } from '../empty-state'
import { Button } from '../button'
import { Confirm } from '../confirm'
import { ScreenLoading } from '../loading'
import { useSheet } from '../sheet'
import { MemoryForm } from '../forms/memory-form'
import { LeafLogo, PlusIcon, TrashIcon } from '../icons'
import type { ScreenProps } from './types'

/**
 * «Lo que AXIS sabe de ti»: todas las memorias de AXIS, qué hace con cada una
 * y de dónde vienen. Crear, editar y borrar pasa por la misma vía que el chat.
 */
export function MemoryScreen({ onBack }: ScreenProps) {
  const memories = useLiveQuery(listUserMemories, [])
  const objectives = useLiveQuery(listObjectives, [])
  const { open, close } = useSheet()

  if (memories === undefined) return <ScreenLoading />

  const describe = (fact: MemoryFact) => describeFact(fact, (id) => objectives?.find((o) => o.id === id)?.name)
  const { facts, notes } = groupMemories(memories, describe)
  const openNew = () => open('Añadir memoria', <MemoryForm memories={memories} onDone={close} />)
  const openEdit = (m: UserMemory) => open('Editar memoria', <MemoryForm memory={m} memories={memories} onDone={close} />)
  const confirmDelete = (v: MemoryView) =>
    open(
      '¿Eliminar esta memoria?',
      <Confirm
        message={`AXIS dejará de usar este dato como memoria: «${v.title}».`}
        confirmLabel="Eliminar"
        destructive
        onCancel={close}
        onConfirm={async () => {
          await deleteUserMemory(v.memory.id)
          close()
        }}
      />,
    )

  return (
    <div className="space-y-6 px-5 pb-8 pt-3">
      <SubPageHeader
        title="Lo que AXIS sabe de ti"
        subtitle="Lo que recuerda y para qué lo usa"
        onBack={onBack}
        action={
          <IconButton label="Añadir memoria" onClick={openNew}>
            <PlusIcon className="h-5 w-5" />
          </IconButton>
        }
      />

      {memories.length === 0 ? (
        <EmptyState
          title="AXIS todavía no tiene memorias guardadas"
          description="Puedes contarle algo en la conversación o añadirlo tú: una nota, un ingreso mensual o el dinero que quieres tener siempre disponible."
          action={<Button onClick={openNew}>Añadir memoria</Button>}
        />
      ) : (
        <>
          {facts.length > 0 && <Section title="Datos que tengo en cuenta" items={facts} onEdit={openEdit} onDelete={confirmDelete} />}
          {notes.length > 0 && <Section title="Notas" items={notes} onEdit={openEdit} onDelete={confirmDelete} />}
          <Button variant="secondary" fullWidth onClick={openNew} icon={<PlusIcon className="h-4 w-4" />}>
            Añadir memoria
          </Button>
        </>
      )}

      <p className="flex gap-2.5 rounded-2xl bg-muted px-4 py-3 text-[12px] font-medium leading-snug text-muted-foreground text-pretty">
        <LeafLogo className="mt-0.5 h-4 w-4 shrink-0 text-axis-violet" />
        <span>
          Estas memorias se guardan en este dispositivo. Cuando conversas con AXIS, se envían al servidor de Finax y al proveedor de IA para
          poder responderte. Se borran al eliminarlas aquí o con «Borrar todos los datos» en Ajustes.
        </span>
      </p>
    </div>
  )
}

function Section({ title, items, onEdit, onDelete }: { title: string; items: MemoryView[]; onEdit: (m: UserMemory) => void; onDelete: (v: MemoryView) => void }) {
  return (
    <section>
      <h2 className="mb-3 text-[17px] font-bold tracking-tight text-grafito">{title}</h2>
      <ul className="space-y-3">
        {items.map((v) => (
          <li key={v.memory.id}>
            <FinancialCard className="space-y-2">
              <p className="text-[14px] font-bold leading-snug text-grafito text-pretty">{v.title}</p>
              <p className="text-[11.5px] font-semibold text-muted-foreground">
                {v.sourceLabel} · {memoryDate(v.memory)}
              </p>
              <p className="text-[12.5px] font-medium leading-snug text-grafito/75 text-pretty">{v.usage}</p>
              <div className="flex items-center gap-4 pt-1">
                {v.editable && (
                  <button type="button" onClick={() => onEdit(v.memory)} className="text-[12.5px] font-semibold text-axis-indigo underline-offset-2 hover:underline">
                    Editar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDelete(v)}
                  className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-negative"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              </div>
            </FinancialCard>
          </li>
        ))}
      </ul>
    </section>
  )
}
