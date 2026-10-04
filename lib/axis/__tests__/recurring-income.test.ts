/**
 * Memoria de AXIS · fase 1 · ingreso recurrente (`recurringIncome`).
 *
 * Un ingreso recurrente es una PREVISIÓN que el usuario declara («cada mes me
 * dan 35 € de paga»): solo mensual, solo en Paga / Regalos / Otros, en
 * céntimos enteros. Entra en el perfil derivado como el resto de hechos, pero
 * en esta fase no cambia ninguna decisión ni ninguna cifra financiera:
 * ni saldo, ni patrimonio, ni movimientos, ni objetivos.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyProposal, factEquals, factSlot, replacementFor } from '../chat/memory'
import { diagnoseProposal } from '../chat/validate'
import type { MemoryProposal, UserMemory } from '../chat/types'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { analyzeWithProvider, chatWithProvider } from '../ai/server/analyze'
import { composeLocalReply } from '../chat/local-reply'
import { analyzeLocally } from '../local-engine'
import type { AxisMemory } from '../types'
import type { MarketAIProvider } from '../../ai/providers/types'
import { deriveProfile, profileFromMemory, reconcileProfile } from '../profile/derive'
import { describeFact } from '../profile/describe'
import { isEmptyProfile, isValidMemoryFact, MEMORY_FACT_KINDS, PROFILE_LIMITS, RECURRING_INCOME_CATEGORIES, type MemoryFact } from '../profile/types'
import { INCOME_CATEGORIES } from '../../types'
import { db } from '../../db/db'
import { clearAllData } from '../../db/backup'
import { getAxisMemory } from '../../db/axis-memory'
import { listUserMemories, saveAcceptedProposal } from '../../db/axis-memories'
import { config, healthyMovements, objective, position, snapshot, TODAY } from './fixtures'

const PAGA: MemoryFact = { kind: 'recurringIncome', cents: 3_500, frequency: 'monthly', category: 'Paga' }
const income = (cents: number, category: 'Paga' | 'Regalos' | 'Otros' = 'Paga'): MemoryFact => ({ kind: 'recurringIncome', cents, frequency: 'monthly', category })
const mem = (id: string, updatedAt: number, fact?: MemoryFact, content = `Memoria ${id}.`): UserMemory => ({ id, content, category: 'financial_plan', importance: 'high', confidence: 0.9, source: 'conversation', createdAt: 0, updatedAt, ...(fact ? { fact } : {}) })

describe('recurringIncome · validación', () => {
  it('es un tipo de hecho conocido y sus categorías son las de ingreso de Finax', () => {
    assert.ok((MEMORY_FACT_KINDS as readonly string[]).includes('recurringIncome'))
    assert.deepEqual([...RECURRING_INCOME_CATEGORIES], ['Paga', 'Regalos', 'Otros'])
    assert.deepEqual([...RECURRING_INCOME_CATEGORIES], [...INCOME_CATEGORIES])
  })

  it('acepta un ingreso mensual en céntimos enteros en cada categoría permitida', () => {
    for (const category of RECURRING_INCOME_CATEGORIES) assert.ok(isValidMemoryFact(income(3_500, category)), category)
    assert.ok(isValidMemoryFact(income(PROFILE_LIMITS.RECURRING_INCOME_MIN_CENTS)))
    assert.ok(isValidMemoryFact(income(PROFILE_LIMITS.RECURRING_INCOME_MAX_CENTS)))
  })

  it('rechaza importes no enteros, nulos, negativos, fuera de rango o como texto', () => {
    for (const cents of [0, -3_500, 35.5, PROFILE_LIMITS.RECURRING_INCOME_MAX_CENTS + 1, Number.NaN, Number.POSITIVE_INFINITY, '3500', null]) {
      assert.equal(isValidMemoryFact({ ...PAGA, cents }), false, String(cents))
    }
  })

  it('solo admite frecuencia mensual', () => {
    for (const frequency of ['weekly', 'yearly', 'Monthly', '', null, undefined]) assert.equal(isValidMemoryFact({ ...PAGA, frequency }), false, String(frequency))
  })

  it('solo admite Paga, Regalos u Otros', () => {
    for (const category of ['Trabajo', 'Comida', 'paga', 'Nómina', '', null]) assert.equal(isValidMemoryFact({ ...PAGA, category }), false, String(category))
  })

  it('exige exactamente sus campos', () => {
    const { category: _c, ...withoutCategory } = PAGA as Extract<MemoryFact, { kind: 'recurringIncome' }>
    void _c
    assert.equal(isValidMemoryFact(withoutCategory), false)
    assert.equal(isValidMemoryFact({ ...PAGA, label: 'paga del abuelo' }), false)
    assert.equal(isValidMemoryFact({ kind: 'recurringIncome', value: 3_500 }), false)
  })

  it('el diagnóstico del chat lo reconoce como tipo válido o inválido', () => {
    const out = (fact: unknown) => ({ memoryProposal: { content: 'Cada mes le dan 35 € de paga.', category: 'financial_plan', importance: 'high', confidence: 0.9, replacesId: null, fact } })
    assert.equal(diagnoseProposal(out(PAGA)).fact, 'valid:recurringIncome')
    assert.equal(diagnoseProposal(out({ ...PAGA, frequency: 'weekly' })).fact, 'invalid:recurringIncome')
  })
})

describe('recurringIncome · perfil derivado', () => {
  it('un ingreso → perfil con su categoría, importe, frecuencia y memoria de origen', () => {
    const profile = deriveProfile([mem('m1', 1, PAGA)])
    assert.deepEqual(profile.recurringIncomes, [{ category: 'Paga', cents: 3_500, frequency: 'monthly', sourceMemoryId: 'm1' }])
    assert.deepEqual(profile.conflicts, [])
    assert.equal(isEmptyProfile(profile), false)
  })

  it('categorías distintas conviven, en el orden Paga, Regalos, Otros', () => {
    const profile = deriveProfile([mem('o', 3, income(1_000, 'Otros')), mem('p', 1, income(3_500, 'Paga')), mem('r', 2, income(2_000, 'Regalos'))])
    assert.deepEqual(profile.recurringIncomes?.map((r) => [r.category, r.cents]), [['Paga', 3_500], ['Regalos', 2_000], ['Otros', 1_000]])
    assert.deepEqual(profile.conflicts, [])
  })

  it('dos de la misma categoría → gana la más reciente y queda el conflicto', () => {
    const profile = deriveProfile([mem('vieja', 1, income(2_000)), mem('nueva', 2, income(3_500)), mem('regalos', 1, income(500, 'Regalos'))])
    assert.deepEqual(profile.recurringIncomes?.map((r) => [r.category, r.cents, r.sourceMemoryId]), [['Paga', 3_500, 'nueva'], ['Regalos', 500, 'regalos']])
    assert.deepEqual(profile.conflicts, [{ kind: 'recurringIncome', winnerId: 'nueva', loserIds: ['vieja'] }])
  })

  it('convive con los demás tipos sin alterarlos', () => {
    const profile = deriveProfile([mem('liq', 1, { kind: 'minLiquidity', cents: 30_000 }), mem('pag', 2, PAGA), mem('hor', 3, { kind: 'horizon', value: 'long' })])
    assert.equal(profile.minLiquidityCents, 30_000)
    assert.equal(profile.horizon, 'long')
    assert.deepEqual(profile.sources, { minLiquidityCents: 'liq', horizon: 'hor' })
    assert.equal(profile.recurringIncomes?.length, 1)
  })

  it('determinista: no depende del orden de las memorias', () => {
    const ms = [mem('a', 1, income(2_000)), mem('b', 1, income(3_000)), mem('c', 2, income(400, 'Otros'))]
    assert.deepEqual(deriveProfile(ms), deriveProfile([...ms].reverse()))
  })

  it('sin ingresos recurrentes, el perfil no gana el campo', () => {
    assert.equal('recurringIncomes' in deriveProfile([mem('liq', 1, { kind: 'minLiquidity', cents: 30_000 })]), false)
    assert.equal(isEmptyProfile(deriveProfile([])), true)
  })

  it('la reconciliación lo conserva, copiado, e idempotente', () => {
    const ctx = buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements() }), TODAY)
    const profile = deriveProfile([mem('p', 1, PAGA)])
    const once = reconcileProfile(profile, ctx)
    assert.deepEqual(once.recurringIncomes, profile.recurringIncomes)
    assert.notEqual(once.recurringIncomes?.[0], profile.recurringIncomes?.[0], 'copia, no la misma referencia')
    assert.deepEqual(reconcileProfile(once, ctx), once)
  })

  it('llega al servidor por profileFacts y se valida igual', () => {
    const memory = { profileFacts: [{ id: 'p', updatedAt: 1, fact: PAGA }, { id: 'x', updatedAt: 2, fact: { ...PAGA, category: 'Trabajo' } }] }
    assert.deepEqual(profileFromMemory(memory as never).recurringIncomes, [{ category: 'Paga', cents: 3_500, frequency: 'monthly', sourceMemoryId: 'p' }])
  })
})

describe('recurringIncome · un hecho por categoría al guardar', () => {
  const proposal = (content: string, fact: MemoryFact): MemoryProposal => ({ content, category: 'financial_plan', importance: 'high', confidence: 0.9, replacesId: null, fact })

  it('el hueco es la categoría', () => {
    assert.equal(factSlot(income(1, 'Paga')), 'recurringIncome:Paga')
    assert.notEqual(factSlot(income(1, 'Paga')), factSlot(income(1, 'Regalos')))
    assert.equal(factSlot({ kind: 'minLiquidity', cents: 1 }), 'minLiquidity')
  })

  it('factEquals compara importe, frecuencia y categoría', () => {
    assert.ok(factEquals(PAGA, { ...PAGA }))
    assert.equal(factEquals(PAGA, income(4_000)), false)
    assert.equal(factEquals(PAGA, income(3_500, 'Otros')), false)
  })

  it('una paga nueva sustituye a la anterior (y la tarjeta enseña la anterior)', () => {
    const existing = [mem('p', 1, income(2_000), 'Cada mes le dan 20 € de paga.')]
    const next = proposal('Ahora le dan 35 € de paga al mes.', PAGA)
    assert.deepEqual(replacementFor(next, existing).replacedFacts, [income(2_000)])
    const out = applyProposal(existing, next, 2, () => 'nuevo')
    assert.equal(out.action, 'updated')
    assert.equal(out.memories.length, 1)
    assert.deepEqual(deriveProfile(out.memories).recurringIncomes?.map((r) => r.cents), [3_500])
  })

  it('regalos y paga conviven', () => {
    const existing = [mem('p', 1, PAGA, 'Cada mes le dan 35 € de paga.')]
    const out = applyProposal(existing, proposal('Cada mes recibe 10 € de regalos.', income(1_000, 'Regalos')), 2, () => 'nuevo')
    assert.equal(out.action, 'created')
    assert.equal(deriveProfile(out.memories).recurringIncomes?.length, 2)
  })
})

describe('recurringIncome · no toca ninguna cifra ni decisión (fase 1)', () => {
  const snap = () =>
    snapshot({
      config: config(100_000),
      movements: healthyMovements(),
      objectives: [objective({ id: 'obj-viaje', name: 'Viaje', targetCents: 500_000, currentCents: 100_000, targetDate: '2027-06-30' })],
      positions: [position({ name: 'Fondo', valueCents: 50_000, investedCents: 40_000 })],
    })
  const memory = { profileFacts: [{ id: 'p', updatedAt: 1, fact: PAGA }] }

  it('la decisión es idéntica con y sin ingreso recordado (salvo el perfil aplicado)', () => {
    const ctx = buildFinancialContext(snap(), TODAY)
    const { profile: withProfile, ...withIncome } = decide({ context: ctx, memory })
    const { profile: _none, ...without } = decide({ context: ctx })
    void _none
    assert.deepEqual(withIncome, without)
    assert.deepEqual(withProfile.influence, [])
    assert.equal(withProfile.fields.recurringIncomes?.[0].cents, 3_500)
  })

  it('saldo, patrimonio, movimientos y objetivos salen solo de los datos de Finax', () => {
    const ctx = buildFinancialContext(snap(), TODAY)
    const decision = decide({ context: ctx, memory })
    assert.deepEqual(decision.context, ctx)
    assert.equal(ctx.wealth.liquidCents, buildFinancialContext(snap(), TODAY).wealth.liquidCents)
    assert.equal(ctx.flows.current.incomeCents, buildFinancialContext(snap(), TODAY).flows.current.incomeCents)
  })

  it('describe el dato para la tarjeta', () => {
    assert.equal(describeFact(PAGA), 'Ingreso recurrente: 35,00 € al mes · Paga')
    assert.equal(describeFact(income(1_050, 'Regalos')), 'Ingreso recurrente: 10,50 € al mes · Regalos')
  })
})

describe('recurringIncome · persistencia en Dexie', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
  })

  it('se guarda tras «Recordar», sobrevive a la recarga y viaja en profileFacts, sin versión nueva de Dexie', async () => {
    const version = db.verno
    await saveAcceptedProposal({ content: 'Cada mes le dan 35 € de paga.', category: 'financial_plan', importance: 'high', confidence: 0.9, replacesId: null, fact: PAGA }, 1_000)
    db.close()
    await db.open()
    assert.equal(db.verno, version, 'el campo `fact` no tiene índice: no hace falta migración')
    const [saved] = await listUserMemories()
    assert.deepEqual(saved.fact, PAGA)
    const memory = await getAxisMemory()
    assert.deepEqual(memory?.profileFacts?.map((f) => f.fact), [PAGA])
    assert.equal(profileFromMemory(memory).recurringIncomes?.[0].cents, 3_500)
  })

  it('guardar un ingreso recurrente no crea movimientos ni toca la configuración', async () => {
    await saveAcceptedProposal({ content: 'Cada mes le dan 35 € de paga.', category: 'financial_plan', importance: 'high', confidence: 0.9, replacesId: null, fact: PAGA }, 1_000)
    assert.equal(await db.movements.count(), 0)
    assert.equal(await db.config.count(), 0)
    assert.equal(await db.objectives.count(), 0)
    assert.equal(await db.positions.count(), 0)
  })
})

/* ---------------- T3 · neutralidad con modelos simulados ---------------- */

describe('recurringIncome · neutralidad en las rutas del servidor (modelos simulados)', () => {
  const ctx = () =>
    buildFinancialContext(
      snapshot({
        config: config(100_000),
        movements: healthyMovements(),
        objectives: [objective({ id: 'obj-viaje', name: 'Viaje', targetCents: 500_000, currentCents: 100_000, targetDate: '2027-06-30' })],
        positions: [position({ name: 'Fondo', valueCents: 50_000, investedCents: 40_000 })],
      }),
      TODAY,
    )
  const NOTE = { id: 'n1', content: 'Prefiere no complicarse.', category: 'preference', importance: 'low', fecha: '2026-09-01' }
  const PAGA_NOTE = { id: 'p1', content: 'Cada mes le dan 35 € de paga.', category: 'financial_plan', importance: 'high', fecha: '2026-10-01', hecho: PAGA }
  const conclusions = [{ generatedAt: '2026-09-30T10:00:00.000Z', summary: 'Lectura anterior.' }]
  // Lo que envía de verdad el cliente antes y después de aceptar la paga: la nota aparece y su hecho viaja en profileFacts.
  const without: AxisMemory = { previousConclusions: conclusions, userMemories: [NOTE] }
  const withIncome: AxisMemory = { previousConclusions: conclusions, userMemories: [PAGA_NOTE, NOTE], profileFacts: [{ id: 'p1', updatedAt: 1, fact: PAGA }] }

  const payloadOf = (user: string) => JSON.parse(user.slice(user.indexOf('\n\n') + 2)) as Record<string, any>
  const withoutDate = (a: unknown) => JSON.parse(JSON.stringify(a, (k, v) => (k === 'generatedAt' ? undefined : v))) as unknown
  function model(output: unknown, seen: string[]): MarketAIProvider {
    return {
      id: 'mock',
      model: 'mock',
      async completeWithUsage(request) {
        seen.push(request.user)
        return { output, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }
      },
      complete: async () => output,
    }
  }

  it('Decision First: misma decisión, mismas cifras permitidas y mismo análisis; solo cambian las notas del usuario', async () => {
    const context = ctx()
    const decision = decide({ context, memory: without })
    assert.deepEqual(
      (({ profile: _p, ...rest }) => rest)(decide({ context, memory: withIncome })),
      (({ profile: _p, ...rest }) => rest)(decision),
    )
    const expression = {
      headline: `Lectura de AXIS: ${decision.lead?.fact ?? 'situación estable'}`,
      interpretation: { summary: `Con los datos disponibles, ${decision.lead?.interpretation ?? 'no hay nada que requiera atención'}`, signals: decision.relevant.map((s) => ({ id: s.id, text: `Dicho de otro modo: ${s.interpretation}` })) },
      recommendation_why: decision.recommendation ? `Tiene sentido porque ${decision.recommendation.why}` : null,
      alternatives: decision.alternatives.map((a) => ({ name: a.name, summary: `Otra opción: ${a.summary}` })),
      uncertainties: decision.uncertainties.map((u) => ({ title: u.title, detail: `Conviene tenerlo presente: ${u.detail}` })),
      conclusion: 'Con esto, la lectura queda clara; sigue registrando movimientos.',
    }
    const seen: string[] = []
    const a = await analyzeWithProvider(model(expression, seen), context, without, undefined, null, 'decision-first')
    const b = await analyzeWithProvider(model(expression, seen), context, withIncome, undefined, null, 'decision-first')
    const [pa, pb] = seen.map(payloadOf)
    assert.deepEqual(pb.decision_de_axis, pa.decision_de_axis, 'la decisión que expresa el modelo no cambia')
    assert.deepEqual(pb.cifras_permitidas, pa.cifras_permitidas, 'ninguna cifra nueva licenciada')
    assert.deepEqual(pb.memoria_relevante.notas_del_usuario, [PAGA_NOTE.content, NOTE.content], 'solo cambia el texto de las notas')
    assert.doesNotMatch(seen[1], /profileFacts|recurringIncome|"cents"/)
    assert.deepEqual(withoutDate(b), withoutDate(a))
  })

  it('legacy: mismas señales y mismo contexto financiero; profileFacts no viaja al modelo', async () => {
    const context = ctx()
    const local = analyzeLocally({ context }, new Date('2026-09-15T10:00:00Z'))
    if (local.status !== 'analysis') throw new Error('unreachable')
    const { engine: _e, generatedAt: _g, basedOnDemoData: _d, ...output } = local.analysis
    const seen: string[] = []
    await analyzeWithProvider(model(output, seen), context, without, undefined, null, 'legacy')
    await analyzeWithProvider(model(output, seen), context, withIncome, undefined, null, 'legacy')
    const [pa, pb] = seen.map(payloadOf)
    assert.deepEqual(pb.senales_detectadas_por_finax, pa.senales_detectadas_por_finax)
    assert.deepEqual(pb.contexto_financiero, pa.contexto_financiero)
    assert.equal('profileFacts' in pb.memoria, false)
    // El contrato legacy sí envía la memoria del usuario, ahora con la nota de la paga y su hecho.
    assert.deepEqual(pb.memoria.userMemories[0].hecho, PAGA)
  })

  it('chat: mismos datos actuales y señales; la memoria del usuario incluye el hecho; respuesta local idéntica', async () => {
    const context = ctx()
    const reply = { reply: 'Con tus datos, yo iría poco a poco.', confidence: 'media', nextStep: null, memoryProposal: null }
    const seen: string[] = []
    const conversation = { summary: null, recent: [] }
    const a = await chatWithProvider(model(reply, seen), { context, memory: without, conversation, message: '¿Cómo voy?' })
    const b = await chatWithProvider(model(reply, seen), { context, memory: withIncome, conversation, message: '¿Cómo voy?' })
    const [pa, pb] = seen.map(payloadOf)
    assert.deepEqual(pb.datos_actuales, pa.datos_actuales, 'contexto, señales y mercado sin cambios')
    assert.deepEqual(pb.memoria.memorias_del_usuario[0].hecho, PAGA, 'el contrato del chat sí muestra el hecho al modelo')
    assert.doesNotMatch(seen[1], /profileFacts/)
    assert.deepEqual(withoutDate(b), withoutDate(a))
    const offline = (memory: AxisMemory) => composeLocalReply({ context, memory, conversation, message: '¿Cómo voy?' }, 'offline', new Date('2026-09-15T10:00:00Z'))
    assert.deepEqual(offline(withIncome), offline(without), 'el motor local responde igual')
  })

  it('motor local: el análisis es idéntico con y sin ingreso recordado', () => {
    const now = new Date('2026-09-15T10:00:00Z')
    assert.deepEqual(analyzeLocally({ context: ctx(), memory: withIncome }, now), analyzeLocally({ context: ctx(), memory: without }, now))
  })
})
