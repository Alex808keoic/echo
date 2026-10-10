/**
 * Guía para invertir (información general). Describe TIPOS de producto, nunca
 * productos, marcas ni entidades concretas, y no dice a nadie qué comprar:
 * explicar qué es un ETF o cómo comparar comisiones es educación financiera;
 * recomendar a una persona un producto concreto según su situación es
 * asesoramiento de inversión y exige autorización de la CNMV.
 */

export type ProductRisk = 'muy-bajo' | 'bajo' | 'medio' | 'alto' | 'muy-alto'
/** Familia para revisar el encaje con el plan (guide/fit.ts). */
export type ProductFamily = 'cash' | 'short-debt' | 'bonds' | 'diversified-equity' | 'concentrated-equity' | 'speculative'

export interface ProductType {
  id: string
  name: string
  family: ProductFamily
  risk: ProductRisk
  /** Plazo para el que suele tener sentido. */
  horizon: string
  what: string
  goodFor: string
  compare: string[]
  warnings: string[]
  /** Palabras con las que el usuario lo nombra (minúsculas, sin tildes). */
  keywords: string[]
}

export const RISK_LABEL: Record<ProductRisk, string> = { 'muy-bajo': 'Muy bajo', bajo: 'Bajo', medio: 'Medio', alto: 'Alto', 'muy-alto': 'Muy alto' }

export const PRODUCT_TYPES: readonly ProductType[] = [
  {
    id: 'cuenta-deposito',
    name: 'Cuenta remunerada o depósito',
    family: 'cash',
    risk: 'muy-bajo',
    horizon: 'Cualquier plazo, sobre todo menos de 2 años',
    what: 'Tu dinero en un banco que te paga un interés. En la cuenta lo tienes disponible siempre; en el depósito, a un plazo fijo.',
    goodFor: 'El colchón y los objetivos cercanos: dinero que puedes necesitar pronto.',
    compare: ['La TAE (el interés anual real) y cuánto dura', 'Si hay penalización por sacar el dinero antes de tiempo', 'Comisiones de la cuenta', 'Que la entidad esté adherida a un fondo de garantía de depósitos'],
    warnings: ['TAE muy alta solo los primeros meses: mira cuánto queda después', 'En España, el Fondo de Garantía de Depósitos cubre hasta 100.000 € por titular y entidad'],
    keywords: ['cuenta remunerada', 'deposito', 'depositos', 'plazo fijo', 'cuenta de ahorro'],
  },
  {
    id: 'letras',
    name: 'Letras del Tesoro',
    family: 'short-debt',
    risk: 'bajo',
    horizon: 'De 3 a 12 meses',
    what: 'Préstamos a corto plazo al Estado. Sabes desde el principio cuánto recibirás al vencimiento.',
    goodFor: 'Dinero que no necesitas en unos meses y no quieres arriesgar.',
    compare: ['La rentabilidad y el plazo', 'Comisiones del intermediario (se pueden comprar directamente al Tesoro Público)'],
    warnings: ['Si las vendes antes del vencimiento, el precio puede ser menor que el que pagaste'],
    keywords: ['letras', 'letra del tesoro', 'letras del tesoro', 'tesoro'],
  },
  {
    id: 'fondo-monetario',
    name: 'Fondo monetario',
    family: 'short-debt',
    risk: 'bajo',
    horizon: 'Meses a pocos años',
    what: 'Un fondo que invierte en deuda a muy corto plazo de estados y empresas solventes.',
    goodFor: 'Dinero de corto plazo como alternativa a una cuenta, con algo más de riesgo.',
    compare: ['La comisión total anual (TER)', 'La rentabilidad después de comisiones'],
    warnings: ['No está garantizado como un depósito: en momentos raros puede bajar un poco'],
    keywords: ['fondo monetario', 'fondos monetarios', 'monetario'],
  },
  {
    id: 'fondo-indexado',
    name: 'Fondo indexado',
    family: 'diversified-equity',
    risk: 'alto',
    horizon: 'Más de 5 años',
    what: 'Un fondo que copia un índice (por ejemplo, de empresas de todo el mundo) en lugar de elegir acciones. Reparte el dinero entre cientos o miles de empresas.',
    goodFor: 'La parte a largo plazo: dinero que no vas a necesitar en muchos años.',
    compare: ['La comisión total anual (TER): en un indexado suele ser baja', 'Qué índice copia y cuántas empresas y países incluye', 'Lo bien que lo copia (error de seguimiento)'],
    warnings: ['Puede caer mucho en un año malo, incluso más de un 30 %: solo para dinero que puedas dejar quieto', 'En España, pasar el dinero de un fondo a otro no tributa (traspaso)'],
    keywords: ['fondo indexado', 'fondos indexados', 'indexado', 'indexados', 'msci world', 'indice mundial'],
  },
  {
    id: 'etf',
    name: 'ETF',
    family: 'diversified-equity',
    risk: 'alto',
    horizon: 'Más de 5 años',
    what: 'Parecido a un fondo indexado, pero se compra y vende en bolsa como una acción, a través de un bróker.',
    goodFor: 'La parte a largo plazo, si prefieres operar en bolsa.',
    compare: ['La comisión total anual (TER)', 'Las comisiones del bróker por comprar y vender', 'Qué índice copia y si es amplio'],
    warnings: ['Puede caer mucho en un año malo', 'En España, cambiar de un ETF a otro normalmente tributa (no hay traspaso como en los fondos)', 'Hay ETF muy especializados o apalancados: mucho más arriesgados'],
    keywords: ['etf', 'etfs'],
  },
  {
    id: 'fondo-activo',
    name: 'Fondo de gestión activa',
    family: 'concentrated-equity',
    risk: 'alto',
    horizon: 'Más de 5 años',
    what: 'Un fondo en el que un gestor elige en qué invertir para intentar batir al mercado.',
    goodFor: 'Quien quiere delegar la elección y acepta pagar más por ello.',
    compare: ['La comisión total anual: suele ser bastante más alta que en un indexado', 'Su resultado frente a su índice durante muchos años, no solo el último'],
    warnings: ['Según los estudios, la mayoría no supera a su índice a largo plazo después de comisiones'],
    keywords: ['fondo de inversion', 'fondos de inversion', 'gestion activa', 'fondo activo'],
  },
  {
    id: 'acciones',
    name: 'Acciones de empresas',
    family: 'concentrated-equity',
    risk: 'muy-alto',
    horizon: 'Más de 5 años',
    what: 'Ser dueño de una parte de una empresa concreta.',
    goodFor: 'Quien conoce bien lo que compra y acepta mucho riesgo.',
    compare: ['Comisiones del bróker', 'Cuánto de tu dinero estaría en una sola empresa'],
    warnings: ['Con pocas empresas, una mala noticia puede hacerte perder mucho', 'Que una empresa haya subido mucho no dice nada de lo que hará'],
    keywords: ['acciones', 'accion', 'bolsa', 'invertir en empresas'],
  },
  {
    id: 'bonos',
    name: 'Bonos y renta fija',
    family: 'bonds',
    risk: 'medio',
    horizon: 'De 2 a 10 años, según el bono',
    what: 'Préstamos a estados o empresas que te pagan un interés. Su precio sube y baja con los tipos de interés.',
    goodFor: 'Equilibrar una cartera con algo menos de riesgo que la renta variable.',
    compare: ['Quién emite el bono y su solvencia', 'El plazo', 'Comisiones (si es a través de un fondo)'],
    warnings: ['Si suben los tipos, el precio de los bonos que ya tienes baja', 'Más interés suele significar más riesgo de impago'],
    keywords: ['bonos', 'bono', 'renta fija', 'obligaciones'],
  },
  {
    id: 'oro',
    name: 'Oro',
    family: 'speculative',
    risk: 'alto',
    horizon: 'Largo plazo',
    what: 'Un metal que no genera rentas: solo ganas si lo vendes más caro de lo que lo compraste.',
    goodFor: 'Como mucho, una parte pequeña para diversificar; no es la base de una cartera.',
    compare: ['Cómo lo tienes: físico (custodia y seguro) o a través de un producto que sigue su precio', 'Las comisiones de compra, venta y custodia'],
    warnings: ['Su precio puede pasar años bajando', 'No paga intereses ni dividendos'],
    keywords: ['oro', 'gold', 'metales preciosos', 'plata'],
  },
  {
    id: 'cripto',
    name: 'Criptomonedas',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'Ninguno es seguro',
    what: 'Activos digitales muy volátiles, sin rentas y con poca protección para el inversor.',
    goodFor: 'Solo dinero que podrías perder entero sin que te afecte.',
    compare: ['Que la plataforma esté registrada y autorizada', 'Las comisiones de compra, venta y retirada'],
    warnings: ['Su precio puede caer más de un 50 % en poco tiempo', 'La CNMV y el Banco de España advierten de su riesgo', 'Estafas frecuentes: desconfía de rentabilidades «garantizadas»'],
    keywords: ['cripto', 'criptomonedas', 'criptomoneda', 'bitcoin', 'ethereum', 'btc'],
  },
]

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Tipos de producto que nombra un texto (por sus palabras clave completas), en el orden de la guía. */
export function matchProductTypes(text: string): ProductType[] {
  const t = fold(text)
  return PRODUCT_TYPES.filter((p) => p.keywords.some((k) => new RegExp(`(^|[^a-z0-9ñ])${k}($|[^a-z0-9ñ])`).test(t)))
}

/** Enlaces oficiales para comprobar entidades (sin nombrar empresas). */
export const OFFICIAL_LINKS = [
  { label: 'CNMV · entidades autorizadas y advertencias', url: 'https://www.cnmv.es', detail: 'Comprueba que una empresa de inversión, gestora o asesor está registrado, y consulta sus advertencias sobre entidades no autorizadas.' },
  { label: 'Banco de España · registro de entidades', url: 'https://www.bde.es', detail: 'Comprueba que un banco está autorizado para operar en España.' },
  { label: 'Fondo de Garantía de Depósitos', url: 'https://www.fgd.es', detail: 'Qué depósitos están protegidos y hasta qué cantidad.' },
] as const

export const AUTHORIZED_SERVICES = {
  intro:
    'Si quieres que alguien te recomiende productos concretos para ti, tiene que hacerlo una entidad autorizada: una empresa de asesoramiento financiero, una gestora o un banco registrados en la CNMV o el Banco de España, o un gestor automatizado («robo-advisor») autorizado. Finax no recomienda entidades.',
  checks: [
    'Que aparezca en los registros oficiales con el mismo nombre y dirección web',
    'Que te pregunten por tus conocimientos, tu situación y cuánto puedes perder antes de recomendarte nada (es obligatorio)',
    'Que te expliquen por escrito todas las comisiones',
  ],
  redFlags: ['Rentabilidades altas «garantizadas» o «sin riesgo»', 'Prisa para que decidas ya', 'Contacto por redes sociales o mensajería sin que lo hayas pedido', 'Te piden pagar en criptomonedas o a cuentas en el extranjero'],
  minors: 'Si eres menor de edad, invertir lo tiene que hacer un adulto a tu nombre (normalmente tus padres o tutores).',
} as const
