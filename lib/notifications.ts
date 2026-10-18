/**
 * Notificaciones de recordatorio con la app cerrada (ver public/sw.js). Usa la
 * sincronización periódica en segundo plano: solo existe en Chrome (y
 * derivados) con la app instalada, y el sistema decide cuándo se ejecuta. Sin
 * ella, los recordatorios siguen saliendo en Inicio al abrir la app.
 */
export const REMINDER_TAG = 'finax-reminders'
/** Una vez al día como mucho (el sistema puede espaciarlo más). */
const MIN_INTERVAL_MS = 24 * 60 * 60 * 1000

export type ReminderSupport = 'unsupported' | 'in-app-only' | 'background'
export type ReminderStatus = { support: ReminderSupport; enabled: boolean; denied: boolean }

interface PeriodicSyncManager {
  register(tag: string, options: { minInterval: number }): Promise<void>
  unregister(tag: string): Promise<void>
  getTags(): Promise<string[]>
}
type RegistrationWithSync = ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }

async function registration(): Promise<RegistrationWithSync | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  return ((await navigator.serviceWorker.getRegistration()) as RegistrationWithSync | undefined) ?? null
}

export async function reminderStatus(): Promise<ReminderStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) return { support: 'unsupported', enabled: false, denied: false }
  const reg = await registration()
  const denied = Notification.permission === 'denied'
  if (!reg?.periodicSync) return { support: 'in-app-only', enabled: false, denied }
  const tags = await reg.periodicSync.getTags().catch(() => [] as string[])
  return { support: 'background', enabled: Notification.permission === 'granted' && tags.includes(REMINDER_TAG), denied }
}

/** Pide permiso y activa la comprobación diaria. Devuelve el estado resultante. */
export async function enableReminders(): Promise<ReminderStatus> {
  const permission = await Notification.requestPermission()
  const reg = await registration()
  if (permission === 'granted' && reg?.periodicSync) {
    try {
      await reg.periodicSync.register(REMINDER_TAG, { minInterval: MIN_INTERVAL_MS })
    } catch (error) {
      // Sin la app instalada o sin permiso de segundo plano, el navegador lo rechaza.
      console.warn('Finax: no se ha podido activar la comprobación en segundo plano', error)
    }
  }
  const status = await reminderStatus()
  // Confirmación en el propio móvil: así se ve en el momento que los avisos llegan.
  if (status.enabled && reg) await reg.showNotification('Finax', { body: CONFIRMATION_TEXT, tag: 'reminders-enabled', icon: '/icon-192.png', badge: '/icon-192.png' }).catch(() => {})
  return status
}

export const CONFIRMATION_TEXT = 'Notificaciones activadas. Te avisaré cuando toque: tu decisión del mes, ingresos sin registrar, inversiones por actualizar o tu copia de seguridad.'

export async function disableReminders(): Promise<ReminderStatus> {
  const reg = await registration()
  await reg?.periodicSync?.unregister(REMINDER_TAG).catch(() => {})
  return reminderStatus()
}
