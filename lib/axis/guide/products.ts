/**
 * Guía para invertir (información general), en dos niveles: familias
 * (ahorro seguro, renta fija, fondos, ETF, compañías, materias primas,
 * inmobiliario, cripto) y, dentro de cada una, TIPOS de producto.
 *
 * Explicar qué es un ETF o cómo comparar comisiones es educación financiera;
 * recomendar a una persona un producto concreto según su situación es
 * asesoramiento de inversión y exige autorización de la CNMV. Por eso:
 * - El encaje con el plan (guide/fit.ts) se decide por tipo, nunca por producto.
 * - `examples` enseña qué existe dentro de un tipo (activos, índices, sectores),
 *   solo en la pantalla y siempre con el aviso de que no son recomendaciones.
 *   Nunca nombra a quien lo vende (gestoras, brókers, bancos, exchanges ni
 *   plataformas) y nunca llega al chat ni al modelo.
 */

import { TYPE_EXPERTISE } from './expertise'

export type ProductRisk = 'muy-bajo' | 'bajo' | 'medio' | 'alto' | 'muy-alto'
/** Familia para revisar el encaje con el plan (guide/fit.ts). */
export type ProductFamily = 'cash' | 'short-debt' | 'bonds' | 'diversified-equity' | 'concentrated-equity' | 'speculative'

export type InvestmentGroupId = 'ahorro' | 'renta-fija' | 'fondos' | 'etf' | 'prevision' | 'acciones' | 'materias' | 'inmobiliario' | 'cripto' | 'complejos'

export interface InvestmentGroup {
  id: InvestmentGroupId
  name: string
  /** Una línea para la lista de familias. */
  summary: string
  /** Lo que se ve al abrir la familia. */
  intro: string
}

export interface ProductType {
  id: string
  group: InvestmentGroupId
  name: string
  family: ProductFamily
  risk: ProductRisk
  /** Plazo para el que suele tener sentido. */
  horizon: string
  what: string
  goodFor: string
  compare: string[]
  /** «Cómo reconocer uno bueno»: señales con umbrales orientativos, sin nombrar ninguno. Solo en los tipos más usados. */
  choose?: string[]
  warnings: string[]
  /** Ejemplos de lo que existe dentro del tipo. Solo pantalla; no son recomendaciones. */
  examples?: string[]
  /** Palabras con las que el usuario lo nombra (minúsculas, sin tildes). */
  keywords: string[]
  /** Cómo cuenta en tu mezcla una inversión de este tipo, si no es la de su familia (un plan de pensiones o un piso: «otro»). */
  assetType?: 'other'
  /** Cómo tributa en España (guide/expertise.ts). */
  taxes: string
  /** Cuándo y cómo recuperas tu dinero. */
  liquidity: string
  /** Quién lo supervisa y qué te protege. */
  protection: string
  /**
   * Encaje con el plan propio del tipo, cuando la regla por familia no lo explica bien (planes de pensiones,
   * vivienda para alquilar): se usa con el plan listo, el colchón completo y un plazo que no es corto.
   */
  fitOverride?: { verdict: 'partial' | 'outside-plan'; reasons: string[] }
}

/** Lo que se escribe en cada tipo; lo de experto (impuestos, liquidez, protección) sale de guide/expertise.ts. */
type ProductTypeBase = Omit<ProductType, 'taxes' | 'liquidity' | 'protection'>

export const RISK_LABEL: Record<ProductRisk, string> = { 'muy-bajo': 'Muy bajo', bajo: 'Bajo', medio: 'Medio', alto: 'Alto', 'muy-alto': 'Muy alto' }
const RISK_ORDER: readonly ProductRisk[] = ['muy-bajo', 'bajo', 'medio', 'alto', 'muy-alto']

export const EXAMPLES_NOTICE = 'Son ejemplos para que sepas qué existe, no recomendaciones: Finax no te dice cuál comprar ni cuándo.'

export const INVESTMENT_GROUPS: readonly InvestmentGroup[] = [
  {
    id: 'ahorro',
    name: 'Ahorro seguro',
    summary: 'Cuentas, depósitos, Letras y fondos monetarios',
    intro: 'Dinero que no quieres arriesgar: el colchón y lo que vas a necesitar pronto. Rinde poco, pero casi no puede bajar.',
  },
  {
    id: 'renta-fija',
    name: 'Renta fija',
    summary: 'Bonos de estados y empresas, ligados a la inflación, high yield, pagarés, preferentes y crowdlending',
    intro: 'Prestas tu dinero a un estado o a una empresa y te paga un interés. Tiene menos riesgo que las acciones, pero su precio se mueve con los tipos de interés.',
  },
  {
    id: 'fondos',
    name: 'Fondos de inversión',
    summary: 'Indexados, activos, mixtos, garantizados, a vencimiento, carteras gestionadas y capital riesgo',
    intro: 'Juntas tu dinero con el de muchas personas y una gestora lo invierte por todos. En España, pasar el dinero de un fondo a otro no tributa (traspaso).',
  },
  {
    id: 'etf',
    name: 'ETF',
    summary: 'Fondos que cotizan en bolsa: mundiales, por país, por sector, por factores…',
    intro: 'Un ETF es un fondo que se compra y vende en bolsa como una acción, a través de un bróker. Casi todos copian un índice: lo importante es cuál.',
  },
  {
    id: 'prevision',
    name: 'Planes de pensiones y seguros de ahorro',
    summary: 'Planes de pensiones, de empleo, PIAS, SIALP y unit linked',
    intro: 'Productos para la jubilación o el ahorro a largo plazo con ventajas fiscales, a cambio de condiciones: no poder sacar el dinero hasta cierta fecha o perder la ventaja si lo haces. Por dentro invierten como un fondo o como un seguro.',
  },
  {
    id: 'acciones',
    name: 'Compañías (acciones)',
    summary: 'Ser dueño de una parte de empresas concretas',
    intro: 'Compras una parte de una empresa: ganas si a la empresa le va bien y pierdes si le va mal. Con pocas empresas, el riesgo es mucho mayor que con un fondo que tiene cientos.',
  },
  {
    id: 'materias',
    name: 'Materias primas',
    summary: 'Oro, plata, energía, metales y agrícolas',
    intro: 'Cosas físicas que se compran y venden en todo el mundo. No generan rentas: solo ganas si las vendes más caras. Se suelen invertir a través de ETC, productos que siguen su precio y cotizan en bolsa.',
  },
  {
    id: 'inmobiliario',
    name: 'Inmobiliario',
    summary: 'SOCIMI, fondos inmobiliarios, crowdfunding y vivienda para alquilar',
    intro: 'Invertir en inmuebles sin comprar una vivienda entera: a través de empresas en bolsa, de fondos o de plataformas de financiación participativa.',
  },
  {
    id: 'cripto',
    name: 'Criptomonedas',
    summary: 'Bitcoin, otras criptomonedas, stablecoins y staking',
    intro: 'Activos digitales muy volátiles, sin rentas y con poca protección para el inversor. La CNMV y el Banco de España advierten de su riesgo.',
  },
  {
    id: 'complejos',
    name: 'Productos complejos',
    summary: 'CFD, futuros y opciones, estructurados, warrants y turbos',
    intro: 'Productos que multiplican lo que ganas y lo que pierdes (apalancamiento) o cuyo resultado depende de condiciones difíciles de entender. La CNMV los considera complejos: la mayoría de los pequeños inversores que operan con ellos pierde dinero.',
  },
]

const EQUITY_DROP = 'Puede caer mucho en un año malo, incluso más de un 30 %: solo para dinero que puedas dejar quieto'

const BASE_TYPES: readonly ProductTypeBase[] = [
  /* ------------------------------ Ahorro seguro ------------------------------ */
  {
    id: 'cuenta-deposito',
    group: 'ahorro',
    name: 'Cuenta remunerada o depósito',
    family: 'cash',
    risk: 'muy-bajo',
    horizon: 'Cualquier plazo, sobre todo menos de 2 años',
    what: 'Tu dinero en un banco que te paga un interés. En la cuenta lo tienes disponible siempre; en el depósito, a un plazo fijo.',
    goodFor: 'El colchón y los objetivos cercanos: dinero que puedes necesitar pronto.',
    compare: ['La TAE (el interés anual real) y cuánto dura', 'Si hay penalización por sacar el dinero antes de tiempo', 'Comisiones de la cuenta', 'Que la entidad esté adherida a un fondo de garantía de depósitos'],
    warnings: ['TAE muy alta solo los primeros meses: mira cuánto queda después', 'En España, el Fondo de Garantía de Depósitos cubre hasta 100.000 € por titular y entidad'],
    examples: ['Cuenta remunerada (dinero disponible siempre)', 'Depósito a 6 meses', 'Depósito a 12 meses'],
    choose: [
      'Una TAE que se acerque al tipo de depósito del BCE y, a ser posible, que supere la inflación',
      'Que la TAE dure: no solo los primeros meses de bienvenida',
      'Sin comisiones ni condiciones que no cumples (nómina, recibos, tarjeta)',
      'Entidad adherida a un fondo de garantía de depósitos: en España cubre hasta 100.000 € por titular y entidad',
    ],
    keywords: ['cuenta remunerada', 'deposito', 'depositos', 'plazo fijo', 'cuenta de ahorro'],
  },
  {
    id: 'letras',
    group: 'ahorro',
    name: 'Letras del Tesoro',
    family: 'short-debt',
    risk: 'bajo',
    horizon: 'De 3 a 12 meses',
    what: 'Préstamos a corto plazo al Estado. Sabes desde el principio cuánto recibirás al vencimiento.',
    goodFor: 'Dinero que no necesitas en unos meses y no quieres arriesgar.',
    compare: ['La rentabilidad y el plazo', 'Comisiones del intermediario (se pueden comprar directamente al Tesoro Público)'],
    warnings: ['Si las vendes antes del vencimiento, el precio puede ser menor que el que pagaste'],
    examples: ['Letras a 3 meses', 'Letras a 6 meses', 'Letras a 9 meses', 'Letras a 12 meses'],
    choose: [
      'Un plazo (3, 6, 9 o 12 meses) que acabe cuando necesites el dinero',
      'Compara su rentabilidad con la TAE de un depósito al mismo plazo',
      'Mira si te cobran comisión por comprarlas o guardarlas: se pueden comprar sin ninguna',
    ],
    keywords: ['letras', 'letra del tesoro', 'letras del tesoro', 'tesoro'],
  },
  {
    id: 'fondo-monetario',
    group: 'ahorro',
    name: 'Fondo monetario',
    family: 'short-debt',
    risk: 'bajo',
    horizon: 'Meses a pocos años',
    what: 'Un fondo que invierte en deuda a muy corto plazo de estados y empresas solventes.',
    goodFor: 'Dinero de corto plazo como alternativa a una cuenta, con algo más de riesgo.',
    compare: ['La comisión total anual (TER)', 'La rentabilidad después de comisiones'],
    warnings: ['No está garantizado como un depósito: en momentos raros puede bajar un poco'],
    choose: [
      'Comisión total por debajo del 0,3 % al año: por encima del 0,5 % se come casi todo lo que da',
      'Invierte en deuda de calidad a muy corto plazo',
      'Su rentabilidad va cerca del tipo de depósito del BCE',
    ],
    keywords: ['fondo monetario', 'fondos monetarios', 'monetario'],
  },

  /* -------------------------------- Renta fija ------------------------------- */
  {
    id: 'bonos-estado',
    group: 'renta-fija',
    name: 'Bonos y Obligaciones del Estado',
    family: 'bonds',
    risk: 'bajo',
    horizon: 'De 3 a 30 años, según el bono',
    what: 'Préstamos al Estado a más de un año: los Bonos, a 3 y 5 años; las Obligaciones, a 10 años o más. Te pagan un interés cada año (cupón) y te devuelven lo prestado al vencimiento.',
    goodFor: 'Dinero que no vas a tocar hasta el vencimiento y que quieres con poco riesgo.',
    compare: ['El plazo: cuanto más largo, más se mueve su precio', 'La rentabilidad hasta el vencimiento', 'Comisiones del intermediario (se pueden comprar directamente al Tesoro Público)'],
    warnings: ['Si suben los tipos y lo vendes antes del vencimiento, puedes perder dinero', 'Un estado con problemas paga más interés, pero arriesga más'],
    examples: ['Bonos del Estado a 3 años', 'Bonos del Estado a 5 años', 'Obligaciones del Estado a 10 años', 'Bonos de otros estados de la zona euro (por ejemplo, Alemania)'],
    choose: [
      'De un estado de la zona euro con buena nota de crédito',
      'Que venza cuando vayas a necesitar el dinero: si lo mantienes hasta entonces, sabes lo que cobras',
      'Compara lo que paga con unas Letras o un depósito al mismo plazo',
    ],
    keywords: ['bonos', 'bono', 'obligaciones', 'bonos del estado', 'deuda publica'],
  },
  {
    id: 'bonos-empresa',
    group: 'renta-fija',
    name: 'Bonos de empresas',
    family: 'bonds',
    risk: 'medio',
    horizon: 'De 2 a 10 años, según el bono',
    what: 'Préstamos a una empresa. Pagan más interés que los de un estado porque la empresa puede tener problemas para devolverlos.',
    goodFor: 'Equilibrar una cartera con algo menos de riesgo que las acciones.',
    compare: ['La calificación de la empresa (su solvencia)', 'El plazo', 'Si te conviene más tenerlos a través de un fondo, con muchos bonos a la vez'],
    warnings: ['Más interés suele significar más riesgo de impago', 'Un bono suelto de una empresa concentra mucho riesgo'],
    examples: ['Bonos de grandes empresas con buena calificación («investment grade»)', 'Bonos de alto rendimiento («high yield»): más interés y bastante más riesgo'],
    keywords: ['bonos de empresa', 'bonos de empresas', 'bonos corporativos', 'renta fija privada'],
  },
  {
    id: 'fondo-renta-fija',
    group: 'renta-fija',
    name: 'Fondo de renta fija',
    family: 'bonds',
    risk: 'medio',
    horizon: 'De 2 a 7 años, según el fondo',
    what: 'Un fondo que reparte el dinero entre muchos bonos de estados, de empresas o de ambos.',
    goodFor: 'Tener renta fija diversificada sin elegir bonos uno a uno.',
    compare: ['La comisión total anual (TER)', 'La duración media de sus bonos: a más duración, más se mueve con los tipos', 'Qué tipo de bonos lleva (estados, empresas, «high yield»)'],
    warnings: ['Si suben los tipos, puede bajar durante un tiempo', 'A diferencia de un bono, no tiene fecha de vencimiento: nadie te asegura recuperar lo invertido en una fecha'],
    choose: [
      'Comisión total por debajo del 0,5 % al año; por encima del 1 %, cara',
      'Bonos de calidad (grado de inversión) de muchos estados y empresas',
      'Una duración acorde a tu plazo: cuanto más larga, más sube y baja cuando cambian los tipos de interés',
      'En euros o con la divisa cubierta, para no sumar riesgo de cambio',
    ],
    keywords: ['renta fija', 'fondo de renta fija', 'fondos de renta fija'],
  },

  {
    id: 'bonos-inflacion',
    group: 'renta-fija',
    name: 'Bonos ligados a la inflación',
    family: 'bonds',
    risk: 'bajo',
    horizon: 'De 3 a 30 años, según el bono',
    what: 'Bonos de un estado cuyo valor y cuyos intereses se actualizan con la inflación: si los precios suben, lo que cobras sube con ellos. El Tesoro español los emite ligados a la inflación de la zona euro.',
    goodFor: 'Proteger del alza de los precios una parte del dinero de medio y largo plazo.',
    compare: ['Su rentabilidad real (lo que paga por encima de la inflación)', 'El plazo: cuanto más largo, más se mueve su precio con los tipos', 'Qué inflación sigue (la de la zona euro, la de España…)'],
    warnings: ['Si suben los tipos y lo vendes antes del vencimiento, puedes perder dinero aunque la inflación esté alta', 'Con inflación muy baja, rinden menos que un bono normal'],
    examples: ['Bonos del Estado indexados a la inflación de la zona euro', 'Bonos de otros estados ligados a su inflación'],
    keywords: ['bonos ligados a la inflacion', 'bonos indexados a la inflacion', 'bonos de inflacion', 'bonos ligados a inflacion'],
  },
  {
    id: 'high-yield',
    group: 'renta-fija',
    name: 'Bonos de alto rendimiento (high yield)',
    family: 'bonds',
    risk: 'alto',
    horizon: 'Más de 5 años',
    what: 'Bonos de empresas con peor calificación de crédito (por debajo de BBB-). Pagan bastante más interés porque es más probable que alguna no devuelva lo prestado.',
    goodFor: 'Como mucho, una parte pequeña de la renta fija, siempre repartida entre muchas empresas.',
    compare: ['Cuántas empresas lleva y de qué sectores', 'Lo que paga de más frente a un bono del Estado', 'La comisión total anual (TER)'],
    warnings: ['En las crisis caen casi como las acciones', 'Un interés muy alto suele avisar de un riesgo de impago alto'],
    examples: ['Fondos de bonos high yield europeos', 'ETF de bonos high yield en euros'],
    keywords: ['high yield', 'alto rendimiento', 'bonos basura', 'bonos de alto rendimiento'],
  },
  {
    id: 'pagares',
    group: 'renta-fija',
    name: 'Pagarés de empresa',
    family: 'bonds',
    risk: 'alto',
    horizon: 'De unos días a 2 años',
    what: 'Préstamos a corto plazo a una empresa: le das dinero y te devuelve una cantidad mayor en una fecha. Los suelen emitir empresas medianas que buscan financiarse sin un banco.',
    goodFor: 'Muy poco: ofrecen algo más que un depósito a cambio de un riesgo que un depósito no tiene.',
    compare: ['Quién es la empresa, su tamaño y su calificación de crédito', 'Cuánto paga frente a un depósito o unas Letras al mismo plazo'],
    warnings: ['Si la empresa no paga, puedes perderlo todo: no hay fondo de garantía', 'Casi no se pueden vender antes del vencimiento', 'Varias empresas medianas españolas han dejado de pagar sus pagarés'],
    keywords: ['pagares', 'pagare', 'pagares de empresa'],
  },
  {
    id: 'preferentes',
    group: 'renta-fija',
    name: 'Preferentes y deuda subordinada',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'Sin vencimiento o muy lejano',
    what: 'Deuda de bancos y empresas que, si tienen problemas, es de las primeras en perder: puede dejar de pagar intereses, convertirse en acciones o quedarse a cero. Incluye las participaciones preferentes, la deuda subordinada y los bonos convertibles contingentes («CoCos»).',
    goodFor: 'No es un producto de ahorro: es para inversores profesionales que entienden el riesgo.',
    compare: ['Cuándo puede dejar de pagar o convertirse en acciones', 'Si tiene fecha de vencimiento o es perpetua'],
    warnings: ['En España, en 2012, miles de ahorradores perdieron dinero con preferentes que les vendieron como si fueran depósitos', 'Pagan más porque arriesgan mucho más: pueden valer cero aunque el banco siga abierto'],
    keywords: ['preferentes', 'participaciones preferentes', 'deuda subordinada', 'cocos', 'bonos convertibles contingentes'],
  },
  {
    id: 'crowdlending',
    group: 'renta-fija',
    name: 'Préstamos por plataformas (crowdlending)',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'De meses a 5 años',
    what: 'Prestas dinero a empresas o a particulares a través de una plataforma de internet, junto a muchas otras personas, a cambio de un interés.',
    goodFor: 'Solo una parte pequeña de dinero que puedes dejar bloqueado y perder.',
    compare: ['Que la plataforma esté autorizada por la CNMV', 'Su historial de impagos y retrasos', 'Si hay garantías y qué pasa si el prestatario no paga'],
    warnings: ['Los impagos son frecuentes: el interés anunciado no es lo que acabas cobrando', 'No puedes sacar el dinero antes de que se devuelva cada préstamo', 'Si la plataforma cierra, recuperar tu dinero puede ser lento'],
    keywords: ['crowdlending', 'prestamos p2p', 'prestamos entre particulares', 'financiacion participativa'],
  },
  /* --------------------------------- Fondos --------------------------------- */
  {
    id: 'fondo-indexado',
    group: 'fondos',
    name: 'Fondo indexado',
    family: 'diversified-equity',
    risk: 'alto',
    horizon: 'Más de 5 años',
    what: 'Un fondo que copia un índice (por ejemplo, de empresas de todo el mundo) en lugar de elegir acciones. Reparte el dinero entre cientos o miles de empresas.',
    goodFor: 'La parte a largo plazo: dinero que no vas a necesitar en muchos años.',
    compare: ['La comisión total anual (TER): en un indexado suele ser baja', 'Qué índice copia y cuántas empresas y países incluye', 'Lo bien que lo copia (error de seguimiento)'],
    warnings: [EQUITY_DROP, 'En España, pasar el dinero de un fondo a otro no tributa (traspaso)'],
    examples: ['Índice MSCI World: grandes empresas de países desarrollados', 'Índice MSCI ACWI: además, países emergentes', 'Índice FTSE All-World: parecido al anterior', 'Índice S&P 500: las 500 mayores de EE. UU.'],
    choose: [
      'Comisión total (TER) por debajo del 0,3 % al año; por encima del 0,5 %, cara para un indexado',
      'Que copie un índice mundial de miles de empresas de muchos países, no uno de un solo país o sector',
      'Clase de acumulación: reinvierte lo que pagan las empresas sin que tributes cada año',
      'Un fondo grande y con años de historia, que copie bien su índice (poco error de seguimiento)',
    ],
    keywords: ['fondo indexado', 'fondos indexados', 'indexado', 'indexados', 'msci world', 'indice mundial'],
  },
  {
    id: 'fondo-activo',
    group: 'fondos',
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
    id: 'fondo-mixto',
    group: 'fondos',
    name: 'Fondo mixto',
    family: 'bonds',
    risk: 'medio',
    horizon: 'De 3 a 7 años',
    what: 'Un fondo que mezcla acciones y bonos, en una proporción fija o que decide el gestor (por ejemplo, 30 % en acciones y 70 % en bonos).',
    goodFor: 'Quien quiere algo intermedio entre la renta fija y las acciones en un solo producto.',
    compare: ['Qué parte lleva en acciones: a más acciones, más riesgo', 'La comisión total anual: algunos son caros para lo que hacen'],
    warnings: ['Puede bajar en los años malos de la bolsa y de los bonos a la vez'],
    choose: [
      'Una proporción de acciones y bonos que encaje con tu perfil de riesgo',
      'Comisión total baja: por debajo del 0,5 % si es indexado; por encima del 1,5 %, cara',
      'Que mantenga solo esa proporción con el tiempo (reequilibrio automático)',
    ],
    keywords: ['fondo mixto', 'fondos mixtos'],
  },

  {
    id: 'fondo-garantizado',
    group: 'fondos',
    name: 'Fondo garantizado o de rentabilidad objetivo',
    family: 'bonds',
    risk: 'bajo',
    horizon: 'Hasta su fecha de vencimiento (de 2 a 7 años)',
    what: 'Un fondo que promete devolverte lo invertido (o lo invertido más algo) en una fecha concreta. Los «de rentabilidad objetivo» buscan una cifra, pero no la garantizan.',
    goodFor: 'Dinero que puedes dejar quieto hasta la fecha y que no quieres arriesgar.',
    compare: ['Qué garantiza exactamente y en qué fecha', 'La comisión de reembolso si sales antes', 'Lo que da frente a una Letra o un bono del Estado al mismo plazo'],
    warnings: ['La garantía solo vale en la fecha: antes puedes perder', 'Suelen rendir poco para el tiempo que te atan', 'Normalmente solo se puede entrar durante un periodo corto'],
    keywords: ['fondo garantizado', 'fondos garantizados', 'rentabilidad objetivo', 'fondo de rentabilidad objetivo'],
  },
  {
    id: 'fondo-vencimiento',
    group: 'fondos',
    name: 'Fondo de renta fija a vencimiento',
    family: 'bonds',
    risk: 'bajo',
    horizon: 'Hasta su fecha objetivo (de 1 a 5 años)',
    what: 'Un fondo que compra bonos que vencen en una fecha parecida y los mantiene hasta entonces. Anuncia una rentabilidad estimada si te quedas hasta el final.',
    goodFor: 'Dinero que sabes que no tocarás hasta una fecha concreta.',
    compare: ['La rentabilidad estimada después de comisiones', 'La calidad de los bonos que lleva', 'La comisión de reembolso si sales antes'],
    warnings: ['La rentabilidad anunciada es una estimación: si alguna empresa no paga, cobrarás menos', 'Si sales antes, cobras el valor de ese día y puede haber comisión'],
    keywords: ['fondo a vencimiento', 'fondos a vencimiento', 'renta fija a vencimiento', 'fondo de renta fija a vencimiento'],
  },
  {
    id: 'cartera-gestionada',
    group: 'fondos',
    name: 'Cartera gestionada o gestión automatizada',
    family: 'diversified-equity',
    risk: 'alto',
    horizon: 'Más de 5 años (según el perfil)',
    what: 'Delegas en una entidad autorizada que invierte tu dinero en una cartera de fondos según tu perfil de riesgo y la reequilibra por ti. Si lo hace con reglas y por internet, se llama gestor automatizado («robo-advisor»).',
    goodFor: 'Quien quiere una cartera diversificada sin ocuparse de elegir ni de reequilibrar.',
    compare: ['El coste total: el de la gestión más el de los fondos', 'Qué fondos usa (indexados o de gestión activa)', 'El perfil que te asigna y cuánto lleva en renta variable'],
    warnings: [EQUITY_DROP, 'Una cartera de fondos caros puede costar más del 2 % al año: se come buena parte de lo que ganes'],
    keywords: ['cartera gestionada', 'gestion discrecional', 'gestion automatizada', 'roboadvisor', 'robo advisor', 'robo-advisor', 'cartera de fondos'],
  },
  {
    id: 'capital-riesgo',
    group: 'fondos',
    name: 'Capital riesgo y fondos ELTIF',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'De 7 a 12 años, sin poder salir antes',
    what: 'Fondos que invierten en empresas que no cotizan en bolsa (capital riesgo o «private equity») o en infraestructuras. Las ELTIF son fondos europeos de este tipo que desde 2024 pueden comercializarse a pequeños inversores con condiciones.',
    goodFor: 'Solo una parte muy pequeña de un patrimonio grande, que no vayas a necesitar en muchos años.',
    compare: ['Cuánto tiempo queda el dinero comprometido', 'Las comisiones de gestión y de éxito', 'Los resultados de los fondos anteriores de la misma gestora'],
    warnings: ['No puedes sacar el dinero hasta que el fondo termina', 'Sus resultados varían muchísimo de un fondo a otro', 'Las comisiones suelen ser altas'],
    keywords: ['capital riesgo', 'private equity', 'eltif', 'eltifs'],
  },
  /* ----------------------------------- ETF ---------------------------------- */
  {
    id: 'etf',
    group: 'etf',
    name: 'ETF de índice mundial',
    family: 'diversified-equity',
    risk: 'alto',
    horizon: 'Más de 5 años',
    what: 'Un ETF que copia un índice amplio de empresas de todo el mundo: como un fondo indexado, pero comprado en bolsa.',
    goodFor: 'La parte a largo plazo, si prefieres operar en bolsa.',
    compare: ['La comisión total anual (TER)', 'Las comisiones del bróker por comprar y vender', 'Qué índice copia y si es amplio', 'Si reparte los dividendos o los reinvierte (acumulación)'],
    warnings: [EQUITY_DROP, 'En España, cambiar de un ETF a otro normalmente tributa (no hay traspaso como en los fondos)'],
    examples: ['Índice MSCI World', 'Índice MSCI ACWI', 'Índice FTSE All-World'],
    choose: [
      'Comisión total (TER) por debajo del 0,3 % al año',
      'Que copie un índice mundial de miles de empresas',
      'De acumulación y domiciliado en la UE (UCITS), el que puede comprar un particular en España',
      'Con mucho dinero invertido y mucha compraventa diaria: así se compra y se vende a buen precio',
    ],
    keywords: ['etf', 'etfs'],
  },
  {
    id: 'etf-region',
    group: 'etf',
    name: 'ETF de un país o región',
    family: 'concentrated-equity',
    risk: 'alto',
    horizon: 'Más de 5 años',
    what: 'Un ETF que copia la bolsa de un solo país o de una zona: depende mucho más de cómo le vaya a esa economía.',
    goodFor: 'Completar una cartera mundial, no sustituirla.',
    compare: ['Qué índice copia y cuánto pesan sus mayores empresas', 'La comisión total anual (TER)'],
    warnings: ['Un país puede pasar muchos años peor que el resto del mundo', 'Si la moneda del país baja frente al euro, también pierdes'],
    examples: ['IBEX 35 (España)', 'Euro Stoxx 50 (zona euro)', 'S&P 500 (EE. UU.)', 'MSCI Emerging Markets (países emergentes)', 'Nikkei 225 (Japón)'],
    keywords: ['etf de un pais', 'etf de pais', 'etf regional', 'etf de emergentes', 'ibex 35', 'euro stoxx'],
  },
  {
    id: 'etf-sector',
    group: 'etf',
    name: 'ETF sectorial o temático',
    family: 'concentrated-equity',
    risk: 'muy-alto',
    horizon: 'Más de 7 años',
    what: 'Un ETF de un solo sector o de una «temática» de moda. Concentra el dinero en empresas que suben y bajan a la vez.',
    goodFor: 'Como mucho, una parte pequeña, si conoces bien el sector.',
    compare: ['Cuántas empresas lleva y cuánto pesan las mayores', 'La comisión total anual: los temáticos suelen ser más caros'],
    warnings: ['Las temáticas de moda a menudo se compran cuando ya han subido mucho', 'Un sector entero puede caer más de un 50 %'],
    examples: ['Tecnología', 'Salud', 'Energía', 'Bancos', 'Energías renovables', 'Semiconductores o inteligencia artificial'],
    keywords: ['etf sectorial', 'etf tematico', 'etf de tecnologia', 'etf de salud'],
  },  {
    id: 'etf-factor',
    group: 'etf',
    name: 'ETF de factores y de dividendos',
    family: 'concentrated-equity',
    risk: 'alto',
    horizon: 'Más de 7 años',
    what: 'ETF que eligen empresas por una característica («factor»): baratas respecto a lo que ganan (valor), pequeñas, de alta calidad, que suben con fuerza (momento), que se mueven poco o que reparten mucho dividendo.',
    goodFor: 'Como complemento de una cartera mundial, para quien entiende el factor y tiene paciencia.',
    compare: ['Qué factor sigue y cómo elige las empresas', 'La comisión total anual (TER)', 'Cuánto se parece en realidad a un ETF mundial'],
    warnings: ['Un factor puede ir peor que el mercado durante muchos años seguidos', 'Los de dividendos reparten rentas que tributan cada año'],
    examples: ['Factor valor', 'Empresas pequeñas', 'Calidad', 'Momento', 'Mínima volatilidad', 'Altos dividendos'],
    keywords: ['etf de factores', 'etf factorial', 'smart beta', 'etf de dividendos', 'etf value', 'etf de valor'],
  },

  {
    id: 'etf-bonos',
    group: 'etf',
    name: 'ETF de bonos',
    family: 'bonds',
    risk: 'medio',
    horizon: 'De 2 a 7 años, según los bonos',
    what: 'Un ETF que reparte el dinero entre muchos bonos de estados o de empresas.',
    goodFor: 'Tener renta fija diversificada comprándola en bolsa.',
    compare: ['La duración media de sus bonos', 'Qué bonos lleva y en qué moneda', 'La comisión total anual (TER)'],
    warnings: ['Si suben los tipos, puede bajar durante un tiempo', 'Si los bonos están en otra moneda, el cambio frente al euro también cuenta'],
    examples: ['Bonos de gobiernos de la zona euro', 'Bonos de empresas en euros', 'Bonos a corto plazo'],
    choose: [
      'Comisión total (TER) por debajo del 0,25 % al año',
      'Bonos de calidad de muchos emisores, con una duración acorde a tu plazo',
      'En euros o con la divisa cubierta',
      'De acumulación y domiciliado en la UE (UCITS)',
    ],
    keywords: ['etf de bonos', 'etf de renta fija'],
  },
  {
    id: 'etf-apalancado',
    group: 'etf',
    name: 'ETF apalancado o inverso',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'Ninguno: pensado para días',
    what: 'Un ETF que multiplica lo que hace un índice cada día (por 2 o por 3) o que gana cuando el índice baja.',
    goodFor: 'Operaciones de muy corto plazo de inversores profesionales. No para ahorrar.',
    compare: ['Que entiendas cómo se recalcula cada día'],
    warnings: ['A largo plazo puede perder aunque el índice suba', 'Puede perder casi todo su valor en pocos días'],
    keywords: ['etf apalancado', 'apalancado', 'apalancados', 'etf inverso'],
  },

  /* ------------------------- Planes de pensiones y seguros ------------------------- */
  {
    id: 'plan-pensiones',
    group: 'prevision',
    name: 'Plan de pensiones individual',
    family: 'diversified-equity',
    assetType: 'other',
    risk: 'medio',
    horizon: 'Hasta tu jubilación',
    what: 'Ahorro para la jubilación que invierte como un fondo (en acciones, bonos o una mezcla). Lo que aportas cada año desgrava en la renta, pero normalmente no puedes sacarlo hasta jubilarte.',
    goodFor: 'La parte de tu largo plazo pensada para la jubilación, sobre todo si hoy pagas un tipo alto en la renta.',
    compare: ['La comisión total anual (gestión más depósito)', 'Qué lleva dentro y cuánto en renta variable', 'Su resultado frente a planes parecidos durante muchos años'],
    warnings: ['El dinero queda bloqueado hasta la jubilación, salvo casos concretos o lo aportado hace más de 10 años', 'Al rescatarlo tributa todo como sueldo: la ventaja es diferir el impuesto, no evitarlo', 'Muchos planes de banco cobran cerca del máximo legal'],
    examples: ['Planes de renta variable global', 'Planes indexados', 'Planes mixtos', 'Planes de renta fija'],
    keywords: ['plan de pensiones', 'planes de pensiones', 'fondo de pensiones', 'jubilacion'],
    fitOverride: {
      verdict: 'partial',
      reasons: [
        'Es para tu jubilación: lo que aportas desgrava en la renta, pero normalmente no puedes sacarlo hasta jubilarte (o con 10 años de antigüedad, o en casos concretos).',
        'Puede ser una buena forma de invertir la parte de tu largo plazo pensada para la jubilación; dentro, busca renta variable global y comisiones bajas.',
      ],
    },
  },
  {
    id: 'plan-empleo',
    group: 'prevision',
    name: 'Plan de pensiones de empleo',
    family: 'diversified-equity',
    assetType: 'other',
    risk: 'medio',
    horizon: 'Hasta tu jubilación',
    what: 'Un plan de pensiones que promueve tu empresa (y en el que a menudo pone dinero) o, si eres autónomo, un plan de empleo simplificado. Permite aportar más cada año con ventaja fiscal.',
    goodFor: 'Si tu empresa aporta, es dinero extra para tu jubilación; si eres autónomo, desgravar más que con un plan individual.',
    compare: ['Cuánto aporta la empresa y si depende de lo que aportes tú', 'La comisión total anual', 'Qué lleva dentro'],
    warnings: ['El dinero queda bloqueado hasta la jubilación, salvo casos concretos', 'Al rescatarlo tributa como sueldo'],
    examples: ['Plan de empleo de tu empresa', 'Plan de empleo simplificado para autónomos', 'Fondos de pensiones de promoción pública'],
    keywords: ['plan de empleo', 'planes de empleo', 'plan de pensiones de empresa', 'plan de empleo simplificado'],
    fitOverride: {
      verdict: 'partial',
      reasons: [
        'Es para tu jubilación y queda bloqueado hasta entonces, salvo casos concretos.',
        'Si tu empresa pone dinero cuando tú aportas, es de lo más rentable que hay: es parte de tu sueldo que de otra forma no cobras.',
      ],
    },
  },
  {
    id: 'pias',
    group: 'prevision',
    name: 'PIAS (plan individual de ahorro sistemático)',
    family: 'bonds',
    assetType: 'other',
    risk: 'bajo',
    horizon: 'Más de 5 años, para cobrarlo como renta',
    what: 'Un seguro de ahorro a largo plazo: si lo mantienes al menos 5 años y lo cobras como una renta para toda la vida, lo ganado no paga impuestos.',
    goodFor: 'Quien quiere asegurarse una renta para toda la vida al jubilarse, con ventaja fiscal.',
    compare: ['Qué garantiza y cuánto cobra el seguro', 'Su rentabilidad después de gastos', 'Cuánto te penalizan si lo rescatas antes'],
    warnings: ['La ventaja fiscal solo existe si lo cobras como renta vitalicia', 'Los gastos del seguro pueden comerse buena parte de la ventaja'],
    keywords: ['pias', 'plan individual de ahorro sistematico'],
    fitOverride: {
      verdict: 'partial',
      reasons: [
        'Es un seguro de ahorro con ventaja fiscal si cumples sus condiciones: al menos 5 años y cobrarlo como una renta para toda la vida.',
        'Compara sus gastos con un fondo indexado: la ventaja fiscal a veces no compensa lo que cobra.',
      ],
    },
  },
  {
    id: 'sialp',
    group: 'prevision',
    name: 'SIALP y CIALP (ahorro a 5 años)',
    family: 'bonds',
    assetType: 'other',
    risk: 'bajo',
    horizon: '5 años',
    what: 'Un seguro (SIALP) o una cuenta (CIALP) de ahorro a 5 años: si no lo tocas en ese tiempo, lo ganado no paga impuestos. Solo se puede tener uno por persona y aportar hasta 5.000 € al año.',
    goodFor: 'Ahorro a medio plazo que no quieres arriesgar, aprovechando que lo ganado no tributa.',
    compare: ['Lo que garantiza y lo que puede rendir por encima', 'Sus gastos y comisiones'],
    warnings: ['Si lo sacas antes de 5 años, pierdes la ventaja fiscal', 'Con tipos bajos, la ventaja fiscal es pequeña en euros'],
    keywords: ['sialp', 'cialp', 'seguro individual de ahorro a largo plazo'],
    fitOverride: {
      verdict: 'partial',
      reasons: [
        'Es ahorro a 5 años con poco riesgo y sin impuestos sobre lo ganado si no lo tocas: puede servir para un objetivo de medio plazo.',
        'Compáralo con unas Letras o un depósito después de impuestos: la ventaja depende de los tipos de ese momento.',
      ],
    },
  },
  {
    id: 'unit-linked',
    group: 'prevision',
    name: 'Seguro unit linked',
    family: 'diversified-equity',
    assetType: 'other',
    risk: 'alto',
    horizon: 'Más de 5 años',
    what: 'Un seguro de vida-ahorro en el que eliges en qué fondos se invierte tu dinero. Puedes cambiar de fondo dentro del seguro y, en ciertos casos, sin pagar impuestos.',
    goodFor: 'Casos concretos (por ejemplo, de planificación de herencias); para la mayoría, un fondo directamente es más barato.',
    compare: ['El coste total: el del seguro más el de los fondos', 'Qué fondos te deja elegir', 'Las penalizaciones por rescatar'],
    warnings: ['Suele ser bastante más caro que tener los fondos directamente', 'Lo invertido sube y baja con los fondos: no está garantizado'],
    keywords: ['unit linked', 'unit-linked', 'seguro de vida ahorro'],
    fitOverride: {
      verdict: 'partial',
      reasons: [
        'Por dentro invierte en fondos, como tu largo plazo, pero con los gastos de un seguro encima.',
        'Con fondos de inversión directamente ya tienes traspasos sin pagar impuestos, normalmente más barato.',
      ],
    },
  },
  /* -------------------------------- Compañías ------------------------------- */
  {
    id: 'acciones',
    group: 'acciones',
    name: 'Grandes empresas consolidadas',
    family: 'concentrated-equity',
    risk: 'alto',
    horizon: 'Más de 5 años',
    what: 'Acciones de empresas muy grandes y conocidas, con muchos años de historia y negocio en muchos países.',
    goodFor: 'Quien quiere elegir empresas concretas y acepta que a una sola le puede ir mal.',
    compare: ['Comisiones del bróker por comprar, vender y custodiar', 'Cuánto de tu dinero estaría en una sola empresa', 'En qué moneda cotiza'],
    warnings: ['Ser grande no protege: empresas enormes han caído mucho o han desaparecido', 'Que una empresa haya subido mucho no dice nada de lo que hará', 'Con pocas empresas, una mala noticia puede hacerte perder mucho'],
    examples: ['Inditex', 'Iberdrola', 'Telefónica', 'Apple', 'Microsoft', 'Nestlé'],
    keywords: ['acciones', 'accion', 'bolsa', 'invertir en empresas', 'companias'],
  },
  {
    id: 'acciones-dividendo',
    group: 'acciones',
    name: 'Empresas de dividendos',
    family: 'concentrated-equity',
    risk: 'alto',
    horizon: 'Más de 5 años',
    what: 'Empresas que reparten cada año una parte de su beneficio entre los accionistas (el dividendo), normalmente de sectores estables como la energía o el consumo.',
    goodFor: 'Quien valora cobrar una renta periódica, sabiendo que la acción puede bajar.',
    compare: ['Si el dividendo sale del beneficio o la empresa se endeuda para pagarlo', 'Cuánto de tu dinero estaría en una sola empresa'],
    warnings: ['El dividendo no está garantizado: la empresa lo puede bajar o quitar', 'Un dividendo muy alto a veces avisa de problemas', 'Los dividendos tributan en tu declaración de la renta'],
    examples: ['Iberdrola', 'Endesa', 'Coca-Cola', 'Procter & Gamble', 'Unilever'],
    keywords: ['dividendos', 'dividendo', 'acciones de dividendo'],
  },
  {
    id: 'acciones-crecimiento',
    group: 'acciones',
    name: 'Empresas de crecimiento y tecnológicas',
    family: 'concentrated-equity',
    risk: 'muy-alto',
    horizon: 'Más de 7 años',
    what: 'Empresas que crecen deprisa, sobre todo tecnológicas. Suelen repartir poco o ningún dividendo y su precio depende de lo que se espera que crezcan.',
    goodFor: 'Una parte pequeña, para quien acepta subidas y bajadas muy fuertes.',
    compare: ['Cuánto de tu dinero estaría en una sola empresa', 'Si ya tienes esas mismas empresas dentro de un fondo o ETF mundial'],
    warnings: ['Pueden caer más de un 50 % aunque la empresa siga yendo bien', 'De las que más han subido se espera mucho: cualquier decepción pesa'],
    examples: ['Nvidia', 'Amazon', 'Alphabet (Google)', 'ASML', 'Tesla'],
    keywords: ['tecnologicas', 'acciones tecnologicas', 'empresas de crecimiento', 'acciones de crecimiento'],
  },
  {
    id: 'acciones-pequenas',
    group: 'acciones',
    name: 'Empresas pequeñas',
    family: 'concentrated-equity',
    risk: 'muy-alto',
    horizon: 'Más de 7 años',
    what: 'Empresas de poco tamaño en bolsa. Pueden crecer mucho, pero también quebrar, y a veces cuesta venderlas porque se negocian poco.',
    goodFor: 'Solo quien conoce muy bien la empresa y puede perder lo que pone.',
    compare: ['Cuánto se negocia cada día: si es poco, vender puede costar', 'Las comisiones del bróker en ese mercado'],
    warnings: ['Puedes perderlo todo si la empresa quiebra', 'Hay menos información pública sobre ellas'],
    keywords: ['empresas pequenas', 'small caps', 'pequenas empresas'],
  },

  /* ------------------------------ Materias primas ---------------------------- */
  {
    id: 'oro',
    group: 'materias',
    name: 'Oro',
    family: 'speculative',
    risk: 'alto',
    horizon: 'Largo plazo',
    what: 'Un metal que no genera rentas: solo ganas si lo vendes más caro de lo que lo compraste. Se suele ver como refugio en las crisis.',
    goodFor: 'Como mucho, una parte pequeña para diversificar; no es la base de una cartera.',
    compare: ['Cómo lo tienes: físico (custodia y seguro) o a través de un producto que sigue su precio', 'Las comisiones de compra, venta y custodia'],
    warnings: ['Su precio puede pasar años bajando', 'No paga intereses ni dividendos'],
    examples: ['Oro físico (lingotes y monedas)', 'ETC de oro (sigue su precio y cotiza en bolsa)'],
    keywords: ['oro', 'gold', 'metales preciosos'],
  },
  {
    id: 'plata',
    group: 'materias',
    name: 'Plata',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'Largo plazo',
    what: 'Un metal precioso que también usa la industria; por eso su precio se mueve más que el del oro.',
    goodFor: 'Como mucho, una parte muy pequeña para diversificar.',
    compare: ['Cómo la tienes: física o a través de un producto que sigue su precio', 'Las comisiones de compra, venta y custodia'],
    warnings: ['Sube y baja bastante más que el oro', 'No paga intereses ni dividendos'],
    examples: ['Plata física (monedas y lingotes)', 'ETC de plata'],
    keywords: ['plata', 'silver'],
  },
  {
    id: 'energia',
    group: 'materias',
    name: 'Petróleo y gas',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'Ninguno es seguro',
    what: 'La energía que mueve el mundo. Su precio depende de la economía, la política y las guerras, y cambia muy deprisa.',
    goodFor: 'Inversores con experiencia; no para el ahorro a largo plazo.',
    compare: ['Cómo sigue el precio el producto (los que usan futuros tienen costes al renovarlos)', 'Las comisiones'],
    warnings: ['Puede caer más de un 50 % en pocos meses', 'Los productos que siguen al petróleo pueden quedarse muy por detrás de su precio'],
    examples: ['Petróleo Brent', 'Petróleo WTI', 'Gas natural'],
    keywords: ['petroleo', 'gas natural', 'brent'],
  },
  {
    id: 'metales-industriales',
    group: 'materias',
    name: 'Metales industriales',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'Ninguno es seguro',
    what: 'Metales que usa la industria (construcción, coches eléctricos, electrónica). Su precio sigue a la economía mundial.',
    goodFor: 'Inversores con experiencia; no para el ahorro a largo plazo.',
    compare: ['Cómo sigue el precio el producto', 'Las comisiones'],
    warnings: ['Caen fuerte cuando la economía se frena', 'No generan rentas'],
    examples: ['Cobre', 'Aluminio', 'Níquel', 'Litio'],
    keywords: ['cobre', 'litio', 'metales industriales'],
  },
  {
    id: 'agricolas',
    group: 'materias',
    name: 'Materias primas agrícolas',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'Ninguno es seguro',
    what: 'Cereales, café, cacao… Su precio depende de las cosechas, el clima y el comercio mundial.',
    goodFor: 'Inversores con experiencia; no para el ahorro a largo plazo.',
    compare: ['Cómo sigue el precio el producto (normalmente con futuros)', 'Las comisiones'],
    warnings: ['Una buena o mala cosecha puede mover mucho el precio', 'No generan rentas'],
    examples: ['Trigo', 'Maíz', 'Café', 'Cacao'],
    keywords: ['materias primas agricolas', 'agricolas'],
  },

  /* ------------------------------- Inmobiliario ------------------------------ */
  {
    id: 'socimi',
    group: 'inmobiliario',
    name: 'SOCIMI y REIT',
    family: 'concentrated-equity',
    risk: 'alto',
    horizon: 'Más de 5 años',
    what: 'Empresas en bolsa que tienen inmuebles (oficinas, centros comerciales, viviendas, naves logísticas) y viven de alquilarlos. En España se llaman SOCIMI y deben repartir como dividendo al menos el 80 % del beneficio de los alquileres; en EE. UU., REIT.',
    goodFor: 'Tener algo de inmobiliario con poco dinero y pudiendo vender cuando quieras.',
    compare: ['Qué tipo de inmuebles tiene y dónde', 'Cuánta deuda tiene', 'Cuánto de tu dinero estaría en una sola empresa'],
    warnings: ['Cotizan en bolsa: pueden caer como cualquier acción aunque sus edificios no bajen', 'Les afectan mucho las subidas de los tipos de interés'],
    examples: ['Merlin Properties', 'Inmobiliaria Colonial', 'Realty Income (REIT de EE. UU.)'],
    keywords: ['socimi', 'socimis', 'reit', 'reits'],
  },
  {
    id: 'fondo-inmobiliario',
    group: 'inmobiliario',
    name: 'Fondo o ETF inmobiliario',
    family: 'concentrated-equity',
    risk: 'alto',
    horizon: 'Más de 5 años',
    what: 'Un fondo o ETF que reparte el dinero entre muchas SOCIMI y REIT de varios países.',
    goodFor: 'Tener inmobiliario diversificado sin elegir empresas una a una.',
    compare: ['La comisión total anual (TER)', 'Qué países y tipos de inmueble incluye'],
    warnings: ['Es un solo sector: depende mucho de los tipos de interés', 'Puede caer más de un 30 % en un año malo'],
    examples: ['Índices de REIT globales', 'Índices de inmobiliario europeo'],
    keywords: ['fondo inmobiliario', 'etf inmobiliario', 'inmobiliario'],
  },
  {
    id: 'crowdfunding-inmobiliario',
    group: 'inmobiliario',
    name: 'Crowdfunding inmobiliario',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'De 1 a 5 años, sin poder salir antes',
    what: 'Prestas dinero o entras como socio en un proyecto concreto (una promoción, una reforma) junto a muchas personas, a través de una plataforma de internet.',
    goodFor: 'Solo dinero que puedes dejar bloqueado y perder.',
    compare: ['Que la plataforma esté autorizada por la CNMV como plataforma de financiación participativa', 'Qué garantías tiene el proyecto', 'Qué pasa si se retrasa'],
    warnings: ['No puedes sacar el dinero antes de que termine el proyecto', 'Los proyectos se retrasan o fallan: puedes perderlo todo', 'Una rentabilidad anunciada no es una rentabilidad asegurada'],
    keywords: ['crowdfunding', 'crowdfunding inmobiliario'],
  },  {
    id: 'vivienda-alquiler',
    group: 'inmobiliario',
    name: 'Vivienda para alquilar',
    family: 'concentrated-equity',
    assetType: 'other',
    risk: 'alto',
    horizon: 'Más de 10 años',
    what: 'Comprar un piso o una casa para alquilarlo: ganas con el alquiler y, si sube, con su precio. Casi siempre se compra con hipoteca, que multiplica lo que ganas y lo que pierdes.',
    goodFor: 'Quien tiene ya colchón y una base invertida, dinero para la entrada y los gastos, y tiempo para gestionarla.',
    compare: ['La rentabilidad neta: alquiler menos todos los gastos, sobre todo lo que cuesta comprar', 'La cuota de la hipoteca frente al alquiler', 'Cómo está la zona: demanda, precios y normas de alquiler'],
    warnings: ['Mete mucho dinero en un solo inmueble y en una sola ciudad', 'Impagos, meses vacíos y reparaciones pueden dejarla en pérdidas', 'Venderla lleva meses y cuesta dinero', 'En zonas tensionadas hay límites a lo que puedes cobrar'],
    keywords: ['vivienda para alquilar', 'piso para alquilar', 'comprar un piso para alquilar', 'alquilar un piso', 'invertir en vivienda', 'comprar para alquilar'],
    fitOverride: {
      verdict: 'partial',
      reasons: [
        'Puede ser una inversión a largo plazo, pero mete mucho dinero en un solo inmueble, casi siempre con hipoteca, y no se vende rápido.',
        'No sustituye a la parte diversificada de tu plan: si la compras, que no deje tu colchón ni tus objetivos sin dinero.',
      ],
    },
  },


  /* ------------------------------- Criptomonedas ----------------------------- */
  {
    id: 'cripto',
    group: 'cripto',
    name: 'Bitcoin y Ethereum',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'Ninguno es seguro',
    what: 'Las dos criptomonedas más grandes. Activos digitales muy volátiles, sin rentas y con poca protección para el inversor.',
    goodFor: 'Solo dinero que podrías perder entero sin que te afecte.',
    compare: ['Que la plataforma esté registrada y autorizada', 'Las comisiones de compra, venta y retirada', 'Dónde se guardan y quién tiene las claves'],
    warnings: ['Su precio puede caer más de un 50 % en poco tiempo', 'La CNMV y el Banco de España advierten de su riesgo', 'Estafas frecuentes: desconfía de rentabilidades «garantizadas»'],
    examples: ['Bitcoin', 'Ethereum'],
    keywords: ['cripto', 'criptomonedas', 'criptomoneda', 'bitcoin', 'ethereum', 'btc'],
  },
  {
    id: 'cripto-otras',
    group: 'cripto',
    name: 'Otras criptomonedas y memecoins',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'Ninguno es seguro',
    what: 'Miles de criptomonedas más pequeñas, muchas sin uso real. Las «memecoins» nacen de bromas o modas de internet.',
    goodFor: 'Nada que forme parte de un plan de ahorro.',
    compare: ['Quién está detrás y para qué sirve', 'Si alguien conocido promete subidas: es una señal de alarma'],
    warnings: ['La mayoría acaba valiendo casi cero', 'Hay muchas estafas que inflan el precio y venden de golpe', 'Más riesgo todavía que el bitcoin'],
    examples: ['Solana', 'XRP', 'Dogecoin (memecoin)'],
    keywords: ['altcoins', 'altcoin', 'memecoin', 'memecoins', 'solana', 'dogecoin'],
  },
  {
    id: 'stablecoins',
    group: 'cripto',
    name: 'Stablecoins',
    family: 'speculative',
    risk: 'medio',
    horizon: 'No es una inversión',
    what: 'Criptomonedas que intentan valer siempre lo mismo que una moneda (un dólar o un euro). No están pensadas para ganar dinero, sino para moverlo dentro del mundo cripto.',
    goodFor: 'No sirven para hacer crecer tu ahorro.',
    compare: ['Quién la emite y si está autorizado en la UE', 'Qué respalda su valor'],
    warnings: ['No las cubre el Fondo de Garantía de Depósitos', 'Algunas han perdido su valor de golpe'],
    examples: ['USDC (dólar)', 'EURC (euro)'],
    keywords: ['stablecoin', 'stablecoins', 'usdt', 'usdc'],
  },  {
    id: 'cripto-staking',
    group: 'cripto',
    name: 'Staking y préstamos de cripto',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'Ninguno es seguro',
    what: 'Dejar tu cripto bloqueada para ayudar a funcionar a su red (staking) o prestarla en una plataforma, a cambio de recibir más cripto.',
    goodFor: 'Nada que forme parte de un plan de ahorro.',
    compare: ['Que la plataforma esté autorizada en la UE', 'Cuánto tiempo queda bloqueada', 'De dónde salen las recompensas'],
    warnings: ['Las recompensas se pagan en cripto: si su precio cae, pierdes igual', 'En 2022 quebraron varias plataformas de préstamos de cripto y sus clientes perdieron su dinero'],
    keywords: ['staking', 'defi', 'prestar cripto', 'prestamos de cripto'],
  },

  /* ---------------------------- Productos complejos ---------------------------- */
  {
    id: 'cfd',
    group: 'complejos',
    name: 'CFD (contratos por diferencias)',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'Ninguno: pensado para horas o días',
    what: 'Un contrato con un intermediario para ganar o perder la diferencia de precio de algo (una acción, un índice, una divisa) sin tenerlo, con apalancamiento: con poco dinero mueves mucho.',
    goodFor: 'No sirve para ahorrar.',
    compare: ['El apalancamiento y cuánto pierdes por cada 1 % que se mueve el precio', 'Los costes por mantener la posición abierta cada día'],
    warnings: ['Los avisos obligatorios dicen que la mayoría de cuentas de pequeños inversores pierde dinero (a menudo más del 70 %)', 'La CNMV restringe su publicidad y su venta a pequeños inversores', 'Las ofertas de «trading» por redes sociales son a menudo estafas'],
    keywords: ['cfd', 'cfds', 'contratos por diferencias', 'trading', 'forex'],
  },
  {
    id: 'futuros-opciones',
    group: 'complejos',
    name: 'Futuros y opciones',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'Ninguno: cada contrato tiene su fecha',
    what: 'Contratos para comprar o vender algo en el futuro a un precio fijado hoy. Un futuro te obliga; una opción te da el derecho. Se usan para cubrirse de riesgos o para especular con apalancamiento.',
    goodFor: 'Empresas e inversores profesionales que saben cubrir riesgos. No para ahorrar.',
    compare: ['Cuánto puedes perder en el peor caso', 'Las garantías que te pueden pedir si el precio va en tu contra'],
    warnings: ['Con un futuro puedes perder más de lo que pusiste', 'Vender opciones sin cubrirte puede costarte muchísimo más de lo que cobraste', 'Una opción comprada puede acabar valiendo cero'],
    keywords: ['futuros financieros', 'opciones financieras', 'opciones call', 'opciones put', 'derivados'],
  },
  {
    id: 'estructurados',
    group: 'complejos',
    name: 'Productos estructurados',
    family: 'speculative',
    risk: 'alto',
    horizon: 'Hasta su vencimiento (de 1 a 7 años)',
    what: 'Productos que combinan un depósito o un bono con derivados: lo que cobras depende de lo que hagan un índice o unas acciones (por ejemplo, «si el índice no baja más de un 30 %, cobras un 6 %»). Algunos se cancelan solos antes de tiempo («autocancelables»).',
    goodFor: 'Muy poco para la mayoría: son difíciles de comparar y a menudo caros por dentro.',
    compare: ['En qué casos cobras, en cuáles no y en cuáles pierdes capital', 'Si el capital está garantizado y quién lo garantiza', 'Su indicador de riesgo del 1 al 7'],
    warnings: ['Una cifra atractiva («hasta un 8 %») suele esconder escenarios en los que pierdes', 'Salir antes del vencimiento suele salir caro o no es posible'],
    keywords: ['estructurado', 'estructurados', 'producto estructurado', 'productos estructurados', 'depositos estructurados', 'autocancelable'],
  },
  {
    id: 'warrants-turbos',
    group: 'complejos',
    name: 'Warrants y turbos',
    family: 'speculative',
    risk: 'muy-alto',
    horizon: 'Ninguno: pensados para días o semanas',
    what: 'Productos que cotizan en bolsa y multiplican lo que se mueve una acción o un índice. Un turbo desaparece en cuanto el precio toca su barrera.',
    goodFor: 'No sirven para ahorrar.',
    compare: ['Dónde está la barrera y cuánto multiplica', 'Quién lo emite'],
    warnings: ['Pueden valer cero en un momento', 'El paso del tiempo les resta valor aunque el precio no se mueva'],
    keywords: ['warrant', 'warrants', 'turbo', 'turbos'],
  },

]

/** Cada tipo con lo que sabría un experto: impuestos, liquidez y protección (y «cómo reconocer uno bueno» si faltaba). */
export const PRODUCT_TYPES: readonly ProductType[] = BASE_TYPES.map((t) => {
  const x = TYPE_EXPERTISE[t.id]
  if (!x) throw new Error(`Falta guide/expertise.ts para «${t.id}»`)
  return { ...t, taxes: x.taxes, liquidity: x.liquidity, protection: x.protection, ...(t.choose ? {} : x.choose ? { choose: x.choose } : {}) }
})

export function groupById(id: InvestmentGroupId): InvestmentGroup {
  return INVESTMENT_GROUPS.find((g) => g.id === id) as InvestmentGroup
}

export function typesOfGroup(id: InvestmentGroupId): ProductType[] {
  return PRODUCT_TYPES.filter((p) => p.group === id)
}

/** Riesgo menor y mayor de los tipos de una familia. */
export function groupRiskRange(id: InvestmentGroupId): [ProductRisk, ProductRisk] {
  const risks = typesOfGroup(id).map((p) => RISK_ORDER.indexOf(p.risk))
  return [RISK_ORDER[Math.min(...risks)], RISK_ORDER[Math.max(...risks)]]
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/**
 * Tipos de producto que nombra un texto (por sus palabras clave completas), en
 * el orden de la guía. Si una palabra clave está dentro de otra más concreta
 * que también aparece («etf» en «etf de bonos»), solo cuenta la concreta.
 */
export function matchProductTypes(text: string): ProductType[] {
  const t = fold(text)
  const hits = PRODUCT_TYPES.map((p) => ({ p, keys: p.keywords.filter((k) => new RegExp(`(^|[^a-z0-9ñ])${k}($|[^a-z0-9ñ])`).test(t)) })).filter((h) => h.keys.length > 0)
  const all = hits.flatMap((h) => h.keys)
  return hits.filter((h) => h.keys.some((k) => !all.some((o) => o !== k && o.includes(k)))).map((h) => h.p)
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
