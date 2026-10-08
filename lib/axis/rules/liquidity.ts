/**
 * Reglas de liquidez: el líquido negativo (`liquidity.negative`, sin perfil,
 * ver `negativeLiquidity`) y la liquidez mínima (perfil · `minLiquidityCents`).
 *
 * La de liquidez mínima EXISTE por el perfil: sin un mínimo declarado no
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

/**
 * Líquido negativo (`liquidity.negative`): no depende del perfil. Mira el
 * signo del líquido, no el colchón: con el líquido por debajo de cero no hay
 * margen propio para nada, aunque el mes deje ahorro. `high` (como
 * `liquidity.below-min`): por delante del mercado y del ahorro del mes, por
 * detrás de `expenses.over-income`. Solo acciones que Finax soporta: revisar
 * los datos (un negativo también aparece si falta un ingreso o el saldo
 * inicial no es el real) y priorizar volver a positivo. Sin saldo inicial no
 * se juzga, igual que el mínimo: la liquidez no es calculable de forma válida.
 */
function negativeLiquidity(ctx: Parameters<Rule>[0]): Signal | null {
  const { liquidCents, totalCents } = ctx.wealth
  if (!ctx.quality.hasInitialBalance || liquidCents >= 0) return null
  return {
    id: 'liquidity.negative',
    domain: 'savings',
    priority: 'high',
    fact: `Tu dinero líquido es negativo: ${eur(liquidCents)}${totalCents < 0 ? `, y tu patrimonio total también (${eur(totalCents)})` : ''}.`,
    interpretation: 'Con el líquido por debajo de cero no hay margen propio: tus objetivos no reciben dinero y un imprevisto empeoraría la situación.',
    recommendation: {
      what: 'Comprueba tu saldo inicial y tus movimientos y, si son correctos, prioriza volver a un líquido positivo antes de cualquier otro destino del dinero.',
      why: 'Mientras el líquido sea negativo, ningún otro plan se puede financiar con dinero propio.',
      nextStep: { label: 'Ver Mi Dinero', to: 'dinero' },
      action: { verb: 'review', target: 'data' },
    },
    uncertainty: {
      title: 'Puede faltar información',
      detail: 'Un líquido negativo también aparece si falta algún ingreso por registrar o el saldo inicial no es el real.',
    },
  }
}

export const liquidityRules: Rule = (ctx, _market, profile) => {
  const negative = negativeLiquidity(ctx)
  const shortfall = liquidityShortfall(ctx, profile)
  if (!shortfall) return negative ? [negative] : []
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
          // Sin acción manual: los objetivos reciben dinero solos; el reparto no aparta el colchón.
          alternative: {
            name: 'Dejar el reparto como está',
            summary: `Tus objetivos siguen recibiendo dinero automáticamente según su orden (ahora «${pendingObjective.name}»), pero el reparto no aparta tu colchón: mientras tanto tendrás menos margen del que fijaste. Es válido si lo aceptas durante un tiempo.`,
          },
        }
      : {}),
    profileInfluence: [{ field: 'minLiquidityCents', sourceMemoryId, signalId: 'liquidity.below-min', effect: 'added-signal' }],
  }
  // Negativo y por debajo del mínimo: conviven (el mínimo no cambia de significado); lidera el negativo.
  return negative ? [negative, signal] : [signal]
}
