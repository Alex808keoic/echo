/**
 * Configuración de la instalación: saldo inicial (D-14) y marca de demo.
 */
import { CONFIG_KEY, db } from './db'
import type { AppConfig } from '../types'
import type { EcosystemSharing } from '../ecosystem/sharing'

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
    // Cambiar el saldo no toca lo que se comparte con AXIS.
    ...(existing?.ecosystem ? { ecosystem: existing.ecosystem } : {}),
    configuredAt: existing?.configuredAt ?? now,
    updatedAt: now,
  })
}

/**
 * Guarda qué se comparte con la app AXIS del ecosistema, o `null` para dejar de
 * compartir. Sin configuración no hay dónde guardarlo: Finax aún no está empezado.
 */
export async function setEcosystemSharing(sharing: EcosystemSharing | null): Promise<void> {
  const existing = await db.config.get(CONFIG_KEY)
  if (!existing) throw new Error('Finax todavía no está configurado.')
  const { ecosystem: _previous, ...rest } = existing
  await db.config.put({ ...rest, ...(sharing ? { ecosystem: sharing } : {}), updatedAt: Date.now() })
}
