/**
 * Copia de seguridad v2 (fase 4): las memorias de AXIS entran en la copia, y
 * solo ellas. Las copias v1 siguen funcionando y conservan las memorias del
 * dispositivo. Una memoria no válida rechaza la copia entera, y restaurar es
 * todo o nada.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { db } from '../db'
import { BACKUP_FORMAT, BACKUP_VERSION, clearAllData, exportBackup, parseBackup, restoreBackup, type Backup } from '../backup'
import { listUserMemories, resolveMemoryProposal } from '../axis-memories'
import { getAxisMemory, rememberConclusion } from '../axis-memory'
import { putConversation } from '../axis-conversation'
import { setInitialBalance } from '../config'
import { addMovement } from '../movements'
import { addObjective } from '../objectives'
import { CHAT_LIMITS, type UserMemory } from '../../axis/chat/types'
import { manualProposal } from '../../axis/chat/memory-editor'
import { proposalFromFact } from '../../axis/chat/profile-proposal'
import { profileFromMemory } from '../../axis/profile/derive'
import { analyzeLocally } from '../../axis/local-engine'
import { buildFinancialContext } from '../../axis/context'
import type { MemoryFact } from '../../axis/profile/types'
import { config, healthyMovements, NOW, snapshot, TODAY } from '../../axis/__tests__/fixtures'

const PAGA: MemoryFact = { kind: 'recurringIncome', cents: 3_500, frequency: 'monthly', category: 'Paga' }
const memory = (id: string, overrides: Partial<UserMemory> = {}): UserMemory => ({
  id,
  content: `Memoria ${id} de prueba.`,
  category: 'context',
  importance: 'high',
  confidence: 1,
  source: 'manual',
  createdAt: 1_000,
  updatedAt: 2_000,
  ...overrides,
})
const file = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ format: BACKUP_FORMAT, version: 2, exportedAt: '2026-10-04T10:00:00.000Z', config: null, movements: [], objectives: [], positions: [], memories: [], ...overrides })
const v1 = () => JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: '2026-09-01T00:00:00.000Z', config: null, movements: [], objectives: [], positions: [] })

async function seedDevice() {
  await setInitialBalance(100_000)
  await addMovement({ type: 'ingreso', amountCents: 200_000, date: '2026-09-01', category: 'Paga' })
  await addObjective({ name: 'Viaje', currentCents: 10_000, targetCents: 50_000 })
  const note = manualProposal({ kind: 'note', text: 'Prefiere no tocar los ahorros del viaje.' })
  assert.ok(note.ok)
  if (note.ok) await resolveMemoryProposal(note.proposal, true, 3_000)
  await resolveMemoryProposal(proposalFromFact(PAGA as never), true, 4_000)
}

/** Foto de todas las tablas que toca restaurar. */
async function tables() {
  return {
    config: await db.config.toArray(),
    movements: await db.movements.toArray(),
    objectives: await db.objectives.toArray(),
    positions: await db.positions.toArray(),
    memories: await db.axisMemories.toArray(),
  }
}

beforeEach(async () => {
  if (!db.isOpen()) await db.open()
  await clearAllData()
})

describe('copia v2 · exportación', () => {
  it('es v2 e incluye las memorias campo a campo, sin transformarlas', async () => {
    await seedDevice()
    const backup = await exportBackup()
    assert.equal(backup.version, 2)
    assert.equal(BACKUP_VERSION, 2)
    assert.deepEqual(backup.memories, await db.axisMemories.toArray())
    const paga = backup.memories?.find((m) => m.fact)
    assert.deepEqual(Object.keys(paga ?? {}).sort(), ['category', 'confidence', 'content', 'createdAt', 'fact', 'id', 'importance', 'source', 'updatedAt'])
  })

  it('no incluye conversación, conclusiones, mercado ni profileFacts', async () => {
    await seedDevice()
    await putConversation({ summary: 'resumen secreto', messages: [{ id: 'u', role: 'user', text: 'mensaje de conversación', createdAt: 1 }] })
    const result = analyzeLocally({ context: buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements() }), TODAY) }, NOW)
    if (result.status === 'analysis') await rememberConclusion(result.analysis)
    await db.market.put({ key: 'latest', research: { marca: 'dato de mercado' } } as never)
    const text = JSON.stringify(await exportBackup())
    for (const forbidden of ['mensaje de conversación', 'resumen secreto', 'previousConclusions', 'dato de mercado', 'profileFacts', 'conversation":{']) {
      assert.ok(!text.includes(forbidden), `la copia contiene «${forbidden}»`)
    }
    assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['config', 'exportedAt', 'format', 'memories', 'movements', 'objectives', 'positions', 'version'])
  })
})

describe('copia v2 · ida y vuelta', () => {
  it('exportar → borrar todo → restaurar: memorias idénticas y mismo perfil', async () => {
    await seedDevice()
    const before = await tables()
    const profileBefore = profileFromMemory(await getAxisMemory())
    const exported = JSON.stringify(await exportBackup())
    await clearAllData()
    assert.equal((await listUserMemories()).length, 0)

    await restoreBackup(parseBackup(exported))
    db.close()
    await db.open()
    const after = await tables()
    const byId = (a: UserMemory, b: UserMemory) => a.id.localeCompare(b.id)
    assert.deepEqual([...after.memories].sort(byId), [...before.memories].sort(byId), 'mismas ids, origen, datos y fechas')
    // Los datos financieros viajan en JSON (las claves con valor undefined desaparecen, como en la v1).
    const asJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
    assert.deepEqual(after.movements, asJson(before.movements))
    assert.deepEqual(after.objectives, asJson(before.objectives))
    assert.deepEqual(after.config, asJson(before.config))
    assert.deepEqual(profileFromMemory(await getAxisMemory()), profileBefore)
  })

  it('restaurar una v2 sustituye las memorias del dispositivo (no las mezcla)', async () => {
    await seedDevice()
    const incoming = [memory('a1', { content: 'Memoria que llega en la copia.' })]
    await restoreBackup(parseBackup(file({ memories: incoming })))
    assert.deepEqual(await listUserMemories(), incoming)
  })

  it('una v2 con la lista de memorias vacía deja el dispositivo sin memorias', async () => {
    await seedDevice()
    await restoreBackup(parseBackup(file({ memories: [] })))
    assert.equal((await listUserMemories()).length, 0)
  })
})

describe('copia v1 · compatibilidad', () => {
  it('sigue siendo válida, sin memorias', () => {
    const backup = parseBackup(v1())
    assert.equal(backup.version, 1)
    assert.equal(backup.memories, undefined)
  })

  it('restaurarla conserva las memorias actuales y restaura el resto como antes', async () => {
    await seedDevice()
    const memoriesBefore = await db.axisMemories.toArray()
    const old = JSON.parse(v1())
    old.movements = [{ id: 'm1', type: 'ingreso', amountCents: 145_000, date: '2026-08-01', category: 'Trabajo', createdAt: 1, updatedAt: 1 }]
    await restoreBackup(parseBackup(JSON.stringify(old)))
    assert.deepEqual(await db.axisMemories.toArray(), memoriesBefore, 'memorias intactas')
    const movements = await db.movements.toArray()
    assert.deepEqual(movements.map((m) => [m.id, m.category, m.amountCents]), [['m1', 'Paga', 145_000]], 'resto restaurado y migrado')
    assert.equal(await db.objectives.count(), 0)
    assert.equal(await db.config.count(), 0)
  })

  it('una versión desconocida se rechaza', () => {
    assert.throws(() => parseBackup(file({ version: 3 })), /Versión de copia no compatible/)
    assert.throws(() => parseBackup(file({ version: '2' })), /Versión de copia no compatible/)
  })
})

describe('copia v2 · validación de memorias (todo o nada)', () => {
  const INVALID: Array<[string, unknown]> = [
    ['sin lista de memorias', undefined],
    ['memorias que no son una lista', { a: 1 }],
    ['estructura inválida', ['texto']],
    ['tipo de dato desconocido', [memory('x', { fact: { kind: 'invest', value: true } as never })]],
    ['dato no válido', [memory('x', { fact: { ...PAGA, cents: 12.5 } as never })]],
    ['categoría de ingreso no válida', [memory('x', { fact: { ...PAGA, category: 'Trabajo' } as never })]],
    ['origen desconocido', [memory('x', { source: 'import' as never })]],
    ['ids repetidos', [memory('x'), memory('x', { content: 'Otra memoria distinta.' })]],
    ['dos datos del mismo hueco', [memory('a', { fact: PAGA }), memory('b', { fact: { ...PAGA, cents: 4_000 } })]],
    [`más de ${CHAT_LIMITS.MAX_MEMORIES} memorias`, Array.from({ length: CHAT_LIMITS.MAX_MEMORIES + 1 }, (_, i) => memory(`m${i}`))],
    ['secreto en el texto', [memory('x', { content: 'Mi PIN es 1234 y la contraseña hunter2' })]],
    ['IBAN en el texto', [memory('x', { content: 'Mi IBAN es ES9121000418450200051332' })]],
    ['texto demasiado corto', [memory('x', { content: 'corto' })]],
    ['texto demasiado largo', [memory('x', { content: 'x'.repeat(CHAT_LIMITS.MAX_MEMORY_CHARS + 1) })]],
    ['categoría de memoria desconocida', [memory('x', { category: 'finanzas' as never })]],
    ['importancia desconocida', [memory('x', { importance: 'urgent' as never })]],
    ['confianza fuera de rango', [memory('x', { confidence: 2 })]],
    ['fecha no entera', [memory('x', { createdAt: 1.5 })]],
    ['id vacío', [memory('', {})]],
    ['campo desconocido (propuesta incompleta colada)', [{ ...memory('x'), incompleteFact: { kind: 'recurringIncome', cents: 1, frequency: 'monthly' } }]],
    ['dato null', [{ ...memory('x'), fact: null }]],
  ]

  for (const [name, memories] of INVALID) {
    it(`rechaza la copia: ${name}`, () => {
      const payload = memories === undefined ? (() => { const o = JSON.parse(file()); delete o.memories; return JSON.stringify(o) })() : file({ memories })
      assert.throws(() => parseBackup(payload), /memorias de AXIS/)
    })
  }

  it('acepta los tipos antiguos válidos sin convertirlos', () => {
    const legacy = [memory('h', { fact: { kind: 'horizon', value: 'long' } }), memory('r', { fact: { kind: 'riskAttitude', value: 'balanced' } }), memory('i', { fact: { kind: 'irregularIncome', value: true } }), memory('p', { fact: { kind: 'priorities', objectiveIds: ['o1'] } })]
    assert.deepEqual(parseBackup(file({ memories: legacy })).memories, legacy)
  })

  it('una memoria sin origen se toma como de conversación', () => {
    const { source: _s, ...withoutSource } = memory('x')
    void _s
    assert.equal(parseBackup(file({ memories: [withoutSource] })).memories?.[0].source, 'conversation')
  })
})

describe('copia v2 · atomicidad', () => {
  it('una memoria no válida no modifica ninguna tabla ni borra las memorias actuales', async () => {
    await seedDevice()
    const before = await tables()
    const bad = file({
      config: { key: 'config', initialBalanceCents: 1, configuredAt: 1, updatedAt: 1 },
      movements: [{ id: 'nuevo', type: 'gasto', amountCents: 1, date: '2026-01-01', category: 'Comida', createdAt: 1, updatedAt: 1 }],
      memories: [memory('ok'), memory('mala', { fact: { kind: 'invest', value: true } as never })],
    })
    assert.throws(() => parseBackup(bad), /memorias de AXIS/)
    assert.deepEqual(await tables(), before)
  })

  it('restoreBackup también se niega a escribir memorias no válidas (aunque no pasen por parseBackup)', async () => {
    await seedDevice()
    const before = await tables()
    const forged: Backup = { format: BACKUP_FORMAT, version: 2, exportedAt: '', config: null, movements: [], objectives: [], positions: [], memories: [memory('x', { content: 'Mi PIN es 1234 y la contraseña hunter2' })] }
    await assert.rejects(restoreBackup(forged), /memorias de AXIS/)
    assert.deepEqual(await tables(), before)
  })

  it('si la escritura falla a mitad, la transacción deja todo como estaba', async () => {
    await seedDevice()
    const before = await tables()
    // Dos movimientos con la misma id: falla al escribir, después de vaciar las tablas dentro de la transacción.
    const duplicated = { id: 'dup', type: 'gasto', amountCents: 1, date: '2026-01-01', category: 'Comida', createdAt: 1, updatedAt: 1 } as const
    const forged: Backup = { format: BACKUP_FORMAT, version: 2, exportedAt: '', config: null, movements: [duplicated, duplicated], objectives: [], positions: [], memories: [memory('nueva')] }
    await assert.rejects(restoreBackup(forged))
    assert.deepEqual(await tables(), before)
  })
})
