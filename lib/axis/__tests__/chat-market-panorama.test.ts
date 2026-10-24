/**
 * El chat sabe cómo van las familias de inversión: recibe el panorama de
 * Finax solo cuando el mercado trae bonos, materias primas, vivienda o cripto,
 * y puede citar sus cifras sin que la validación las rechace.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AI_ENGINE_INFO } from '../ai-engine'
import { buildChatRequest } from '../chat/prompt'
import { chatPanoramaOf } from '../chat/market-panorama'
import { buildChatGuard, validateChatReply } from '../chat/semantic'
import { parseChatReply } from '../chat/validate'
import type { ChatInput } from '../chat/types'
import { buildFinancialContext } from '../context'
import { buildMarketContext } from '../../market/relevance'
import { history as marketHistory, research } from '../../market/__tests__/fixtures'
import type { MarketIndicator } from '../../market/types'
import { config, healthyMovements, NOW, objective, snapshot, TODAY } from './fixtures'

// El panorama juzga la frescura con la fecha real: los datos son de hoy.
const today = new Date().toISOString().slice(0, 10)
const ASSETS: MarketIndicator[] = [
  { key: 'ea-10y', label: 'Bono a 10 años de la eurozona (AAA)', group: 'bond', value: 3.38, unit: '%', asOf: today, changePct: -0.18, changeDays: 28, source: 'BCE' },
  { key: 'btc', label: 'Bitcoin (euros)', group: 'crypto', value: 105000, unit: 'EUR', asOf: today, changePct: 46.2, changeDays: 28, source: 'CoinGecko' },
]

const context = buildFinancialContext(snapshot({ config: config(150_000), movements: healthyMovements(), objectives: [objective({ name: 'Viaje', targetCents: 100_000, currentCents: 30_000 })] }), TODAY)
const market = (assets: MarketIndicator[]) => buildMarketContext(research({ generatedAt: new Date().toISOString(), indicators: [...research().indicators, ...assets] }), marketHistory, [], new Date())
const input = (assets: MarketIndicator[], message = '¿Cómo van las criptomonedas?'): ChatInput => ({ context, market: market(assets), conversation: { summary: null, recent: [] }, message })
const asReply = (text: string) => parseChatReply({ reply: text, confidence: 'media', nextStep: null, memoryProposal: null, engine: AI_ENGINE_INFO, generatedAt: NOW.toISOString() })
const payload = (i: ChatInput) => JSON.parse(buildChatRequest(i).user.slice(buildChatRequest(i).user.indexOf('{')))

describe('chat · cómo van las inversiones', () => {
  it('el contexto de mercado lleva los indicadores de las familias solo si existen', () => {
    assert.equal(market([]).assetIndicators, undefined)
    assert.deepEqual(market(ASSETS).assetIndicators?.map((i) => i.key), ['ea-10y', 'btc'])
  })

  it('sin esos datos, el prompt es el de antes', () => {
    const p = payload(input([]))
    assert.equal(p.datos_actuales.como_van_las_inversiones, undefined)
  })

  it('con ellos, el prompt lleva las 8 familias y no repite los indicadores', () => {
    const p = payload(input(ASSETS))
    const familias = p.datos_actuales.como_van_las_inversiones.familias
    assert.equal(familias.length, 8)
    const cripto = familias.find((f: { familia: string }) => f.familia === 'Criptomonedas')
    assert.equal(cripto.como_va, 'Sube con fuerza')
    assert.match(cripto.resumen, /bitcoin ha subido un 46,2 %/)
    assert.equal(p.datos_actuales.contexto_de_mercado.assetIndicators, undefined)
    assert.match(p.datos_actuales.como_van_las_inversiones.como_usarlo, /nunca digas qué va a pasar/)
  })

  it('el chat puede citar las cifras del panorama', () => {
    const i = input(ASSETS)
    const text = 'El bitcoin ha subido un 46,2 % en el último mes y está en 105.000 €; el bono a 10 años de la eurozona paga un 3,38 %.'
    assert.deepEqual(validateChatReply(asReply(text), buildChatGuard(i)), { ok: true })
  })

  it('pero no cifras de mercado inventadas', () => {
    const i = input(ASSETS)
    const v = validateChatReply(asReply('El bitcoin ha subido un 57,3 % en el último mes y vale 131.000 €.'), buildChatGuard(i))
    assert.equal(v.ok, false)
  })

  it('sin assetIndicators no hay panorama (clientes anteriores)', () => {
    assert.equal(chatPanoramaOf(market([])), null)
    assert.equal(chatPanoramaOf(null), null)
  })
})
