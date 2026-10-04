/**
 * Puerta de datos de perfil y tarjeta editable (fase 2 de la memoria de AXIS).
 *
 * Reproduce el problema real de producción: el modelo devolvía `fact: null`
 * (y, con ejemplos en el prompt, datos de otro tipo). Ahora el dato sale del
 * extractor, lo confirma el usuario y nunca se guarda un dato del modelo que
 * no coincida con lo que el usuario dijo.
 */
import 'fake-indexeddb/auto'
import { beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildEditedProposal, contentForFact, draftFor, gateProposalFact, proposalFromFact, validationMessage, withProfileProposal } from '../chat/profile-proposal'
import { isSavableProposal, replacementFor } from '../chat/memory'
import { createChatEngine, type ChatTransport } from '../chat/engine'
import { chatWithProvider } from '../ai/server/analyze'
import { buildFinancialContext } from '../context'
import { extractProfileFacts } from '../profile/extract'
import type { MemoryFact } from '../profile/types'
import type { ChatInput, MemoryProposal } from '../chat/types'
import type { MarketAIProvider } from '../../ai/providers/types'
import { db } from '../../db/db'
import { clearAllData } from '../../db/backup'
import { getAxisMemory } from '../../db/axis-memory'
import { listUserMemories, resolveMemoryProposal } from '../../db/axis-memories'
import { config, healthyMovements, snapshot, TODAY } from './fixtures'

const PAGA_MSG = 'Cada mes me van a dar 35 € de paga, recuérdalo siempre'
const LIQ_MSG = 'Quiero tener siempre al menos 5.000 € disponibles. Recuérdalo'
const PAGA: MemoryFact = { kind: 'recurringIncome', cents: 3_500, frequency: 'monthly', category: 'Paga' }
const LIQ: MemoryFact = { kind: 'minLiquidity', cents: 500_000 }
const modelProposal = (extra: Partial<MemoryProposal> = {}): MemoryProposal => ({ content: 'Quiere tener dinero de reserva.', category: 'preference', importance: 'medium', confidence: 0.7, replacesId: null, ...extra })

describe('puerta · el extractor manda', () => {
  it('fact: null del modelo (el caso de producción) → se añade el dato del extractor', () => {
    const { proposal, outcome } = gateProposalFact(modelProposal({ fact: null }), extractProfileFacts(PAGA_MSG))
    assert.equal(outcome, 'attached-extractor')
    assert.deepEqual(proposal?.fact, PAGA)
    assert.equal(proposal?.content, 'Recibe 35,00 € de paga cada mes.')
  })

  it('el modelo propone un tipo equivocado (lo que pasó con 722ca83) → se sustituye por el del extractor', () => {
    for (const wrong of [
      { kind: 'riskAttitude', value: 'conservative' },
      { kind: 'irregularIncome', value: false },
      { kind: 'minLiquidity', cents: 1 },
    ] as MemoryFact[]) {
      const { proposal, outcome } = gateProposalFact(modelProposal({ fact: wrong }), extractProfileFacts(LIQ_MSG))
      assert.equal(outcome, 'replaced-model')
      assert.deepEqual(proposal?.fact, LIQ)
      assert.equal(proposal?.content, 'Quiere tener siempre al menos 5.000,00 € disponibles.')
    }
  })

  it('el modelo coincide con el extractor → se conserva su propuesta', () => {
    const p = modelProposal({ content: 'Quiere un colchón de 5.000 €.', fact: { kind: 'minLiquidity', cents: 500_000 } })
    const { proposal, outcome } = gateProposalFact(p, extractProfileFacts(LIQ_MSG))
    assert.equal(outcome, 'kept-model')
    assert.equal(proposal?.content, p.content)
  })

  it('el modelo no propone nada → se crea la propuesta del extractor', () => {
    const { proposal, outcome } = gateProposalFact(null, extractProfileFacts(PAGA_MSG))
    assert.equal(outcome, 'created-extractor')
    assert.deepEqual(proposal, proposalFromFact(PAGA as never))
    assert.ok(proposal && isSavableProposal(proposal))
  })

  it('sin categoría → propuesta incompleta, que no es guardable tal cual', () => {
    const { proposal, outcome } = gateProposalFact(modelProposal({ fact: { kind: 'horizon', value: 'long' } }), extractProfileFacts('Me dan 35 € al mes'))
    assert.equal(outcome, 'incomplete')
    assert.equal(proposal?.fact, undefined)
    assert.deepEqual(proposal?.incompleteFact, { kind: 'recurringIncome', cents: 3_500, frequency: 'monthly' })
    assert.equal(proposal && isSavableProposal(proposal), false)
  })

  it('el modelo propone un dato y el mensaje no declara nada → queda solo el texto', () => {
    const { proposal, outcome } = gateProposalFact(modelProposal({ fact: { kind: 'riskAttitude', value: 'dynamic' } }), extractProfileFacts('Prefiero no complicarme con inversiones'))
    assert.equal(outcome, 'dropped-model')
    assert.equal(proposal && 'fact' in proposal, false)
    assert.equal(proposal?.content, 'Quiere tener dinero de reserva.')
  })

  it('mensaje ambiguo → nunca un dato (tercera persona, aproximado, condicional…)', () => {
    for (const m of ['A mi hermano le dan 35 € de paga al mes', 'Me dan unos 35 € de paga al mes', 'Si me dieran 35 € de paga al mes', 'Pago 35 € al mes de gimnasio']) {
      const { proposal } = gateProposalFact(modelProposal({ fact: PAGA }), extractProfileFacts(m))
      assert.equal(proposal?.fact, undefined, m)
      assert.equal(proposal?.incompleteFact, undefined, m)
    }
  })

  it('sin propuesta y sin declaración → nada', () => {
    assert.deepEqual(gateProposalFact(null, extractProfileFacts('¿Cómo voy?')), { proposal: null, outcome: 'none' })
  })

  it('idempotente: aplicarla dos veces da lo mismo (servidor y navegador usan la misma)', () => {
    for (const m of [PAGA_MSG, LIQ_MSG, 'Me dan 35 € al mes', '¿Cómo voy?']) {
      const once = gateProposalFact(modelProposal({ fact: null }), extractProfileFacts(m)).proposal
      const twice = gateProposalFact(once, extractProfileFacts(m)).proposal
      assert.deepEqual(twice, once, m)
    }
  })
})

describe('tarjeta editable · lógica', () => {
  const created = proposalFromFact(PAGA as never)

  it('sin cambios conserva la propuesta y su texto', () => {
    const r = buildEditedProposal(created, draftFor(created)!.draft)
    assert.equal(r.ok, true)
    assert.deepEqual(r.ok && r.proposal, created)
  })

  it('importe corregido → dato y texto nuevos, coherentes', () => {
    const r = buildEditedProposal(created, { amount: '40', category: 'Paga' })
    assert.ok(r.ok)
    assert.deepEqual(r.ok && r.proposal.fact, { kind: 'recurringIncome', cents: 4_000, frequency: 'monthly', category: 'Paga' })
    assert.equal(r.ok && r.proposal.content, 'Recibe 40,00 € de paga cada mes.')
  })

  it('categoría cambiada', () => {
    const r = buildEditedProposal(created, { amount: '35,00', category: 'Regalos' })
    assert.equal(r.ok && r.proposal.content, 'Recibe 35,00 € en regalos cada mes.')
  })

  it('propuesta incompleta: sin categoría no se puede guardar; al elegirla, sí', () => {
    const incomplete = gateProposalFact(null, extractProfileFacts('Me dan 35 € al mes')).proposal!
    assert.equal(draftFor(incomplete)?.draft.category, null)
    const missing = buildEditedProposal(incomplete, draftFor(incomplete)!.draft)
    assert.equal(missing.ok, false)
    const chosen = buildEditedProposal(incomplete, { ...draftFor(incomplete)!.draft, category: 'Otros' })
    assert.ok(chosen.ok)
    assert.equal(chosen.ok && 'incompleteFact' in chosen.proposal, false)
    assert.ok(chosen.ok && isSavableProposal(chosen.proposal))
    assert.equal(chosen.ok && chosen.proposal.content, 'Recibe 35,00 € de otros ingresos cada mes.')
  })

  it('propuesta incompleta: sin aviso antes de interactuar, pero sin poder guardar', () => {
    const incomplete = gateProposalFact(null, extractProfileFacts('Me dan 35 € al mes')).proposal!
    const untouched = buildEditedProposal(incomplete, draftFor(incomplete)!.draft)
    assert.equal(untouched.ok, false, 'el botón sigue desactivado')
    assert.equal(validationMessage(untouched, false), null, 'no se muestra un error al abrir la tarjeta')
  })

  it('después de interactuar, los avisos aparecen solo cuando hacen falta', () => {
    const incomplete = gateProposalFact(null, extractProfileFacts('Me dan 35 € al mes')).proposal!
    // Toca el importe sin elegir categoría: ahora sí hace falta pedirla.
    const amountOnly = buildEditedProposal(incomplete, { amount: '40', category: null })
    assert.equal(validationMessage(amountOnly, true), 'Elige si es paga, regalos u otros ingresos.')
    // Elige categoría: el aviso desaparece y se puede guardar.
    const chosen = buildEditedProposal(incomplete, { amount: '40', category: 'Paga' })
    assert.equal(validationMessage(chosen, true), null)
    assert.equal(chosen.ok, true)
    // Borra el importe: aviso del importe.
    assert.equal(validationMessage(buildEditedProposal(incomplete, { amount: '', category: 'Paga' }), true), 'Introduce un importe mayor que cero.')
  })

  it('importes no válidos no se pueden guardar', () => {
    for (const amount of ['', '0', '-5', 'abc', '12,5,0']) assert.equal(buildEditedProposal(created, { amount, category: 'Paga' }).ok, false, amount)
  })

  it('liquidez mínima: solo importe', () => {
    const liq = proposalFromFact(LIQ as never)
    assert.equal(draftFor(liq)?.kind, 'minLiquidity')
    const r = buildEditedProposal(liq, { amount: '6.000', category: null })
    assert.deepEqual(r.ok && r.proposal.fact, { kind: 'minLiquidity', cents: 600_000 })
    assert.equal(r.ok && r.proposal.content, contentForFact({ kind: 'minLiquidity', cents: 600_000 }))
  })

  it('«Antes / Ahora» se calcula sobre el valor editado', () => {
    const existing = [{ id: 'p', content: 'Recibe 20,00 € de paga cada mes.', category: 'financial_plan' as const, importance: 'high' as const, confidence: 1, source: 'conversation' as const, createdAt: 0, updatedAt: 0, fact: { kind: 'recurringIncome', cents: 2_000, frequency: 'monthly', category: 'Paga' } as MemoryFact }]
    const edited = buildEditedProposal(created, { amount: '40', category: 'Paga' })
    assert.ok(edited.ok)
    assert.deepEqual(edited.ok && replacementFor(edited.proposal, existing).replacedFacts, [existing[0].fact])
    const regalos = buildEditedProposal(created, { amount: '40', category: 'Regalos' })
    assert.deepEqual(regalos.ok && replacementFor(regalos.proposal, existing).replacedFacts, [], 'otra categoría no sustituye')
  })
})

/* ------------------------- integración: servidor (IA) ------------------------- */

const context = () => buildFinancialContext(snapshot({ config: config(100_000), movements: healthyMovements() }), TODAY)
function modelReturning(memoryProposal: unknown): MarketAIProvider {
  const output = { reply: 'Entendido.', confidence: 'media', nextStep: null, memoryProposal }
  return { id: 'mock', model: 'mock', completeWithUsage: async () => ({ output, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }), complete: async () => output }
}
async function serverChat(message: string, memoryProposal: unknown) {
  const lines: string[] = []
  const real = console.info
  console.info = (...args: unknown[]) => void lines.push(args.map(String).join(' '))
  try {
    const reply = await chatWithProvider(modelReturning(memoryProposal), { context: context(), conversation: { summary: null, recent: [] }, message })
    const line = lines.find((l) => l.startsWith('[axis] chat: propuesta: ')) ?? ''
    return { reply, log: JSON.parse(line.slice(line.indexOf('{'))) as Record<string, unknown>, line }
  } finally {
    console.info = real
  }
}

describe('integración · servidor con modelo simulado', () => {
  const raw = (fact: unknown) => ({ content: 'Quiere tener dinero de reserva.', category: 'preference', importance: 'medium', confidence: 0.7, replacesId: null, fact })

  it('fact: null ante la frase de la paga → sale el dato del extractor', async () => {
    const { reply, log } = await serverChat(PAGA_MSG, raw(null))
    assert.deepEqual(reply.memoryProposal?.fact, PAGA)
    assert.deepEqual(log, { proposal: 'present', fact: 'none:null', kept: true, extractor: 'recurringIncome', gate: 'attached-extractor' })
  })

  it('tipo equivocado ante la frase de liquidez → nunca sale del servidor', async () => {
    const { reply, log } = await serverChat(LIQ_MSG, raw({ kind: 'riskAttitude', value: 'conservative' }))
    assert.deepEqual(reply.memoryProposal?.fact, LIQ)
    assert.equal(log.gate, 'replaced-model')
  })

  it('sin propuesta del modelo → la crea el extractor', async () => {
    const { reply, log } = await serverChat(PAGA_MSG, null)
    assert.deepEqual(reply.memoryProposal?.fact, PAGA)
    assert.equal(log.gate, 'created-extractor')
  })

  it('sin categoría → propuesta incompleta', async () => {
    const { reply, log } = await serverChat('Me dan 35 € al mes', null)
    assert.equal(reply.memoryProposal?.fact, undefined)
    assert.deepEqual(reply.memoryProposal?.incompleteFact, { kind: 'recurringIncome', cents: 3_500, frequency: 'monthly' })
    assert.deepEqual([log.extractor, log.gate], ['ambiguous:no-category', 'incomplete'])
  })

  it('frase sobre otra persona → sin dato, aunque el modelo lo proponga', async () => {
    const { reply, log } = await serverChat('A mi hermano le dan 35 € de paga al mes', raw(PAGA))
    assert.equal(reply.memoryProposal?.fact, undefined)
    assert.deepEqual([log.extractor, log.gate], ['ambiguous:third-person', 'dropped-model'])
  })

  it('el texto de la respuesta no cambia y el log no lleva importes ni textos', async () => {
    const { reply, line } = await serverChat(PAGA_MSG, raw(null))
    assert.equal(reply.text, 'Entendido.')
    for (const forbidden of ['35', '3500', 'paga de', 'Recibe', 'reserva']) assert.ok(!line.includes(forbidden), `el log contiene «${forbidden}»`)
  })
})

/* ------------------------ integración: respuesta local ------------------------ */

describe('integración · respuesta local (sin IA)', () => {
  const unavailable: ChatTransport = { isAvailable: async () => false, ask: async () => { throw new Error('no debe llamarse') } }
  const input = (message: string): ChatInput => ({ context: context(), conversation: { summary: null, recent: [] }, message })

  it('sin IA también se puede recordar la paga: la propuesta sale del extractor', async () => {
    const reply = await createChatEngine({ transport: unavailable }).ask(input(PAGA_MSG))
    assert.equal(reply.engine.isAI, false)
    assert.deepEqual(reply.memoryProposal?.fact, PAGA)
  })

  it('sin conexión, propuesta incompleta si falta la categoría', async () => {
    const reply = await createChatEngine({ transport: unavailable, isOffline: () => true }).ask(input('Me dan 35 € al mes'))
    assert.ok(reply.memoryProposal?.incompleteFact)
  })

  it('sin declaración, la respuesta local sigue sin propuesta', async () => {
    const reply = await createChatEngine({ transport: unavailable }).ask(input('¿Cómo voy este mes?'))
    assert.equal(reply.memoryProposal, null)
  })

  it('con IA, el navegador no vuelve a aplicar la puerta: usa lo que manda el servidor', async () => {
    const fromServer = withProfileProposal({ text: 'Entendido.', confidence: 'media', memoryProposal: null, engine: { id: 'external-ai', label: 'IA', isAI: true }, generatedAt: '2026-10-04T10:00:00.000Z' }, PAGA_MSG).reply
    const ai: ChatTransport = { isAvailable: async () => true, ask: async () => fromServer }
    const reply = await createChatEngine({ transport: ai }).ask(input(PAGA_MSG))
    assert.deepEqual(reply.memoryProposal, fromServer.memoryProposal)
  })
})

/* ------------------------------ integración: Dexie ------------------------------ */

describe('integración · confirmar en la tarjeta y guardar', () => {
  beforeEach(async () => {
    if (!db.isOpen()) await db.open()
    await clearAllData()
  })
  const reopen = async () => {
    db.close()
    await db.open()
  }
  const incomes = async () => (await getAxisMemory())?.profileFacts?.map((f) => f.fact)

  it('aceptar el candidato tal cual → guardado y persistente', async () => {
    const proposal = gateProposalFact(modelProposal({ fact: null }), extractProfileFacts(PAGA_MSG)).proposal!
    assert.equal(await resolveMemoryProposal(proposal, true, 1_000), 'accepted')
    await reopen()
    assert.deepEqual(await incomes(), [PAGA])
  })

  it('aceptar con el importe corregido → se guarda lo corregido, con su texto', async () => {
    const proposal = gateProposalFact(null, extractProfileFacts(PAGA_MSG)).proposal!
    const edited = buildEditedProposal(proposal, { amount: '40', category: 'Paga' })
    assert.ok(edited.ok)
    if (edited.ok) await resolveMemoryProposal(edited.proposal, true, 1_000)
    await reopen()
    const [saved] = await listUserMemories()
    assert.deepEqual(saved.fact, { kind: 'recurringIncome', cents: 4_000, frequency: 'monthly', category: 'Paga' })
    assert.equal(saved.content, 'Recibe 40,00 € de paga cada mes.')
  })

  it('propuesta incompleta: aceptarla sin categoría no guarda nada; con categoría, sí', async () => {
    const incomplete = gateProposalFact(null, extractProfileFacts('Me dan 35 € al mes')).proposal!
    assert.equal(await resolveMemoryProposal(incomplete, true, 1_000), 'rejected')
    assert.equal((await listUserMemories()).length, 0)
    const chosen = buildEditedProposal(incomplete, { amount: '35', category: 'Regalos' })
    if (chosen.ok) assert.equal(await resolveMemoryProposal(chosen.proposal, true, 2_000), 'accepted')
    assert.deepEqual(await incomes(), [{ kind: 'recurringIncome', cents: 3_500, frequency: 'monthly', category: 'Regalos' }])
  })

  it('«No recordar» no guarda nada', async () => {
    const proposal = gateProposalFact(null, extractProfileFacts(PAGA_MSG)).proposal!
    assert.equal(await resolveMemoryProposal(proposal, false, 1_000), 'rejected')
    assert.equal((await listUserMemories()).length, 0)
  })

  it('sustitución con el valor editado: una sola paga, la nueva', async () => {
    await resolveMemoryProposal(proposalFromFact({ kind: 'recurringIncome', cents: 2_000, frequency: 'monthly', category: 'Paga' }), true, 1_000)
    const proposal = gateProposalFact(null, extractProfileFacts(PAGA_MSG)).proposal!
    const edited = buildEditedProposal(proposal, { amount: '45', category: 'Paga' })
    if (edited.ok) await resolveMemoryProposal(edited.proposal, true, 2_000)
    await reopen()
    assert.equal((await listUserMemories()).length, 1)
    assert.deepEqual(await incomes(), [{ kind: 'recurringIncome', cents: 4_500, frequency: 'monthly', category: 'Paga' }])
  })

  it('un dato del modelo que no coincide nunca llega a guardarse', async () => {
    const proposal = gateProposalFact(modelProposal({ fact: { kind: 'riskAttitude', value: 'conservative' } }), extractProfileFacts(LIQ_MSG)).proposal!
    await resolveMemoryProposal(proposal, true, 1_000)
    assert.deepEqual(await incomes(), [LIQ])
  })
})
