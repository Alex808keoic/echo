/**
 * Lectura de extractos del banco (el texto de un PDF) para proponer movimientos.
 *
 * Determinista y local: el PDF nunca sale del dispositivo. Cada banco maqueta
 * su extracto a su manera, así que esto no promete acertar siempre: propone
 * y el usuario revisa cada fila antes de guardar nada.
 *
 * Una fila es una línea que empieza (o casi) por una fecha y tiene al menos un
 * importe. Con dos importes o más, el penúltimo es el movimiento y el último el
 * saldo. El signo sale, por orden: del propio importe («-45,30»), del saldo
 * (cuánto cambia respecto a la fila anterior en el tiempo) o, si no hay forma,
 * de palabras del concepto («nómina», «abono»…; si no, gasto).
 */
import type { Category, MovementType } from '../types'

/** Lo que se reconoce de cada fila. `kind` separa los traspasos con el efectivo (cajero). */
export interface StatementRow {
  date: string
  concept: string
  amountCents: number
  kind: MovementType | 'retirada-efectivo' | 'ingreso-efectivo'
  category: Category
  /** Saldo tras el movimiento, cuando el extracto lo trae. */
  balanceCents?: number
}

/* --------------------------------- Fechas --------------------------------- */

const MONTHS: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
}

const NUMERIC_DATE = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?![\d,])/
const TEXT_DATE = /^(\d{1,2})[\s.-]+([a-záéíóú]{3})[a-záéíóú]*\.?(?:[\s.-]+(\d{4}|\d{2}))?(?![\d,])/i
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?!\d)/

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, m - 1, d))
  if (date.getUTCMonth() !== m - 1) return null
  return `${y}-${pad(m)}-${pad(d)}`
}

function fullYear(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = Number(raw)
  return raw.length === 2 ? 2000 + n : n
}

function stripAccents(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Fecha al principio de `text` y cuánto ocupa. */
export function leadingDate(text: string, fallbackYear: number): { iso: string; length: number } | null {
  const iso = ISO_DATE.exec(text)
  if (iso) {
    const v = validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))
    return v ? { iso: v, length: iso[0].length } : null
  }
  const num = NUMERIC_DATE.exec(text)
  if (num) {
    const v = validDate(fullYear(num[3], fallbackYear), Number(num[2]), Number(num[1]))
    return v ? { iso: v, length: num[0].length } : null
  }
  const txt = TEXT_DATE.exec(text)
  if (txt) {
    const month = MONTHS[stripAccents(txt[2].toLowerCase())]
    if (!month) return null
    const v = validDate(fullYear(txt[3], fallbackYear), month, Number(txt[1]))
    return v ? { iso: v, length: txt[0].length } : null
  }
  return null
}

/* -------------------------------- Importes -------------------------------- */

/**
 * Importes con dos decimales, al estilo español («1.234,56», «-45,30 €»,
 * «+1.000,00», «45,30-») o con punto decimal («1,234.56»). Siempre con
 * decimales: así no se confunden con números de tarjeta, referencias u horas.
 */
const AMOUNT = /(?<![\d.,])([+\-−]?)\s?(\d{1,3}(?:([.,])\d{3})+|\d+)([.,])(\d{2})(?!\d)(?:\s?(?:€|eur))?([+\-−](?![\d]))?/gi

interface FoundAmount {
  cents: number
  /** -1, 1 o 0 si no lleva signo. */
  sign: number
  index: number
}

function findAmounts(text: string): FoundAmount[] {
  const out: FoundAmount[] = []
  for (const m of text.matchAll(AMOUNT)) {
    const [, pre, whole, group, decimal, fraction, post] = m
    // El separador de miles no puede ser el mismo que el decimal.
    if (group && group === decimal) continue
    const cents = Number(whole.replace(/[.,]/g, '')) * 100 + Number(fraction)
    if (!Number.isSafeInteger(cents)) continue
    const s = pre || post || ''
    out.push({ cents, sign: s === '' ? 0 : s === '+' ? 1 : -1, index: m.index ?? 0 })
  }
  return out
}

/* ------------------------------- Categorías ------------------------------- */

function normalizeText(text: string): string {
  return stripAccents(text.toLowerCase())
}

const CASH_OUT = /\b(cajero|reintegro|retirada( de)? efectivo|disposicion( de)? efectivo|atm)\b/
const CASH_IN = /\b(ingreso( de)? efectivo|ingreso en cajero|deposito( de)? efectivo)\b/
const INCOME_WORDS = /\b(nomina|salario|abono|transferencia recibida|transf\.? recibida|ingreso|devolucion|reembolso|bizum recibido|recibida|cobro|pension|prestacion)\b/
const SKIP = /(saldo (anterior|inicial|final|a fecha|al)|sumas? (de )?(movimientos|totales)|^total(es)?\b|^saldo\b)/

const EXPENSE_RULES: Array<[RegExp, Category]> = [
  [/(mercadona|carrefour|lidl|aldi|alcampo|eroski|consum|hipercor|ahorramas|bonpreu|caprabo|supercor|supermercado|froiz|gadis|condis|spar |coviran|\bdia\b)/, 'Supermercado'],
  [/(netflix|spotify|hbo|max\.com|disney|prime video|amazon prime|apple\.com|icloud|youtube|google one|google storage|playstation|xbox|dazn|filmin|chatgpt|openai)/, 'Suscripciones'],
  [/(restaurante|\brest\b|\bbar\b|cafeteria|\bcafe\b|mcdonald|burger king|telepizza|domino|\bkfc\b|starbucks|glovo|just eat|uber \*?eats|deliveroo|\btgb\b|\bvips\b|goiko|montaditos|taberna|pizzeria)/, 'Restaurantes'],
  [/(renfe|\bmetro\b|\bemt\b|\btmb\b|\balsa\b|cabify|\buber\b|\bbolt\b|\btaxi\b|repsol|cepsa|\bgalp\b|\bbp\b|\bshell\b|gasolinera|petronor|ballenoil|plenoil|parking|aparcamiento|autopista|peaje|bicing|cercanias|blablacar)/, 'Transporte'],
  [/(iberdrola|endesa|naturgy|holaluz|totalenergies|vodafone|movistar|orange|yoigo|\bdigi\b|masmovil|pepephone|lowi|simyo|jazztel|aguas|canal de isabel|emasesa|\bagua\b|butano|gas natural)/, 'Facturas'],
  [/(alquiler|comunidad de propietarios|comunidad prop|hipoteca|\bibi\b|inmobiliaria)/, 'Vivienda'],
  [/(farmacia|clinica|dentista|hospital|medico|optica|fisioterap|sanitas|adeslas|\bdkv\b|asisa|quiron)/, 'Salud'],
  [/(gimnasio|\bgym\b|basic-fit|basic fit|mcfit|holmes place|altafit|vivagym|go fit|decathlon|padel|club deportivo)/, 'Deporte'],
  [/(zara|primark|h&m|pull&bear|pull and bear|bershka|stradivarius|\bmango\b|massimo dutti|lefties|kiabi|shein|zalando|el corte ingles|\bnike\b|adidas|foot locker|jd sports)/, 'Ropa'],
  [/(ryanair|vueling|iberia|air europa|easyjet|booking|airbnb|hotel|expedia|edreams|trainline|ouigo|iryo)/, 'Viajes'],
  [/(colegio|universidad|academia|matricula|libreria|udemy|coursera|escuela)/, 'Educación'],
  [/(seguro|mapfre|mutua|allianz|\baxa\b|linea directa|generali|comision|cuota tarjeta|mantenimiento cuenta|intereses deudores)/, 'Seguros y banco'],
  [/(amazon|amzn|aliexpress|\bfnac\b|mediamarkt|media markt|pccomponentes|\bgame\b|steam|ikea)/, 'Caprichos'],
]

const INCOME_RULES: Array<[RegExp, Category]> = [
  [/(nomina|salario|pension|prestacion|\bsepe\b)/, 'Paga'],
  [/(wallapop|vinted|\bventa\b)/, 'Ventas'],
]

/** Categoría probable para el concepto; «Otros» si nada encaja. */
export function guessCategory(concept: string, type: MovementType): Category {
  const text = normalizeText(concept)
  const rules = type === 'gasto' ? EXPENSE_RULES : INCOME_RULES
  for (const [re, category] of rules) if (re.test(text)) return category
  return 'Otros'
}

/* --------------------------------- Lectura --------------------------------- */

/** Limpia el concepto: sin la fecha valor y con espacios simples. */
function cleanConcept(text: string, fallbackYear: number): string {
  let rest = text.trim()
  // Muchos extractos traen fecha de operación y fecha valor seguidas.
  const second = leadingDate(rest, fallbackYear)
  if (second) rest = rest.slice(second.length)
  return rest.replace(/\s+/g, ' ').replace(/^[\s·|:-]+|[\s·|:-]+$/g, '').trim()
}

interface RawRow {
  date: string
  concept: string
  amount: FoundAmount
  balanceCents?: number
}

/** Año para las fechas que no lo traen: el más repetido en el texto, o el de `today`. */
function guessYear(text: string, today: string): number {
  const counts = new Map<string, number>()
  for (const m of text.matchAll(/\b(20\d{2})\b/g)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return best ? Number(best[0]) : Number(today.slice(0, 4))
}

/**
 * Filas reconocidas en el texto de un extracto (un renglón del PDF por línea).
 * Nunca devuelve movimientos con fecha posterior a `today`.
 */
export function parseStatement(text: string, today: string): StatementRow[] {
  const year = guessYear(text, today)
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const raw: RawRow[] = []
  let lastWasRow = false

  for (const line of lines) {
    // La fecha puede ir tras un número de orden corto.
    const start = line.search(/\d/)
    const date = start >= 0 && start <= 4 ? leadingDate(line.slice(start), year) : null
    const afterDate = date ? line.slice(start + date.length) : ''
    const amounts = date ? findAmounts(afterDate) : findAmounts(line)
    if (!date || amounts.length === 0) {
      // Concepto partido en dos renglones: se une al de la fila anterior.
      const prev = raw[raw.length - 1]
      if (lastWasRow && prev && amounts.length === 0 && !date && line.length <= 60 && prev.concept.length < 60 && !SKIP.test(normalizeText(line))) {
        prev.concept = `${prev.concept} ${line}`
      }
      lastWasRow = false
      continue
    }
    const concept = cleanConcept(afterDate.slice(0, amounts[0].index), year)
    if (concept === '' || SKIP.test(normalizeText(concept))) {
      lastWasRow = false
      continue
    }
    const amount = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0]
    const balance = amounts.length >= 2 ? amounts[amounts.length - 1] : undefined
    lastWasRow = false
    if (amount.cents <= 0) continue
    raw.push({
      date: date.iso,
      concept,
      amount,
      ...(balance ? { balanceCents: balance.sign === -1 ? -balance.cents : balance.cents } : {}),
    })
    lastWasRow = true
  }

  // Orden del extracto: del más antiguo al más reciente o al revés.
  const descending = raw.length > 1 && raw[0].date > raw[raw.length - 1].date

  const rows: StatementRow[] = []
  raw.forEach((row, i) => {
    if (row.date > today) return
    const concept = row.concept.slice(0, 120)
    const text = normalizeText(concept)
    let sign = row.amount.sign
    if (sign === 0 && row.balanceCents !== undefined) {
      const prev = raw[descending ? i + 1 : i - 1]
      if (prev?.balanceCents !== undefined) {
        const diff = row.balanceCents - prev.balanceCents
        if (Math.abs(diff) === row.amount.cents) sign = diff > 0 ? 1 : -1
      }
    }
    if (sign === 0) sign = INCOME_WORDS.test(text) && !CASH_OUT.test(text) ? 1 : -1
    const type: MovementType = sign > 0 ? 'ingreso' : 'gasto'
    const kind: StatementRow['kind'] =
      type === 'gasto' && CASH_OUT.test(text) ? 'retirada-efectivo' : type === 'ingreso' && CASH_IN.test(text) ? 'ingreso-efectivo' : type
    rows.push({
      date: row.date,
      concept,
      amountCents: row.amount.cents,
      kind,
      category: guessCategory(concept, type),
      ...(row.balanceCents !== undefined ? { balanceCents: row.balanceCents } : {}),
    })
  })
  return rows
}
