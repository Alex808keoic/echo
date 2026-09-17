/**
 * Los prompts de sistema se ensamblan por bloques (lib/axis/prompts). Este
 * test garantiza que el resultado es byte a byte el prompt original,
 * guardado tal cual en `__snapshots__/prompt-*.txt` antes de la separación.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AXIS_CHAT_SYSTEM_PROMPT, AXIS_SYSTEM_PROMPT } from '../prompts'
import { AXIS_SYSTEM_PROMPT as FROM_ANALYSIS_MODULE } from '../ai/prompt'
import { AXIS_CHAT_SYSTEM_PROMPT as FROM_CHAT_MODULE } from '../chat/prompt'
import { PERSONALITY } from '../personality'
import { SAFETY } from '../prompts/safety'

const golden = (name: string) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__snapshots__', name), 'utf8')

describe('AXIS · prompts por bloques', () => {
  it('el prompt del análisis es byte a byte el original', () => {
    assert.equal(AXIS_SYSTEM_PROMPT, golden('prompt-analysis.txt'))
    assert.equal(FROM_ANALYSIS_MODULE, AXIS_SYSTEM_PROMPT, 'ai/prompt.ts reexporta el mismo prompt')
  })

  it('el prompt de la conversación es byte a byte el original', () => {
    assert.equal(AXIS_CHAT_SYSTEM_PROMPT, golden('prompt-chat.txt'))
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
