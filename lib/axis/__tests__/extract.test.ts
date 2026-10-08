/**
 * Extractor determinista de datos de perfil (fase 2 de la memoria de AXIS).
 * Solo declaraciones explícitas; ante la duda, ningún candidato y su motivo.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractionLabel, extractProfileFacts, type AmbiguityReason } from '../profile/extract'
import { isValidMemoryFact, type MemoryFact } from '../profile/types'

const income = (cents: number, category: 'Paga' | 'Regalos' | 'Otros'): MemoryFact => ({ kind: 'recurringIncome', cents, frequency: 'monthly', category })
const liquidity = (cents: number): MemoryFact => ({ kind: 'minLiquidity', cents })

const POSITIVES: Array<[string, MemoryFact]> = [
  // Las dos frases reales de las pruebas en producción.
  ['Cada mes me van a dar 35 € de paga, recuérdalo siempre', income(3_500, 'Paga')],
  ['Quiero tener siempre al menos 5.000 € disponibles. Recuérdalo', liquidity(500_000)],
  // Formatos de importe.
  ['Me dan 35€ de paga al mes', income(3_500, 'Paga')],
  ['Mi paga es de 35 euros al mes', income(3_500, 'Paga')],
  // Sueldo, nómina o cobro del propio usuario: Otros, nunca Paga.
  ['Cobro 1.200 € al mes', income(120_000, 'Otros')],
  ['Mi nómina es de 1.234,56 € al mes', income(123_456, 'Otros')],
  ['Tengo un sueldo de 900 € mensuales', income(90_000, 'Otros')],
  ['Cobro 600 €/mes', income(60_000, 'Otros')],
  ['Mi padre me da 35 € de paga al mes', income(3_500, 'Paga')],
  ['Todos los meses me regalan 20 €', income(2_000, 'Regalos')],
  ['Mi abuela me da 20 € al mes de regalo', income(2_000, 'Regalos')],
  ['Recibo 50 € al mes de otros ingresos', income(5_000, 'Otros')],
  ['Cada mes me dan 35 € de paga, ¿lo recuerdas?', income(3_500, 'Paga')],
  // Liquidez mínima.
  ['Quiero tener siempre 300 € disponibles', liquidity(30_000)],
  ['Quiero mantener como mínimo 1.000 € en la cuenta', liquidity(100_000)],
  ['Mi colchón de 2.000 € no lo quiero tocar', liquidity(200_000)],
]

const AMBIGUOUS: Array<[string, AmbiguityReason]> = [
  ['Me dan 35 € al mes', 'no-category'],
  ['Gano 1.200 € al mes', 'no-category'],
  ['Me ingresan 35 € al mes', 'no-category'],
  // «Me paga(n)» es un verbo: no dice que sea una paga.
  ['Me pagan 35.50 € cada mes', 'no-category'],
  ['Mi padre me paga 35 € al mes', 'no-category'],
  // Sueldo, nómina o cobro sin dueño claro: abstenerse.
  ['El sueldo es de 1.500 € al mes', 'unclear-owner'],
  ['El cobro de 500 € al mes llega el día 5', 'unclear-owner'],
  ['Me dan entre 30 y 40 € de paga al mes', 'multiple-amounts'],
  ['Me dan 35 € de paga al mes y 50 € en verano', 'multiple-amounts'],
  ['Me dan unos 35 € de paga al mes', 'approximate'],
  ['Me dan más o menos 35 € de paga al mes', 'approximate'],
  ['Si me dieran 35 € de paga al mes ahorraría', 'conditional'],
  ['Me gustaría cobrar 1.500 € al mes', 'conditional'],
  ['Quizá me den 35 € de paga al mes', 'conditional'],
  ['Ya no me dan paga, antes eran 35 € al mes', 'negated'],
  ['No me dan 35 € de paga al mes', 'negated'],
  ['Me daban 35 € de paga al mes', 'past'],
  ['Me dan 35 € de paga a la semana', 'other-frequency'],
  ['Me dan 35 € de paga al año', 'other-frequency'],
  ['Me dan una paga extra de 200 € al mes de junio', 'other-frequency'],
  ['¿Me darán 35 € de paga al mes?', 'question'],
  ['Pago 35 € al mes de gimnasio', 'expense'],
  ['Gasto 35 € al mes en comida', 'expense'],
  ['A mi hermano le dan 35 € de paga al mes', 'third-person'],
  ['A mi hijo le pagan 50 € al mes', 'third-person'],
  ['La paga de mi hija es de 20 € al mes', 'third-person'],
  ['Mi novia cobra 1.500 € al mes', 'third-person'],
  ['Mi hijo tiene una paga de 30 € al mes', 'third-person'],
  ['Le pagan 50 € al mes', 'third-person'],
]

const NOTHING = [
  'Hola, ¿qué tal voy este mes?',
  'Quiero ahorrar al menos 1.000 € para el verano',
  'Quiero ahorrar 50 € al mes',
  'Me dan treinta y cinco euros de paga al mes',
  'Me dan 35 de paga al mes',
  'Cada mes me dan paga',
  'El viaje cuesta 600 €',
]

describe('extractor · candidatos', () => {
  for (const [message, expected] of POSITIVES) {
    it(message, () => {
      const e = extractProfileFacts(message)
      assert.deepEqual(e.candidates, [expected])
      assert.equal(e.ambiguity, null)
      assert.ok(isValidMemoryFact(e.candidates[0]))
    })
  }
})

describe('extractor · ambiguo → sin candidato y con motivo', () => {
  for (const [message, reason] of AMBIGUOUS) {
    it(`${reason}: ${message}`, () => {
      const e = extractProfileFacts(message)
      assert.deepEqual(e.candidates, [])
      assert.equal(e.ambiguity?.reason, reason)
    })
  }

  it('sin categoría → propuesta incompleta con el importe y la frecuencia', () => {
    const e = extractProfileFacts('Me dan 35 € al mes')
    assert.deepEqual(e.incomplete, { kind: 'recurringIncome', cents: 3_500, frequency: 'monthly' })
    assert.equal(extractionLabel(e), 'ambiguous:no-category')
  })

  it('las demás ambigüedades no dejan propuesta incompleta', () => {
    for (const [message, reason] of AMBIGUOUS) if (reason !== 'no-category') assert.equal(extractProfileFacts(message).incomplete, null, message)
  })

  it('«no quiero bajar de…» se trata como negación (conservador)', () => {
    assert.deepEqual(extractProfileFacts('No quiero bajar de 500 €').candidates, [])
  })

  it('dos datos distintos en un mensaje → ninguno', () => {
    const e = extractProfileFacts('Me dan 35 € de paga al mes y no quiero quedarme con menos de 35 € de colchón')
    assert.deepEqual(e.candidates, [])
    assert.ok(e.ambiguity)
  })
})

describe('extractor · sin declaración de perfil', () => {
  for (const message of NOTHING) {
    it(message, () => {
      const e = extractProfileFacts(message)
      assert.deepEqual(e.candidates, [])
      assert.equal(e.incomplete, null)
    })
  }
})

describe('extractor · propiedades', () => {
  it('determinista', () => {
    for (const [m] of [...POSITIVES, ...AMBIGUOUS]) assert.deepEqual(extractProfileFacts(m), extractProfileFacts(m))
  })

  it('como mucho un candidato y siempre válido', () => {
    for (const [m] of [...POSITIVES, ...AMBIGUOUS, ...NOTHING.map((n) => [n])]) {
      const { candidates } = extractProfileFacts(m as string)
      assert.ok(candidates.length <= 1)
      assert.ok(candidates.every(isValidMemoryFact))
    }
  })

  it('la etiqueta del log nunca lleva importes', () => {
    for (const [m] of [...POSITIVES, ...AMBIGUOUS]) assert.doesNotMatch(extractionLabel(extractProfileFacts(m)), /\d/)
  })
})

/**
 * Casos fijados en la revisión de la fase 2: dato completo, candidato parcial
 * (sin categoría, fuera de `MemoryFact`) o nada estructurado.
 */
describe('extractor · casos de referencia', () => {
  const complete: Array<[string, MemoryFact]> = [
    ['Cada mes me dan 35 € de paga.', income(3_500, 'Paga')],
    ['Cada mes recibo 50 € de regalos.', income(5_000, 'Regalos')],
    ['Tengo otro ingreso de 100 € al mes.', income(10_000, 'Otros')],
    // «cobro» en primera persona: del usuario, así que Otros; nunca Paga.
    ['Cobro 500 € al mes.', income(50_000, 'Otros')],
  ]
  for (const [message, expected] of complete) {
    it(`dato completo: ${message}`, () => {
      const e = extractProfileFacts(message)
      assert.deepEqual(e.candidates, [expected])
      assert.equal(e.incomplete, null)
    })
  }

  it('candidato parcial sin categoría: «Me dan 35 € al mes.»', () => {
    const e = extractProfileFacts('Me dan 35 € al mes.')
    assert.deepEqual(e.candidates, [])
    assert.deepEqual(e.incomplete, { kind: 'recurringIncome', cents: 3_500, frequency: 'monthly' })
    // El candidato parcial no es un MemoryFact: le falta la categoría.
    assert.equal(isValidMemoryFact(e.incomplete as unknown as MemoryFact), false)
  })

  for (const message of [
    'A mi hermano le dan 35 € al mes.',
    'Me gustaría cobrar 500 € al mes.',
    'Quizá me den 35 €.',
    'Me daban 35 € al mes.',
    'Pago 35 € al mes de gimnasio.',
    'Tengo que ahorrar 1.000 €.',
  ]) {
    it(`ningún dato estructurado: ${message}`, () => {
      const e = extractProfileFacts(message)
      assert.deepEqual(e.candidates, [])
      assert.equal(e.incomplete, null)
    })
  }

  it('sueldo, nómina o cobro nunca se clasifican como Paga', () => {
    for (const m of ['Cobro 500 € al mes.', 'Mi sueldo es de 1.500 € al mes', 'Mi nómina es de 900 € al mes', 'Voy a cobrar 600 € al mes']) {
      const [fact] = extractProfileFacts(m).candidates
      assert.ok(!fact || (fact.kind === 'recurringIncome' && fact.category !== 'Paga'), m)
    }
  })
})
