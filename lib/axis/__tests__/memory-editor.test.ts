/**
 * Gestión de la memoria de AXIS (fase 3): «Lo que AXIS sabe de ti».
 *
 * Crear, editar y borrar memorias pasa por la misma vía que el chat
 * (`resolveMemoryProposal` → `applyProposal`). El tope de 30 memorias ya no
 * olvida nada en silencio: `evictionPreview` lo anuncia y el guardado se niega
 * a expulsar lo que el usuario no ha confirmado.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyProposal, memoriesForModel } from '../chat/memory'
import {
  editableKind,
  editProposal,
  evictionPreview,
  groupMemories,
  inputFor,
  LEGACY_NOT_EDITABLE,
  manualProposal,
  memorySource,
  memoryUsage,
  SOURCE_LABEL,
} from '../chat/memory-editor'
import { proposalFromFact } from '../chat/profile-proposal'
import { CHAT_LIMITS, type MemoryProposal, type UserMemory } from '../chat/types'
import { describeFact } from '../profile/describe'
import { deriveProfile } from '../profile/derive'
import type { MemoryFact } from '../profile/types'
import { db } from '../../db/db'
import { clearAllData } from '../../db/backup'
import { getAxisMemory } from '../../db/axis-memory'
import { listUserMemories, resolveMemoryProposal, saveAcceptedProposal } from '../../db/axis-memories'

const PAGA = (cents: number, category: 'Paga' | 'Regalos' | 'Otros' = 'Paga'): MemoryFact => ({ kind: 'recurringIncome', cents, frequency: 'monthly', category })
const LIQ = (cents: number): MemoryFact => ({ kind: 'minLiquidity', cents })
const mem = (id: string, overrides: Partial<UserMemory> = {}): UserMemory => ({
  id,
  content: `Memoria ${id} de prueba.`,
  category: 'preference',
  importance: 'medium',
  confidence: 0.8,
  source: 'conversation',
  createdAt: 1_000,
  updatedAt: 1_000,
  ...overrides,
})
const ok = (r: ReturnType<typeof manualProposal>): MemoryProposal => {
  assert.ok(r.ok, r.ok ? '' : r.error)
  return (r as { ok: true; proposal: MemoryProposal }).proposal
}
const save = (memories: UserMemory[], p: MemoryProposal, now = 5_000) => applyProposal(memories, p, now, () => 'nueva')

describe('memoria · creación manual', () => {
  it('nota: categoría context, importancia high, origen manual', () => {
    const p = ok(manualProposal({ kind: 'note', text: '  Prefiere no tocar   los ahorros del viaje. ' }))
    assert.deepEqual(p, { content: 'Prefiere no tocar los ahorros del viaje.', category: 'context', importance: 'high', confidence: 1, replacesId: null, origin: 'manual' })
    const out = save([], p)
    assert.equal(out.action, 'created')
    assert.equal(out.memories[0].source, 'manual')
  })

  it('nota: vacía, corta, demasiado larga o con secretos no se puede guardar', () => {
    for (const text of ['', '   ', 'corto', 'x'.repeat(CHAT_LIMITS.MAX_MEMORY_CHARS + 1), 'Mi PIN es 1234 y la contraseña hunter2', 'Mi IBAN es ES9121000418450200051332']) {
      assert.equal(manualProposal({ kind: 'note', text }).ok, false, text.slice(0, 30))
    }
  })

  it('ingreso mensual: dato válido y texto generado a partir de él', () => {
    const p = ok(manualProposal({ kind: 'recurringIncome', amount: '35', category: 'Paga' }))
    assert.deepEqual(p.fact, PAGA(3_500))
    assert.equal(p.content, 'Recibe 35,00 € de paga cada mes.')
    assert.equal(p.origin, 'manual')
    assert.equal(p.importance, 'high')
    assert.equal(save([], p).memories[0].source, 'manual')
  })

  it('ingreso mensual: sin categoría o con importe no válido no se puede guardar', () => {
    assert.equal(manualProposal({ kind: 'recurringIncome', amount: '35', category: null }).ok, false)
    for (const amount of ['', '0', '-3', 'abc']) assert.equal(manualProposal({ kind: 'recurringIncome', amount, category: 'Paga' }).ok, false, amount)
  })

  it('liquidez mínima: dato válido, texto generado', () => {
    const p = ok(manualProposal({ kind: 'minLiquidity', amount: '1.000' }))
    assert.deepEqual(p.fact, LIQ(100_000))
    assert.equal(p.content, 'Quiere tener siempre al menos 1.000,00 € disponibles.')
    // Incluso con el importe de la semilla interna, el texto se genera: nunca queda vacío.
    assert.equal(ok(manualProposal({ kind: 'minLiquidity', amount: '0,01' })).content, 'Quiere tener siempre al menos 0,01 € disponibles.')
  })
})

describe('memoria · edición', () => {
  const note = mem('n', { content: 'Prefiere no tocar los ahorros.', category: 'context', importance: 'high', source: 'manual' })
  const income = mem('i', { content: 'Recibe 35,00 € de paga cada mes.', category: 'financial_plan', importance: 'high', fact: PAGA(3_500) })
  const liq = mem('l', { content: 'Quiere tener siempre al menos 500,00 € disponibles.', category: 'constraint', fact: LIQ(50_000) })

  it('nota: cambia solo el texto; misma id, origen e importancia', () => {
    const p = ok(editProposal(note, { kind: 'note', text: 'Prefiere no tocar los ahorros hasta verano.' }))
    const out = save([note], p)
    assert.equal(out.action, 'updated')
    assert.deepEqual(out.memories.map((m) => [m.id, m.source, m.importance, m.category, m.content]), [['n', 'manual', 'high', 'context', 'Prefiere no tocar los ahorros hasta verano.']])
    assert.equal(out.memories[0].createdAt, note.createdAt)
  })

  it('ingreso: cambia el importe y el texto se regenera; conserva id y origen de conversación', () => {
    const p = ok(editProposal(income, { kind: 'recurringIncome', amount: '40', category: 'Paga' }))
    const out = save([income], p)
    assert.equal(out.memories.length, 1)
    assert.deepEqual([out.memories[0].id, out.memories[0].source, out.memories[0].content], ['i', 'conversation', 'Recibe 40,00 € de paga cada mes.'])
    assert.deepEqual(out.memories[0].fact, PAGA(4_000))
  })

  it('ingreso: cambiar la categoría regenera el texto', () => {
    const p = ok(editProposal(income, { kind: 'recurringIncome', amount: '35,00', category: 'Regalos' }))
    assert.equal(p.content, 'Recibe 35,00 € en regalos cada mes.')
  })

  it('sin cambios conserva el texto original', () => {
    assert.equal(ok(editProposal(income, inputFor(income)!)).content, income.content)
  })

  it('liquidez: cambia el importe', () => {
    const p = ok(editProposal(liq, { kind: 'minLiquidity', amount: '600' }))
    assert.deepEqual(save([liq], p).memories[0].fact, LIQ(60_000))
  })

  it('los tipos antiguos se ven y se borran, pero no se editan', () => {
    for (const fact of [{ kind: 'horizon', value: 'long' }, { kind: 'riskAttitude', value: 'balanced' }, { kind: 'irregularIncome', value: true }, { kind: 'priorities', objectiveIds: ['o1'] }] as MemoryFact[]) {
      const legacy = mem('x', { fact })
      assert.equal(editableKind(legacy), null)
      assert.equal(inputFor(legacy), null)
      assert.deepEqual(editProposal(legacy, { kind: 'note', text: 'Cualquier texto válido.' }), { ok: false, error: LEGACY_NOT_EDITABLE })
    }
  })

  it('no se puede cambiar el tipo de una memoria', () => {
    assert.equal(editProposal(note, { kind: 'minLiquidity', amount: '10' }).ok, false)
  })
})

describe('memoria · sustituciones', () => {
  it('cambiar la categoría a una ya ocupada: una sola memoria por categoría, sin duplicados', () => {
    const paga = mem('p', { content: 'Recibe 35,00 € de paga cada mes.', fact: PAGA(3_500) })
    const regalos = mem('r', { content: 'Recibe 10,00 € en regalos cada mes.', fact: PAGA(1_000, 'Regalos') })
    const p = ok(editProposal(paga, { kind: 'recurringIncome', amount: '35', category: 'Regalos' }))
    const out = save([paga, regalos], p)
    assert.equal(out.action, 'updated')
    assert.deepEqual(out.memories.map((m) => m.id), ['p'])
    assert.deepEqual(deriveProfile(out.memories).recurringIncomes?.map((r) => [r.category, r.cents]), [['Regalos', 3_500]])
    assert.deepEqual(deriveProfile(out.memories).conflicts, [])
  })

  it('un ingreso manual de una categoría ya ocupada la sustituye (y no añade memorias)', () => {
    const paga = mem('p', { content: 'Recibe 35,00 € de paga cada mes.', fact: PAGA(3_500) })
    const out = save([paga], ok(manualProposal({ kind: 'recurringIncome', amount: '50', category: 'Paga' })))
    assert.equal(out.memories.length, 1)
    assert.deepEqual(out.memories[0].fact, PAGA(5_000))
  })
})

describe('memoria · límite de 30', () => {
  const full = (n: number) => Array.from({ length: n }, (_, i) => mem(`m${String(i).padStart(2, '0')}`, { importance: i === 7 ? 'low' : 'medium', updatedAt: 1_000 + i }))
  const newNote = () => ok(manualProposal({ kind: 'note', text: 'Una nota nueva para AXIS.' }))

  it('por debajo de 30: nada que olvidar', () => {
    assert.deepEqual(evictionPreview(full(28), newNote()), [])
  })

  it('con 29, la nueva hace 30: nada que olvidar', () => {
    assert.deepEqual(evictionPreview(full(29), newNote()), [])
  })

  it('con 30, una nueva olvidaría exactamente la que elige trimMemories (la menos importante)', () => {
    const preview = evictionPreview(full(30), newNote())
    assert.deepEqual(preview.map((m) => m.id), ['m07'])
    const out = save(full(30), newNote())
    assert.equal(out.action, 'created')
    assert.deepEqual(out.action === 'created' && out.evicted.map((m) => m.id), ['m07'], 'la vista previa coincide con lo que hace applyProposal')
  })

  it('a igual importancia, la más antigua', () => {
    const same = Array.from({ length: 30 }, (_, i) => mem(`s${i}`, { updatedAt: 2_000 - i }))
    assert.deepEqual(evictionPreview(same, newNote()).map((m) => m.id), ['s29'])
  })

  it('una edición o sustitución con 30 memorias no avisa: no aumenta el número', () => {
    const memories = full(30)
    const editNote = ok(editProposal(memories[3], { kind: 'note', text: 'Texto corregido de la memoria.' }))
    assert.deepEqual(evictionPreview(memories, editNote), [])
    const withPaga = [...full(29), mem('p', { content: 'Recibe 35,00 € de paga cada mes.', fact: PAGA(3_500) })]
    assert.deepEqual(evictionPreview(withPaga, proposalFromFact(PAGA(4_000) as never)), [])
  })

  it('la vista previa no modifica la lista', () => {
    const memories = full(30)
    const copy = structuredClone(memories)
    evictionPreview(memories, newNote())
    assert.deepEqual(memories, copy)
  })
})

describe('memoria · agrupación y explicaciones', () => {
  const describe_ = (f: MemoryFact) => describeFact(f)
  const list = [
    mem('nota', { content: 'Le preocupa el margen.', updatedAt: 3 }),
    mem('ing', { content: 'Recibe 35,00 € de paga cada mes.', fact: PAGA(3_500), updatedAt: 2 }),
    mem('liq', { content: 'Quiere tener siempre al menos 500,00 € disponibles.', fact: LIQ(50_000), updatedAt: 4, source: 'manual' }),
    mem('old', { content: 'Piensa a largo plazo.', fact: { kind: 'horizon', value: 'long' }, updatedAt: 1 }),
  ]

  it('datos estructurados (editables y antiguos) por un lado y notas por otro, más reciente primero', () => {
    const { facts, notes } = groupMemories(list, describe_)
    assert.deepEqual(facts.map((v) => [v.memory.id, v.editable]), [['liq', true], ['ing', true], ['old', false]])
    assert.deepEqual(notes.map((v) => v.memory.id), ['nota'])
    assert.equal(facts[1].title, 'Ingreso recurrente: 35,00 € al mes · Paga')
    assert.equal(notes[0].title, 'Le preocupa el margen.')
  })

  it('el origen se muestra con su etiqueta', () => {
    const { facts, notes } = groupMemories(list, describe_)
    assert.equal(facts[0].sourceLabel, 'Añadido manualmente')
    assert.equal(notes[0].sourceLabel, 'De una conversación')
    assert.equal(memorySource({ source: undefined as never }), 'conversation', 'una memoria sin origen es de conversación')
    assert.deepEqual(SOURCE_LABEL, { conversation: 'De una conversación', manual: 'Añadido manualmente' })
  })

  it('las explicaciones son honestas con lo que hace AXIS hoy', () => {
    const income = memoryUsage(PAGA(3_500))
    assert.match(income, /no se suma a tu saldo/i)
    assert.match(income, /todavía no se usa en los cálculos/)
    assert.match(income, /regístralo en Movimientos/)
    assert.match(memoryUsage(LIQ(50_000)), /recomendarte/)
    assert.match(memoryUsage(undefined), /contexto cuando conversa contigo/)
    assert.match(memoryUsage({ kind: 'horizon', value: 'long' }), /no cambia sus recomendaciones/)
  })
})

describe('memoria · origen', () => {
  it('lo creado desde el chat es de conversación; lo manual, manual', () => {
    const chat = save([], { content: 'Prefiere no complicarse.', category: 'preference', importance: 'low', confidence: 0.7, replacesId: null })
    assert.equal(chat.memories[0].source, 'conversation')
    const manual = save([], ok(manualProposal({ kind: 'note', text: 'Prefiere no complicarse con nada.' })))
    assert.equal(manual.memories[0].source, 'manual')
  })

  it('ni el origen ni `origin` viajan al modelo', () => {
    const manual = save([], ok(manualProposal({ kind: 'recurringIncome', amount: '35', category: 'Paga' }))).memories
    const view = JSON.stringify(memoriesForModel(manual))
    assert.doesNotMatch(view, /source|origin|manual|conversation/)
  })
})

/* ------------------------------ Dexie ------------------------------ */

describe('memoria · persistencia', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
  })
  const reopen = async () => {
    db.close()
    await db.open()
  }

  it('alta manual de una nota y de un ingreso: persisten con su origen; el ingreso llega al perfil', async () => {
    assert.equal(await resolveMemoryProposal(ok(manualProposal({ kind: 'note', text: 'Prefiere no tocar los ahorros.' })), true, 1_000), 'accepted')
    assert.equal(await resolveMemoryProposal(ok(manualProposal({ kind: 'recurringIncome', amount: '35', category: 'Paga' })), true, 2_000), 'accepted')
    await reopen()
    const saved = await listUserMemories()
    assert.deepEqual(saved.map((m) => m.source), ['manual', 'manual'])
    assert.deepEqual((await getAxisMemory())?.profileFacts?.map((f) => f.fact), [PAGA(3_500)])
  })

  it('editar en su sitio: misma id y origen; borrar lo quita del perfil', async () => {
    await resolveMemoryProposal(proposalFromFact(PAGA(3_500) as never), true, 1_000)
    const [original] = await listUserMemories()
    await resolveMemoryProposal(ok(editProposal(original, { kind: 'recurringIncome', amount: '40', category: 'Paga' })), true, 2_000)
    await reopen()
    const [edited] = await listUserMemories()
    assert.deepEqual([edited.id, edited.source, edited.content], [original.id, 'conversation', 'Recibe 40,00 € de paga cada mes.'])
    const { deleteUserMemory } = await import('../../db/axis-memories')
    await deleteUserMemory(edited.id)
    assert.equal((await getAxisMemory())?.profileFacts, undefined)
  })

  it('con 30 memorias, guardar sin confirmar NO escribe; confirmando, olvida exactamente la anunciada', async () => {
    for (let i = 0; i < 30; i++) {
      await saveAcceptedProposal({ content: `Nota número ${i} para AXIS.`, category: 'context', importance: i === 4 ? 'low' : 'medium', confidence: 1, replacesId: null }, 1_000 + i)
    }
    const before = await listUserMemories()
    assert.equal(before.length, 30)
    const p = ok(manualProposal({ kind: 'note', text: 'La nota número treinta y uno.' }))
    const preview = evictionPreview(before, p)
    assert.equal(preview.length, 1)
    assert.equal(preview[0].content, 'Nota número 4 para AXIS.')

    assert.equal(await resolveMemoryProposal(p, true, 9_000), 'needs-confirmation')
    assert.deepEqual(await listUserMemories(), before, 'sin confirmación no cambia nada')

    assert.equal(await resolveMemoryProposal(p, true, 9_000, preview.map((m) => m.id)), 'accepted')
    await reopen()
    const after = await listUserMemories()
    assert.equal(after.length, 30)
    assert.ok(!after.some((m) => m.id === preview[0].id), 'la anunciada se ha olvidado')
    assert.ok(after.some((m) => m.content === 'La nota número treinta y uno.'))
  })

  it('una confirmación que ya no corresponde (la lista cambió) vuelve a pedir confirmación', async () => {
    for (let i = 0; i < 30; i++) {
      await saveAcceptedProposal({ content: `Nota número ${i} para AXIS.`, category: 'context', importance: 'medium', confidence: 1, replacesId: null }, 1_000 + i)
    }
    const p = ok(manualProposal({ kind: 'note', text: 'La nota número treinta y uno.' }))
    assert.equal(await resolveMemoryProposal(p, true, 9_000, ['id-que-no-es']), 'needs-confirmation')
    assert.equal((await listUserMemories()).length, 30)
  })

  it('rechazar no escribe nada', async () => {
    assert.equal(await resolveMemoryProposal(ok(manualProposal({ kind: 'note', text: 'Una nota que no se guarda.' })), false, 1_000), 'rejected')
    assert.equal((await listUserMemories()).length, 0)
  })
})
