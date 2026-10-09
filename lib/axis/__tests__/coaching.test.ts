/**
 * Tono de coach (parte 4a): lo decide Finax con reglas, no el modelo. Un
 * problema siempre manda sobre un logro. El tono cambia cómo se dice, nunca qué.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildChatRequest } from '../chat/prompt'
import { composeLocalReply } from '../chat/local-reply'
import { coachingTone, TONE_GUIDE, TONE_OPENER } from '../coaching'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import type { ChatInput } from '../chat/types'
import type { Objective } from '../../types'
import { config, gasto, healthyMovements, ingreso, NOW, objective, snapshot, TODAY } from './fixtures'

/** Saldo inicial tal que el líquido final sea `liquidCents` con esos movimientos. */
const ctxWith = (liquidCents: number, objectives: Objective[] = [], movements = healthyMovements()) => {
  const net = movements.reduce((t, m) => t + (m.type === 'ingreso' ? m.amountCents : -m.amountCents), 0)
  return buildFinancialContext(snapshot({ config: config(liquidCents - net), movements, objectives }), TODAY)
}
const toneOf = (liquidCents: number, objectives: Objective[] = [], movements = healthyMovements()) => coachingTone(decide({ context: ctxWith(liquidCents, objectives, movements) })).tone
const chat = (message: string, liquidCents: number, objectives: Objective[] = []): ChatInput => ({ context: ctxWith(liquidCents, objectives), market: null, conversation: { summary: null, recent: [] }, message })

describe('tono de coach', () => {
  it('líquido negativo → firme', () => {
    assert.equal(toneOf(-50_000), 'firm')
  })

  it('gastar más de lo que se ingresa → firme', () => {
    assert.equal(toneOf(800_000, [], [...healthyMovements(), gasto('2026-09-14', 300_000)]), 'firm')
  })

  it('un objetivo cubierto → celebrar', () => {
    assert.equal(toneOf(800_000, [objective({ name: 'Viaje', targetCents: 50_000 })]), 'celebrate')
  })

  it('ahorro sano sin logros ni problemas → animar', () => {
    assert.equal(toneOf(300_000, [objective({ name: 'Casa', targetCents: 5_000_000 })]), 'encourage')
  })

  it('un problema manda sobre un logro', () => {
    const movements = [...healthyMovements(), gasto('2026-09-14', 300_000)]
    assert.equal(toneOf(800_000, [objective({ name: 'Viaje', targetCents: 50_000 })], movements), 'firm')
  })

  it('sin nada destacable → sereno', () => {
    const flat = [ingreso('2026-09-01', 100_000), gasto('2026-09-05', 90_000)]
    assert.equal(toneOf(100_000, [objective({ name: 'Casa', targetCents: 5_000_000 })], flat), 'steady')
  })
})

describe('el tono llega al chat sin cambiar el contenido', () => {
  it('el modelo recibe el tono sugerido y la regla para usarlo', () => {
    const request = buildChatRequest(chat('¿Cómo voy?', -50_000))
    const payload = JSON.parse(request.user.slice(request.user.indexOf('{')))
    assert.equal(payload.datos_actuales.tono_sugerido, TONE_GUIDE.firm)
    assert.match(request.system, /«tono_sugerido» es el tono que Finax ha elegido/)
  })

  it('la respuesta local abre con la frase del tono y mantiene la lectura de AXIS', () => {
    const reply = composeLocalReply(chat('¿Cómo voy?', -50_000), 'unavailable', NOW)
    assert.ok(reply.text.includes(TONE_OPENER.firm))
    assert.match(reply.text, /dinero líquido es negativo/)
  })

  it('en tono sereno no añade frase', () => {
    const flat = buildFinancialContext(snapshot({ config: config(100_000), movements: [ingreso('2026-09-01', 100_000), gasto('2026-09-05', 90_000)], objectives: [objective({ name: 'Casa', targetCents: 5_000_000 })] }), TODAY)
    const reply = composeLocalReply({ context: flat, market: null, conversation: { summary: null, recent: [] }, message: '¿Cómo voy?' }, 'unavailable', NOW)
    for (const opener of Object.values(TONE_OPENER).filter(Boolean)) assert.ok(!reply.text.includes(opener))
  })
})

describe('señales con id de objetivo', () => {
  it('«objectives.covered:<id>» cuenta como logro y «objectives.overdue:<id>» como problema', () => {
    const base = decide({ context: ctxWith(800_000) })
    const withSignal = (id: string) => ({ ...base, signals: [{ id, domain: 'objectives' as const, priority: 'low' as const, fact: 'x', interpretation: 'x' }] })
    assert.equal(coachingTone(withSignal('objectives.covered:t-1')).tone, 'celebrate')
    assert.equal(coachingTone(withSignal('objectives.overdue:t-9')).tone, 'firm')
  })
})
