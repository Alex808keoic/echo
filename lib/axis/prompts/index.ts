/**
 * Ensamblado de los prompts de sistema de AXIS a partir de bloques
 * reutilizables: contrato (qué recibe), seguridad (qué no puede hacer),
 * memoria (precedencia y propuestas), personalidad (cómo comunica) y salida
 * (qué devuelve). Cada prompt es una concatenación fija y estable (cacheable).
 *
 * `__tests__/prompts.test.ts` garantiza que el prompt legacy del análisis es
 * byte a byte el original (no lleva la voz), y que el del chat coincide con su
 * golden, regenerable solo de forma deliberada (`UPDATE_GOLDEN=1`).
 */
import { PERSONALITY } from '../personality'
import { CONTRACT } from './contract'
import { MEMORY } from './memory'
import { OUTPUT } from './output'
import { SAFETY } from './safety'

const section = (title: string, lines: readonly string[]) => [title, ...lines].join('\n')
const prompt = (sections: readonly string[]) => sections.join('\n\n')

/** Prompt de sistema del análisis (DATOS → … → CONCLUSIÓN). */
export const AXIS_SYSTEM_PROMPT = prompt([
  PERSONALITY.identity.analysis,
  CONTRACT.analysis.mission,
  section('REGLAS SOBRE LOS DATOS', [
    CONTRACT.analysis.cents,
    CONTRACT.analysis.euroFormat,
    SAFETY.analysis.noInvent,
    SAFETY.analysis.noMarketOutsideContext,
    CONTRACT.analysis.marketFreshness,
    MEMORY.analysis.userMemories,
    SAFETY.analysis.quality,
  ]),
  section('REGLAS SOBRE LAS RECOMENDACIONES', [
    SAFETY.analysis.neverExecutes,
    SAFETY.analysis.derivedAndPrudent,
    SAFETY.analysis.noAssumptions,
    CONTRACT.analysis.noActionIsValid,
    OUTPUT.analysis.prioritize,
  ]),
  section('TONO', [PERSONALITY.tone.analysis]),
  section('SALIDA', [OUTPUT.analysis.jsonOnly]),
])

/** Prompt de sistema de la conversación (cuatro niveles de contexto). */
export const AXIS_CHAT_SYSTEM_PROMPT = prompt([
  PERSONALITY.identity.chat,
  section(CONTRACT.chat.levelsTitle, [CONTRACT.chat.levelData, MEMORY.chat.level, CONTRACT.chat.levelConversation, CONTRACT.chat.levelQuery]),
  section('REGLAS SOBRE LOS DATOS', [
    CONTRACT.chat.useFigures,
    MEMORY.chat.precedence,
    SAFETY.chat.noInvent,
    SAFETY.chat.quality,
    CONTRACT.chat.euroFormat,
  ]),
  section('REGLAS SOBRE LA MEMORIA', [MEMORY.chat.onlyStored, MEMORY.chat.reasonWithIt, MEMORY.chat.proposals, SAFETY.chat.noSecrets]),
  section('REGLAS SOBRE LAS RECOMENDACIONES', [
    SAFETY.chat.neverExecutes,
    PERSONALITY.style.reasoned,
    SAFETY.chat.noAssumptions,
    PERSONALITY.style.noDisclaimer,
  ]),
  section('VOZ Y FORMATO', [PERSONALITY.tone.chat, ...Object.values(PERSONALITY.voice), PERSONALITY.style.brevity, OUTPUT.chat.fields, OUTPUT.chat.jsonOnly]),
])
