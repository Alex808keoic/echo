'use client'

import { CUSHION_OBJECTIVE_NAME, isCushionObjective } from '@/lib/axis/plan/allocation'
import { addObjectiveFirst, listObjectives, moveObjectiveToFirst } from '@/lib/db/objectives'
import { formatCents } from '@/lib/money'
import { Confirm } from './confirm'
import { useSheet } from './sheet'

const ORDER_WARNING = 'Tu dinero líquido irá primero a él, así que el progreso de tus otros objetivos bajará hasta completarlo.'

/**
 * Las dos acciones del plan que cambian datos: crear el «Fondo de emergencia»
 * el primero del reparto o poner el existente el primero. Siempre con
 * confirmación (pantalla «Tu plan» y tarjetas del chat). Si al confirmar ya
 * existe uno (p. ej. una tarjeta antigua del chat), no se crea otro: se pone
 * el existente el primero.
 */
export function useCushionActions() {
  const { open, close } = useSheet()

  const confirm = (title: string, message: string, label: string, run: () => Promise<unknown>) =>
    open(
      title,
      <Confirm
        message={message}
        confirmLabel={label}
        onCancel={close}
        onConfirm={async () => {
          await run()
          close()
        }}
      />,
    )

  const existingCushion = async () => (await listObjectives()).find((o) => !o.achievedAt && isCushionObjective(o))

  return {
    createCushion: (targetCents: number) =>
      confirm(
        'Crear objetivo',
        `Crearé el objetivo «${CUSHION_OBJECTIVE_NAME}» de ${formatCents(targetCents)} y lo pondré el primero del reparto. ${ORDER_WARNING} Podrás cambiar la cantidad cuando quieras.`,
        'Crear objetivo',
        async () => {
          const existing = await existingCushion()
          if (existing) return moveObjectiveToFirst(existing.id)
          return addObjectiveFirst({ name: CUSHION_OBJECTIVE_NAME, targetCents })
        },
      ),
    moveCushionFirst: (objectiveId: string) =>
      confirm('Ponerlo primero', `Pondré «${CUSHION_OBJECTIVE_NAME}» el primero del reparto. ${ORDER_WARNING}`, 'Ponerlo primero', () => moveObjectiveToFirst(objectiveId)),
  }
}
