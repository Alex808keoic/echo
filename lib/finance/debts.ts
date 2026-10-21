/**
 * Cálculos de deudas: cuándo terminas, cuánto te cuestan en intereses y qué
 * ganas pagando más cada mes. Puros, en céntimos; el interés es el anual
 * (TAE) repartido por meses, como un préstamo con cuota fija.
 */

/** Interés a partir del cual una deuda es cara: devolverla antes gana a cualquier inversión razonable. */
export const DEBT_EXPENSIVE_PCT = 7
/** Por debajo de esto, una deuda es barata (p. ej. una hipoteca): no hace falta adelantar pagos. */
export const DEBT_CHEAP_PCT = 3
/** Cuotas por encima de este % de tus ingresos: demasiada carga (la referencia de los bancos es 30–35 %). */
export const DEBT_LOAD_MAX_PCT = 35
/** Límite de la simulación: 50 años. */
const MAX_MONTHS = 600

export const aprPctOf = (aprBp: number) => aprBp / 100

/** Recorre la deuda mes a mes; `null` si la cuota no llega a cubrir los intereses o pasa de 50 años. */
function amortize(balanceCents: number, aprPct: number, paymentCents: number): { months: number; interestCents: number } | null {
  if (balanceCents <= 0) return { months: 0, interestCents: 0 }
  if (paymentCents <= 0) return null
  const r = Math.max(0, aprPct) / 100 / 12
  let balance = balanceCents
  let interest = 0
  for (let m = 1; m <= MAX_MONTHS; m++) {
    const i = balance * r
    if (paymentCents <= i) return null
    interest += i
    balance = balance + i - paymentCents
    if (balance <= 0.5) return { months: m, interestCents: Math.round(interest) }
  }
  return null
}

/** Meses que faltan para terminar de pagar con la cuota de ahora; `null` si así no se termina nunca. */
export function payoffMonths(balanceCents: number, aprPct: number, paymentCents: number): number | null {
  return amortize(balanceCents, aprPct, paymentCents)?.months ?? null
}

/** Intereses que quedan por pagar con la cuota de ahora; `null` si así no se termina nunca. */
export function remainingInterestCents(balanceCents: number, aprPct: number, paymentCents: number): number | null {
  return amortize(balanceCents, aprPct, paymentCents)?.interestCents ?? null
}

/** Cuota fija de un préstamo nuevo (sistema francés), redondeada al céntimo hacia arriba. */
export function annuityPaymentCents(principalCents: number, aprPct: number, months: number): number {
  if (principalCents <= 0 || months <= 0) return 0
  const r = Math.max(0, aprPct) / 100 / 12
  if (r === 0) return Math.ceil(principalCents / months)
  return Math.ceil((principalCents * r) / (1 - Math.pow(1 + r, -months)))
}

/** Qué cambia pagando `extraCents` más al mes: meses e intereses que te ahorras. `null` si ni así se termina. */
export function extraPaymentEffect(
  balanceCents: number,
  aprPct: number,
  paymentCents: number,
  extraCents: number,
): { months: number; monthsSaved: number | null; interestSavedCents: number | null } | null {
  const faster = amortize(balanceCents, aprPct, paymentCents + Math.max(0, extraCents))
  if (!faster) return null
  const now = amortize(balanceCents, aprPct, paymentCents)
  return {
    months: faster.months,
    monthsSaved: now ? now.months - faster.months : null,
    interestSavedCents: now ? Math.max(0, Math.round((now.interestCents - faster.interestCents) / 100) * 100) : null,
  }
}

/** Revisión de una deuda variable con el Euríbor de hoy. */
export interface Repricing {
  /** Interés que tendría: Euríbor + diferencial. */
  newAprPct: number
  /** Cuota para terminar en los mismos meses que ahora, con ese interés. */
  newPaymentCents: number
  /** Meses que quedan con la cuota de ahora. */
  months: number
}

/**
 * Cuota estimada en la próxima revisión de una deuda variable: el mismo plazo
 * que le queda hoy, con Euríbor + diferencial. Es una estimación: el banco
 * usa el Euríbor del mes de la revisión. `null` si no es variable o si con la
 * cuota de hoy no se termina nunca.
 */
export function repricing(debt: { balanceCents: number; aprBp: number; monthlyPaymentCents: number; variableSpreadBp?: number }, euriborPct: number): Repricing | null {
  if (debt.variableSpreadBp === undefined || debt.balanceCents <= 0 || !Number.isFinite(euriborPct)) return null
  const months = payoffMonths(debt.balanceCents, aprPctOf(debt.aprBp), debt.monthlyPaymentCents)
  if (months === null || months === 0) return null
  const newAprPct = Math.round((euriborPct + debt.variableSpreadBp / 100) * 1000) / 1000
  return { newAprPct, newPaymentCents: annuityPaymentCents(debt.balanceCents, Math.max(0, newAprPct), months), months }
}
