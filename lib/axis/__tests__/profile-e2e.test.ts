/**
 * Perfil de extremo a extremo (fase 2 · bloque 3).
 *
 *   propuesta del modelo con `fact` → parseChatReply → «Recordar» (Dexie)
 *   → getAxisMemory().profileFacts → AxisMemory → decide() en el cliente,
 *   en el servidor (legacy y Decision First) y en el chat
 *
 * La memoria viene del cliente: `profileFromMemory` la valida entrada a
 * entrada. Sin hechos, todo es exactamente igual que antes (los goldens de
 * decisión no cambian). Este archivo añade el golden con perfil.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildFinancialContext } from '../context'
import { decide } from '../core/decision'
import { analyzeLocally } from '../local-engine'
import { buildAIRequest } from '../ai/prompt'
import { buildChatRequest } from '../chat/prompt'
import { composeLocalReply } from '../chat/local-reply'
import { AXIS_CHAT_SCHEMA } from '../chat/schema'
import { parseChatReply } from '../chat/validate'
import { AI_ENGINE_INFO } from '../ai-engine'
import { deriveProfile, profileFactsOf, profileFromMemory } from '../profile/derive'
import { describeFact } from '../profile/describe'
import type { MemoryFact } from '../profile/types'
import type { AxisMemory, FinancialContext, ProfileFactEntry } from '../types'
import type { UserMemory } from '../chat/types'
import { db } from '../../db/db'
import { getAxisMemory } from '../../db/axis-memory'
import { saveAcceptedProposal } from '../../db/axis-memories'
import { config, healthyMovements, NOW, objective, snapshot, TODAY } from './fixtures'

const SNAPSHOT = join(dirname(fileURLToPath(import.meta.url)), '__snapshots__', 'profile', 'con-perfil.json')
const UPDATE = process.env.UPDATE_GOLDEN === '1'

/** Líquido 3.550 €, ahorro sano, dos objetivos pendientes. */
const context = (): FinancialContext =>
  buildFinancialContext(
    snapshot({
      config: config(100_000),
      movements: healthyMovements(),
      objectives: [
        objective({ id: 'obj-viaje', name: 'Viaje', targetCents: 500_000, currentCents: 100_000 }),
        objective({ id: 'obj-moto', name: 'Moto', targetCents: 300_000, currentCents: 50_000 }),
      ],
    }),
    TODAY,
  )

const FACTS: ProfileFactEntry[] = [
  { id: 'mem-liq', updatedAt: 2, fact: { kind: 'minLiquidity', cents: 400_000 } },
  { id: 'mem-prio', updatedAt: 1, fact: { kind: 'priorities', objectiveIds: ['obj-moto'] } },
]
const memory = (profileFacts: unknown = FACTS): AxisMemory => ({ profileFacts: profileFacts as ProfileFactEntry[] })
const signalIds = (ctx: FinancialContext, mem?: AxisMemory) => decide({ context: ctx, memory: mem }).signals.map((s) => s.id)

describe('AXIS · perfil de extremo a extremo · decide()', () => {
  it('sin hechos, la decisión es la misma que sin memoria', () => {
    const ctx = context()
    assert.deepEqual(decide({ context: ctx, memory: { previousConclusions: [] } }), decide({ context: ctx }))
    assert.deepEqual(decide({ context: ctx, memory: memory([]) }), decide({ context: ctx }))
  })

  it('con hechos en la memoria, decide igual que con el perfil explícito', () => {
    const ctx = context()
    assert.deepEqual(decide({ context: ctx, memory: memory() }), decide({ context: ctx, profile: deriveProfile(FACTS) }))
  })

  it('la liquidez mínima declarada crea su señal, trazada hasta la memoria', () => {
    const decision = decide({ context: context(), memory: memory() })
    const below = decision.signals.find((s) => s.id === 'liquidity.below-min')
    assert.ok(below, 'falta liquidity.below-min')
    assert.ok(decision.profile.influence.some((i) => i.sourceMemoryId === 'mem-liq' && i.signalId === 'liquidity.below-min'))
    assert.equal(decision.profile.fields.priorities?.[0], 'obj-moto')
  })

  it('un perfil explícito manda sobre la memoria', () => {
    const ctx = context()
    assert.deepEqual(decide({ context: ctx, memory: memory(), profile: { sources: {}, conflicts: [] } }), decide({ context: ctx }))
  })
})

describe('AXIS · perfil de extremo a extremo · memoria no fiable', () => {
  it('descarta entradas sin id, sin fecha entera o con hecho inválido', () => {
    const bad = [
      null,
      'texto',
      { id: '', updatedAt: 1, fact: { kind: 'horizon', value: 'long' } },
      { id: 'x'.repeat(65), updatedAt: 1, fact: { kind: 'horizon', value: 'long' } },
      { id: 'a', updatedAt: 1.5, fact: { kind: 'horizon', value: 'long' } },
      { id: 'b', updatedAt: '1', fact: { kind: 'horizon', value: 'long' } },
      { id: 'c', updatedAt: 1, fact: { kind: 'horizon', value: 'forever' } },
      { id: 'd', updatedAt: 1, fact: { kind: 'minLiquidity', cents: -5 } },
      { id: 'e', updatedAt: 1, fact: { kind: 'riskAttitude', value: 'dynamic', extra: true } },
    ]
    assert.deepEqual(profileFromMemory(memory(bad)), { sources: {}, conflicts: [] })
    assert.deepEqual(profileFromMemory(memory({ no: 'array' })), { sources: {}, conflicts: [] })
    assert.deepEqual(profileFromMemory(null), { sources: {}, conflicts: [] })
  })

  it('conserva las válidas junto a las inválidas y gana la más reciente', () => {
    const profile = profileFromMemory(
      memory([
        { id: 'old', updatedAt: 1, fact: { kind: 'horizon', value: 'short' } },
        { id: 'bad', updatedAt: 9, fact: { kind: 'horizon', value: 'eterno' } },
        { id: 'new', updatedAt: 5, fact: { kind: 'horizon', value: 'long' } },
      ]),
    )
    assert.equal(profile.horizon, 'long')
    assert.equal(profile.sources.horizon, 'new')
    assert.deepEqual(profile.conflicts, [{ kind: 'horizon', winnerId: 'new', loserIds: ['old'] }])
  })

  it('acota el número de entradas', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ id: `m${i}`, updatedAt: i, fact: { kind: 'horizon', value: 'long' } as MemoryFact }))
    const profile = profileFromMemory(memory(many))
    // Solo cuentan las 30 primeras: gana la más reciente de ellas (m29), no la 39.
    assert.equal(profile.sources.horizon, 'm29')
  })
})

describe('AXIS · perfil de extremo a extremo · prompts y chat', () => {
  it('análisis legacy: las señales usan el perfil y los hechos no van al modelo', () => {
    const request = buildAIRequest({ context: context(), memory: { ...memory(), previousConclusions: [] } })
    assert.match(request.user, /liquidity\.below-min/)
    assert.doesNotMatch(request.user, /profileFacts/)
    assert.match(request.user, /"memoria":\{"previousConclusions":\[\]\}/)
  })

  it('chat: las señales usan el perfil y los hechos solo llegan dentro de las memorias', () => {
    const userMemories = [{ id: 'mem-liq', content: 'Quiere tener siempre 4.000 €.', category: 'constraint', importance: 'high', fecha: '2026-09-01', hecho: FACTS[0].fact }]
    const request = buildChatRequest({ context: context(), memory: { ...memory(), userMemories }, conversation: { summary: null, recent: [] }, message: '¿Puedo invertir?' })
    assert.match(request.user, /liquidity\.below-min/)
    assert.doesNotMatch(request.user, /profileFacts/)
    assert.match(request.user, /"hecho":\{"kind":"minLiquidity","cents":400000\}/)
  })

  it('respuesta local del chat: aplica el mismo perfil que el análisis', () => {
    const input = { context: context(), market: null, conversation: { summary: null, recent: [] }, message: '¿Qué hago?' }
    const plain = composeLocalReply(input, 'offline', NOW)
    const withProfile = composeLocalReply({ ...input, memory: memory() }, 'offline', NOW)
    assert.notEqual(withProfile.text, plain.text)
    const local = analyzeLocally({ context: context(), profile: profileFromMemory(memory()) }, NOW)
    assert.equal(local.status, 'analysis')
    if (local.status === 'analysis') assert.ok(withProfile.text.includes(local.analysis.headline.replace(/[.!?]$/, '')))
  })
})

describe('AXIS · perfil de extremo a extremo · propuesta del modelo', () => {
  const parse = (fact: unknown) =>
    parseChatReply({
      reply: 'Entendido.',
      confidence: 'media',
      nextStep: null,
      memoryProposal: { content: 'Quiere tener siempre 4.000 € disponibles.', category: 'constraint', importance: 'high', confidence: 0.9, replacesId: null, fact },
      engine: AI_ENGINE_INFO,
      generatedAt: NOW.toISOString(),
    })

  it('el esquema exige «fact» en la propuesta', () => {
    const proposal = AXIS_CHAT_SCHEMA.properties.memoryProposal.anyOf[1]
    assert.ok((proposal.required as readonly string[]).includes('fact'))
  })

  it('conserva un hecho válido', () => {
    assert.deepEqual(parse({ kind: 'minLiquidity', cents: 400_000 }).memoryProposal?.fact, { kind: 'minLiquidity', cents: 400_000 })
  })

  it('un hecho inválido o nulo deja la propuesta solo con texto', () => {
    for (const fact of [null, undefined, { kind: 'minLiquidity', cents: 12.5 }, { kind: 'invest', value: true }]) {
      const proposal = parse(fact).memoryProposal
      assert.ok(proposal, 'la propuesta debe sobrevivir')
      assert.equal(proposal?.fact, undefined)
    }
  })
})

describe('AXIS · perfil de extremo a extremo · persistencia', () => {
  beforeEach(async () => {
    await db.axisMemories.clear()
    await db.axisMemory.clear()
  })

  it('«Recordar» una propuesta con hecho lo envía en la siguiente memoria', async () => {
    await saveAcceptedProposal({ content: 'Quiere tener siempre 4.000 € disponibles.', category: 'constraint', importance: 'high', confidence: 0.9, replacesId: null, fact: { kind: 'minLiquidity', cents: 400_000 } }, 1_000)
    await saveAcceptedProposal({ content: 'Prefiere no complicarse.', category: 'preference', importance: 'low', confidence: 0.8, replacesId: null }, 2_000)
    const mem = await getAxisMemory()
    assert.equal(mem?.userMemories?.length, 2)
    assert.equal(mem?.profileFacts?.length, 1)
    assert.deepEqual(mem?.profileFacts?.[0].fact, { kind: 'minLiquidity', cents: 400_000 })
    assert.deepEqual(mem?.userMemories?.find((m) => m.hecho)?.hecho, { kind: 'minLiquidity', cents: 400_000 })
    assert.equal(profileFromMemory(mem).minLiquidityCents, 400_000)
  })

  it('sin hechos, la memoria no lleva profileFacts', async () => {
    await saveAcceptedProposal({ content: 'Prefiere no complicarse.', category: 'preference', importance: 'low', confidence: 0.8, replacesId: null }, 1_000)
    assert.equal((await getAxisMemory())?.profileFacts, undefined)
  })

  it('profileFactsOf ignora memorias sin hecho o con hecho inválido', () => {
    const base = { content: 'x', category: 'other', importance: 'low', confidence: 1, source: 'conversation', createdAt: 0 } as const
    const memories: UserMemory[] = [
      { ...base, id: 'a', updatedAt: 1 },
      { ...base, id: 'b', updatedAt: 2, fact: { kind: 'irregularIncome', value: true } },
      { ...base, id: 'c', updatedAt: 3, fact: { kind: 'horizon', value: 'nunca' } as unknown as MemoryFact },
    ]
    assert.deepEqual(profileFactsOf(memories), [{ id: 'b', updatedAt: 2, fact: { kind: 'irregularIncome', value: true } }])
  })
})

describe('AXIS · perfil de extremo a extremo · texto para la interfaz', () => {
  it('describe cada clase de hecho', () => {
    assert.equal(describeFact({ kind: 'minLiquidity', cents: 30_000 }), 'Liquidez mínima: 300,00 €')
    assert.equal(describeFact({ kind: 'horizon', value: 'long' }), 'Horizonte: largo plazo (más de 5 años)')
    assert.equal(describeFact({ kind: 'riskAttitude', value: 'conservative' }), 'Perfil de riesgo: conservador')
    assert.equal(describeFact({ kind: 'irregularIncome', value: false }), 'Ingresos estables')
    assert.equal(describeFact({ kind: 'priorities', objectiveIds: ['a', 'b'] }, (id) => ({ a: 'Viaje', b: 'Moto' })[id]), 'Prioridad: «Viaje», «Moto»')
    assert.equal(describeFact({ kind: 'priorities', objectiveIds: ['a', 'zz'] }, (id) => ({ a: 'Viaje' })[id]), 'Prioridad entre 2 objetivos')
  })
})

describe('AXIS · golden con perfil', () => {
  it('decide() con perfil en la memoria coincide con su golden (regenerable solo con UPDATE_GOLDEN=1)', () => {
    const decision = JSON.parse(JSON.stringify(decide({ context: context(), memory: memory() })))
    if (UPDATE || !existsSync(SNAPSHOT)) {
      mkdirSync(dirname(SNAPSHOT), { recursive: true })
      writeFileSync(SNAPSHOT, `${JSON.stringify(decision, null, 2)}\n`)
    }
    assert.deepEqual(decision, JSON.parse(readFileSync(SNAPSHOT, 'utf8')))
  })

  it('el golden con perfil difiere del mismo escenario sin perfil', () => {
    const ctx = context()
    assert.notDeepEqual(signalIds(ctx, memory()), signalIds(ctx))
  })
})
