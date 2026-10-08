/**
 * Cuestionario «Tu perfil» (plan de reparto · fase 2a): cuatro respuestas
 * cerradas que se guardan como memorias con hecho, todo o nada, sin olvidar
 * memorias sin confirmarlo. La edad es un hecho nuevo (`adult`) que solo
 * puede venir del cuestionario: el chat no puede fijarlo.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyProposals, isSavableProposal, validateImportedMemories } from '../chat/memory'
import { evictionPreviewAll, memoryUsage } from '../chat/memory-editor'
import { gateProposalFact } from '../chat/profile-proposal'
import { CHAT_LIMITS, type MemoryProposal, type UserMemory } from '../chat/types'
import { deriveProfile } from '../profile/derive'
import { describeFact } from '../profile/describe'
import { extractProfileFacts } from '../profile/extract'
import { answeredCount, answersFromProfile, PROFILE_QUESTIONS, profileProposals } from '../profile/questionnaire'
import { isValidMemoryFact, type MemoryFact } from '../profile/types'
import { db } from '../../db/db'
import { clearAllData } from '../../db/backup'
import { listUserMemories, saveMemoryProposals } from '../../db/axis-memories'

let seq = 0
const newId = () => `m-${++seq}`
const memory = (fact: MemoryFact | undefined, i: number, content = `Memoria de prueba número ${i}.`): UserMemory => ({
  id: `old-${i}`,
  content,
  category: 'context',
  importance: 'low',
  confidence: 1,
  source: 'manual',
  createdAt: i,
  updatedAt: i,
  ...(fact ? { fact } : {}),
})
/** Índice de la opción de una pregunta por su valor. */
const pick = (id: string, value: unknown) => PROFILE_QUESTIONS.find((q) => q.id === id)!.options.findIndex((o) => o.fact.value === value)
const ALL = { horizon: pick('horizon', 'long'), riskAttitude: pick('riskAttitude', 'balanced'), irregularIncome: pick('irregularIncome', true), adult: pick('adult', false) }

describe('hecho «adult»', () => {
  it('válido solo como { kind, value: boolean }', () => {
    assert.ok(isValidMemoryFact({ kind: 'adult', value: true }))
    assert.ok(isValidMemoryFact({ kind: 'adult', value: false }))
    assert.equal(isValidMemoryFact({ kind: 'adult', value: 'sí' }), false)
    assert.equal(isValidMemoryFact({ kind: 'adult', value: true, age: 17 }), false)
  })

  it('se describe y se explica sin prometer más de lo que hace AXIS', () => {
    assert.equal(describeFact({ kind: 'adult', value: true }), 'Mayor de edad')
    assert.equal(describeFact({ kind: 'adult', value: false }), 'Menor de edad')
    assert.match(memoryUsage({ kind: 'adult', value: false }), /no lo usa para decidir nada/)
  })

  it('entra en el perfil derivado', () => {
    assert.equal(deriveProfile([memory({ kind: 'adult', value: false }, 1)]).adult, false)
  })

  it('el chat no puede fijarlo: un dato propuesto por el modelo sin respaldo del mensaje se descarta', () => {
    const p: MemoryProposal = { content: 'Es mayor de edad.', category: 'context', importance: 'high', confidence: 1, replacesId: null, fact: { kind: 'adult', value: true } }
    const { proposal, outcome } = gateProposalFact(p, extractProfileFacts('Tengo 25 años'))
    assert.equal(outcome, 'dropped-model')
    assert.equal(proposal?.fact, undefined)
  })

  it('una copia de seguridad con la edad se importa', () => {
    const checked = validateImportedMemories([memory({ kind: 'adult', value: true }, 1)])
    assert.equal(checked.ok, true)
  })
})

describe('cuestionario · respuestas', () => {
  it('cuatro preguntas, cada opción con un hecho válido y un texto guardable', () => {
    assert.deepEqual(PROFILE_QUESTIONS.map((q) => q.id), ['horizon', 'riskAttitude', 'irregularIncome', 'adult'])
    for (const q of PROFILE_QUESTIONS) {
      for (const o of q.options) {
        assert.equal(o.fact.kind, q.id)
        assert.ok(isValidMemoryFact(o.fact), o.label)
      }
    }
    for (const p of profileProposals(ALL, {})) assert.ok(isSavableProposal(p), p.content)
  })

  it('sin responder no guarda nada; solo lo que cambia', () => {
    assert.deepEqual(profileProposals({}, {}), [])
    assert.deepEqual(profileProposals(ALL, ALL), [])
    const changed = profileProposals({ ...ALL, horizon: pick('horizon', 'short') }, ALL)
    assert.deepEqual(changed.map((p) => p.fact), [{ kind: 'horizon', value: 'short' }])
  })

  it('ida y vuelta: lo guardado se lee como las mismas respuestas', () => {
    const outcome = applyProposals([], profileProposals(ALL, {}), 1, newId)
    assert.equal(outcome.action, 'applied')
    const profile = deriveProfile(outcome.memories)
    assert.deepEqual(answersFromProfile(profile), ALL)
    assert.equal(answeredCount(profile), 4)
    assert.equal(profile.riskAttitude, 'balanced')
    assert.equal(profile.irregularIncome, true)
  })

  it('responder otra vez sustituye la respuesta anterior (un hueco por pregunta)', () => {
    const first = applyProposals([], profileProposals(ALL, {}), 1, newId)
    assert.equal(first.action, 'applied')
    const before = first.memories
    const next = applyProposals(before, profileProposals({ ...ALL, riskAttitude: pick('riskAttitude', 'dynamic') }, answersFromProfile(deriveProfile(before))), 2, newId)
    assert.equal(next.action, 'applied')
    assert.equal(next.memories.length, 4)
    assert.equal(next.memories.filter((m) => m.fact?.kind === 'riskAttitude').length, 1)
    assert.equal(deriveProfile(next.memories).riskAttitude, 'dynamic')
  })

  it('todo o nada: si una respuesta no es guardable, no se aplica ninguna', () => {
    const bad: MemoryProposal = { content: 'x', category: 'context', importance: 'high', confidence: 1, replacesId: null, fact: { kind: 'adult', value: true } }
    const outcome = applyProposals([], [...profileProposals(ALL, {}), bad], 1, newId)
    assert.equal(outcome.action, 'rejected')
    assert.deepEqual(outcome.memories, [])
  })

  it('al llegar al tope, avisa de qué memorias se olvidarían', () => {
    const full = Array.from({ length: CHAT_LIMITS.MAX_MEMORIES }, (_, i) => memory(undefined, i + 1))
    const evicted = evictionPreviewAll(full, profileProposals(ALL, {}))
    assert.equal(evicted.length, 4)
    assert.ok(evicted.every((m) => full.includes(m)))
  })
})

describe('cuestionario · guardado (Dexie)', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
  })

  it('guarda las cuatro respuestas en una transacción', async () => {
    const outcome = await saveMemoryProposals(profileProposals(ALL, {}))
    assert.deepEqual(outcome, { action: 'saved' })
    const saved = await listUserMemories()
    assert.equal(saved.length, 4)
    assert.ok(saved.every((m) => m.source === 'manual'))
    assert.deepEqual(answersFromProfile(deriveProfile(saved)), ALL)
  })

  it('con el tope lleno no olvida nada sin confirmarlo; con la confirmación, sí', async () => {
    const full = Array.from({ length: CHAT_LIMITS.MAX_MEMORIES }, (_, i) => memory(undefined, i + 1))
    await db.axisMemories.bulkAdd(full)
    const proposals = profileProposals(ALL, {})
    const first = await saveMemoryProposals(proposals)
    assert.equal(first.action, 'needs-confirmation')
    assert.equal((await listUserMemories()).length, CHAT_LIMITS.MAX_MEMORIES)
    assert.ok((await listUserMemories()).every((m) => m.fact === undefined), 'no se ha escrito nada')
    const evicted = first.action === 'needs-confirmation' ? first.evicted.map((m) => m.id) : []
    assert.deepEqual(await saveMemoryProposals(proposals, Date.now(), evicted), { action: 'saved' })
    const after = await listUserMemories()
    assert.equal(after.length, CHAT_LIMITS.MAX_MEMORIES)
    assert.equal(answeredCount(deriveProfile(after)), 4)
  })
})
