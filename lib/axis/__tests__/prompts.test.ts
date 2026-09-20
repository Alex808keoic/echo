/**
 * Los prompts de sistema se ensamblan por bloques (lib/axis/prompts).
 *
 *   - `prompt-analysis.txt`: el prompt LEGACY del análisis debe seguir byte a
 *     byte igual al original (no lleva la voz). No se regenera nunca.
 *   - `prompt-chat.txt`: golden del prompt de la conversación. Cambia solo de
 *     forma deliberada, con `UPDATE_GOLDEN=1 pnpm test` (fase 1: voz natural).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AXIS_CHAT_SYSTEM_PROMPT, AXIS_SYSTEM_PROMPT } from '../prompts'
import { AXIS_SYSTEM_PROMPT as FROM_ANALYSIS_MODULE } from '../ai/prompt'
import { AXIS_CHAT_SYSTEM_PROMPT as FROM_CHAT_MODULE } from '../chat/prompt'
import { PERSONALITY } from '../personality'
import { SAFETY } from '../prompts/safety'

const snapshot = (name: string) => join(dirname(fileURLToPath(import.meta.url)), '__snapshots__', name)
// Los .txt pueden llegar con CRLF según `core.autocrlf`; la comparación es sobre el contenido, no sobre los finales de línea.
const golden = (name: string) => readFileSync(snapshot(name), 'utf8').replace(/\r\n/g, '\n')
const UPDATE = process.env.UPDATE_GOLDEN === '1'

describe('AXIS · prompts por bloques', () => {
  it('el prompt del análisis es byte a byte el original', () => {
    assert.equal(AXIS_SYSTEM_PROMPT, golden('prompt-analysis.txt'))
    assert.equal(FROM_ANALYSIS_MODULE, AXIS_SYSTEM_PROMPT, 'ai/prompt.ts reexporta el mismo prompt')
  })

  it('el prompt de la conversación coincide con su golden (regenerable solo con UPDATE_GOLDEN=1)', () => {
    if (UPDATE) writeFileSync(snapshot('prompt-chat.txt'), AXIS_CHAT_SYSTEM_PROMPT)
    assert.equal(AXIS_CHAT_SYSTEM_PROMPT, golden('prompt-chat.txt'), 'si el cambio es deliberado: UPDATE_GOLDEN=1 pnpm test')
    assert.equal(FROM_CHAT_MODULE, AXIS_CHAT_SYSTEM_PROMPT, 'chat/prompt.ts reexporta el mismo prompt')
  })

  it('la personalidad no contiene reglas financieras ni de seguridad', () => {
    const text = JSON.stringify(PERSONALITY)
    assert.doesNotMatch(text, /céntimos|recalcules|inventes|ejecuta|memoryProposal|esquema/i)
    const safety = JSON.stringify(SAFETY)
    assert.match(safety, /nunca ejecuta|NUNCA ejecutas/)
    assert.match(safety, /No inventes/)
  })
})
