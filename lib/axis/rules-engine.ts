/**
 * MOTOR LOCAL DE REGLAS — AXIS
 * ------------------------------------------------------------------
 * NO es inteligencia artificial. Es lógica determinista sobre los datos
 * locales del usuario, sin conexión, sin modelo de lenguaje y sin datos de
 * mercado. La interfaz lo identifica como tal (`engine.isAI = false`).
 *
 * Cuando se conecte un motor de IA, este archivo queda como fallback offline.
 * Todos los importes que cita salen del contexto real; no inventa cifras.
 */
import { formatCents } from '../money'
import { formatPct } from '../format'
import type {
  AxisAlternative,
  AxisAnalysis,
  AxisContext,
  AxisEngine,
  AxisUncertainty,
  Confidence,
} from './types'

export const LOCAL_RULES_ENGINE_INFO = {
  id: 'local-rules',
  label: 'Motor local de reglas',
  isAI: false,
} as const

const pct = (n: number) => formatPct(Math.round(n))

function buildAnalysis(ctx: AxisContext): AxisAnalysis {
  const facts: string[] = [
    `Patrimonio total: ${formatCents(ctx.patrimonioCents)} (líquido ${formatCents(ctx.liquidCents)}${
      ctx.investedCents > 0 ? `, invertido ${formatCents(ctx.investedCents)}` : ''
    }).`,
    `Este mes: ingresos ${formatCents(ctx.monthIncomeCents)} y gastos ${formatCents(ctx.monthExpenseCents)}.`,
  ]
  if (ctx.monthTopExpense) {
    facts.push(
      `Mayor gasto del mes: ${ctx.monthTopExpense.label} (${formatCents(ctx.monthTopExpense.cents)}, ${pct(ctx.monthTopExpense.pct)} del gasto).`,
    )
  }
  if (ctx.objectives.length > 0) {
    const saved = ctx.objectives.reduce((t, o) => t + Math.min(o.currentCents, o.targetCents), 0)
    const target = ctx.objectives.reduce((t, o) => t + o.targetCents, 0)
    facts.push(
      `${ctx.objectives.length} objetivo${ctx.objectives.length === 1 ? '' : 's'}: ${formatCents(saved)} de ${formatCents(target)}.`,
    )
  }

  const balance = ctx.monthIncomeCents - ctx.monthExpenseCents
  const savingRate = ctx.monthIncomeCents > 0 ? (balance / ctx.monthIncomeCents) * 100 : null
  const expenseTrend =
    ctx.previousMonthExpenseCents > 0
      ? ((ctx.monthExpenseCents - ctx.previousMonthExpenseCents) / ctx.previousMonthExpenseCents) * 100
      : null

  const alternatives: AxisAlternative[] = []
  const uncertainties: AxisUncertainty[] = []
  let interpretation: string
  let recommendation: AxisAnalysis['recommendation']
  let conclusion: string
  let nextStep: AxisAnalysis['nextStep']
  let headline: string
  let confidence: Confidence = ctx.historyDays >= 10 ? 'media' : 'baja'

  const pendingObjective = ctx.objectives.find((o) => o.currentCents < o.targetCents)

  if (ctx.monthIncomeCents === 0 && ctx.monthExpenseCents === 0) {
    interpretation = 'Todavía no hay movimientos este mes, así que no se puede valorar tu ritmo actual.'
    headline = 'Aún no hay movimientos este mes. Registra ingresos y gastos para obtener una lectura.'
    conclusion = 'Sin datos del mes en curso no conviene actuar. Registra tus movimientos y vuelve a consultar.'
    nextStep = { label: 'Registrar un movimiento', to: 'movimientos' }
    confidence = 'baja'
  } else if (balance < 0) {
    interpretation = `Este mes gastas más de lo que ingresas: el balance es ${formatCents(balance, true)}. Tu patrimonio líquido está bajando.`
    headline = `Gastas más de lo que ingresas este mes (${formatCents(balance, true)}). Conviene revisar el gasto.`
    recommendation = {
      what: ctx.monthTopExpense
        ? `Revisa el gasto en ${ctx.monthTopExpense.label}, tu mayor partida del mes.`
        : 'Revisa tus gastos del mes para recuperar un balance positivo.',
      why: `Con un balance negativo cualquier objetivo se aleja. ${
        ctx.monthTopExpense
          ? `${ctx.monthTopExpense.label} concentra ${pct(ctx.monthTopExpense.pct)} del gasto.`
          : ''
      }`.trim(),
    }
    alternatives.push({
      name: 'No cambiar nada todavía',
      summary: 'Si el balance negativo es puntual (un gasto excepcional), puede bastar con vigilar el mes que viene.',
    })
    conclusion = 'Prioridad: volver a un balance mensual positivo antes de plantear ahorro o inversión.'
    nextStep = { label: 'Ver gastos por categoría', to: 'estadisticas' }
  } else if (savingRate !== null && savingRate >= 20) {
    interpretation = `Ahorras alrededor del ${pct(savingRate)} de tus ingresos este mes. Es un ritmo sólido.`
    headline = `Buen ritmo: ahorras cerca del ${pct(savingRate)} de tus ingresos este mes.`
    if (pendingObjective) {
      const remaining = pendingObjective.targetCents - pendingObjective.currentCents
      recommendation = {
        what: `Destina parte del excedente (${formatCents(balance)}) a «${pendingObjective.name}».`,
        why: `Te faltan ${formatCents(remaining)} para alcanzarlo y tu balance del mes lo permite.`,
      }
      nextStep = { label: 'Actualizar objetivo', to: 'objetivos' }
    } else if (ctx.objectives.length === 0) {
      recommendation = {
        what: 'Define un objetivo de ahorro para dar destino a tu excedente.',
        why: 'Sin objetivo no hay forma de saber para qué estás ahorrando ni si vas bien.',
      }
      nextStep = { label: 'Crear objetivo', to: 'objetivos' }
    } else {
      conclusion = 'Tus objetivos están cubiertos y tu balance es positivo: no hace falta actuar.'
    }
    alternatives.push({
      name: 'Mantener liquidez',
      summary: 'Conservar el excedente como colchón si no tienes un fondo de emergencia claro.',
    })
    conclusion ??= 'Mantén el ritmo. Con este balance, avanzar en tus objetivos es realista.'
  } else {
    interpretation = `Tu balance del mes es positivo (${formatCents(balance, true)}) pero ajustado${
      savingRate !== null ? `: ahorras alrededor del ${pct(savingRate)} de lo que ingresas` : ''
    }.`
    headline = `Balance positivo pero ajustado este mes (${formatCents(balance, true)}).`
    recommendation = ctx.monthTopExpense
      ? {
          what: `Revisa si puedes reducir ${ctx.monthTopExpense.label}, tu mayor gasto del mes.`,
          why: `Concentra ${pct(ctx.monthTopExpense.pct)} del gasto; un pequeño ajuste ahí tiene más efecto que en el resto.`,
        }
      : undefined
    alternatives.push({
      name: 'No actuar',
      summary: 'Si el mes es representativo, un margen pequeño pero estable también es aceptable.',
    })
    conclusion = 'Situación estable. Un ajuste moderado en el gasto principal mejoraría tu margen.'
    nextStep = { label: 'Ver estadísticas', to: 'estadisticas' }
  }

  if (expenseTrend !== null && Math.abs(expenseTrend) >= 15) {
    facts.push(
      `Gasto un ${pct(Math.abs(expenseTrend))} ${expenseTrend > 0 ? 'mayor' : 'menor'} que el mes anterior.`,
    )
  }

  if (ctx.historyDays < 10) {
    uncertainties.push({
      title: 'Historial corto',
      detail: `Solo hay ${ctx.historyDays} día${ctx.historyDays === 1 ? '' : 's'} con movimientos. Un mes puede no ser representativo.`,
    })
  }
  if (ctx.previousMonthExpenseCents === 0) {
    uncertainties.push({
      title: 'Sin mes anterior',
      detail: 'No hay gastos del mes pasado con los que comparar la tendencia.',
    })
  }
  if (ctx.positions.length > 0) {
    uncertainties.push({
      title: 'Valor de inversiones manual',
      detail: 'El valor de tus posiciones lo has introducido tú; no hay cotizaciones conectadas.',
    })
  }
  uncertainties.push({
    title: 'Sin información de mercado',
    detail: 'Este análisis no considera contexto económico externo.',
  })

  return {
    facts,
    interpretation,
    recommendation,
    alternatives,
    uncertainties,
    confidence,
    conclusion,
    nextStep,
    headline,
    generatedAt: new Date().toISOString(),
    engine: LOCAL_RULES_ENGINE_INFO,
  }
}

export const localRulesEngine: AxisEngine = {
  info: LOCAL_RULES_ENGINE_INFO,
  analyze: (context) => Promise.resolve(buildAnalysis(context)),
}
