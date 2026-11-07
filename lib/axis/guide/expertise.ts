/**
 * Lo que sabría un experto de cada tipo de la Guía (decidido con el usuario el
 * 2026-11-02): cómo tributa en España, cuándo puedes recuperar tu dinero y qué
 * te protege si algo va mal; y, donde faltaba, cómo reconocer uno bueno.
 *
 * Reglas generales de España (IRPF 2026), información general: nunca
 * planificación fiscal personalizada. Sin productos, gestoras, brókers ni
 * plataformas concretos (CNMV).
 */

export interface TypeExpertise {
  /** Cómo tributa en España. */
  taxes: string
  /** Cuándo y cómo puedes recuperar tu dinero. */
  liquidity: string
  /** Quién lo supervisa y qué te protege (o que nada te protege del precio). */
  protection: string
  /** «Cómo reconocer uno bueno», para los tipos que no lo traen en su ficha. */
  choose?: string[]
}

/** Base del ahorro del IRPF: tramos 2026. */
export const SAVINGS_TAX = 'base del ahorro del IRPF (19 % hasta 6.000 € de ganancia al año, 21 % hasta 50.000 €, 23 % hasta 200.000 €, 27 % hasta 300.000 € y 30 % por encima)'

const FUND_TAX = `Tributa solo cuando sacas el dinero, por lo que hayas ganado, en la ${SAVINGS_TAX}. Pasar el dinero de un fondo a otro (traspaso) no tributa: puedes cambiar de fondo sin pagar impuestos.`
const ETF_TAX = `Tributa al venderlo, por lo que hayas ganado, en la ${SAVINGS_TAX}. Si reparte dividendos, también tributan cada año. Cambiar de un ETF a otro no tiene traspaso: tributa como una venta.`
const STOCK_TAX = `Al vender, la ganancia o la pérdida va a la ${SAVINGS_TAX}; las pérdidas compensan ganancias de los 4 años siguientes. Los dividendos tributan cada año (te retienen un 19 %); los de empresas extranjeras pagan también en su país y puedes recuperar una parte en tu declaración.`
const BOND_TAX = `Los intereses (cupones) tributan como rendimiento del capital mobiliario en la ${SAVINGS_TAX}, con una retención del 19 % al cobrarlos; al vender o al vencer, también la diferencia con lo que pagaste.`
const COMMODITY_TAX = `A través de un ETC o un fondo: tributa al vender, por lo que hayas ganado, en la ${SAVINGS_TAX}.`
const CRYPTO_TAX = `Tributa al venderla y también al cambiar una cripto por otra, por lo que hayas ganado, en la ${SAVINGS_TAX}. Si tienes en plataformas extranjeras más de 50.000 €, hay que informar a Hacienda (modelo 721).`
const DERIVATIVE_TAX = `Lo que ganes o pierdas va a la ${SAVINGS_TAX} como ganancia o pérdida patrimonial.`

const FUND_LIQUIDITY = 'Normalmente tienes el dinero en 1 a 3 días hábiles desde que lo pides.'
const MARKET_LIQUIDITY = 'Se vende en bolsa en cualquier momento en que el mercado esté abierto; el dinero llega en unos 2 días hábiles.'

const FUND_PROTECTION =
  'Lo supervisa la CNMV. El dinero del fondo está separado del de la gestora y lo guarda un depositario: si la gestora quiebra, no se pierde. Nada te protege de que baje lo que lleva dentro.'
const BROKER_PROTECTION =
  'Si el bróker quiebra y no te devuelve tus títulos, en España el FOGAIN cubre hasta 100.000 € (los brókers de otros países de la UE tienen un fondo parecido). Nada te protege de que baje el precio.'
const ETC_PROTECTION = 'Un ETC es deuda de quien lo emite, aunque suela estar respaldado: si el emisor quiebra, puedes perder aunque el precio suba. Nada te protege del precio.'
const INSURANCE_PROTECTION = 'Lo supervisa la Dirección General de Seguros y Fondos de Pensiones. Si la aseguradora quiebra, el Consorcio de Compensación de Seguros se encarga de liquidarla; no es una garantía como la de un depósito.'
const PENSION_PROTECTION =
  'Lo supervisa la Dirección General de Seguros y Fondos de Pensiones. El dinero del fondo de pensiones está separado del de la gestora y lo guarda un depositario. Nada te protege de que baje lo que lleva dentro.'
const COMPLEX_PROTECTION =
  'Es un producto complejo: la entidad tiene que comprobar antes si lo entiendes (test de conveniencia) y darte un documento de datos fundamentales con un indicador de riesgo del 1 al 7. Ningún fondo de garantía cubre lo que pierdas operando.'

export const TYPE_EXPERTISE: Readonly<Record<string, TypeExpertise>> = {
  /* ------------------------------ Ahorro seguro ------------------------------ */
  'cuenta-deposito': {
    taxes: `Los intereses tributan como rendimiento del capital mobiliario en la ${SAVINGS_TAX}; el banco te retiene un 19 % al pagarlos.`,
    liquidity: 'En una cuenta, cuando quieras. En un depósito, al vencimiento; antes, con penalización o sin poder sacarlo, según el contrato.',
    protection: 'El Fondo de Garantía de Depósitos cubre hasta 100.000 € por titular y entidad si el banco quiebra (de entidades autorizadas en España; en otros países de la UE, su fondo equivalente).',
  },
  letras: {
    taxes: `Lo que ganas (la diferencia entre lo que pagas y lo que cobras al vencimiento) tributa en la ${SAVINGS_TAX}, sin retención al cobrar.`,
    liquidity: 'Al vencimiento (3, 6, 9 o 12 meses). Antes, solo vendiéndolas en el mercado a su precio de ese día.',
    protection: 'No las cubre el Fondo de Garantía de Depósitos: su seguridad es la del Estado español. Si las compras directamente al Tesoro, quedan a tu nombre en el Banco de España.',
  },
  'fondo-monetario': { taxes: FUND_TAX, liquidity: FUND_LIQUIDITY, protection: `${FUND_PROTECTION} No lo cubre el Fondo de Garantía de Depósitos.` },

  /* -------------------------------- Renta fija ------------------------------- */
  'bonos-estado': {
    taxes: BOND_TAX,
    liquidity: 'Al vencimiento recuperas lo prestado. Antes, solo vendiéndolo en el mercado a su precio de ese día, que puede ser menor.',
    protection: `Su seguridad es la del Estado que lo emite. ${BROKER_PROTECTION}`,
  },
  'bonos-empresa': {
    taxes: BOND_TAX,
    liquidity: 'Al vencimiento. Antes, vendiéndolo en el mercado: algunos bonos se negocian poco y vender puede costar o salir caro.',
    protection: `Depende de que la empresa pague: si quiebra, puedes perder parte o todo. ${BROKER_PROTECTION}`,
    choose: [
      'Calificación de grado de inversión (de BBB- hacia arriba) si buscas estabilidad',
      'Mejor muchos bonos a la vez, a través de un fondo o ETF, que uno solo',
      'Que lo que paga de más frente a un bono del Estado compense el riesgo extra',
      'Un vencimiento que encaje con cuándo necesitarás el dinero',
    ],
  },
  'fondo-renta-fija': { taxes: FUND_TAX, liquidity: FUND_LIQUIDITY, protection: FUND_PROTECTION },
  'bonos-inflacion': {
    taxes: BOND_TAX,
    liquidity: 'Al vencimiento recuperas lo prestado, actualizado con la inflación. Antes, vendiéndolo en el mercado a su precio de ese día.',
    protection: `Su seguridad es la del Estado que lo emite. ${BROKER_PROTECTION}`,
    choose: [
      'De un estado de la zona euro con buena calificación',
      'Compara su rentabilidad real (por encima de la inflación) con la de un bono normal al mismo plazo',
      'Un vencimiento que encaje con tu plazo: hasta entonces su precio se mueve con los tipos',
    ],
  },
  'high-yield': {
    taxes: BOND_TAX,
    liquidity: 'Un fondo o ETF, en días. Un bono suelto de alto rendimiento puede costar mucho de vender en una crisis.',
    protection: `Si la empresa quiebra, puedes perder parte o todo. Un fondo reparte ese riesgo entre muchas. ${BROKER_PROTECTION}`,
    choose: [
      'Siempre muchos bonos a la vez (fondo o ETF), nunca uno suelto',
      'Comisión total por debajo del 0,6 % al año',
      'Una parte pequeña de tu renta fija: no sustituye a los bonos de calidad',
    ],
  },
  pagares: {
    taxes: `Lo que ganas (la diferencia entre lo que pagas y lo que cobras) es rendimiento del capital mobiliario en la ${SAVINGS_TAX}, con retención del 19 %.`,
    liquidity: 'Al vencimiento (de unos días a 2 años). Casi no se pueden vender antes.',
    protection: 'Depende solo de que la empresa pague: no hay fondo de garantía que te cubra si no lo hace.',
    choose: [
      'Una empresa grande y solvente, con calificación de crédito y cuentas públicas',
      'Desconfía si paga mucho más que un depósito al mismo plazo: el riesgo es mayor',
      'Nunca una parte grande de tus ahorros en los pagarés de una sola empresa',
    ],
  },
  preferentes: {
    taxes: BOND_TAX,
    liquidity: 'No tienen vencimiento o es muy lejano: recuperas el dinero solo si alguien te los compra, a su precio de ese día, o si el emisor decide devolverlos.',
    protection: 'Si el banco o la empresa tiene problemas, son de lo primero que pierde: pueden dejar de pagar, convertirse en acciones o quedarse a cero. Ningún fondo de garantía los cubre.',
    choose: ['Si no entiendes exactamente cuándo puede dejar de pagar o convertirse en acciones, ninguno', 'Nunca dinero que puedas necesitar ni una parte importante de tus ahorros'],
  },
  crowdlending: {
    taxes: `Los intereses son rendimiento del capital mobiliario en la ${SAVINGS_TAX}. Los préstamos que no se devuelven no siempre se pueden restar fácilmente en la declaración.`,
    liquidity: 'Al final de cada préstamo (meses o años). Algunas plataformas permiten vender antes a otros inversores, sin garantía de encontrar comprador.',
    protection:
      'La plataforma tiene que estar autorizada por la CNMV (reglamento europeo de financiación participativa) y avisarte si inviertes más de 1.000 € o del 5 % de tu patrimonio en un proyecto. Eso no protege los préstamos: ningún fondo cubre los impagos.',
    choose: [
      'Plataforma autorizada por la CNMV como proveedor de financiación participativa',
      'Repartir entre muchos préstamos pequeños, nunca uno grande',
      'Mirar su historial de impagos y de retrasos, no solo el interés anunciado',
    ],
  },

  /* --------------------------------- Fondos --------------------------------- */
  'fondo-indexado': { taxes: FUND_TAX, liquidity: FUND_LIQUIDITY, protection: FUND_PROTECTION },
  'fondo-activo': {
    taxes: FUND_TAX,
    liquidity: FUND_LIQUIDITY,
    protection: FUND_PROTECTION,
    choose: [
      'Que haya batido a su índice durante 10 años o más después de comisiones, no solo el último',
      'Comisión total por debajo del 1,5 % al año: cada punto de más se nota mucho a largo plazo',
      'Un gestor y un estilo estables, con una cartera que se diferencie de verdad de su índice',
    ],
  },
  'fondo-mixto': { taxes: FUND_TAX, liquidity: FUND_LIQUIDITY, protection: FUND_PROTECTION },
  'fondo-perfilado': {
    taxes: `${FUND_TAX} Los cambios que hace el gestor entre los fondos de dentro tampoco te hacen tributar.`,
    liquidity: FUND_LIQUIDITY,
    protection: FUND_PROTECTION,
  },
  'fondo-sostenible': {
    taxes: `Si es un fondo: ${FUND_TAX} Si es un ETF, tributa al venderlo y no tiene traspaso.`,
    liquidity: `Si es un fondo, ${FUND_LIQUIDITY.toLowerCase()} Si es un ETF, se vende en bolsa cuando el mercado está abierto.`,
    protection: `${FUND_PROTECTION} Desde 2021, la UE obliga a explicar qué criterios sostenibles sigue (reglamento SFDR) y, desde 2024, limita el uso de palabras como «ESG» o «sostenible» en el nombre.`,
  },
  'fondo-retorno-absoluto': {
    taxes: FUND_TAX,
    liquidity: `${FUND_LIQUIDITY} Algunos alternativos solo permiten salir una vez por semana o por mes.`,
    protection: `${FUND_PROTECTION} Pueden usar derivados y apostar a la baja: el riesgo depende de la estrategia, no de la etiqueta.`,
    choose: [
      'Que entiendas cómo intenta ganar dinero y en qué situaciones pierde',
      'Que en los años malos de la bolsa (2008, 2020, 2022) haya perdido bastante menos que ella',
      'Comisión total por debajo del 1,5 % y, si cobra comisión de éxito, solo por encima de un mínimo y recuperando antes lo perdido',
      'Que después de comisiones haya rendido más que una Letra durante 5 años o más',
    ],
  },
  'fondo-garantizado': {
    taxes: FUND_TAX,
    liquidity: 'La garantía solo vale en la fecha de vencimiento. Si sacas el dinero antes, cobras su valor de ese día y suele haber una comisión de reembolso de hasta un 5 %.',
    protection: `${FUND_PROTECTION} La garantía la da un banco o una aseguradora: vale lo que valga quien la da.`,
    choose: [
      'Que garantice el 100 % de lo invertido, no solo una parte',
      'Compara lo que promete con una Letra, un bono del Estado o un depósito al mismo plazo',
      'Un vencimiento que puedas esperar sin tocar el dinero',
      'Lee si es garantizado o solo de «rentabilidad objetivo», que no lo está',
    ],
  },
  'fondo-vencimiento': {
    taxes: FUND_TAX,
    liquidity: 'Lo pensado es esperar a la fecha objetivo. Antes, cobras su valor de ese día y suele haber una comisión de reembolso.',
    protection: `${FUND_PROTECTION} La rentabilidad que anuncia es una estimación, no una garantía.`,
    choose: [
      'Una fecha objetivo que encaje con cuándo necesitarás el dinero',
      'Bonos de calidad (grado de inversión) y una comisión total por debajo del 0,6 %',
      'Compara su rentabilidad estimada, después de comisiones, con una Letra o un bono al mismo plazo',
    ],
  },
  'cartera-gestionada': {
    taxes: `Si la cartera es de fondos, los cambios que hace la entidad entre fondos son traspasos y no tributan; pagas cuando sacas el dinero, en la ${SAVINGS_TAX}. Si es de ETF o acciones, cada venta tributa.`,
    liquidity: 'Normalmente en unos días, porque se venden los fondos de la cartera.',
    protection: 'La entidad tiene que estar autorizada por la CNMV y preguntarte por tu situación antes de decidir tu perfil. Los fondos están separados de la entidad; nada te protege de que bajen.',
    choose: [
      'Coste total (gestión más fondos) por debajo del 1 % al año; por encima del 1,5 %, caro',
      'Que invierta en fondos indexados globales y reequilibre sola',
      'Que el perfil que te asigna coincida con lo que respondiste a «Tu perfil»',
    ],
  },
  'capital-riesgo': {
    taxes: `Tributa al recuperar el dinero, en la ${SAVINGS_TAX}. Normalmente no se puede traspasar como un fondo ordinario.`,
    liquidity: 'Muy poca: el dinero queda comprometido de 7 a 12 años y a veces te lo van pidiendo por partes.',
    protection: 'Lo supervisa la CNMV, pero invierte en empresas que no cotizan: no hay fondo de garantía y puedes perder lo invertido.',
    choose: ['Solo una parte muy pequeña de un patrimonio grande', 'Comisiones (de gestión y de éxito) explicadas por escrito', 'Una gestora con muchos años de resultados en fondos anteriores'],
  },

  /* ----------------------------------- ETF ---------------------------------- */
  etf: { taxes: ETF_TAX, liquidity: MARKET_LIQUIDITY, protection: `El ETF está supervisado y su dinero separado de la gestora. ${BROKER_PROTECTION}` },
  'etf-region': {
    taxes: ETF_TAX,
    liquidity: MARKET_LIQUIDITY,
    protection: `El ETF está supervisado y su dinero separado de la gestora. ${BROKER_PROTECTION}`,
    choose: [
      'Como complemento de una base mundial, no como toda tu inversión',
      'Comisión total (TER) por debajo del 0,3 % en países grandes; los emergentes cuestan algo más',
      'De acumulación y domiciliado en la UE (UCITS)',
    ],
  },
  'etf-sector': {
    taxes: ETF_TAX,
    liquidity: MARKET_LIQUIDITY,
    protection: `El ETF está supervisado y su dinero separado de la gestora. ${BROKER_PROTECTION}`,
    choose: [
      'Que lleve muchas empresas y ninguna pese más del 10 %',
      'Comisión total por debajo del 0,4 %',
      'Del sector en todo el mundo mejor que en un solo país',
      'Como mucho una parte pequeña, y nunca porque haya subido mucho últimamente',
    ],
  },
  'etf-tematico': {
    taxes: ETF_TAX,
    liquidity: `${MARKET_LIQUIDITY} En los temáticos pequeños, comprar y vender puede salir algo más caro (poca compraventa diaria).`,
    protection: `El ETF está supervisado y su dinero separado de la gestora. Si cierra por falta de dinero, te devuelven su valor de ese día (y tributa como una venta). ${BROKER_PROTECTION}`,
    choose: [
      'Que lleve al menos 30–50 empresas y ninguna pese más del 10 %',
      'Comisión total por debajo del 0,6 %: por encima, es mucho para lo que hace',
      'Con varios años de historia y bastante dinero invertido: los pequeños y recién lanzados cierran a menudo',
      'Como mucho una parte pequeña, y nunca porque esté de moda o haya subido mucho',
    ],
  },
  'etf-factor': {
    taxes: ETF_TAX,
    liquidity: MARKET_LIQUIDITY,
    protection: `El ETF está supervisado y su dinero separado de la gestora. ${BROKER_PROTECTION}`,
    choose: [
      'Comisión total por debajo del 0,4 % al año',
      'Que entiendas el factor que sigue (valor, tamaño, calidad, momento…) y aceptes que puede ir peor que el mercado durante años',
      'Como complemento de una base mundial, no como sustituto',
    ],
  },
  'etf-dividendo': {
    taxes: `Cada dividendo que reparte tributa ese año en la ${SAVINGS_TAX}, con una retención del 19 % al cobrarlo (y a veces también en el país del ETF). Al venderlo, la ganancia tributa igual. Cambiar de ETF no tiene traspaso.`,
    liquidity: `${MARKET_LIQUIDITY} Los dividendos llegan a tu cuenta en las fechas de reparto (cada mes, trimestre o semestre).`,
    protection: `El ETF está supervisado y su dinero separado de la gestora. ${BROKER_PROTECTION} Las empresas pueden recortar o suprimir su dividendo cuando les va mal.`,
  },
  'etf-bonos': { taxes: ETF_TAX, liquidity: MARKET_LIQUIDITY, protection: `El ETF está supervisado y su dinero separado de la gestora. ${BROKER_PROTECTION}` },
  'etf-apalancado': {
    taxes: ETF_TAX,
    liquidity: MARKET_LIQUIDITY,
    protection: `El ETF está supervisado, pero eso no limita lo que puedes perder dentro. ${BROKER_PROTECTION}`,
    choose: ['Si no entiendes al detalle cómo se recalcula cada día, ninguno', 'Nunca para dejarlo meses: está pensado para días'],
  },
  'etf-inverso': {
    taxes: `${ETF_TAX} Las pérdidas se pueden compensar con ganancias, pero no si vuelves a comprar lo mismo en los 2 meses siguientes.`,
    liquidity: MARKET_LIQUIDITY,
    protection: `El ETF está supervisado, pero eso no limita lo que puedes perder dentro. La CNMV lo considera un producto complejo. ${BROKER_PROTECTION}`,
    choose: [
      'Para ahorrar o invertir a largo plazo, ninguno',
      'Si lo usas para cubrir una cartera, solo unos días y sabiendo cuánto pierdes si la bolsa sube',
      'Mejor sin apalancamiento: un −2x o −3x multiplica el efecto del recálculo diario',
    ],
  },

  /* ------------------------------ Planes y seguros ------------------------------ */
  'plan-pensiones': {
    taxes:
      'Lo que aportas (hasta 1.500 € al año) se resta de tu base imponible general: ahorras en la renta según tu tipo marginal (del 19 % a más del 45 %, según lo que ganes y tu comunidad). Al rescatarlo, todo tributa como si fuera sueldo de ese año, en la base general. Pasar de un plan a otro (traspaso) no tributa.',
    liquidity:
      'Solo al jubilarte, por incapacidad, dependencia, enfermedad grave, paro de larga duración o desahucio, o con lo aportado hace más de 10 años (lo aportado desde 2015 se puede rescatar desde 2025).',
    protection: PENSION_PROTECTION,
    choose: [
      'Comisión total por debajo del 0,5 % al año (los indexados se acercan al 0,3 %); la ley permite hasta el 1,5 %, que es caro',
      'Que su mezcla de renta variable y renta fija encaje con los años que te quedan para jubilarte',
      'Compensa más cuanto más alto es tu tipo en la renta hoy frente al que tendrás al jubilarte',
      'Rescatarlo poco a poco al jubilarte suele tributar menos que de golpe',
    ],
  },
  'plan-empleo': {
    taxes:
      'Lo que aporta tu empresa amplía el límite: entre tu empresa y tú, hasta 10.000 € al año restan de tu base imponible general. Si eres autónomo, los planes de empleo simplificados permiten hasta 5.750 € al año. Al rescatarlo, tributa como sueldo, en la base general.',
    liquidity: 'Las mismas condiciones que un plan de pensiones: jubilación, ciertas contingencias o lo aportado hace más de 10 años.',
    protection: PENSION_PROTECTION,
    choose: [
      'Si tu empresa pone dinero cuando tú aportas, conviene aportar al menos lo necesario para recibir todo lo suyo: si no, es sueldo que no cobras',
      'Mira su comisión total y qué mezcla de inversión tiene',
      'Si eres autónomo, compara su comisión con la de un plan individual',
    ],
  },
  pias: {
    taxes:
      'Puedes aportar hasta 8.000 € al año y 240.000 € en total. Si lo mantienes al menos 5 años y lo cobras como una renta para toda la vida, lo ganado no tributa. Si lo rescatas antes o de otra forma, tributa lo ganado en la base del ahorro.',
    liquidity: 'Puedes rescatarlo cuando quieras, pero perdiendo la ventaja fiscal y, a menudo, con penalización o al valor de ese día.',
    protection: INSURANCE_PROTECTION,
    choose: ['Lo que garantiza y los gastos del seguro, por escrito', 'Compara su rentabilidad después de gastos con un fondo indexado a largo plazo', 'Solo si de verdad vas a cobrarlo como renta para toda la vida'],
  },
  sialp: {
    taxes: 'Hasta 5.000 € al año, y solo puedes tener uno. Si lo mantienes al menos 5 años, lo ganado no tributa; si lo rescatas antes, tributa en la base del ahorro.',
    liquidity: 'Puedes sacarlo antes de 5 años, pero pierdes la ventaja fiscal.',
    protection: `${INSURANCE_PROTECTION} Por ley tiene que asegurarte al menos el 85 % de lo aportado al cumplir los 5 años.`,
    choose: ['Lo que te garantiza (como mínimo el 85 %) y lo que puede rendir por encima', 'Sus gastos y comisiones, por escrito', 'Compáralo con un depósito o unas Letras a 5 años después de impuestos'],
  },
  'unit-linked': {
    taxes:
      'Tributa al rescatarlo, como rendimiento del capital mobiliario en la base del ahorro. Cambiar entre los fondos que te ofrece la aseguradora no tributa si se cumplen ciertas condiciones.',
    liquidity: 'Normalmente puedes rescatarlo, a veces con penalización los primeros años.',
    protection: `${INSURANCE_PROTECTION} Lo invertido sube y baja con los fondos que elijas: no está garantizado.`,
    choose: ['Coste total (seguro más fondos) por escrito: suelen ser caros', 'Que te dejen elegir fondos indexados baratos', 'Compáralo con tener esos mismos fondos directamente, con traspasos sin tributar'],
  },

  /* -------------------------------- Compañías ------------------------------- */
  acciones: {
    taxes: STOCK_TAX,
    liquidity: MARKET_LIQUIDITY,
    protection: BROKER_PROTECTION,
    choose: [
      'Negocio que entiendes, con beneficios estables y deuda bajo control',
      'Precio razonable para lo que gana (no solo porque haya subido)',
      'Que una sola empresa no pase del 5 % de lo que tienes invertido',
    ],
  },
  'acciones-dividendo': {
    taxes: STOCK_TAX,
    liquidity: MARKET_LIQUIDITY,
    protection: BROKER_PROTECTION,
    choose: [
      'Que reparta menos de lo que gana (pagar más del 80 % del beneficio es una señal de alerta)',
      'Años de historia manteniendo o subiendo el dividendo',
      'Repartido entre varias empresas y sectores, no todo en uno',
    ],
  },
  'acciones-crecimiento': {
    taxes: STOCK_TAX,
    liquidity: MARKET_LIQUIDITY,
    protection: BROKER_PROTECTION,
    choose: ['Ventas que crecen de verdad y un camino creíble a ganar dinero', 'Sin pagar cualquier precio: lo que ya se espera de ella cuenta', 'Como mucho una parte pequeña, sumando también las que ya tienes en fondos'],
  },
  'acciones-pequenas': {
    taxes: STOCK_TAX,
    liquidity: 'Se venden en bolsa, pero algunas se negocian tan poco que vender puede tardar o salir a peor precio.',
    protection: BROKER_PROTECTION,
    choose: ['Mejor a través de un fondo o ETF de empresas pequeñas que una a una', 'Si eliges una, que publique cuentas claras y tenga poca deuda', 'Cuánto se negocia cada día: si es poco, vender puede costar'],
  },

  /* ------------------------------ Materias primas ---------------------------- */
  oro: {
    taxes: `Al venderlo, lo ganado tributa en la ${SAVINGS_TAX}. El oro de inversión (lingotes y ciertas monedas) no paga IVA en España.`,
    liquidity: 'Un ETC se vende en bolsa al momento. El oro físico, vendiéndolo a un comprador, con diferencia entre el precio de compra y el de venta.',
    protection: `Físico: depende de dónde y cómo lo guardes. ${ETC_PROTECTION}`,
    choose: ['Como mucho entre un 5 % y un 10 % de lo que inviertes', 'Si es un ETC, que esté respaldado por oro físico guardado y con comisión baja', 'Si es físico, con certificado y sabiendo cuánto te cuesta guardarlo y venderlo'],
  },
  plata: {
    taxes: `Al venderla, lo ganado tributa en la ${SAVINGS_TAX}. A diferencia del oro, la plata física paga IVA (21 %) al comprarla.`,
    liquidity: 'Un ETC se vende en bolsa al momento. La física, vendiéndola a un comprador, normalmente bastante por debajo del precio de compra.',
    protection: `Física: depende de dónde la guardes. ${ETC_PROTECTION}`,
    choose: ['Mejor un ETC respaldado por plata física que comprarla con IVA', 'Una parte muy pequeña, nunca la base de tu inversión'],
  },
  energia: {
    taxes: COMMODITY_TAX,
    liquidity: MARKET_LIQUIDITY,
    protection: ETC_PROTECTION,
    choose: ['Que entiendas cómo sigue el precio (los que usan futuros pierden al renovarlos)', 'Si lo que te interesa es el sector, una parte pequeña en un fondo o ETF de empresas de energía'],
  },
  'metales-industriales': {
    taxes: COMMODITY_TAX,
    liquidity: MARKET_LIQUIDITY,
    protection: ETC_PROTECTION,
    choose: ['Que entiendas cómo sigue el precio el producto', 'Una parte muy pequeña: van con la economía mundial'],
  },
  agricolas: {
    taxes: COMMODITY_TAX,
    liquidity: MARKET_LIQUIDITY,
    protection: ETC_PROTECTION,
    choose: ['Que entiendas cómo sigue el precio el producto (normalmente con futuros)', 'Una parte muy pequeña: no generan rentas'],
  },

  /* ------------------------------- Inmobiliario ------------------------------ */
  socimi: {
    taxes: STOCK_TAX,
    liquidity: 'Las grandes se venden en bolsa al momento; muchas SOCIMI pequeñas cotizan en mercados con muy poca compraventa y venderlas puede costar.',
    protection: BROKER_PROTECTION,
    choose: ['Deuda moderada (que no pase de la mitad del valor de sus inmuebles)', 'Inmuebles alquilados casi al completo y en buenas zonas', 'Que el dividendo salga de los alquileres, no de vender edificios'],
  },
  'fondo-inmobiliario': {
    taxes: `Si es un fondo, traspasar a otro no tributa y pagas al sacar el dinero; si es un ETF, tributa al venderlo. En ambos casos, en la ${SAVINGS_TAX}.`,
    liquidity: 'Un fondo o ETF de SOCIMI y REIT, en días. Los fondos que tienen edificios directamente pueden limitar cuándo sacas el dinero.',
    protection: FUND_PROTECTION,
    choose: ['Comisión total por debajo del 0,5 %', 'Repartido entre muchos países y tipos de inmueble', 'Que sepas si tiene acciones de inmobiliarias o edificios directamente'],
  },
  'crowdfunding-inmobiliario': {
    taxes: `Si prestas, los intereses son rendimiento del capital mobiliario; si entras como socio, lo que ganes al final es ganancia patrimonial. En ambos casos, en la ${SAVINGS_TAX}.`,
    liquidity: 'Al terminar el proyecto (de 1 a 5 años), y más tarde si se retrasa. Algunas plataformas tienen un mercado para vender antes, sin garantía de encontrar comprador.',
    protection: 'La plataforma tiene que estar autorizada por la CNMV (reglamento europeo de financiación participativa), pero eso no protege el proyecto: ningún fondo de garantía cubre lo que se pierda.',
    choose: ['Plataforma autorizada por la CNMV', 'Proyectos con garantía real (una hipoteca sobre el inmueble) y promotor con historial', 'Repartir entre varios proyectos pequeños, nunca uno grande'],
  },
  'vivienda-alquiler': {
    taxes:
      'El alquiler neto (después de gastos e intereses de la hipoteca) tributa como rendimiento del capital inmobiliario en la base general; si es la vivienda habitual del inquilino, se puede reducir entre un 50 % y un 90 % según el contrato y la zona. Al vender, lo ganado va a la base del ahorro. Comprar cuesta además entre un 8 % y un 12 % en impuestos y gastos.',
    liquidity: 'Muy poca: vender una vivienda lleva meses y cuesta dinero (agencia, impuestos, plusvalía municipal).',
    protection: 'Ninguna garantía: el precio puede bajar, puede haber impagos, inquilinos que no se van o reparaciones grandes. Un seguro de impago cubre parte del riesgo.',
    choose: [
      'Calcula la rentabilidad neta: alquiler de un año menos IBI, comunidad, seguro, reparaciones y meses vacíos, dividido entre todo lo que te cuesta comprarla',
      'Por debajo de un 4 % neto, compite mal con un fondo indexado y te da más trabajo',
      'Una cuota de hipoteca que podrías pagar aunque estuviera meses sin alquilar',
      'Que no sea casi todo tu patrimonio en un solo inmueble',
    ],
  },

  /* ------------------------------- Criptomonedas ----------------------------- */
  cripto: {
    taxes: CRYPTO_TAX,
    liquidity: 'Se venden al momento en una plataforma, a cualquier hora; el paso a euros y a tu banco puede tardar días.',
    protection:
      'En la UE, las plataformas tienen que estar autorizadas por el reglamento MiCA: compruébalo en el registro de la CNMV. No hay fondo de garantía: si la plataforma quiebra o pierdes tus claves, puedes perderlo todo.',
    choose: ['Plataforma autorizada en la UE (MiCA)', 'Como mucho una parte muy pequeña de lo que inviertes', 'Si guardas tú las claves, que sepas hacerlo: si las pierdes, no hay recuperación'],
  },
  'cripto-otras': {
    taxes: CRYPTO_TAX,
    liquidity: 'Las pequeñas pueden quedarse sin compradores de un día para otro.',
    protection: 'No hay fondo de garantía y abundan las estafas. Que una plataforma la tenga no significa que alguien la haya revisado.',
    choose: ['Si alguien te promete subidas, nada', 'Si aun así quieres, solo una cantidad que te dé igual perder'],
  },
  stablecoins: {
    taxes: CRYPTO_TAX,
    liquidity: 'Se cambian al momento en una plataforma; el paso a euros puede tardar días.',
    protection: 'Con MiCA, las que se ofrecen en la UE deben estar respaldadas y su emisor autorizado; aun así, no las cubre el Fondo de Garantía de Depósitos.',
    choose: ['Emitida por una entidad autorizada en la UE (MiCA)', 'Respaldada por reservas que se publican y se auditan'],
  },
  'cripto-staking': {
    taxes: `Las recompensas tributan cuando las recibes, por su valor en euros ese día, como rendimiento del capital mobiliario en la ${SAVINGS_TAX}. Al vender después, tributa lo ganado o perdido desde entonces.`,
    liquidity: 'Mientras está bloqueada no puedes venderla; desbloquearla puede tardar días o semanas.',
    protection: 'Si la plataforma quiebra o el protocolo falla, puedes perder la cripto entera. Ningún fondo de garantía lo cubre.',
    choose: ['Plataforma autorizada en la UE (MiCA)', 'Que sepas cuánto tiempo queda bloqueada y qué pasa si quieres salir', 'Desconfía de recompensas muy altas: suelen esconder más riesgo'],
  },

  /* -------------------------------- Complejos -------------------------------- */
  cfd: {
    taxes: DERIVATIVE_TAX,
    liquidity: 'Se cierran al momento, pero con apalancamiento puedes perder lo depositado en minutos.',
    protection: `${COMPLEX_PROTECTION} En la UE, a los minoristas se les limita el apalancamiento y no pueden perder más de lo depositado.`,
    choose: ['Para ahorrar, ninguno', 'Si aun así operas, solo con dinero que puedas perder entero y sabiendo cuánto pierdes por cada 1 % que se mueve'],
  },
  'futuros-opciones': {
    taxes: DERIVATIVE_TAX,
    liquidity: 'Se negocian en mercados organizados, pero algunos contratos tienen poca compraventa.',
    protection: COMPLEX_PROTECTION,
    choose: ['Si no entiendes cuánto puedes perder en el peor caso, ninguno', 'Nunca vender opciones sin cubrir: las pérdidas pueden ser ilimitadas'],
  },
  estructurados: {
    taxes: `Depende de cómo esté hecho: un depósito estructurado tributa como rendimiento del capital mobiliario; un bono o un fondo, como tales. Siempre en la ${SAVINGS_TAX}.`,
    liquidity: 'Pensado para llegar al vencimiento. Antes, a menudo no se puede salir o solo con pérdidas.',
    protection: `${COMPLEX_PROTECTION} Si es un depósito estructurado, el Fondo de Garantía de Depósitos cubre lo depositado (hasta 100.000 €), no la parte variable.`,
    choose: [
      'Que entiendas en qué casos cobras, en cuáles no y en cuáles pierdes capital',
      'Si dice «capital garantizado», que lo esté al 100 % y sepas quién lo garantiza',
      'Compara lo que puedes ganar con lo que paga una Letra o un depósito al mismo plazo',
    ],
  },
  'warrants-turbos': {
    taxes: DERIVATIVE_TAX,
    liquidity: 'Cotizan en bolsa, pero un turbo desaparece en cuanto el precio toca su barrera.',
    protection: `${COMPLEX_PROTECTION} Además, dependes de que pague quien lo emite.`,
    choose: ['Para ahorrar, ninguno', 'Si operas, sabiendo dónde está la barrera y que puede llegar a valer cero'],
  },
}
