/**
 * «El mercado y tu plan»: qué significa el mercado de esta semana para TU
 * dinero. Puro y determinista; nunca cambia los importes del plan.
 *
 * Reglas (decididas con el usuario el 2026-10-21):
 *   - Solo datos vigentes (`fresh`), como en el resto de Finax.
 *   - Nunca intenta adivinar el mercado: una caída o una subida fuerte nunca
 *     cambia cuánto inviertes; se explica por qué seguir con el plan.
 *   - Tipos de producto como referencia (cuenta, depósito), nunca productos ni
 *     entidades (CNMV).
 *
 *   equity-drop / equity-rise  la bolsa ha caído ≥ 8 % o subido ≥ 10 % en un mes (`strongEquityMove`)
 *   safe-vs-inflation          lo que paga el ahorro seguro (tipo del BCE) frente a la inflación
 *   variable-debt:<id>         cuota estimada de una deuda variable con el Euríbor de hoy
 *   idle-loss                  lo que pierde con la inflación tu dinero sin destino (solo si se pasa
 *                              `idleCents`: «Tu plan» ya lo explica en su paso; no se usa en la app)
 */
import { formatCents } from '../../money'
import { repricing } from '../../finance/debts'
import type { EquityMove } from '../../market/moves'
import type { ContextIndicator } from '../../market/types'
import type { Debt } from '../../types'
import { inflationPhrase, yearlyLossCents, type InflationRef } from './inflation'

export interface MarketSignal {
  id: string
  /** `calm`: no hagas nada distinto · `info`: para decidir mejor · `warning`: te afecta al bolsillo. */
  tone: 'calm' | 'info' | 'warning'
  title: string
  text: string
}

export interface MarketSignalsInput {
  /** Indicadores del contexto de mercado, con su frescura. */
  indicators: readonly ContextIndicator[]
  move: EquityMove | null
  /** El plan invierte cada mes o ya tienes inversiones en bolsa: solo entonces importa la bolsa. */
  invests: boolean
  inflation: InflationRef
  debts: readonly Debt[]
  /** Dinero sin destino del plan (paso `idle-money`), para decir cuánto pierde quieto. */
  idleCents?: number
}

/** Cambio de cuota a partir del cual se avisa (en % de la cuota de ahora). */
export const VARIABLE_DEBT_NOTICE_PCT = 2

const pct = (n: number, decimals = 1) => `${String(Math.round(n * 10 ** decimals) / 10 ** decimals).replace('.', ',')} %`

/** Valor de un indicador solo si está vigente. */
export function freshValue(indicators: readonly ContextIndicator[], key: string): number | null {
  const i = indicators.find((x) => x.key === key)
  return i && i.freshness === 'fresh' && typeof i.value === 'number' && Number.isFinite(i.value) ? i.value : null
}

/** Lo que paga hoy el ahorro seguro como referencia: el tipo de depósito del BCE, si está vigente. */
export function safeRatePct(indicators: readonly ContextIndicator[]): number | null {
  const v = freshValue(indicators, 'ecb-dfr')
  return v !== null && v >= 0 && v < 15 ? v : null
}

export function marketSignals(input: MarketSignalsInput): MarketSignal[] {
  const out: MarketSignal[] = []
  const m = input.move
  if (m && input.invests) {
    const amount = pct(Math.abs(m.pct))
    out.push(
      m.direction === 'drop'
        ? {
            id: 'equity-drop',
            tone: 'calm',
            title: `La bolsa ha bajado un ${amount} en un mes`,
            text: `El ${m.label} ha caído un ${amount} en unas ${Math.round(m.days / 7)} semanas. Pasa de vez en cuando con la renta variable y tu plan no cambia: sigue con tus aportaciones de cada mes; con la bolsa más barata, compras más con el mismo dinero. Vender ahora convertiría la bajada en una pérdida de verdad.`,
          }
        : {
            id: 'equity-rise',
            tone: 'calm',
            title: `La bolsa ha subido un ${amount} en un mes`,
            text: `El ${m.label} ha subido un ${amount} en unas ${Math.round(m.days / 7)} semanas. Tu plan no cambia: no metas más de lo previsto por haber subido ni intentes adivinar cuándo bajará. Si tu mezcla se descuadra, tu plan ya lo corrige con lo que aportas cada mes.`,
          },
    )
  }

  const safe = safeRatePct(input.indicators)
  if (safe !== null && input.inflation.source === 'ine') {
    const loses = safe < input.inflation.pct
    out.push({
      id: 'safe-vs-inflation',
      tone: 'info',
      title: loses ? 'Tu ahorro seguro no le gana a la inflación' : 'Tu ahorro seguro le gana algo a la inflación',
      text: loses
        ? `El BCE paga un ${pct(safe, 2)} y la inflación está en el ${pct(input.inflation.pct)}: el dinero en cuentas y depósitos pierde algo de poder de compra. Para tu colchón está bien, porque su trabajo es estar disponible, pero no guardes ahí más de lo que dice tu plan. Al elegir dónde, compara la TAE con ese ${pct(safe, 2)}: si te pagan mucho menos (o nada), hay cuentas y depósitos que pagan más.`
        : `El BCE paga un ${pct(safe, 2)} y la inflación está en el ${pct(input.inflation.pct)}: el ahorro seguro mantiene tu poder de compra. Al elegir dónde guardar tu colchón, compara la TAE con ese ${pct(safe, 2)}: si te pagan mucho menos (o nada), hay cuentas y depósitos que pagan más.`,
    })
  }

  const idleLoss = input.idleCents && input.inflation.source === 'ine' ? yearlyLossCents(input.idleCents, input.inflation) : 0
  if (idleLoss > 0)
    out.push({
      id: 'idle-loss',
      tone: 'warning',
      title: `Tus ${formatCents(input.idleCents ?? 0)} sin destino pierden unos ${formatCents(idleLoss)} al año`,
      text: `Es dinero que no necesitan ni tu colchón ni tus objetivos. Quieto en la cuenta, con ${inflationPhrase(input.inflation)}, pierde poder de compra cada mes. Tu plan te dice qué hacer con él.`,
    })

  const euribor = freshValue(input.indicators, 'euribor-12m')
  if (euribor !== null) {
    for (const d of input.debts) {
      const r = repricing(d, euribor)
      if (!r || d.monthlyPaymentCents <= 0) continue
      const change = ((r.newPaymentCents - d.monthlyPaymentCents) / d.monthlyPaymentCents) * 100
      if (Math.abs(change) < VARIABLE_DEBT_NOTICE_PCT) continue
      const up = change > 0
      out.push({
        id: `variable-debt:${d.id}`,
        tone: up ? 'warning' : 'info',
        title: `Tu cuota de «${d.name}» podría ${up ? 'subir' : 'bajar'} a unos ${formatCents(Math.round(r.newPaymentCents / 100) * 100)} al mes`,
        text: `Con el Euríbor de hoy (${pct(euribor, 3)}) más tu diferencial (${pct((d.variableSpreadBp ?? 0) / 100, 2)}), tu interés sería del ${pct(r.newAprPct, 2)} y, para terminar en el mismo plazo, pagarías unos ${formatCents(Math.round(r.newPaymentCents / 100) * 100)} al mes (ahora, ${formatCents(d.monthlyPaymentCents)}). Es una estimación: el banco usa el Euríbor del mes de la revisión.${up ? ' Si sube, revisa tu plan cuando llegue la carta del banco.' : ''}`,
      })
    }
  }
  return out
}
