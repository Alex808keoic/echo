'use client'

import { requestMovementDeletion } from '@/lib/movements/confirm-deletion'
import type { Movement } from '@/lib/types'
import { Confirm } from '../confirm'
import { useSheet } from '../sheet'

/**
 * Abre la confirmación de borrado en la hoja. `back` vuelve a la vista desde la
 * que se pidió (detalle o edición) si el usuario cancela.
 */
export function useConfirmMovementDeletion() {
  const { open, close } = useSheet()
  return (movement: Movement, back: () => void) =>
    requestMovementDeletion(movement, {
      show: (p) => open(p.title, <Confirm message={p.message} confirmLabel={p.confirmLabel} destructive onConfirm={p.onConfirm} onCancel={p.onCancel} />),
      done: close,
      back,
    })
}
