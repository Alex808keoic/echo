/**
 * Regla de liquidez mínima (perfil · `minLiquidityCents`).
 *
 * Es la única regla que EXISTE por el perfil: sin un mínimo declarado no
 * emite nada. Su hecho sigue siendo objetivo — la liquidez actual del
 * contexto frente al mínimo que el usuario ha fijado — y el déficit lo
 * calcula AXIS. La comparación (`liquidityShortfall`, shared.ts) es la misma
 * que usa `savings.healthy` para retirar su alternativa «Mantener liquidez».
 *
 *   liquido < mínimo   →  `liquidity.below-min`, high, recomendación
 *                         complete-cushion / cushion (acción cerrada de AXIS)
 *   liquido ≥ mínimo   →  nada (cubierto)
 *   sin saldo inicial  →  nada (la liquidez no es calculable de forma válida)
 *
 * Una situación crítica (`expenses.over-income`) sigue por delante: esta
 * señal es `high`, nunca `critical`. Toda su influencia queda trazada en
 * `profileInfluence` (campo, memoria de origen, señal, efecto).
 */
import type { Signal } from '../types'
import { eur, liquidityShortfall, type Rule } from './shared'

export const liquidityRules: Rule = (ctx, _market, profile) => {
  const shortfall = liquidityShortfall(ctx, profile)
  if (!shortfall) return []
  const { minCents, liquidCents, deficitCents, sourceMemoryId } = shortfall
  const pendingObjective = ctx.objectives.find((o) => !o.completed)

  const signal: Signal = {
    id: 'liquidity.below-min',
    domain: 'savings',
    priority: 'high',
    fact: `Quieres mantener al menos ${eur(minCents)} líquidos y hoy tienes ${eur(liquidCents)}: faltan ${eur(deficitCents)}.`,
    interpretation: 'Estás por debajo del colchón que tú mismo has fijado: un gasto imprevisto tendría que salir de otros planes.',
    recommendation: {
      what: `Completa tu colchón hasta ${eur(minCents)} antes de destinar ahorro a otros fines.`,
      why: 'Es el mínimo que has decidido mantener; mientras no esté cubierto, cualquier otro destino del ahorro se financia con menos margen del que quieres.',
      nextStep: { label: 'Ver Mi Dinero', to: 'dinero' },
      action: { verb: 'complete-cushion', target: 'cushion' },
    },
    ...(pendingObjective
      ? {
          alternative: {
            name: 'Aportar al objetivo antes que al colchón',
            summary: `Seguir con «${pendingObjective.name}» y completar el colchón después; es válido si aceptas ese margen menor durante un tiempo.`,
          },
        }
      : {}),
    profileInfluence: [{ field: 'minLiquidityCents', sourceMemoryId, signalId: 'liquidity.below-min', effect: 'added-signal' }],
  }
  return [signal]
}
