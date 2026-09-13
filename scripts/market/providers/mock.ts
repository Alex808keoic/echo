/**
 * Proveedor de prueba: sintetiza el material de forma determinista y SIN IA.
 * Solo para ejecuciones locales (`--provider mock`) y tests. El resultado
 * queda marcado como `provider.id = 'mock'` y con la advertencia
 * correspondiente; nunca debe publicarse desde el cron.
 */
import type { AIRequest } from '../../../lib/axis/ai/provider'
import { DEFAULT_ASSET_ALIASES } from '../../../lib/market/schema'
import type { MarketAIProvider } from '../../../lib/ai/providers/types'

export function createMockProvider(): MarketAIProvider {
  return {
    id: 'mock',
    model: 'mock',
    async completeWithUsage(request: AIRequest) {
      const indicatorLines = request.user.split('\n').filter((l) => l.startsWith('- ') && l.includes('[')).slice(0, 6)
      const headlineLines = request.user.split('\n').filter((l) => /^- \d{4}-\d{2}-\d{2} · /.test(l)).slice(0, 3)
      const output = {
        overview: `Síntesis de prueba sin IA. Indicadores disponibles: ${indicatorLines.length}. Titulares oficiales recientes: ${headlineLines.length}. Los datos describen el periodo analizado; no hay predicciones.`,
        events: headlineLines.map((l) => {
          const [, date, rest] = l.match(/^- (\S+) · (.*)$/) ?? ['', '2000-01-01', l]
          const [source, ...title] = rest.split(': ')
          return { date, title: title.join(': ').slice(0, 120), summary: 'Titular oficial recogido en la recopilación (prueba local).', impact: 'low', source, affects: [] }
        }),
        trends: [],
        assetClasses: Object.entries(DEFAULT_ASSET_ALIASES).map(([key, aliases]) => ({
          key,
          label: key,
          aliases,
          note: 'Sin lectura: síntesis de prueba sin IA.',
          stance: 'neutral',
        })),
        uncertainties: ['Esta síntesis es una prueba local sin modelo de IA; no interpreta el material.'],
        warnings: ['Esta síntesis no es asesoramiento financiero', 'Datos de mercado con posible retraso', 'Generada por el proveedor de prueba (mock), sin IA'],
      }
      const inputTokens = Math.ceil(request.user.length / 4)
      return { output, usage: { inputTokens, outputTokens: 300, totalTokens: inputTokens + 300 } }
    },
    complete(request) {
      return this.completeWithUsage(request, { maxOutputTokens: 6000 }).then((c) => c.output)
    },
  }
}
