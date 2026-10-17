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

export type ProductRisk = 'muy-bajo' | 'bajo' | 'medio' | 'alto' | 'muy-alto'
/** Familia para revisar el encaje con el plan (guide/fit.ts). */
export type ProductFamily = 'cash' | 'short-debt' | 'bonds' | 'diversified-equity' | 'concentrated-equity' | 'speculative'

export type InvestmentGroupId = 'ahorro' | 'renta-fija' | 'fondos' | 'etf' | 'acciones' | 'materias' | 'inmobiliario' | 'cripto'

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
  warnings: string[]
  /** Ejemplos de lo que existe dentro del tipo. Solo pantalla; no son recomendaciones. */
  examples?: string[]
  /** Palabras con las que el usuario lo nombra (minúsculas, sin tildes). */
  keywords: string[]
}

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
    summary: 'Bonos de estados y de empresas',
    intro: 'Prestas tu dinero a un estado o a una empresa y te paga un interés. Tiene menos riesgo que las acciones, pero su precio se mueve con los tipos de interés.',
  },
  {
    id: 'fondos',
    name: 'Fondos de inversión',
    summary: 'Indexados, de gestión activa y mixtos',
    intro: 'Juntas tu dinero con el de muchas personas y una gestora lo invierte por todos. En España, pasar el dinero de un fondo a otro no tributa (traspaso).',
  },
  {
    id: 'etf',
    name: 'ETF',
    summary: 'Fondos que cotizan en bolsa: mundiales, por país, por sector…',
    intro: 'Un ETF es un fondo que se compra y vende en bolsa como una acción, a través de un bróker. Casi todos copian un índice: lo importante es cuál.',
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
    summary: 'SOCIMI, fondos inmobiliarios y crowdfunding',
    intro: 'Invertir en inmuebles sin comprar una vivienda entera: a través de empresas en bolsa, de fondos o de plataformas de financiación participativa.',
  },
  {
    id: 'cripto',
    name: 'Criptomonedas',
    summary: 'Bitcoin, otras criptomonedas y stablecoins',
    intro: 'Activos digitales muy volátiles, sin rentas y con poca protección para el inversor. La CNMV y el Banco de España advierten de su riesgo.',
  },
]

const EQUITY_DROP = 'Puede caer mucho en un año malo, incluso más de un 30 %: solo para dinero que puedas dejar quieto'

export const PRODUCT_TYPES: readonly ProductType[] = [
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
    keywords: ['bonos de empresa', 'bonos de empresas', 'bonos corporativos', 'renta fija privada', 'high yield'],
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
    keywords: ['renta fija', 'fondo de renta fija', 'fondos de renta fija'],
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
    keywords: ['fondo mixto', 'fondos mixtos'],
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
    keywords: ['crowdfunding', 'crowdfunding inmobiliario', 'crowdlending'],
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
  },
]

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
