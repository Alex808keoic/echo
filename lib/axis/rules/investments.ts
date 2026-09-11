/**
 * Reglas de inversiones (solo estructura de cartera; sin datos de mercado):
 * ausencia de posiciones, concentración, peso sobre el patrimonio.
 * Nunca opina sobre rentabilidad futura ni sobre productos concretos.
 */
import type { Signal } from '../types'
import { eur, pct, THRESHOLDS, type Rule } from './shared'

export const investmentRules: Rule = (ctx) => {
  const { positions, totalValueCents, shareOfWealthPct } = ctx.investments
  const signals: Signal[] = []

  if (positions.length === 0) {
    signals.push({
      id: 'investments.none',
      domain: 'investments',
      priority: 'low',
      fact: 'No hay inversiones registradas: todo el patrimonio es líquido.',
      interpretation: 'Eso no es bueno ni malo por sí mismo; depende de para qué es el dinero y de cuándo lo necesitas.',
      uncertainty: {
        title: 'Sin posiciones registradas',
        detail:
          'No puedo evaluar tu reparto entre liquidez e inversión. Si tienes inversiones fuera de Finax, registrarlas completaría la lectura.',
      },
    })
    return signals
  }

  const largest = [...positions].sort((a, b) => b.weightPct - a.weightPct)[0]
  if (positions.length >= 2 && largest.weightPct >= THRESHOLDS.positionConcentrationPct) {
    signals.push({
      id: 'investments.concentration',
      domain: 'investments',
      priority: 'medium',
      fact: `«${largest.name}» pesa el ${pct(largest.weightPct)} de tus inversiones (${eur(largest.valueCents)} de ${eur(totalValueCents)}).`,
      interpretation: 'La evolución de tu parte invertida depende casi por completo de una sola posición.',
      recommendation: {
        what: 'Decide si esa concentración es deliberada; si no lo es, conviene que lo sea antes de añadir más a la misma posición.',
        why: 'No puedo valorar el riesgo de ese activo sin datos de mercado; sí puedo decir que el reparto es desigual.',
        nextStep: { label: 'Ver inversiones', to: 'inversiones' },
      },
    })
  }

  if (shareOfWealthPct >= THRESHOLDS.lowLiquidityInvestedPct) {
    signals.push({
      id: 'investments.low-liquidity',
      domain: 'investments',
      priority: 'medium',
      fact: `Las inversiones son el ${pct(shareOfWealthPct)} de tu patrimonio; el líquido disponible es ${eur(ctx.wealth.liquidCents)}.`,
      interpretation: 'Con poca liquidez, un imprevisto obligaría a deshacer inversiones en un momento que no eliges.',
      recommendation: {
        what: 'Comprueba que el líquido cubre tus gastos de varios meses antes de seguir invirtiendo.',
        why: 'El colchón de liquidez es lo que permite mantener las inversiones cuando llega un gasto inesperado.',
        nextStep: { label: 'Ver Mi Dinero', to: 'dinero' },
      },
    })
  }

  signals.push({
    id: 'investments.manual-values',
    domain: 'investments',
    priority: 'low',
    fact: `Valor invertido: ${eur(totalValueCents)} en ${positions.length} ${positions.length === 1 ? 'posición' : 'posiciones'} (${pct(shareOfWealthPct)} del patrimonio).`,
    interpretation: 'El valor es el que has introducido a mano; la lectura es tan actual como tu última actualización.',
    uncertainty: {
      title: 'Valores manuales, sin mercado',
      detail: 'No hay cotizaciones conectadas: no puedo valorar rentabilidad futura ni riesgo de mercado de estas posiciones.',
    },
  })

  return signals
}
