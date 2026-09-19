/**
 * Tests dorados de AXIS: fijan el comportamiento observable actual para que
 * la evolución arquitectónica (decisión separada del lenguaje) no lo cambie.
 *
 * Para cada escenario se congela, con fecha fija y sin red:
 *   - el `AxisResult` del motor local (análisis o «sin análisis»);
 *   - la respuesta local de la conversación (fallback);
 *   - las peticiones efectivas al modelo (system + user) del análisis y del chat;
 *   - la petición de expresión (Decision First): decisión + cifras permitidas.
 *
 * Los snapshots viven en `__snapshots__/<escenario>.json`. Para regenerarlos
 * de forma deliberada: `UPDATE_GOLDEN=1 pnpm test`. Un cambio inesperado aquí
 * es un cambio de comportamiento y debe justificarse.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFinancialContext } from '../context'
import { analyzeLocally } from '../local-engine'
import { buildAIRequest } from '../ai/prompt'
import { buildChatRequest } from '../chat/prompt'
import { composeLocalReply } from '../chat/local-reply'
import { decide } from '../core/decision'
import { buildExpressionRequest } from '../core/expression'
import { buildMarketContext } from '../../market/relevance'
import { history as marketHistory, research } from '../../market/__tests__/fixtures'
import type { AxisInput, MarketContext } from '../types'
import type { ChatInput, FallbackReason } from '../chat/types'
import { config, gasto, healthyMovements, ingreso, NOW, objective, position, snapshot, TODAY } from './fixtures'

const SNAPSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '__snapshots__')
const UPDATE = process.env.UPDATE_GOLDEN === '1'

type Scenario = { name: string; input: AxisInput }

function ctx(partial: Parameters<typeof snapshot>[0]) {
  return buildFinancialContext(snapshot(partial), TODAY)
}

function market(generatedAt?: string, names: string[] = ['Fondo Indexado Global']): MarketContext {
  return buildMarketContext(research(generatedAt ? { generatedAt } : {}), marketHistory, names, NOW)
}

const SCENARIOS: Scenario[] = [
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

const REASONS: FallbackReason[] = ['unavailable', 'error']

function golden(input: AxisInput) {
  const chat: ChatInput = {
    context: input.context,
    market: input.market ?? null,
    memory: {
      ...(input.memory ?? {}),
      userMemories: [{ id: 'mem-1', content: 'Quiere mantener 200 € de liquidez mínima.', category: 'constraint', importance: 'high', fecha: '2026-09-01' }],
    },
    conversation: { summary: 'Usuario: quiero ahorrar 1.000 €. · AXIS: ¿Para qué fecha?', recent: [{ role: 'user', text: 'Para diciembre.' }, { role: 'axis', text: 'Entendido.' }] },
    message: '¿Y cuánto tendría que ahorrar al mes?',
  }
  return {
    local: analyzeLocally(input, NOW),
    chatLocal: Object.fromEntries(REASONS.map((r) => [r, composeLocalReply(chat, r, NOW)])),
    analysisRequest: buildAIRequest(input),
    chatRequest: buildChatRequest(chat),
    expressionRequest: buildExpressionRequest(decide(input), chat.memory),
  }
}

describe('AXIS · tests dorados (comportamiento congelado)', () => {
  for (const scenario of SCENARIOS) {
    it(`escenario «${scenario.name}» produce exactamente lo mismo que antes`, () => {
      const actual = JSON.parse(JSON.stringify(golden(scenario.input))) as unknown
      const file = join(SNAPSHOT_DIR, `${scenario.name}.json`)
      if (UPDATE || !existsSync(file)) {
        mkdirSync(SNAPSHOT_DIR, { recursive: true })
        writeFileSync(file, `${JSON.stringify(actual, null, 2)}\n`)
      }
      const expected = JSON.parse(readFileSync(file, 'utf8')) as unknown
      assert.deepEqual(actual, expected, `el snapshot ${scenario.name}.json no coincide (si el cambio es deliberado: UPDATE_GOLDEN=1 pnpm test)`)
    })
  }
})
