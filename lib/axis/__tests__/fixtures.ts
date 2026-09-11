/**
 * Datos ficticios para probar AxisEngine. Solo viven en los tests.
 */
import type { AppConfig, Movement, MovementInput, Objective, Position } from '../../types'
import type { FinancialSnapshot } from '../context'

/** Fecha de referencia fija para que los tests no dependan del reloj. */
export const TODAY = '2026-09-15'
export const NOW = new Date('2026-09-15T10:00:00Z')

let seq = 0
const id = () => `t-${++seq}`

export function movement(input: MovementInput & { createdAt?: number }): Movement {
  const createdAt = input.createdAt ?? Date.parse(input.date)
  return { id: id(), createdAt, updatedAt: createdAt, ...input }
}

export const gasto = (date: string, amountCents: number, category: Movement['category'] = 'Comida', motivo?: string) =>
  movement({ type: 'gasto', amountCents, date, category, motivo })

export const ingreso = (date: string, amountCents: number) =>
  movement({ type: 'ingreso', amountCents, date, category: 'Trabajo' })

export function objective(input: Partial<Objective> & { name: string; targetCents: number }): Objective {
  const createdAt = input.createdAt ?? Date.parse('2026-06-01')
  return { id: id(), currentCents: 0, createdAt, updatedAt: createdAt, ...input }
}

export function position(input: Partial<Position> & { name: string; valueCents: number }): Position {
  const createdAt = Date.parse('2026-05-01')
  return { id: id(), investedCents: input.valueCents, date: '2026-05-01', createdAt, updatedAt: createdAt, ...input }
}

export function config(initialBalanceCents: number, demo = false): AppConfig {
  return { key: 'config', initialBalanceCents, demo, configuredAt: 1, updatedAt: 1 }
}

export function snapshot(partial: Partial<FinancialSnapshot> = {}): FinancialSnapshot {
  return { config: null, movements: [], objectives: [], positions: [], ...partial }
}

/** Dos meses de ingresos y gastos moderados: contexto suficiente y sano. */
export function healthyMovements(): Movement[] {
  return [
    ingreso('2026-08-01', 200_000),
    gasto('2026-08-05', 40_000, 'Comida'),
    gasto('2026-08-12', 20_000, 'Restaurantes'),
    gasto('2026-08-20', 15_000, 'Ropa'),
    ingreso('2026-09-01', 200_000),
    gasto('2026-09-04', 42_000, 'Comida'),
    gasto('2026-09-10', 18_000, 'Restaurantes'),
    gasto('2026-09-12', 10_000, 'Salidas'),
  ]
}
