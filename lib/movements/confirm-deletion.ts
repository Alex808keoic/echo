/**
 * Confirmación de «Eliminar movimiento». Se puede pedir desde el detalle del
 * movimiento (sin pasar por la edición) y desde su formulario. Abrirla no
 * borra nada; cancelar vuelve a donde estaba; solo confirmar borra. Si el
 * almacenamiento falla, el error lo muestra `Confirm` y la hoja sigue abierta.
 */
import { deleteMovement } from '../db/movements'
import { formatFullDate } from '../dates'
import { formatCents } from '../money'
import { movementLabel, type Movement } from '../types'

export interface DeletionConfirmation {
  title: string
  message: string
  confirmLabel: string
}

export interface DeletionPrompt extends DeletionConfirmation {
  /** Borra el movimiento y cierra. Si falla, lanza (y no cierra). */
  onConfirm: () => Promise<void>
  /** Vuelve a donde estaba, sin borrar. */
  onCancel: () => void
}

/** Qué se va a borrar, con las mismas cifras que ve el usuario. */
export function deletionConfirmation(movement: Movement): DeletionConfirmation {
  const signed = movement.type === 'ingreso' ? movement.amountCents : -movement.amountCents
  return {
    title: 'Eliminar movimiento',
    message:
      `¿Eliminar «${movementLabel(movement)}» (${formatCents(signed, true)}, ${formatFullDate(movement.date)})? ` +
      'Tu patrimonio y tus objetivos se recalcularán. Esta acción no se puede deshacer.',
    confirmLabel: 'Eliminar',
  }
}

export function requestMovementDeletion(
  movement: Movement,
  ui: { show: (prompt: DeletionPrompt) => void; done: () => void; back: () => void },
  remove: (id: string) => Promise<void> = deleteMovement,
): void {
  ui.show({
    ...deletionConfirmation(movement),
    onConfirm: async () => {
      await remove(movement.id)
      ui.done()
    },
    onCancel: ui.back,
  })
}
