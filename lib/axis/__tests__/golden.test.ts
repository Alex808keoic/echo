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
 * Los escenarios viven en `golden-scenarios.ts` (compartidos con
 * `golden-decision.test.ts`) y los snapshots en `__snapshots__/<escenario>.json`. Para regenerarlos
 * de forma deliberada: `UPDATE_GOLDEN=1 pnpm test`. Un cambio inesperado aquí
 * es un cambio de comportamiento y debe justificarse.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyzeLocally } from '../local-engine'
import { buildAIRequest } from '../ai/prompt'
import { buildChatRequest } from '../chat/prompt'
import { composeLocalReply } from '../chat/local-reply'
import { decide } from '../core/decision'
import { buildExpressionRequest } from '../core/expression'
import type { AxisInput } from '../types'
import type { ChatInput, FallbackReason } from '../chat/types'
import { NOW } from './fixtures'
import { GOLDEN_SCENARIOS as SCENARIOS } from './golden-scenarios'

const SNAPSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '__snapshots__')
const UPDATE = process.env.UPDATE_GOLDEN === '1'

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
