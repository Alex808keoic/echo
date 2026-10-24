/**
 * «Cómo van las inversiones» para el chat de AXIS: el mismo panorama de la
 * pantalla (`lib/market/panorama.ts`), calculado por Finax con los
 * indicadores del `MarketContext` que recibe el modelo. Solo llega al prompt
 * si el contexto trae `assetIndicators` (bonos, materias primas, vivienda o
 * cripto); sin ellos, el chat es el de antes. Sus cifras las escribe Finax:
 * el chat puede citarlas (`panoramaFigures`).
 */
import { GROUP_TREND_LABEL, marketPanorama, type GroupPanorama } from '../../market/panorama'
import { extractFigures, type AllowedFigure } from '../core/figures'
import type { MarketContext } from '../types'

export type ChatPanorama = GroupPanorama[]

export function chatPanoramaOf(market: MarketContext | null | undefined, now: Date = new Date()): ChatPanorama | null {
  if (!market?.assetIndicators?.length) return null
  // Las notas de la investigación no: son texto de la IA semanal y sus cifras pueden estar superadas.
  return marketPanorama([...market.keyIndicators, ...market.assetIndicators], [], now)
}

const figureText = (f: GroupPanorama['figures'][number]) => `${f.label}: ${f.value}${f.change ? ` (${f.change})` : ''}, dato de ${f.asOf} [${f.source}]`

export function panoramaForPrompt(panorama: ChatPanorama) {
  return {
    familias: panorama.map((g) => ({
      familia: g.name,
      como_va: GROUP_TREND_LABEL[g.trend],
      resumen: g.headline,
      ...(g.figures.length > 0 ? { datos: g.figures.map(figureText) } : {}),
    })),
    como_usarlo:
      'Es el resumen de Finax de cómo han ido en el último mes las familias de la Guía para invertir, con datos oficiales o públicos y su fecha. Úsalo si pregunta cómo va el mercado, la bolsa, los bonos, el oro, la vivienda, las criptomonedas, los fondos o los ETF. Cita las cifras tal cual, con su fecha. Describe solo lo que ya ha pasado: nunca digas qué va a pasar, ni que compre, venda o espere por esto; que algo haya subido mucho no lo hace mejor compra y su plan no cambia por ello. Si una familia no tiene datos recientes, dilo así.',
  }
}

/** Cifras del panorama (escritas por Finax), también los números desnudos («18.914 pts»), como los textos de la decisión. */
export function panoramaFigures(panorama: ChatPanorama | null): AllowedFigure[] {
  if (!panorama) return []
  const label = 'Cómo van las inversiones'
  const texts = panorama.flatMap((g) => [g.headline, ...g.figures.map(figureText)])
  return texts.flatMap((text) =>
    extractFigures(text).flatMap((f): AllowedFigure[] => {
      if (f.kind === 'bare') return f.bareValue === undefined ? [] : [{ key: `c:${f.bareValue}`, kind: 'count', value: f.bareValue, text: f.raw, label, source: 'decision-text' }]
      const n = Number(f.key.slice(2))
      if (f.kind === 'money') return [{ key: f.key, kind: 'money', cents: Math.round(n * 100), text: f.raw.trim(), label, source: 'decision-text' }]
      if (f.kind === 'percent' || f.kind === 'count') return [{ key: f.key, kind: f.kind, value: n, text: f.raw.trim(), label, source: 'decision-text' }]
      return []
    }),
  )
}
