/**
 * La historia de cada tipo de la Guía (decidido con el usuario el 2026-11-02):
 * cómo ha evolucionado, sus grandes subidas y caídas, cuánto tardó en
 * recuperarse y qué lo mueve. Es contexto para entender el riesgo, nunca una
 * previsión ni una señal de compra o venta.
 *
 * Hechos ampliamente documentados, con cifras redondeadas («unos», «cerca de»)
 * y en la moneda en que cotiza cada cosa. Sin gestoras, brókers, plataformas
 * ni productos concretos (CNMV). Lo que pasa esta semana lo cuenta el
 * panorama del mercado (lib/market/panorama.ts), no este archivo.
 */

export interface TypeHistory {
  /** Qué mueve su precio o su rentabilidad. */
  drivers: string
  /** Momentos clave, de antiguo a reciente (3–5). */
  timeline: string[]
  /** La lección que deja su historia, en una frase. */
  lesson: string
}

export const HISTORY_NOTICE = 'Cifras aproximadas, en la moneda en que cotiza cada cosa. La historia ayuda a entender el riesgo, pero no se repite igual: no es una previsión.'

export const TYPE_HISTORY: Readonly<Record<string, TypeHistory>> = {
  /* ------------------------------ Ahorro seguro ------------------------------ */
  'cuenta-deposito': {
    drivers: 'Los tipos de interés del Banco Central Europeo y las ganas de los bancos de captar dinero.',
    timeline: [
      '2008: el Fondo de Garantía de Depósitos sube su cobertura de 20.000 a 100.000 € en plena crisis financiera.',
      '2014–2022: el BCE pone tipos negativos (hasta el −0,5 %): las cuentas y los depósitos pagan prácticamente nada durante ocho años.',
      '2022–2023: el BCE sube los tipos hasta el 4 % para frenar la inflación y vuelven las cuentas y depósitos que pagan un 2–3 %.',
      '2024–2025: el BCE los baja hasta el 2 % y las ofertas vuelven a bajar.',
    ],
    lesson: 'Lo que paga el ahorro seguro depende casi por completo del BCE: nunca es fijo para siempre.',
  },
  letras: {
    drivers: 'Los tipos del BCE y la confianza en España.',
    timeline: [
      '2012: en la crisis del euro, España tiene que pagar mucho más para financiarse y las Letras rinden varios puntos.',
      '2015–2021: con los tipos negativos, las Letras llegan a rentabilidad negativa: pagabas por prestar al Estado.',
      '2023: con los tipos al 4 %, miles de ahorradores hacen cola para comprarlas directamente al Tesoro, un récord de compras de particulares.',
    ],
    lesson: 'Son de lo más seguro que hay, pero lo que rinden cambia mucho de un año a otro.',
  },
  'fondo-monetario': {
    drivers: 'Los tipos de interés a muy corto plazo.',
    timeline: [
      '2008: en EE. UU., un gran fondo monetario baja de 1 dólar por participación por tener deuda de un banco quebrado, y provoca una salida masiva.',
      'Después, las normas europeas y americanas se endurecen: más liquidez y deuda de más calidad.',
      '2015–2021: con tipos negativos, muchos dan una rentabilidad algo negativa después de comisiones.',
      '2023–2024: vuelven a dar cerca del 3–4 % y se disparan las entradas de dinero.',
    ],
    lesson: 'Casi siempre se comportan como una cuenta, pero no son una cuenta: en crisis muy graves pueden bajar.',
  },

  /* -------------------------------- Renta fija ------------------------------- */
  'bonos-estado': {
    drivers: 'Los tipos de interés, la inflación y la confianza en el estado que los emite.',
    timeline: [
      '1980–2020: cuarenta años de tipos bajando hacen ganar mucho dinero a quien tenía bonos.',
      '2012: la prima de riesgo de España pasa de 600 puntos y el bono a 10 años ronda el 7 %; Grecia reestructura su deuda y sus acreedores privados pierden más de la mitad.',
      '2019–2021: el bono alemán a 10 años rinde por debajo de cero.',
      '2022: con la inflación disparada, los tipos suben de golpe y los bonos de la zona euro pierden cerca de un 18 % (los más largos, bastante más): su peor año en décadas.',
    ],
    lesson: 'Si lo mantienes hasta el vencimiento sabes lo que cobras; si tienes que venderlo antes, puede costar caro cuando suben los tipos.',
  },
  'bonos-empresa': {
    drivers: 'Los tipos de interés y la salud de las empresas: en las crisis, el miedo a los impagos hace que bajen.',
    timeline: [
      '2008: en la crisis financiera, incluso los bonos de buenas empresas caen con fuerza durante unos meses.',
      '2016–2022: el BCE compra bonos de empresas y su rentabilidad queda en mínimos.',
      '2020: en marzo se hunden en días con el COVID y se recuperan cuando intervienen los bancos centrales.',
      '2022: caen alrededor de un 14 % por la subida de tipos.',
    ],
    lesson: 'Rinden algo más que los de un estado porque, en los peores momentos, se comportan peor.',
  },
  'fondo-renta-fija': {
    drivers: 'Lo mismo que los bonos que lleva: tipos de interés y calidad de los emisores.',
    timeline: [
      '2009–2020: años muy buenos gracias a los tipos que no paraban de bajar.',
      '2022: muchos fondos de renta fija pierden entre un 10 % y un 15 %, algo que mucha gente creía imposible.',
      '2023–2024: con tipos más altos, vuelven a rentabilidades del 3–5 % al año.',
    ],
    lesson: 'Renta fija no significa que no pueda bajar: significa que suele moverse menos que las acciones.',
  },
  'bonos-inflacion': {
    drivers: 'La inflación (que suma) y los tipos de interés reales (que mueven su precio).',
    timeline: [
      '2014: el Tesoro español empieza a emitir bonos ligados a la inflación de la zona euro.',
      '2021–2022: la inflación de la zona euro llega al 10,6 % y sus pagos suben con ella.',
      '2022: aun así, los de plazo largo bajan de precio porque los tipos suben más deprisa.',
    ],
    lesson: 'Protegen de la inflación si los mantienes hasta el vencimiento; antes, su precio sigue moviéndose con los tipos.',
  },
  'high-yield': {
    drivers: 'La economía: cuando hay miedo a una recesión, se dispara el riesgo de impago y caen.',
    timeline: [
      '2008: caen más de un 30 % y los impagos se multiplican.',
      '2020: caen cerca de un 20 % en unas semanas con el COVID y se recuperan en meses.',
      '2022: bajan más de un 10 % con la subida de tipos.',
    ],
    lesson: 'En los años buenos parecen renta fija; en las crisis, se comportan casi como las acciones.',
  },
  pagares: {
    drivers: 'La salud de la empresa que los emite.',
    timeline: [
      'Desde 2013, el mercado alternativo de renta fija permite a empresas medianas españolas emitir pagarés para financiarse sin bancos.',
      'Varias de ellas han entrado en concurso de acreedores y han dejado de pagarlos, a veces con pagarés vendidos a particulares.',
    ],
    lesson: 'Un pagaré vale lo que valga la empresa: el interés de más es el precio de ese riesgo.',
  },
  preferentes: {
    drivers: 'La solvencia del banco o la empresa: si tiene problemas, son de lo primero en perder.',
    timeline: [
      '2009–2012: en España, cajas y bancos venden preferentes a cientos de miles de ahorradores como si fueran depósitos; con la crisis bancaria, quedan atrapados y pierden buena parte.',
      '2013 en adelante: arbitrajes y sentencias devuelven dinero a muchos afectados, años después.',
      '2023: en el rescate de un gran banco suizo, unos 16.000 millones de francos en bonos convertibles contingentes se quedan a cero mientras los accionistas aún cobran algo.',
    ],
    lesson: 'Pueden pagar bien durante años y perderlo todo de golpe: no son un depósito, aunque lo parezcan.',
  },
  crowdlending: {
    drivers: 'Cuántos prestatarios devuelven lo prestado y la solidez de la plataforma.',
    timeline: [
      '2015: la ley española regula por primera vez las plataformas de financiación participativa.',
      '2020: con el COVID se disparan los retrasos y los impagos en muchas plataformas.',
      '2021–2023: entra en vigor el reglamento europeo y varias plataformas cierran o dejan de operar.',
    ],
    lesson: 'El interés anunciado es lo que cobras si todo va bien; los impagos llegan juntos en las crisis.',
  },

  /* --------------------------------- Fondos --------------------------------- */
  'fondo-indexado': {
    drivers: 'Las bolsas de todo el mundo: los beneficios de las empresas, los tipos de interés y el miedo o la euforia del momento.',
    timeline: [
      '1976: nace en EE. UU. el primer fondo indexado para particulares; durante años se ríen de él por «conformarse con la media».',
      '2000–2002 y 2007–2009: la bolsa mundial cae alrededor de un 50 % y de un 58 %; tarda unos 5–6 años en recuperarse en cada caso (con dividendos).',
      '2020: cae un 34 % en un mes con el COVID y recupera su máximo en unos 5 meses.',
      'Desde 1970, la bolsa mundial ha dado de media alrededor de un 8–9 % al año en dólares con dividendos (antes de inflación), con años muy malos por el camino.',
    ],
    lesson: 'A largo plazo la bolsa mundial siempre se ha recuperado de sus caídas, pero ha habido que esperar años: por eso solo es para dinero de más de 5 años.',
  },
  'fondo-activo': {
    drivers: 'Las bolsas y las decisiones de su gestor, menos sus comisiones.',
    timeline: [
      'Los informes SPIVA, que comparan miles de fondos con su índice, repiten lo mismo cada año en EE. UU. y en Europa:',
      'a 10–15 años, entre un 80 % y un 90 % de los fondos de gestión activa de bolsa lo hacen peor que su índice después de comisiones.',
      'Los que baten al índice un periodo rara vez lo siguen haciendo el siguiente.',
    ],
    lesson: 'Hay gestores excelentes, pero es muy difícil saber de antemano cuáles serán.',
  },
  'fondo-mixto': {
    drivers: 'La bolsa y los bonos a la vez, según la proporción de cada uno.',
    timeline: [
      'Durante décadas, cuando caía la bolsa solían subir los bonos y un mixto amortiguaba las caídas.',
      '2008: un mixto típico pierde bastante menos que la bolsa.',
      '2022: bolsa y bonos caen a la vez por primera vez en décadas y los mixtos pierden entre un 10 % y un 15 %.',
    ],
    lesson: 'Mezclar suaviza, pero no siempre: hay años en que todo baja junto.',
  },
  'fondo-perfilado': {
    drivers: 'La bolsa y los bonos según la proporción de su perfil, menos las comisiones de sus dos capas.',
    timeline: [
      '2000s: los bancos españoles empiezan a vender fondos de fondos por perfiles como solución «todo en uno».',
      '2008: los perfiles conservadores pierden en torno a un 5–10 % y los dinámicos más de un 30 %.',
      '2016–2020s: aparecen fondos de fondos indexados con comisiones bastante más bajas que los de antes.',
      '2022: bolsa y bonos caen a la vez y hasta los perfiles conservadores pierden cerca de un 10 %.',
    ],
    lesson: 'El perfil marca cuánto puede caer; la comisión, cuánto te queda al final.',
  },
  'fondo-sostenible': {
    drivers: 'La bolsa en general y, sobre todo, cómo van los sectores que excluye (energía, armas, tabaco) frente al resto.',
    timeline: [
      '1971: nace en EE. UU. uno de los primeros fondos que excluye empresas por motivos éticos.',
      '2019–2021: entra en los fondos ESG más dinero que nunca y, sin petróleo, ganan a sus índices.',
      '2022: suben la energía y las armas tras la invasión de Ucrania y muchos fondos ESG quedan por detrás de sus índices.',
      '2023–2024: cientos de fondos europeos bajan de «artículo 9» a «artículo 8» y la UE limita el uso de palabras sostenibles en sus nombres.',
    ],
    lesson: 'Excluir sectores cambia el resultado unos años a favor y otros en contra: elígelo por tus valores, no por la rentabilidad.',
  },
  'fondo-garantizado': {
    drivers: 'Los tipos de interés del momento en que se crea: con tipos altos pueden prometer más.',
    timeline: [
      '2000–2012: en España son de los fondos más vendidos por los bancos.',
      '2015–2021: con los tipos negativos casi desaparecen: no se puede garantizar nada que rinda.',
      '2023: con los tipos al alza vuelven con fuerza, sobre todo los de «rentabilidad objetivo».',
    ],
    lesson: 'Aparecen cuando los tipos son altos: su garantía es real, pero a cambio de atarte hasta la fecha.',
  },
  'fondo-vencimiento': {
    drivers: 'Los tipos de interés en el momento de entrar.',
    timeline: [
      '2022: los tipos suben de golpe tras años en cero.',
      '2023–2024: se convierten en uno de los fondos más vendidos en España, con rentabilidades estimadas del 3–4 %.',
      'Cuando los tipos bajan, los nuevos que se crean prometen menos.',
    ],
    lesson: 'Fijan lo que se podía conseguir al entrar: entrar tarde, cuando han bajado los tipos, da menos.',
  },
  'cartera-gestionada': {
    drivers: 'Lo que llevan dentro (sobre todo fondos de bolsa y de bonos) y lo que cobran.',
    timeline: [
      '2008: nacen en EE. UU. los primeros gestores automatizados («robo-advisors»).',
      '2014–2016: llegan a España, con carteras de fondos indexados y comisiones bajas.',
      '2022: las carteras pierden entre un 10 % y un 15 % porque caen a la vez la bolsa y los bonos.',
    ],
    lesson: 'Te ahorran trabajo y errores, pero no las caídas del mercado.',
  },
  'fondo-retorno-absoluto': {
    drivers: 'La habilidad del gestor con su estrategia, los tipos de interés y lo que cobra.',
    timeline: [
      '1949: nace en EE. UU. el primer fondo que compra unas acciones y apuesta contra otras para no depender de la bolsa.',
      '1998: un fondo de este tipo dirigido por premios Nobel pierde casi todo en semanas y obliga a un rescate coordinado por la Reserva Federal.',
      '2008: de media pierden en torno a un 20 %, menos que la bolsa, pero lejos de «ganar pase lo que pase».',
      '2010s: con los tipos en cero, muchos rinden poco más que nada después de comisiones y cierran.',
      '2022: algunas estrategias de tendencias ganan con fuerza mientras caen a la vez la bolsa y los bonos.',
    ],
    lesson: 'Pueden diversificar de verdad, pero la diferencia entre gestores es enorme y el nombre no garantiza nada.',
  },
  'capital-riesgo': {
    drivers: 'La marcha de empresas que no cotizan y el precio al que se venden al final.',
    timeline: [
      'Durante décadas solo ha estado al alcance de grandes inversores e instituciones.',
      '2015: la UE crea las ELTIF para canalizar ahorro hacia empresas e infraestructuras.',
      '2024: las nuevas normas las abren a pequeños inversores.',
      'La diferencia entre los mejores y los peores fondos es enorme, mucho mayor que en la bolsa.',
    ],
    lesson: 'Sus buenas cifras medias esconden muchos fondos mediocres y años sin poder sacar el dinero.',
  },

  /* ----------------------------------- ETF ---------------------------------- */
  etf: {
    drivers: 'Lo mismo que la bolsa mundial que copia.',
    timeline: [
      '1993: nace el primer ETF de EE. UU.; en Europa llegan en 2000.',
      '2000–2002, 2008 y 2020: los ETF mundiales caen lo mismo que la bolsa (−50 %, −58 % y −34 %).',
      '2020s: los ETF superan en dinero a muchos fondos tradicionales y sus comisiones bajan por debajo del 0,2 %.',
    ],
    lesson: 'Un ETF mundial es la bolsa mundial en un solo producto: su historia es la de la bolsa.',
  },
  'etf-region': {
    drivers: 'La economía, la moneda y las empresas de ese país o zona.',
    timeline: [
      '1989–2024: la bolsa japonesa tarda 34 años en recuperar su máximo de 1989.',
      '2007–2020s: la bolsa de los países emergentes pasa más de 15 años sin superar en dólares su máximo de 2007.',
      '2010s–2020s: la bolsa de EE. UU. deja muy atrás a Europa y llega a pesar más del 60 % de la bolsa mundial.',
    ],
    lesson: 'Un solo país puede ir mal durante décadas: por eso la base se diversifica en todo el mundo.',
  },
  'etf-sector': {
    drivers: 'El ciclo económico y lo que mueve a ese sector (los tipos de interés a los bancos, el petróleo a la energía…).',
    timeline: [
      '2000–2002: las tecnológicas de EE. UU. caen cerca de un 80 % al pinchar la burbuja de internet y tardan unos 15 años en recuperar el máximo.',
      '2008: los bancos caen más de un 70 %; los europeos siguen lejos de su máximo más de 15 años después.',
      '2014–2020: el sector de la energía pierde más de la mitad con la caída del petróleo; en 2021–2022 es el que más sube.',
      '2010s–2020s: la tecnología pasa a ser el sector más grande de la bolsa mundial.',
    ],
    lesson: 'Cada sector tiene sus décadas buenas y malas: el líder de una época rara vez lo es en la siguiente.',
  },
  'etf-tematico': {
    drivers: 'Las expectativas sobre una tendencia, que a menudo se adelantan años a la realidad.',
    timeline: [
      '1999–2000: los fondos «de internet» se disparan y luego pierden más del 80 %, aunque internet sí cambió el mundo.',
      '2020–2021: los ETF temáticos de innovación, energías limpias o vehículos eléctricos se multiplican y captan dinero récord.',
      '2021–2023: muchos de ellos pierden entre un 60 % y un 75 %; según los estudios, la mayoría de los temáticos rinde menos que la bolsa mundial en los 5 años siguientes a su lanzamiento.',
      '2023–2025: la inteligencia artificial dispara a los semiconductores; su historia aún se está escribiendo.',
    ],
    lesson: 'Que una tendencia sea real no significa que sus acciones no estén ya demasiado caras.',
  },
  'etf-factor': {
    drivers: 'Si el mercado premia o no la característica que siguen (valor, tamaño, calidad…).',
    timeline: [
      '1992: los estudios académicos muestran que, a largo plazo, las empresas baratas y las pequeñas habían rendido más.',
      '2007–2020: el factor valor pasa más de una década rindiendo menos que el mercado.',
      '2022: el valor vuelve a ganar con fuerza cuando caen las tecnológicas.',
    ],
    lesson: 'Los factores funcionan a muy largo plazo, pero pueden pasar más de diez años sin hacerlo.',
  },
  'etf-dividendo': {
    drivers: 'Los beneficios de empresas maduras, sobre todo bancos, energía, eléctricas y consumo, y los tipos de interés.',
    timeline: [
      '2008–2009: muchos bancos, grandes repartidores de dividendo, recortan o suprimen sus pagos y los ETF de dividendos caen tanto como la bolsa.',
      '2020: el BCE pide a los bancos europeos que no repartan dividendos durante la pandemia y muchas empresas los recortan.',
      '2010s: con los tipos en cero, se buscan como sustituto de los bonos, pero quedan por detrás de la bolsa mundial, más tirada por tecnológicas que reparten poco.',
      '2022: caen bastante menos que la bolsa porque pesan mucho la energía y los bancos.',
    ],
    lesson: 'El dividendo no es un interés fijo: se recorta justo en las crisis, y en total no rinden más que la bolsa.',
  },
  'etf-bonos': {
    drivers: 'Los tipos de interés y la calidad de los bonos que lleva.',
    timeline: [
      '2020: en marzo, algunos ETF de bonos cotizan durante días por debajo del valor de lo que llevan, por las ventas de pánico.',
      '2022: los ETF de bonos de la zona euro pierden entre un 10 % y un 18 %, según su plazo.',
      '2023–2024: con tipos más altos, vuelven a rendir un 3–4 % al año.',
    ],
    lesson: 'Los de plazo corto se mueven poco; los de plazo largo pueden bajar casi como las acciones cuando suben los tipos.',
  },
  'etf-apalancado': {
    drivers: 'Lo que hace cada día el índice que siguen, multiplicado.',
    timeline: [
      '2006: aparecen en EE. UU. los primeros ETF apalancados.',
      '2020: algunos productos apalancados sobre el petróleo pierden casi todo su valor en semanas.',
      '2022: los ETF que multiplican por 3 la bolsa tecnológica de EE. UU. pierden cerca de un 80 %, mientras su índice cae un 33 %.',
      'Muchos ETF apalancados acaban perdiendo en años en los que su índice queda plano, por cómo se recalculan cada día.',
    ],
    lesson: 'Están hechos para días: con el tiempo, el apalancamiento diario juega en contra.',
  },
  'etf-inverso': {
    drivers: 'Lo contrario de lo que hace cada día el índice que siguen.',
    timeline: [
      'Febrero de 2018: varios productos inversos sobre la volatilidad de la bolsa pierden más del 90 % en un solo día y se liquidan.',
      'Marzo de 2020: suben con fuerza durante la caída por la pandemia y lo devuelven todo en los meses siguientes, cuando la bolsa se recupera.',
      '2009–2021: un ETF inverso sobre la bolsa de EE. UU. mantenido todo el periodo pierde más del 80 % de su valor.',
    ],
    lesson: 'Como la bolsa sube más años de los que baja, apostar contra ella a largo plazo casi siempre pierde.',
  },

  /* ------------------------------ Planes y seguros ------------------------------ */
  'plan-pensiones': {
    drivers: 'Lo que lleva dentro, sus comisiones y los cambios de la ley.',
    timeline: [
      '1987: nacen los planes de pensiones en España.',
      'Durante años, muchos planes de banco rinden de media menos de un 2–3 % al año por sus comisiones altas y su mucha renta fija.',
      '2021–2022: el límite de aportación con ventaja fiscal baja de 8.000 € a 2.000 € y luego a 1.500 € al año.',
      '2025: por primera vez se puede rescatar lo aportado con más de 10 años de antigüedad (lo aportado desde 2015).',
    ],
    lesson: 'Su ventaja es fiscal; lo que gane depende de lo que lleve dentro y de lo que cobre.',
  },
  'plan-empleo': {
    drivers: 'Lo que aporta la empresa, lo que lleva dentro y la ley.',
    timeline: [
      'En España, siempre han tenido mucho menos peso que en otros países europeos.',
      '2022: una ley nueva los impulsa, crea los fondos de promoción pública y los planes simplificados para autónomos.',
      'Desde entonces, el límite conjunto con lo que aporta la empresa llega a 10.000 € al año.',
    ],
    lesson: 'Lo más valioso suele ser lo que pone la empresa.',
  },
  pias: {
    drivers: 'Lo que garantiza la aseguradora y los tipos de interés.',
    timeline: [
      '2007: nacen los PIAS en España.',
      '2015–2021: con tipos en cero, garantizan muy poco y pierden atractivo.',
      'Con tipos más altos, vuelven a ofrecer garantías algo mejores.',
    ],
    lesson: 'Su gran ventaja es fiscal y está pensada para cobrarlos como renta de por vida.',
  },
  sialp: {
    drivers: 'Los tipos de interés del momento.',
    timeline: [
      '2015: se crean los SIALP y las CIALP con la reforma fiscal.',
      '2015–2021: con tipos en cero, la ventaja de no pagar impuestos sobre lo ganado es casi nula.',
      '2023 en adelante: con tipos más altos, vuelven a tener sentido.',
    ],
    lesson: 'Una ventaja fiscal vale más cuanto más hay que ganar.',
  },
  'unit-linked': {
    drivers: 'Los fondos que eliges y los gastos del seguro.',
    timeline: [
      'Se hacen populares en Europa como forma de invertir en fondos con ventajas de un seguro.',
      'Los supervisores europeos han avisado varias veces de que muchos tienen costes altos para lo que ofrecen.',
    ],
    lesson: 'Por dentro son fondos; por fuera, un seguro que cobra.',
  },

  /* -------------------------------- Compañías ------------------------------- */
  acciones: {
    drivers: 'Los beneficios de cada empresa, lo que se espera de ella y el ánimo de la bolsa.',
    timeline: [
      'De las 12 empresas del primer índice Dow Jones (1896), ninguna sigue hoy en él: la última salió en 2018.',
      'Empresas enormes han caído o desaparecido: grandes bancos en 2008, grandes eléctricas, aerolíneas y telecos en distintas crisis.',
      'Los estudios de largo plazo muestran que la mayor parte de lo que gana la bolsa sale de un número pequeño de empresas.',
    ],
    lesson: 'Ser grande y conocida no protege: con pocas empresas, el riesgo es mucho mayor que con un fondo mundial.',
  },
  'acciones-dividendo': {
    drivers: 'Los beneficios de las empresas y los tipos de interés (cuando suben, el dividendo compite con los bonos).',
    timeline: [
      '2008–2012: muchos bancos y eléctricas recortan o suprimen su dividendo.',
      '2020: el BCE pide a los bancos que no repartan dividendos y muchas empresas los suspenden por el COVID.',
      'Algunas grandes empresas españolas han recortado su dividendo varias veces en la última década.',
    ],
    lesson: 'El dividendo no está garantizado: se recorta justo cuando las cosas van mal.',
  },
  'acciones-crecimiento': {
    drivers: 'Lo que se espera que crezcan y los tipos de interés: cuando suben, son las que más caen.',
    timeline: [
      '2000–2002: algunas de las grandes tecnológicas de hoy pierden más del 90 % y tardan años en recuperarse.',
      '2022: con la subida de tipos, varias de las mayores tecnológicas caen entre un 50 % y un 75 %.',
      '2023–2025: unas pocas tecnológicas ligadas a la inteligencia artificial explican buena parte de lo que sube la bolsa mundial.',
    ],
    lesson: 'Las que más suben también son las que más caen cuando decepcionan.',
  },
  'acciones-pequenas': {
    drivers: 'La economía, el crédito y el apetito por el riesgo.',
    timeline: [
      'A muy largo plazo, los estudios académicos encontraron que habían rendido algo más que las grandes.',
      '2008 y 2020: caen más que la bolsa en general.',
      '2010s–2020s: durante más de una década, las pequeñas rinden bastante menos que las grandes.',
    ],
    lesson: 'Pueden crecer mucho, pero sufren más en las crisis y muchas desaparecen.',
  },

  /* ------------------------------ Materias primas ---------------------------- */
  oro: {
    drivers: 'El miedo (crisis, guerras), la inflación, los tipos de interés reales, el dólar y las compras de los bancos centrales.',
    timeline: [
      '1971: EE. UU. deja de cambiar dólares por oro a 35 dólares la onza y su precio pasa a ser libre.',
      '1980: llega a unos 850 dólares; después cae cerca de un 65 % y tarda unos 28 años en volver a ese precio.',
      '2011: marca un máximo cerca de 1.900 dólares y cae alrededor de un 45 % hasta 2015.',
      '2022–2025: los bancos centrales compran oro a un ritmo récord y en 2025 supera por primera vez los 4.000 dólares la onza.',
    ],
    lesson: 'Brilla en las crisis, pero ha pasado décadas enteras perdiendo; no paga rentas.',
  },
  plata: {
    drivers: 'Lo mismo que el oro, más la industria (paneles solares, electrónica), lo que la hace mucho más volátil.',
    timeline: [
      '1980: un intento de acapararla la lleva a unos 50 dólares la onza y luego se hunde.',
      '2011: vuelve a rozar los 50 dólares y cae alrededor de un 70 % en los años siguientes.',
      '2025: supera por fin esos máximos de 1980 y 2011, más de cuarenta años después.',
    ],
    lesson: 'Se mueve como el oro, pero exagerado: subidas y caídas mucho más fuertes.',
  },
  energia: {
    drivers: 'La economía mundial, las decisiones de los grandes productores, las guerras y la transición energética.',
    timeline: [
      '2008: el petróleo llega a 147 dólares el barril y meses después baja de 40.',
      'Abril de 2020: con el COVID, el precio del petróleo americano llega a ser negativo un día.',
      '2022: la invasión de Ucrania dispara el petróleo por encima de 120 dólares y el gas europeo multiplica su precio por más de diez.',
    ],
    lesson: 'Es de lo más volátil que existe: puede duplicarse o hundirse en meses.',
  },
  'metales-industriales': {
    drivers: 'La economía mundial (sobre todo China), la construcción y la transición energética.',
    timeline: [
      '2008: el cobre cae más de un 60 % en unos meses.',
      '2021–2022: el litio se multiplica por más de diez con el boom del coche eléctrico.',
      '2023: el litio pierde más del 80 % desde su máximo.',
    ],
    lesson: 'Suben con las grandes historias de crecimiento y se hunden cuando la oferta las alcanza.',
  },
  agricolas: {
    drivers: 'Las cosechas, el clima, las guerras y el comercio mundial.',
    timeline: [
      '2007–2008: los alimentos básicos se disparan y provocan protestas en muchos países.',
      '2022: el trigo sube con fuerza tras la invasión de Ucrania, uno de sus grandes productores.',
      '2024: el cacao triplica su precio por malas cosechas en África occidental, hasta récords históricos.',
    ],
    lesson: 'Un mal año de clima puede cambiar el precio más que cualquier otra cosa.',
  },

  /* ------------------------------- Inmobiliario ------------------------------ */
  socimi: {
    drivers: 'Los alquileres, el valor de los inmuebles y, sobre todo, los tipos de interés.',
    timeline: [
      '2008: los REIT de EE. UU. caen cerca de un 70 % en la crisis financiera.',
      '2009–2012: se crean y reforman las SOCIMI en España; desde 2014 llegan las grandes.',
      '2020: las de oficinas y centros comerciales sufren con el COVID; las de logística, no.',
      '2022–2023: con la subida de tipos, muchas pierden entre un 30 % y un 50 % en bolsa.',
    ],
    lesson: 'Son inmobiliario, pero cotizan como acciones: caen con la bolsa y con los tipos.',
  },
  'fondo-inmobiliario': {
    drivers: 'Lo mismo que las SOCIMI y REIT que lleva dentro.',
    timeline: [
      '2007–2009: el inmobiliario cotizado mundial pierde más de la mitad.',
      '2022: cae cerca de un 25 % con la subida de tipos.',
      'Algunos fondos con edificios directamente han tenido que cerrar los reembolsos temporalmente en crisis, en varios países europeos.',
    ],
    lesson: 'El inmobiliario también cae, y a veces no te deja salir.',
  },
  'crowdfunding-inmobiliario': {
    drivers: 'La marcha de cada proyecto y el mercado de la vivienda.',
    timeline: [
      '2015 en adelante: se populariza en España con proyectos de reforma y promoción.',
      '2020–2023: el COVID, la subida de costes de construcción y de tipos retrasan muchos proyectos.',
      '2023: entra en pleno vigor el reglamento europeo de plataformas de financiación participativa.',
    ],
    lesson: 'Los retrasos son habituales: el plazo anunciado es el mejor caso.',
  },
  'vivienda-alquiler': {
    drivers: 'Los tipos de las hipotecas, el empleo, la demanda de alquiler y las normas de cada zona.',
    timeline: [
      '1997–2007: la vivienda en España casi triplica su precio.',
      '2008–2014: cae alrededor de un 30–40 % de media y mucho más en algunas zonas; muchos compradores con hipoteca quedan atrapados.',
      '2015–2025: se recupera con fuerza en las grandes ciudades y la costa; en muchas zonas tarda más de quince años en volver al precio de 2007.',
      '2023: la ley de vivienda permite limitar alquileres en zonas tensionadas.',
    ],
    lesson: '«La vivienda nunca baja» resultó falso: puede caer mucho y tardar más de una década en recuperarse.',
  },

  /* ------------------------------- Criptomonedas ----------------------------- */
  cripto: {
    drivers: 'La oferta y la demanda, el apetito por el riesgo, la regulación y la entrada de grandes inversores.',
    timeline: [
      '2009: nace el bitcoin.',
      '2017–2018: sube hasta cerca de 20.000 dólares y luego cae alrededor de un 84 %.',
      '2021–2022: llega a unos 69.000 dólares y vuelve a caer más del 75 %, con la quiebra de grandes plataformas.',
      '2024: EE. UU. aprueba fondos cotizados de bitcoin y supera por primera vez los 100.000 dólares a final de año.',
    ],
    lesson: 'Ha multiplicado su precio como nada, pero con caídas del 75–85 % cada pocos años.',
  },
  'cripto-otras': {
    drivers: 'Las modas, las redes sociales y lo que haga el bitcoin.',
    timeline: [
      '2017–2018: miles de proyectos nuevos («ICO») recaudan dinero; la mayoría acaba valiendo casi cero.',
      '2021: algunas memecoins se multiplican por cientos impulsadas por las redes sociales y luego se hunden.',
      'Cada ciclo deja una lista de criptomonedas que fueron de las mayores y hoy casi no valen nada.',
    ],
    lesson: 'Por cada una que se dispara, muchas desaparecen.',
  },
  stablecoins: {
    drivers: 'La confianza en que su emisor tiene de verdad el respaldo que dice.',
    timeline: [
      'Mayo de 2022: una stablecoin algorítmica de las mayores pierde su paridad y se hunde a casi cero en días, arrastrando decenas de miles de millones.',
      'Marzo de 2023: otra de las grandes baja a unos 0,88 dólares durante un fin de semana por tener reservas en un banco americano quebrado.',
      '2024: el reglamento europeo MiCA obliga a respaldarlas y a autorizar a quien las emite.',
    ],
    lesson: '«Estable» no es «garantizada»: depende de que su respaldo exista y esté disponible.',
  },
  'cripto-staking': {
    drivers: 'El precio de la cripto y la solidez de la plataforma o del protocolo.',
    timeline: [
      '2022: Ethereum pasa a funcionar con staking.',
      '2022: quiebran varias plataformas de préstamos de cripto que prometían intereses altos y congelan el dinero de sus clientes.',
      'Desde entonces, los reguladores de EE. UU. y Europa ponen más condiciones a estos servicios.',
    ],
    lesson: 'Un interés alto en cripto suele significar un riesgo alto que no se ve.',
  },

  /* -------------------------------- Complejos -------------------------------- */
  cfd: {
    drivers: 'Lo que hace aquello a lo que están ligados, multiplicado por el apalancamiento.',
    timeline: [
      '2010s: se popularizan entre particulares con anuncios de «trading» por internet.',
      '2018: el supervisor europeo limita su apalancamiento para pequeños inversores e impone avisos con el porcentaje de clientes que pierde.',
      '2023: la CNMV restringe su publicidad y su venta a pequeños inversores en España.',
    ],
    lesson: 'Los propios avisos obligatorios lo dicen: la mayoría de quienes los usan pierde dinero.',
  },
  'futuros-opciones': {
    drivers: 'El precio de lo que siguen, el paso del tiempo y la volatilidad.',
    timeline: [
      '1995: un solo operador hunde un banco británico de más de 200 años con pérdidas en futuros.',
      'Abril de 2020: los futuros del petróleo americano cotizan en negativo; quien tenía que recibir barriles pierde más de lo que puso.',
      '2021: el auge de las opciones entre particulares en EE. UU. provoca subidas y caídas extremas en acciones concretas.',
    ],
    lesson: 'Sirven para cubrirse; para especular, pueden costar más de lo que pones.',
  },
  estructurados: {
    drivers: 'Las condiciones de cada producto (barreras, fechas) y la solvencia de quien lo emite.',
    timeline: [
      '2008: quiebra un gran banco de inversión de EE. UU. y muchos estructurados emitidos por él, vendidos también en Europa, pierden casi todo.',
      'Desde 2015, en España los productos financieros llevan un indicador de riesgo y alertas de liquidez y complejidad.',
      'Desde 2018, en toda la UE llevan un documento de datos fundamentales con un indicador del 1 al 7.',
    ],
    lesson: 'Su rentabilidad depende de quien lo emite y de condiciones que conviene entender del todo.',
  },
  'warrants-turbos': {
    drivers: 'El precio de lo que siguen, el tiempo que queda y la volatilidad.',
    timeline: [
      '2000s: los warrants se hacen populares entre particulares en España.',
      'En cada caída fuerte de la bolsa, como 2008 o 2020, muchos turbos tocan su barrera y desaparecen en horas.',
    ],
    lesson: 'Pueden valer cero en un momento, aunque la acción se recupere después.',
  },
}
