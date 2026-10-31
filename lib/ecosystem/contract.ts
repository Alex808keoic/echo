// COPIA de github.com/Alex808keoic/axis · lib/contract/snapshot-v1.ts. No editar aquí:
// se cambia allí y se vuelve a copiar.

/**
 * Contrato axis.snapshot.v1 (docs/CONTRACT_SNAPSHOT_V1.md, docs/METRICS_CATALOG.md).
 *
 * Esta es la copia de referencia. Cada app guarda una copia idéntica; si cambia,
 * se copia otra vez a todas. Solo usa sintaxis de tipos que se pueda borrar (sin
 * enums), para que funcione igual con tsx y con el type stripping nativo de Node.
 */

export const SNAPSHOT_SCHEMA = 'axis.snapshot.v1'

export type SnapshotApp = 'axthletics' | 'finax' | 'mentax'

/** Métricas que cada app puede enviar. Las que no están aquí se descartan al validar (regla 4). */
export const METRIC_KEYS = {
  axthletics: [
    'sessions_completed',
    'sessions_abandoned',
    'training_minutes',
    'volume_kg',
    'sessions_modified',
    'sleep_hours_avg',
    'energy_avg',
    'stress_avg',
    'muscle_fatigue_avg',
    'recovery_score_avg',
    'weight_kg',
  ],
  finax: [
    'income_cents',
    'expense_cents',
    'expense_habitual_cents',
    'wealth_cents',
    'invested_value_cents',
    'debt_cents',
    'movements_count',
  ],
  mentax: ['entries_count', 'days_with_entry', 'mood_avg', 'mood_min', 'writing_minutes', 'goals_active', 'goals_completed'],
} as const

export type MetricKey<A extends SnapshotApp = SnapshotApp> = (typeof METRIC_KEYS)[A][number]

/** `value: null` es «sin datos», nunca cero. `n` es la cobertura en días (0–7). */
export type MetricValue = { value: number | null; n?: number }

export type SnapshotGoal = {
  id: string
  /** Opcional: Mentax no lo envía salvo que el usuario lo active. */
  title?: string
  /** De 0 a 1. */
  progress: number
  target?: number
  deadline?: string
  status: 'active' | 'completed'
}

export type Snapshot = {
  schema: typeof SNAPSHOT_SCHEMA
  app: SnapshotApp
  appVersion: string
  /** Lunes de la semana, fecha local `YYYY-MM-DD`. */
  weekStart: string
  /** `false` mientras la semana está en curso. */
  complete: boolean
  generatedAt: string
  metrics: Partial<Record<string, MetricValue>>
  goals: SnapshotGoal[]
}

export type SnapshotValidation = { ok: true; snapshot: Snapshot } | { ok: false; reason: string }

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/
const MAX_TITLE = 120

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isDayKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DAY_KEY.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

function isMonday(dayKey: string): boolean {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() === 1
}

function isApp(value: unknown): value is SnapshotApp {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(METRIC_KEYS, value)
}

function readMetric(value: unknown): MetricValue | null {
  if (!isRecord(value)) return null
  const v = value.value
  if (v !== null && !(typeof v === 'number' && Number.isFinite(v))) return null
  if (value.n === undefined) return { value: v }
  if (!(Number.isInteger(value.n) && (value.n as number) >= 0 && (value.n as number) <= 7)) return null
  return { value: v, n: value.n as number }
}

function readGoal(value: unknown): SnapshotGoal | null {
  if (!isRecord(value)) return null
  const { id, title, progress, target, deadline, status } = value
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof progress !== 'number' || !(progress >= 0 && progress <= 1)) return null
  if (status !== 'active' && status !== 'completed') return null
  if (title !== undefined && !(typeof title === 'string' && title.length > 0 && title.length <= MAX_TITLE)) return null
  if (target !== undefined && !(typeof target === 'number' && Number.isFinite(target))) return null
  if (deadline !== undefined && !isDayKey(deadline)) return null
  return {
    id,
    progress,
    status,
    ...(title !== undefined ? { title: title as string } : {}),
    ...(target !== undefined ? { target: target as number } : {}),
    ...(deadline !== undefined ? { deadline: deadline as string } : {}),
  }
}

/**
 * Valida un snapshot entero: o vale todo, o se rechaza todo (regla 5). Las métricas
 * que la app no tiene en el catálogo se descartan sin rechazar (regla 4).
 */
export function validateSnapshot(value: unknown): SnapshotValidation {
  if (!isRecord(value)) return { ok: false, reason: 'no es un objeto' }
  if (value.schema !== SNAPSHOT_SCHEMA) return { ok: false, reason: `schema desconocido: ${String(value.schema)}` }
  if (!isApp(value.app)) return { ok: false, reason: `app desconocida: ${String(value.app)}` }
  if (typeof value.appVersion !== 'string') return { ok: false, reason: 'falta appVersion' }
  if (!isDayKey(value.weekStart) || !isMonday(value.weekStart)) return { ok: false, reason: 'weekStart debe ser un lunes YYYY-MM-DD' }
  if (typeof value.complete !== 'boolean') return { ok: false, reason: 'complete debe ser booleano' }
  if (typeof value.generatedAt !== 'string' || Number.isNaN(Date.parse(value.generatedAt))) return { ok: false, reason: 'generatedAt no es una fecha' }
  if (!isRecord(value.metrics)) return { ok: false, reason: 'metrics debe ser un objeto' }
  if (!Array.isArray(value.goals)) return { ok: false, reason: 'goals debe ser una lista' }

  const known: readonly string[] = METRIC_KEYS[value.app]
  const metrics: Record<string, MetricValue> = {}
  for (const [key, raw] of Object.entries(value.metrics)) {
    if (!known.includes(key)) continue
    const metric = readMetric(raw)
    if (!metric) return { ok: false, reason: `métrica no válida: ${key}` }
    metrics[key] = metric
  }

  const goals: SnapshotGoal[] = []
  for (const raw of value.goals) {
    const goal = readGoal(raw)
    if (!goal) return { ok: false, reason: 'objetivo no válido' }
    goals.push(goal)
  }

  return {
    ok: true,
    snapshot: {
      schema: SNAPSHOT_SCHEMA,
      app: value.app,
      appVersion: value.appVersion,
      weekStart: value.weekStart,
      complete: value.complete,
      generatedAt: value.generatedAt,
      metrics,
      goals,
    },
  }
}
