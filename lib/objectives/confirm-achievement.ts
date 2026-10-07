/**
 * Confirmación de «Marcar como conseguido». Marcarlo saca el objetivo del
 * reparto automático, así que antes se explica la consecuencia y solo se
 * guarda al confirmar. Cancelar no toca nada. Es reversible con «Reactivar».
 */
import { markObjectiveAchieved } from '../db/objectives'
import type { Objective } from '../types'

export interface AchievementConfirmation {
  title: string
  message: string
  confirmLabel: string
}

export interface AchievementPrompt extends AchievementConfirmation {
  /** Marca el objetivo como conseguido y cierra la confirmación. */
  onConfirm: () => Promise<void>
  /** Cierra la confirmación sin cambiar nada. */
  onCancel: () => void
}

export function achievementConfirmation(name: string): AchievementConfirmation {
  return {
    title: '¿Marcar como conseguido?',
    message:
      `«${name}» dejará de recibir dinero líquido del reparto automático: lo que tenía asignado pasará a tus siguientes objetivos activos o quedará disponible. ` +
      'Puedes reactivarlo cuando quieras; volverá al final del orden.',
    confirmLabel: 'Marcar como conseguido',
  }
}

/**
 * Abre la confirmación (no cambia nada todavía). `show` la presenta y `close`
 * la cierra; `markAchieved` solo se llama al confirmar.
 */
export function requestObjectiveAchievement(
  objective: Pick<Objective, 'id' | 'name'>,
  ui: { show: (prompt: AchievementPrompt) => void; close: () => void },
  markAchieved: (id: string) => Promise<void> = markObjectiveAchieved,
): void {
  ui.show({
    ...achievementConfirmation(objective.name),
    onConfirm: async () => {
      await markAchieved(objective.id)
      ui.close()
    },
    onCancel: ui.close,
  })
}
