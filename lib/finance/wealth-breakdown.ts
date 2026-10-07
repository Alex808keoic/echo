/**
 * Desglose del patrimonio para el donut de Mi Dinero: disponible, destinado a
 * objetivos e inversiones, con su porcentaje sobre el total.
 *
 * Solo tiene sentido en porcentajes si todas las partes son positivas. Con el
 * líquido en negativo, las partes ya no suman el patrimonio (el donut
 * enseñaba «Inversiones 100 %» junto a un total menor que esas inversiones),
 * así que no se reparte: se muestran las cifras tal cual.
 */
import { roundedShares } from './summary'

export interface BreakdownInput {
  liquidCents: number
  destinedCents: number
  availableCents: number
  investedCents: number
}

export interface BreakdownPart {
  key: 'disponible' | 'objetivos' | 'inversiones'
  label: string
  amount: number
  pct: number
}

export type WealthBreakdown = { kind: 'empty' } | { kind: 'negative-liquid' } | { kind: 'parts'; parts: BreakdownPart[] }

export function wealthBreakdown({ liquidCents, destinedCents, availableCents, investedCents }: BreakdownInput): WealthBreakdown {
  if (liquidCents < 0) return { kind: 'negative-liquid' }
  const parts = [
    { key: 'disponible' as const, label: 'Disponible', amount: availableCents },
    { key: 'objetivos' as const, label: 'Destinado a objetivos', amount: destinedCents },
    { key: 'inversiones' as const, label: 'Inversiones', amount: investedCents },
  ].filter((p) => p.amount > 0)
  if (parts.length === 0) return { kind: 'empty' }
  const shares = roundedShares(parts.map((p) => p.amount))
  return { kind: 'parts', parts: parts.map((p, i) => ({ ...p, pct: shares[i] })) }
}
