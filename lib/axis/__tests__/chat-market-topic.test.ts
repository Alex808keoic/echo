/**
 * El mercado detallado solo viaja cuando la conversación va de mercado (2026-10-25): una pregunta
 * corriente pesaba ~37.000 caracteres y ni Cloudflare respondía a tiempo ni Groq la admitía.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MARKET_TOPIC } from '../chat/prompt'

describe('MARKET_TOPIC', () => {
  it('reconoce preguntas de mercado, con y sin tildes', () => {
    for (const q of ['¿Cómo va la bolsa?', '¿y el oro?', '¿Qué ha pasado con el euríbor?', '¿Subirá el bitcoin?', 'rentabilidad de los bonos', '¿Cómo están los índices?', 'la inflacion de este mes', '¿Hay crisis?'])
      assert.ok(MARKET_TOPIC.test(q), q)
  })
  it('deja fuera las preguntas sobre tu dinero o conceptos generales', () => {
    for (const q of ['¿Qué es la renta fija?', '¿Cuánto gasté en restaurantes en agosto?', '¿Me puedo permitir un coche?', '¿Cuánto tendría que ahorrar al mes?', 'Quiero ahorrar para un viaje', 'Explícame el colchón'])
      assert.ok(!MARKET_TOPIC.test(q), q)
  })
  it('no confunde palabras que contienen otras («tesoro», «decoro», «gastos»)', () => {
    for (const q of ['Letras del Tesoro no, ¿y una cuenta?', 'con decoro', 'mis gastos fijos']) assert.ok(!MARKET_TOPIC.test(q.replace('Letras del ', '')), q)
  })
})
