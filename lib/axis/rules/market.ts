/**
 * Regla de mercado. Solo actúa si existe `MarketContext`.
 *
 * - `fresh`/`aging`: aporta HECHOS (indicadores clave con fecha y fuente) y la
 *   incertidumbre propia de un contexto con fecha.
 * - Solo `fresh` + clase de activo en `caution` que cruce con una posición:
 *   recomendación de prudencia («revisa antes de ampliar»), nunca comprar/vender.
 * - `stale`: únicamente la advertencia; ninguna recomendación de mercado.
 *
 * Nunca presenta tendencias como certezas: reproduce lo que la investigación
 * describe del periodo y remite a sus fuentes.
 *
 * Frescura por indicador (`ContextIndicator.freshness`): solo los indicadores
 * `fresh` aparecen con su valor como situación actual. Los `stale` o
 * `unknown` (o sin frescura, de un cliente antiguo) se nombran como «sin dato
 * actual», sin valor: nunca sustentan una lectura de mercado.
 */
import { FRESHNESS_LABEL } from '../../market/freshness'
import type { ContextIndicator, MarketIndicator } from '../../market/types'
import type { Signal } from '../types'
import { type Rule } from './shared'

/** Solo un indicador marcado `fresh` es situación actual; sin marca, no se da por actual. */
const isCurrent = (i: ContextIndicator) => i.freshness === 'fresh'

function fmtNotCurrent(i: ContextIndicator): string {
  return i.freshness === 'stale' ? `${i.label} (último dato de ${i.asOf})` : `${i.label} (sin fecha fiable)`
}

function fmtIndicator(i: MarketIndicator): string {
  if (i.value === null) return `${i.label}: sin dato`
  const value = i.unit === '%' ? `${String(i.value).replace('.', ',')} %` : `${i.value.toLocaleString('es-ES')} pts`
  return `${i.label}: ${value} (${i.asOf}, ${i.source})`
}

export const marketRules: Rule = (_ctx, market, _profile) => {
  if (!market) return []
  const signals: Signal[] = []
  const age = `${market.ageDays} día${market.ageDays === 1 ? '' : 's'}`

  if (market.freshness === 'stale') {
    signals.push({
      id: 'market.stale',
      domain: 'market',
      priority: 'low',
      fact: `El contexto de mercado disponible es de hace ${age} (${market.asOf.slice(0, 10)}).`,
      interpretation: 'Está desactualizado: no sirve para valorar el momento actual de los mercados.',
      uncertainty: {
        title: 'Contexto de mercado desactualizado',
        detail: 'No se emiten lecturas de mercado hasta que haya una investigación reciente.',
      },
    })
    return signals
  }

  const indicators = market.keyIndicators.filter(isCurrent).slice(0, 4).map(fmtIndicator).join(' · ')
  const notCurrent = market.keyIndicators.filter((i) => !isCurrent(i)).map(fmtNotCurrent)
  const withoutCurrent = notCurrent.length > 0 ? ` Sin dato actual: ${notCurrent.join(', ')}.` : ''
  signals.push({
    id: 'market.snapshot',
    domain: 'market',
    priority: 'low',
    fact: `Mercado (${FRESHNESS_LABEL[market.freshness]}, ${market.coversFrom} → ${market.coversTo}): ${indicators || 'sin indicadores'}.${withoutCurrent}`,
    interpretation: market.overview,
    uncertainty: {
      title: `Contexto de mercado de hace ${age}`,
      detail:
        market.freshness === 'aging'
          ? 'La investigación tiene ya varios días; los mercados pueden haber cambiado desde entonces.'
          : 'Describe el periodo analizado con datos públicos; no anticipa lo que harán los mercados.',
    },
  })

  if (market.freshness === 'fresh') {
    for (const ac of market.relevantAssetClasses.filter((a) => a.stance === 'caution').slice(0, 1)) {
      signals.push({
        id: `market.caution:${ac.key}`,
        domain: 'market',
        priority: 'medium',
        fact: `La investigación señala prudencia en «${ac.label}», una clase de activo que cruza con tus posiciones.`,
        interpretation: ac.note,
        recommendation: {
          what: `Antes de ampliar tu posición en «${ac.label}», revisa el contexto y tu horizonte.`,
          why: 'No es una señal de vender ni de comprar: es un momento para no aumentar el compromiso sin haberlo revisado.',
          nextStep: { label: 'Ver inversiones', to: 'inversiones' },
          action: { verb: 'hold', target: 'position', targetId: ac.key },
        },
        uncertainty: {
          title: 'Sin datos de mercado en tiempo real',
          detail: 'La lectura procede de una síntesis semanal de fuentes públicas, no de cotizaciones actuales.',
        },
      })
    }
  }

  return signals
}
