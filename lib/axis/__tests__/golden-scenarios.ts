/**
 * Escenarios dorados de AXIS, compartidos por `golden.test.ts` (resultado
 * local, chat y peticiones al modelo) y `golden-decision.test.ts` (la
 * `AxisDecision` completa). Una sola lista: lo que se congela en un sitio y
 * en otro es, por construcción, la misma entrada.
 */
import { buildFinancialContext } from '../context'
import { buildMarketContext } from '../../market/relevance'
import { history as marketHistory, research } from '../../market/__tests__/fixtures'
import type { AxisInput, MarketContext } from '../types'
import { config, gasto, healthyMovements, ingreso, NOW, objective, position, snapshot, TODAY } from './fixtures'

export type GoldenScenario = { name: string; input: AxisInput }

function ctx(partial: Parameters<typeof snapshot>[0]) {
  return buildFinancialContext(snapshot(partial), TODAY)
}

function market(generatedAt?: string, names: string[] = ['Fondo Indexado Global']): MarketContext {
  return buildMarketContext(research(generatedAt ? { generatedAt } : {}), marketHistory, names, NOW)
}

export const GOLDEN_SCENARIOS: GoldenScenario[] = [
  { name: 'sin-datos', input: { context: ctx({}) } },
  { name: 'solo-saldo-inicial', input: { context: ctx({ config: config(150_000) }) } },
  { name: 'sano', input: { context: ctx({ config: config(100_000), movements: healthyMovements() }) } },
  {
    name: 'gastos-suben',
    input: {
      context: ctx({
        config: config(50_000),
        movements: [
          ingreso('2026-08-01', 200_000),
          gasto('2026-08-10', 50_000, 'Comida'),
          ingreso('2026-09-01', 200_000),
          gasto('2026-09-05', 50_000, 'Comida'),
          gasto('2026-09-08', 60_000, 'Otros', 'Reparación coche'),
        ],
      }),
    },
  },
  {
    name: 'objetivo-en-progreso',
    input: { context: ctx({ config: config(300_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents: 500_000, currentCents: 246_000 })] }) },
  },
  {
    name: 'objetivo-conseguido',
    input: { context: ctx({ config: config(300_000), movements: healthyMovements(), objectives: [objective({ name: 'Colchón', targetCents: 100_000, currentCents: 100_000 })] }) },
  },
  {
    name: 'inversion',
    input: { context: ctx({ config: config(100_000), movements: healthyMovements(), positions: [position({ name: 'Fondo', investedCents: 150_000, valueCents: 158_000 })] }) },
  },
  { name: 'datos-limitados', input: { context: ctx({ config: config(0), movements: [ingreso('2026-09-01', 100_000), gasto('2026-09-03', 20_000)] }) } },
  { name: 'demo', input: { context: ctx({ config: config(120_000, true), movements: healthyMovements() }) } },
  {
    name: 'multiples-senales',
    input: {
      context: ctx({
        config: config(50_000),
        movements: [
          ingreso('2026-08-01', 200_000),
          gasto('2026-08-10', 50_000, 'Comida'),
          ingreso('2026-09-01', 150_000),
          gasto('2026-09-05', 120_000, 'Comida'),
          gasto('2026-09-08', 60_000, 'Salidas'),
        ],
        objectives: [objective({ name: 'Viaje', targetCents: 100_000, currentCents: 95_000 })],
      }),
    },
  },
  {
    name: 'objetivo-con-fecha',
    input: { context: ctx({ config: config(0), movements: healthyMovements(), objectives: [objective({ name: 'Coche', targetCents: 1_000_000, currentCents: 100_000, targetDate: '2027-03-15' })] }) },
  },
  {
    name: 'mercado-fresh',
    input: {
      context: ctx({ config: config(100_000), movements: healthyMovements(), positions: [position({ name: 'Fondo Indexado Global', investedCents: 150_000, valueCents: 158_000 })] }),
      market: market(),
      memory: { previousConclusions: [{ generatedAt: '2026-09-01T00:00:00.000Z', summary: 'Lectura anterior: ahorro sólido.' }] },
    },
  },
  {
    name: 'mercado-stale',
    input: {
      context: ctx({ config: config(100_000), movements: healthyMovements(), positions: [position({ name: 'Fondo Indexado Global', investedCents: 150_000, valueCents: 158_000 })] }),
      market: market('2026-07-01T06:00:00Z'),
    },
  },
]
