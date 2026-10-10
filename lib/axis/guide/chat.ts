/**
 * La guía para invertir en el chat. Si el mensaje nombra tipos de producto
 * («¿qué es un ETF?», «estoy mirando un fondo indexado»), el chat recibe su
 * ficha de la guía y si encajan con el plan del usuario (guide/fit.ts), igual
 * con IA que sin ella. Información general y encaje: nunca «cómpralo».
 */
import { extractFigures, type AllowedFigure } from '../core/figures'
import { buildAllocationPlan } from '../plan/allocation'
import type { AxisDecision } from '../types'
import { productFit, type ProductFit } from './fit'
import { matchProductTypes, RISK_LABEL, type ProductType } from './products'

/** Como mucho tantos tipos por mensaje (el resto, en la pantalla de la guía). */
export const MAX_GUIDE_TYPES = 2

export interface ChatGuide {
  types: ProductType[]
  fits: ProductFit[]
}

export function chatGuideOf(message: string, decision: AxisDecision): ChatGuide | null {
  const types = matchProductTypes(message).slice(0, MAX_GUIDE_TYPES)
  if (types.length === 0 || decision.level === 'none') return null
  const plan = buildAllocationPlan(decision)
  return { types, fits: types.map((t) => productFit(t, plan, decision.profile.fields)) }
}

/** Bloque `guia_para_invertir` del prompt del chat. */
export function guideForPrompt({ types, fits }: ChatGuide) {
  return {
    tipos: types.map((t) => ({ nombre: t.name, que_es: t.what, para_que: t.goodFor, riesgo: RISK_LABEL[t.risk], plazo: t.horizon, como_compararlo: t.compare, tener_en_cuenta: t.warnings })),
    encaje_con_su_plan: fits.map((f) => ({ producto: f.product, veredicto: f.headline, motivos: f.reasons, comprobar: f.checks })),
    como_usarlo:
      'Es la guía de Finax: información general sobre el TIPO de producto y si encaja con su plan. Explícalo con tus palabras usando solo esto. Nunca le digas que compre, venda o invierta en él, ni nombres marcas, fondos, gestoras ni brókers concretos. Si quiere una recomendación concreta, dile que solo puede dársela una entidad autorizada (CNMV o Banco de España) y que en «Guía para invertir» tiene cómo comprobarlo.',
  }
}

/** Cifras de la guía (escritas por Finax): el chat puede citarlas. */
export function guideFigures(guide: ChatGuide | null): AllowedFigure[] {
  if (!guide) return []
  const texts = [...guide.types.flatMap((t) => [t.what, t.goodFor, t.horizon, ...t.compare, ...t.warnings]), ...guide.fits.flatMap((f) => [...f.reasons, ...f.checks])]
  return texts.flatMap((text) =>
    extractFigures(text).flatMap((f): AllowedFigure[] => {
      const n = Number(f.key.slice(2))
      if (f.kind === 'money') return [{ key: f.key, kind: 'money', cents: Math.round(n * 100), text: f.raw.trim(), label: 'Guía para invertir', source: 'decision-text' }]
      if (f.kind === 'percent' || f.kind === 'count') return [{ key: f.key, kind: f.kind, value: n, text: f.raw.trim(), label: 'Guía para invertir', source: 'decision-text' }]
      return []
    }),
  )
}

/** La guía en texto, para la respuesta sin IA. */
export function guideLocalReply({ types, fits }: ChatGuide): string {
  const parts = types.map((t, i) => {
    const fit = fits[i]
    return `Sobre ${t.name.toLowerCase()}: ${t.what} Riesgo ${RISK_LABEL[t.risk].toLowerCase()}; plazo: ${t.horizon.toLowerCase()}.\n\nCon tu plan: ${fit.headline.toLowerCase()}. ${fit.reasons.join(' ')}`
  })
  return `${parts.join('\n\n')}\n\nEs información general, no una recomendación: Finax no te dice qué comprar. En «Guía para invertir» tienes qué comprobar antes de decidir.`
}
