/**
 * Resúmenes semanales para la app AXIS (contrato axis.snapshot.v1).
 *
 * Función pura: recibe los datos del dispositivo y devuelve un snapshot por semana
 * (lunes a domingo), desde la primera semana con algún dato hasta la actual. Solo
 * lleva las métricas que el usuario activó: importes agregados, nunca movimientos
 * sueltos, conceptos, notas ni nombres de inversiones.
 */
import { allocateObjectives } from '../finance/objectives'
import { buildWealthSeries, computeLiquidCents } from '../finance/patrimonio'
import { revaluationDeltas } from '../finance/position-values'
import { goalInvestedPool } from '../axis/plan/mix'
import { shiftedISO } from '../dates'
import { isOneOff, type Debt, type Movement, type Objective, type Position } from '../types'
import { SNAPSHOT_SCHEMA, type MetricValue, type Snapshot, type SnapshotGoal } from './contract'
import type { FinaxMetric } from './sharing'

export interface SnapshotInput {
  data: {
    initialBalanceCents: number
    movements: Movement[]
    positions: Position[]
    objectives: Objective[]
    debts: Debt[]
  }
  metrics: readonly FinaxMetric[]
  /** Hoy, `YYYY-MM-DD`. */
  today: string
  generatedAt: string
  appVersion: string
}

/** Lunes de la semana de `iso` (`YYYY-MM-DD`), sin que la zona horaria lo mueva de día. */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
  return shiftedISO(iso, -weekday)
}

function sum(list: readonly Movement[]): number {
  return list.reduce((total, m) => total + m.amountCents, 0)
}

function weekMetrics(weekStart: string, input: SnapshotInput): Partial<Record<FinaxMetric, MetricValue>> {
  const { data, today } = input
  const weekEnd = shiftedISO(weekStart, 6)
  const isCurrent = weekStart === mondayOf(today)
  const inWeek = data.movements.filter((m) => m.date >= weekStart && m.date <= weekEnd)
  const expenses = inWeek.filter((m) => m.type === 'gasto')
  const owned = data.positions.filter((p) => p.date <= weekEnd)

  const all: Record<FinaxMetric, () => MetricValue> = {
    income_cents: () => ({ value: sum(inWeek.filter((m) => m.type === 'ingreso')) }),
    expense_cents: () => ({ value: sum(expenses) }),
    expense_habitual_cents: () => ({ value: sum(expenses.filter((m) => !isOneOff(m))) }),
    wealth_cents: () => {
      // La misma curva que la gráfica de patrimonio: su último punto dentro de la semana.
      const points = buildWealthSeries(data.initialBalanceCents, data.movements, data.positions, today).filter((p) => p.date <= weekEnd)
      return { value: points.length > 0 ? points[points.length - 1].cents : data.initialBalanceCents }
    },
    invested_value_cents: () => ({
      value: owned.reduce(
        (total, p) => total + p.investedCents + revaluationDeltas(p, today).reduce((acc, d) => (d.date <= weekEnd ? acc + d.cents : acc), 0),
        0,
      ),
    }),
    // Las deudas solo guardan lo que queda hoy: en semanas pasadas no hay dato.
    debt_cents: () => ({ value: isCurrent ? data.debts.reduce((total, d) => total + d.balanceCents, 0) : null }),
    movements_count: () => ({ value: inWeek.length }),
  }

  const metrics: Partial<Record<FinaxMetric, MetricValue>> = {}
  for (const key of input.metrics) metrics[key] = all[key]()
  return metrics
}

/** Los objetivos tal como los ve Finax hoy (mismo reparto que la pantalla). Solo van en la semana actual. */
function currentGoals(input: SnapshotInput): SnapshotGoal[] {
  const { data, today } = input
  const liquid = computeLiquidCents(data.initialBalanceCents, data.movements, data.positions)
  return allocateObjectives(data.objectives, liquid, goalInvestedPool(data.positions, today)).items.map((item) => {
    const target = Math.max(0, item.objective.targetCents)
    return {
      id: item.objective.id,
      title: item.objective.name.slice(0, 120) || 'Objetivo',
      progress: target > 0 ? Math.min(1, Math.round((item.allocatedCents / target) * 100) / 100) : 0,
      target,
      ...(item.objective.targetDate ? { deadline: item.objective.targetDate } : {}),
      status: item.status === 'achieved' ? 'completed' : 'active',
    }
  })
}

function firstWeek(input: SnapshotInput): string {
  const dates = [...input.data.movements.map((m) => m.date), ...input.data.positions.map((p) => p.date)].filter((d) => d <= input.today)
  return mondayOf(dates.length > 0 ? dates.reduce((a, b) => (a < b ? a : b)) : input.today)
}

export function buildWeeklySnapshots(input: SnapshotInput): Snapshot[] {
  const current = mondayOf(input.today)
  const snapshots: Snapshot[] = []
  for (let week = firstWeek(input); week <= current; week = shiftedISO(week, 7)) {
    snapshots.push({
      schema: SNAPSHOT_SCHEMA,
      app: 'finax',
      appVersion: input.appVersion,
      weekStart: week,
      complete: shiftedISO(week, 6) < input.today,
      generatedAt: input.generatedAt,
      metrics: weekMetrics(week, input),
      goals: week === current ? currentGoals(input) : [],
    })
  }
  return snapshots
}
