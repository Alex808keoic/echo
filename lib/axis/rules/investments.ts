/**
 * Reglas de inversiones (solo estructura de cartera; sin datos de mercado):
 * ausencia de posiciones, concentración, peso sobre el patrimonio.
 * Nunca opina sobre rentabilidad futura ni sobre productos concretos.
 *
 * Perfil (preferencias declaradas; solo cambian la LECTURA, nunca la decisión):
 *   - `horizon`       → interpretación de `investments.none`.
 *   - `riskAttitude`  → interpretación de `investments.concentration`.
 * Prioridad, hecho, recomendación, acción, alternativa e incertidumbre quedan
 * intactos; ninguna señal aparece ni desaparece. Solo hay influencia cuando
 * el texto resultante es distinto del de siempre.
 */
import type { Horizon, RiskAttitude } from '../profile/types'
import type { Signal } from '../types'
import { eur, horizonOf, pct, riskAttitudeOf, THRESHOLDS, type Rule } from './shared'

const NONE_INTERPRETATION = 'Eso no es bueno ni malo por sí mismo; depende de para qué es el dinero y de cuándo lo necesitas.'
const NONE_BY_HORIZON: Record<Horizon, string> = {
  short: 'Con el horizonte corto que declaraste, tenerlo todo líquido encaja: el dinero que puedes necesitar pronto no conviene comprometerlo.',
  medium: 'Con el horizonte medio que declaraste, tenerlo todo líquido es una opción prudente; lo importante es que sea una elección y no solo la situación por defecto.',
  long: 'Con el horizonte largo que declaraste, tenerlo todo líquido no es bueno ni malo por sí mismo, pero sí es una elección: merece ser consciente.',
}

const CONCENTRATION_INTERPRETATION = 'La evolución de tu parte invertida depende casi por completo de una sola posición.'
const CONCENTRATION_BY_RISK: Record<RiskAttitude, string> = {
  conservative: 'La evolución de tu parte invertida depende casi por completo de una sola posición; con la actitud conservadora que declaraste, esa concentración no encaja y merece una revisión.',
  balanced: 'La evolución de tu parte invertida depende casi por completo de una sola posición; con la actitud equilibrada que declaraste, ese peso debería ser deliberado y no fruto de la inercia.',
  dynamic: 'La evolución de tu parte invertida depende casi por completo de una sola posición; encaja con la actitud dinámica que declaraste, pero sigue siendo una concentración que merece tener presente.',
}

export const investmentRules: Rule = (ctx, _market, profile) => {
  const { positions, totalValueCents, shareOfWealthPct } = ctx.investments
  const signals: Signal[] = []
  const horizon = horizonOf(profile)
  const risk = riskAttitudeOf(profile)

  if (positions.length === 0) {
    signals.push({
      id: 'investments.none',
      domain: 'investments',
      priority: 'low',
      fact: 'No hay inversiones registradas: todo el patrimonio es líquido.',
      interpretation: horizon ? NONE_BY_HORIZON[horizon.value] : NONE_INTERPRETATION,
      uncertainty: {
        title: 'Sin posiciones registradas',
        detail:
          'No puedo evaluar tu reparto entre liquidez e inversión. Si tienes inversiones fuera de Finax, registrarlas completaría la lectura.',
      },
      ...(horizon && NONE_BY_HORIZON[horizon.value] !== NONE_INTERPRETATION
        ? { profileInfluence: [{ field: 'horizon', sourceMemoryId: horizon.sourceMemoryId, signalId: 'investments.none', effect: 'interpretation' }] }
        : {}),
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
      interpretation: risk ? CONCENTRATION_BY_RISK[risk.value] : CONCENTRATION_INTERPRETATION,
      recommendation: {
        what: 'Decide si esa concentración es deliberada; si no lo es, conviene que lo sea antes de añadir más a la misma posición.',
        why: 'No puedo valorar el riesgo de ese activo sin datos de mercado; sí puedo decir que el reparto es desigual.',
        nextStep: { label: 'Ver inversiones', to: 'inversiones' },
        action: { verb: 'decide', target: 'position', targetId: largest.id },
      },
      ...(risk && CONCENTRATION_BY_RISK[risk.value] !== CONCENTRATION_INTERPRETATION
        ? { profileInfluence: [{ field: 'riskAttitude', sourceMemoryId: risk.sourceMemoryId, signalId: 'investments.concentration', effect: 'interpretation' }] }
        : {}),
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
        action: { verb: 'review', target: 'cushion' },
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
