/**
 * «¿Por qué?» de cada paso del plan: las razones salen de tus datos y de TUS
 * respuestas (citadas con las palabras del cuestionario), con reglas fijas.
 * Las usan la pantalla «Tu plan», el chat de AXIS y la respuesta sin IA.
 * Nunca añaden cifras que el plan no tenga.
 */
import { formatCents } from '../../money'
import { PROFILE_QUESTIONS, type ProfileQuestionId } from '../profile/questionnaire'
import type { ReconciledProfile } from '../profile/types'
import { CUSHION_MONTHS, planRisk, SHORT_TERM_MONTHS, type AllocationPlan, type PlanStep } from './allocation'
import { RISKY_MAX_PCT, RISKY_MIN_IDLE_MONTHS } from './mix'
import { inflationPhrase } from './inflation'

type Profile = Pick<
  ReconciledProfile,
  'riskAttitude' | 'horizon' | 'irregularIncome' | 'minLiquidityCents' | 'adult' | 'work' | 'dependents' | 'investingExperience' | 'lossCapacity'
>

/** «Respondiste «En más de 5 años»» para la respuesta guardada; `null` si no hay. */
function answer(id: ProfileQuestionId, value: unknown): string | null {
  const option = PROFILE_QUESTIONS.find((q) => q.id === id)?.options.find((o) => o.fact.value === value)
  return option ? `«${option.label}»` : null
}

const MIX_BY_RISK = {
  conservative: 'más renta fija que renta variable, porque prefieres no arriesgar',
  balanced: 'sobre todo renta variable global, con una parte de renta fija que da estabilidad',
  dynamic: 'casi todo en renta variable global, porque llevas bien los altibajos',
} as const

export function stepReasons(step: PlanStep, plan: AllocationPlan, profile: Profile): string[] {
  const why: string[] = []
  const risk = answer('riskAttitude', profile.riskAttitude)
  const horizon = answer('horizon', profile.horizon)
  switch (step.kind) {
    case 'create-cushion':
    case 'fill-cushion':
    case 'move-cushion-first': {
      if (step.kind === 'fill-cushion' && step.starter) {
        why.push('Tienes deudas caras: cada mes que tardas en devolverlas te cuesta intereses, así que de momento basta con un mes de gasto apartado para imprevistos.')
        why.push('Sin ese mínimo, un imprevisto te obligaría a endeudarte otra vez.')
        break
      }
      const c = plan.cushion
      if (c?.source === 'min-liquidity' && profile.minLiquidityCents !== undefined)
        why.push(`Dijiste que quieres tener siempre al menos ${formatCents(profile.minLiquidityCents)} líquidos.`)
      else if (c?.source === 'months') {
        const work = profile.work === 'self-employed' || profile.work === 'unemployed' ? answer('work', profile.work) : null
        if (profile.irregularIncome === true)
          why.push(`Respondiste ${answer('irregularIncome', true)} sobre tus ingresos: un mes flojo no debe obligarte a tocar tus objetivos, por eso la base son ${CUSHION_MONTHS.irregular} meses de gasto y no ${CUSHION_MONTHS.regular}.`)
        else if (work)
          why.push(`Sobre tu situación respondiste ${work}: tus ingresos pueden fallar sin aviso, por eso la base son ${CUSHION_MONTHS.irregular} meses de gasto y no ${CUSHION_MONTHS.regular}.`)
        else why.push(`${CUSHION_MONTHS.regular} meses de tu gasto habitual es lo normal con ingresos estables.`)
        if (profile.dependents === true)
          why.push(`A si alguien depende de tu dinero respondiste ${answer('dependents', true)}: un imprevisto no te afecta solo a ti, así que el colchón suma ${CUSHION_MONTHS.dependentsExtra} meses más${c.months ? ` (${c.months} en total)` : ''}.`)
      }
      why.push('Sin colchón, cualquier imprevisto te obligaría a sacar dinero invertido, quizá justo en un mal momento.')
      break
    }
    case 'short-term-objectives':
      why.push(`Los necesitas en ${SHORT_TERM_MONTHS / 12} años o menos: el dinero que vas a usar pronto no se arriesga, porque una inversión podría estar en pérdidas justo entonces.`)
      break
    case 'invest-long-term': {
      const applied = planRisk(profile)
      if (risk && applied === profile.riskAttitude) why.push(`Sobre el riesgo respondiste ${risk}: por eso la mezcla lleva ${MIX_BY_RISK[applied!]}.`)
      else if (risk && applied)
        why.push(`Sobre el riesgo respondiste ${risk}, pero a si una caída te obligaría a cambiar tus planes respondiste ${answer('lossCapacity', 'low')}: lo que puedes permitirte manda, así que la mezcla es equilibrada (${MIX_BY_RISK[applied]}) y sin parte arriesgada.`)
      if (horizon) why.push(`Sobre cuándo necesitarás el dinero respondiste ${horizon}${profile.horizon === 'medium' ? ': con un plazo medio, la mezcla lleva más renta fija' : ''}.`)
      if (step.noObjectives) why.push('No tienes objetivos pendientes, así que lo que te sobra no tiene otro destino: por eso se invierte una parte mayor.')
      else why.push('Tienes objetivos pendientes: por eso solo se invierte una parte y el resto va a ellos.')
      if (step.mix.some((p) => p.key === 'risky'))
        why.push(`Tienes la parte arriesgada (como mucho el ${RISKY_MAX_PCT} %) porque se cumplen todas las condiciones: perfil dinámico, algo de experiencia invirtiendo, plazo largo, colchón completo, ningún objetivo cercano con retraso y dinero parado de más de ${RISKY_MIN_IDLE_MONTHS} meses de gasto.`)
      else if (applied === 'dynamic' && profile.horizon === 'long' && profile.investingExperience === 'none')
        why.push(`A si has invertido alguna vez respondiste ${answer('investingExperience', 'none')}: por eso no hay parte arriesgada. Se empieza por lo diversificado, que es lo que mejor perdona los errores.`)
      if (step.rebalance) why.push('Lo que ya tienes invertido se ha alejado de tu mezcla: en vez de vender, lo nuevo va a lo que falta.')
      if (plan.inflation) why.push(`Con ${inflationPhrase(plan.inflation)}, el dinero quieto en la cuenta pierde poder de compra cada año; invertir a largo plazo busca crecer más que la inflación, aunque con altibajos.`)
      break
    }
    case 'idle-money':
      why.push('Tu colchón está completo y tus objetivos tienen lo que necesitan: este dinero no tiene ningún destino.')
      if (step.safe && horizon) why.push(`Sobre cuándo necesitarás el dinero respondiste ${horizon}: por eso no se invierte.`)
      else if (risk) why.push(`Se reparte con tu misma mezcla, que sale de tu respuesta sobre el riesgo: ${risk}.`)
      break
    case 'invest-for-goals':
      why.push('Para un objetivo a más de 5 años, invertir cada mes da tiempo a que las caídas se recuperen y a crecer más que la inflación.')
      if (risk) why.push(`Se reparte con tu respuesta sobre el riesgo (${risk}), a largo plazo y sin parte arriesgada: es dinero con destino.`)
      why.push('La cifra es lo que falta entre los meses que quedan, sin contar con la rentabilidad, para no prometer nada que el mercado no asegura.')
      break
    case 'move-goal-to-safe':
      why.push('Cerca de la fecha, una caída de la bolsa ya no tiene tiempo de recuperarse y podrías llegar con menos de lo que necesitas.')
      why.push('Hacerlo poco a poco evita venderlo todo justo en un mal momento.')
      break
    case 'invest-goal-money':
      why.push('Para un objetivo a más de 5 años, el dinero quieto en la cuenta pierde frente a la inflación; invertido tiene tiempo de recuperarse de las caídas.')
      if (risk) why.push(`Se reparte con tu respuesta sobre el riesgo (${risk}), a largo plazo y sin parte arriesgada: es dinero con destino.`)
      why.push('Cuando falten unos 3 años, lo prudente es irlo pasando a ahorro seguro, para que una caída no te pille justo antes.')
      break
    case 'pay-debt':
      why.push(`Una deuda al ${String(step.aprPct).replace('.', ',')} % te cuesta ese interés cada año, pase lo que pase. Devolverla antes es una rentabilidad segura; invertir no lo es.`)
      if (step.expectedReturnPct !== null && risk)
        why.push(`Con tu respuesta sobre el riesgo (${risk}), tu mezcla podría rendir unos ${String(step.expectedReturnPct).replace('.', ',')} % al año: menos de lo que te cuesta la deuda.`)
      why.push('Antes de ir a por la deuda se aparta un mes de gasto, para que un imprevisto no te obligue a endeudarte otra vez.')
      break
    case 'debt-choice':
      why.push('Con un interés medio, ninguna de las dos opciones es claramente mejor: invertir puede rendir más a largo plazo, pero devolver la deuda es seguro y te quita una cuota.')
      if (risk) why.push(`Si sobre el riesgo respondiste ${risk} y te quita el sueño deber dinero, devolverla antes también es una buena decisión.`)
      break
    case 'debt-load':
      why.push('Los bancos consideran sano que las cuotas no pasen del 30–35 % de tus ingresos: por encima, cualquier imprevisto te aprieta.')
      break
    case 'forecast-basis':
      why.push('Declaraste un ingreso fijo, así que no hace falta esperar a tener dos meses completos para empezar.')
      break
    default:
      break
  }
  return why
}
