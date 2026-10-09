/**
 * Búsqueda de mercado en tiempo real (parte 5b): titulares oficiales recientes
 * y la investigación de Finax sobre un tema, como CONTEXTO fechado. La ejecuta
 * el servidor; el cliente no puede aportar su resultado; sus cifras no se
 * pueden citar; y nunca se convierte en una recomendación de compra.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chatTurnWithProvider } from '../ai/server/analyze'
import { buildChatRequest } from '../chat/prompt'
import { isChatToolResults, parseToolRequest, runChatTool, toolResultFigures } from '../chat/tools'
import { buildFinancialContext } from '../context'
import type { AxisLanguageModel } from '../language/model'
import type { ChatInput } from '../chat/types'
import { searchMarket, searchTerms } from '../../market/search'
import { research } from '../../market/__tests__/fixtures'
import { config, healthyMovements, snapshot, TODAY } from './fixtures'

const NOW = new Date('2026-09-15T10:00:00Z')
const rss = (items: Array<[string, string]>) =>
  `<rss><channel>${items.map(([title, date]) => `<item><title>${title}</title><link>https://example.org/${encodeURIComponent(title)}</link><pubDate>${new Date(date).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`

function fakeFetch(opts: { feeds?: Record<string, string>; latest?: unknown; fail?: boolean } = {}): typeof fetch {
  return (async (url: string) => {
    if (opts.fail) throw new Error('sin red')
    if (url.endsWith('/latest.json')) return new Response(JSON.stringify(opts.latest ?? null), { status: opts.latest ? 200 : 404 })
    const feed = Object.entries(opts.feeds ?? {}).find(([k]) => url.includes(k))?.[1]
    return feed ? new Response(feed) : new Response('', { status: 404 })
  }) as typeof fetch
}

const GOLD_RESEARCH = research({
  assetClasses: [
    { key: 'gold', label: 'Oro', aliases: ['oro', 'gold'], note: 'Ha subido un 4 % en la semana por la demanda de refugio.', stance: 'watch' },
    { key: 'cash', label: 'Liquidez', aliases: ['depósito'], note: 'Remuneración estable.', stance: 'neutral' },
  ],
})

describe('términos de búsqueda', () => {
  it('quita palabras vacías y añade sinónimos (oro → gold; depósitos → plazo fijo)', () => {
    const t = searchTerms('¿Me recomiendas invertir en oro?')
    assert.ok(t.includes('oro') && t.includes('gold'))
    assert.ok(!t.includes('recomiendas') && !t.includes('invertir'))
    assert.ok(searchTerms('¿Cómo están los depósitos?').includes('plazo fijo'))
  })
})

describe('searchMarket (servidor)', () => {
  const feeds = {
    'ecb.europa.eu': rss([
      ['ECB keeps interest rates unchanged', '2026-09-11'],
      ['Speech on gold reserves and the euro', '2026-09-10'],
      ['Old note about gold', '2026-06-01'],
    ]),
    'federalreserve.gov': rss([['Fed statement on gold holdings', '2026-09-12']]),
  }

  it('titulares recientes del tema, más recientes primero, con fuente, fecha y enlace', async () => {
    const r = (await searchMarket('oro', { now: NOW, fetchImpl: fakeFetch({ feeds }) })) as { titulares: Array<Record<string, string>>; hay_informacion: boolean }
    assert.deepEqual(
      r.titulares.map((h) => [h.fuente, h.titular]),
      [
        ['Fed · prensa', 'Fed statement on gold holdings'],
        ['BCE · prensa', 'Speech on gold reserves and the euro'],
      ],
    )
    assert.ok(r.titulares.every((h) => h.enlace?.startsWith('https://')))
    assert.equal(r.hay_informacion, true)
  })

  it('la nota de la investigación de Finax, si no está desactualizada', async () => {
    const fresh = (await searchMarket('oro', { now: NOW, fetchImpl: fakeFetch({ latest: GOLD_RESEARCH }), dataUrl: 'https://data.example' })) as { investigacion_de_finax?: { notas: Array<{ clase: string }> } }
    assert.deepEqual(fresh.investigacion_de_finax?.notas.map((n) => n.clase), ['Oro'])
    const later = new Date(NOW.getTime() + 60 * 86_400_000)
    const stale = await searchMarket('oro', { now: later, fetchImpl: fakeFetch({ latest: GOLD_RESEARCH }), dataUrl: 'https://data.example' })
    assert.equal('investigacion_de_finax' in stale, false)
  })

  it('sin red: sin información, sin romper', async () => {
    const r = await searchMarket('oro', { now: NOW, fetchImpl: fakeFetch({ fail: true }), dataUrl: 'https://data.example' })
    assert.equal(r.hay_informacion, false)
    assert.match(String(r.como_usarlo), /no una recomendación/)
  })
})

describe('la consulta es del servidor', () => {
  it('requiere tema', () => {
    assert.equal(parseToolRequest({ herramienta: 'buscar_mercado', mes: null, categoria: null, texto: null, tipo: null }), null)
    assert.deepEqual(parseToolRequest({ herramienta: 'buscar_mercado', mes: null, categoria: null, texto: 'oro', tipo: null }), { herramienta: 'buscar_mercado', texto: 'oro' })
  })

  it('el dispositivo no la ejecuta y el cliente no puede aportar su resultado', () => {
    assert.throws(() => runChatTool({ herramienta: 'buscar_mercado', texto: 'oro' }, []))
    assert.equal(isChatToolResults([{ consulta: { herramienta: 'buscar_mercado', texto: 'oro' }, resultado: { titulares: [] } }]), false)
  })

  it('sus cifras no se pueden citar (texto de terceros)', () => {
    assert.deepEqual(toolResultFigures([{ consulta: { herramienta: 'buscar_mercado', texto: 'oro' }, resultado: { nota: 'Ha subido un 4 % y vale 2.000,00 €' } }]), [])
  })

  it('se ofrece en la primera llamada', () => {
    const context = buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements() }), TODAY)
    assert.match(buildChatRequest({ context, market: null, conversation: { summary: null, recent: [] }, message: '¿Invierto en oro?' }, { tools: true }).user, /buscar_mercado/)
  })
})

describe('servidor: buscar y responder en la misma petición', () => {
  const context = buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements() }), TODAY)
  const input: ChatInput = { context, market: null, conversation: { summary: null, recent: [] }, message: '¿Me recomiendas invertir en oro?' }
  const answer = (reply: string, consulta: unknown = null) => ({ reply, confidence: 'media', nextStep: null, memoryProposal: null, consulta })
  function scripted(...outputs: unknown[]): AxisLanguageModel & { users: string[] } {
    const users: string[] = []
    return {
      id: 'test:mock',
      available: true,
      users,
      async complete(request) {
        users.push(request.user)
        return outputs.shift()
      },
    }
  }
  const search = async () => ({ tema: 'oro', titulares: [{ fecha: '12 sep 2026', fuente: 'Fed · prensa', titular: 'Fed statement on gold holdings' }], hay_informacion: true })

  it('el modelo pide buscar_mercado → el servidor busca y el modelo responde con el resultado', async () => {
    const model = scripted(answer('Lo busco.', { herramienta: 'buscar_mercado', mes: null, categoria: null, texto: 'oro', tipo: null }), answer('La Fed publicó el 12 de septiembre una nota sobre sus reservas de oro; es contexto, no una señal para comprar. Lo que sí puedes decidir es tu plan.'))
    const turn = await chatTurnWithProvider(model, input, undefined, { searchMarket: search, consumeSlot: () => true })
    assert.ok('reply' in turn, JSON.stringify(turn))
    assert.equal(model.users.length, 2)
    assert.match(model.users[1], /resultados_de_consultas/)
  })

  it('aunque haya noticias, «compra oro» se rechaza (→ motor local)', async () => {
    const model = scripted(answer('Lo busco.', { herramienta: 'buscar_mercado', mes: null, categoria: null, texto: 'oro', tipo: null }), answer('Con estas noticias, te recomiendo comprar oro ahora.'))
    await assert.rejects(chatTurnWithProvider(model, input, undefined, { searchMarket: search, consumeSlot: () => true }))
  })

  it('sin cupo para la segunda llamada: error de cupo (→ motor local), sin llamar otra vez', async () => {
    const model = scripted(answer('Lo busco.', { herramienta: 'buscar_mercado', mes: null, categoria: null, texto: 'oro', tipo: null }))
    await assert.rejects(chatTurnWithProvider(model, input, undefined, { searchMarket: search, consumeSlot: () => false }), /cupo/)
    assert.equal(model.users.length, 1)
  })
})
