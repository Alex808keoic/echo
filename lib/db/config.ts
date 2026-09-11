/**
 * Configuración de la instalación: saldo inicial (D-14) y marca de demo.
 */
import { CONFIG_KEY, db } from './db'
import type { AppConfig } from '../types'

/**
 * Devuelve `null` cuando Finax todavía no está configurado.
 * Se distingue de `undefined` (cargando en `useLiveQuery`) a propósito.
 */
export async function getConfig(): Promise<AppConfig | null> {
  const config = await db.config.get(CONFIG_KEY)
  return config ?? null
}

export async function setInitialBalance(cents: number, demo?: boolean): Promise<void> {
  const now = Date.now()
  const existing = await db.config.get(CONFIG_KEY)
  await db.config.put({
    key: CONFIG_KEY,
    initialBalanceCents: cents,
    demo: demo ?? existing?.demo,
    configuredAt: existing?.configuredAt ?? now,
    updatedAt: now,
  })
}
