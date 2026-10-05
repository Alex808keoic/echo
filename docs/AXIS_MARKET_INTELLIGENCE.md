# AXIS · Inteligencia de mercado — investigación y diseño (sin implementar)

**Fecha de la investigación:** 5 de octubre de 2026 (datos consultados entre el 5-10-2026 y sus fechas de referencia indicadas).
**Estado:** documento de trabajo para revisión. **Nada de esto está implementado.** No hay cambios de código asociados.
**Alcance:** mapa de mercado actual, evidencia sobre inversión, diseño conceptual del motor de decisión, arquitectura de datos, fuentes, regulación, experiencia y casos de prueba.

> **Convención de etiquetas** (se usa en todo el documento):
> **[O]** dato observado y publicado · **[P]** previsión/proyección de un organismo · **[I]** interpretación de una fuente · **[D]** cálculo derivado nuestro a partir de datos observados · **[Op]** opinión o propuesta nuestra · **[2ª]** cifra tomada de fuente secundaria (prensa, agregadores), sin verificar en origen.

---

## Índice

0. [Resumen ejecutivo](#0-resumen-ejecutivo)
1. [Mapa del mercado actual (octubre 2026)](#1-mapa-del-mercado-actual-octubre-2026)
2. [Fuentes y calidad de los datos](#2-fuentes-y-calidad-de-los-datos)
3. [Qué información necesita realmente AXIS](#3-qué-información-necesita-realmente-axis)
4. [Motor de decisión (modelo conceptual)](#4-motor-de-decisión-modelo-conceptual)
5. [Horizonte temporal](#5-horizonte-temporal)
6. [Inversión pasiva y diversificación: qué tiene respaldo](#6-inversión-pasiva-y-diversificación-qué-tiene-respaldo)
7. [Market timing](#7-market-timing)
8. [IA y mercado](#8-ia-y-mercado)
9. [Arquitectura futura para Finax](#9-arquitectura-futura-para-finax)
10. [Proveedores de datos](#10-proveedores-de-datos)
11. [Regulación y seguridad](#11-regulación-y-seguridad)
12. [Experiencia: «Tengo 500 € disponibles, ¿qué hago?»](#12-experiencia-tengo-500--disponibles-qué-hago)
13. [Casos de prueba (24 escenarios)](#13-casos-de-prueba-24-escenarios)
14. [Conclusiones](#14-conclusiones)
15. [Hallazgos sobre el código actual de Finax](#15-hallazgos-sobre-el-código-actual-de-finax)
16. [Decisiones pendientes de aprobación](#16-decisiones-pendientes-de-aprobación)
17. [Ideas para futuras fases](#17-ideas-para-futuras-fases)
18. [No implementar todavía](#18-no-implementar-todavía)
19. [Fuentes consultadas](#19-fuentes-consultadas)

---

## 0. Resumen ejecutivo

- **El contexto de 2026 es un shock energético con inflación al alza, no un ciclo de bajadas de tipos.** El conflicto en Oriente Medio (Irán; interrupciones en Ormuz y ataques a infraestructura saudí) llevó el Brent por encima de 100 $/b en septiembre; la inflación de la eurozona subió al 3,8 % [O, Eurostat, flash sept. 2026] y la de España al 4,9 % IPC / 5,0 % IPCA [O, INE, avance sept. 2026]. **El BCE ha subido tipos dos veces en 2026** (depósito al 2,50 %) y **la Fed también** (3,75–4,00 %).
- **Los tipos largos están en máximos de casi 20 años** (Treasury 10 años 5,24 % el 1-10-2026 [O, FRED]); el Bund superó el 3,3 % [2ª]. Según el BCE (Lane, 5-10-2026), parte de la subida de tipos largos globales viene del auge inversor en IA [I].
- **La renta variable sube en el agregado pero está muy concentrada.** MSCI ACWI +13,0 % en 2026 hasta septiembre (USD), con EE. UU. al 64 % del índice mundial y los 10 mayores valores al 25 % del índice global [O, MSCI, 30-9-2026]. En el S&P 500, la mayoría de valores está lejos de sus máximos aunque el índice no [2ª].
- **El dinero «seguro» pierde poder adquisitivo hoy**: depósitos a plazo de hogares ≈1,8 % [2ª] y Letras a 12 meses ≈2,8 % [2ª] frente a una inflación española del 4,9 % [O]. Esto es real pero coyuntural: no justifica por sí solo invertir dinero que se necesita pronto.
- **La evidencia más sólida para AXIS no es de mercado, es de finanzas personales y comportamiento:** colchón de liquidez antes de invertir; separar dinero por horizonte; diversificación amplia y barata; aportaciones constantes; no intentar adivinar el momento. La valoración (CAPE) informa sobre expectativas a 10 años pero casi nada sobre el próximo año.
- **Hallazgo crítico en Finax:** el pipeline de mercado publica una inflación **congelada en diciembre de 2025** (2,9 % España / 2,0 % eurozona) porque INE y Eurostat cambiaron de series en enero de 2026 (ECOICOP v2). Además fallan las fuentes del BCE (tipo de depósito). AXIS ve hoy una foto de mercado que contradice la realidad (§15).
- **Principio rector propuesto:** *el mercado nunca decide si invertir; decide, como mucho, cómo explicarlo.* La decisión la gobiernan la situación del usuario (liquidez, gasto, objetivos, horizonte, riesgo) y las reglas deterministas; el mercado aporta contexto con fecha y fuente.

---

## 1. Mapa del mercado actual (octubre 2026)

Cada bloque: **qué ocurre · por qué · qué lo cambiaría · riesgos · implicación a largo plazo · qué NO se puede concluir.** Fechas de referencia explícitas.

### 1.1 Energía (origen del shock)

**Qué ocurre**
- Brent: empezó el 3T en 72 $/b (1-7-2026); futuros máximos de 109 $/b el 15-9-2026; spot hasta 132 $/b; media ≈104 $/b las dos últimas semanas de septiembre [O, EIA *Today in Energy*, 5-10-2026].
- EIA (STEO sept. 2026): Brent ≈90 $/b de media en 2S26 y ≈74 $/b en 2027 a medida que se reconstruyen inventarios [P, EIA; cifras vía resultados de búsqueda del STEO, verificar en el PDF].
- Gas europeo (TTF): por encima de 80 €/MWh a principios de septiembre, máximos desde 2023 [2ª]; Qatar detuvo producción de GNL el 2-3-2026 [2ª]. Almacenamiento europeo reportado por debajo de lo habitual [2ª, no verificado].
- Inflación energética: +18,8 % interanual en la eurozona (sept., flash) [O, Eurostat]; +16,3 % en EE. UU. (agosto) [O, BLS].

**Por qué** [I, EIA/BCE]: conflicto en Oriente Medio con ataques a estaciones de bombeo del oleoducto Este-Oeste saudí y a petroleros en Bab el-Mandeb; menor liberación de la Reserva Estratégica de EE. UU. en septiembre; inventarios globales cayendo.

**Qué lo cambiaría**: acuerdo de paz o reapertura estable de rutas (un memorando del 17-6-2026 ya bajó precios temporalmente [O, EIA]); reconstrucción de inventarios; destrucción de demanda.

**Riesgos**: escalada; invierno con almacenamiento bajo de gas; efectos de segunda ronda en salarios y servicios (el BCE vigila la transmisión a inflación no energética).

**Largo plazo**: shocks de oferta energética han sido históricamente transitorios en precio pero pueden dejar inflación persistente si contaminan expectativas. El horizonte largo no cambia por un shock; sí cambia el rendimiento real del efectivo y de los bonos a corto.

**Qué NO podemos concluir**: el precio futuro del petróleo (las previsiones de la EIA cambian cada mes y han oscilado mucho en 2026); que «la energía seguirá subiendo» o «bajará pronto».

### 1.2 Inflación

| Indicador | Valor | Periodo | Fuente | Tipo |
|---|---|---|---|---|
| HICP eurozona | 3,8 % (ago.: 3,2 %) | sept. 2026 (flash) | Eurostat, 2-10-2026 | [O] |
| Energía eurozona | 18,8 % | sept. 2026 | Eurostat | [O] |
| Servicios eurozona | 3,2 % | sept. 2026 | Eurostat | [O] |
| Inflación no energética eurozona | 2,3 % | sept. 2026 | BCE (Lane, 5-10-2026) | [O citado] |
| IPC España | 4,9 % (ago.: 4,3 %) | sept. 2026 (avance) | INE | [O] |
| IPC subyacente España | 3,1 % | sept. 2026 (avance) | INE | [O] |
| IPCA España | 5,0 % | sept. 2026 (avance) | INE / Eurostat | [O] |
| IPC EE. UU. | 3,4 %; subyacente 2,4 % | ago. 2026 | BLS, 11-9-2026 | [O] |
| Inflación implícita EE. UU. 10 años | 2,36 % | 2-10-2026 | FRED (T10YIE) | [O, de mercado] |
| Proyección BCE (general) | 3,0 % / 2,5 % / 2,1 % | 2026 / 2027 / 2028 | BCE, 10-9-2026 | [P] |
| Proyección BCE (sin energía ni alimentos) | 2,5 % / 2,6 % / 2,3 % | 2026 / 2027 / 2028 | BCE, 10-9-2026 | [P] |
| Proyección Fed (PCE / PCE subyacente) | 3,7 % / 3,4 % | 2026 | Fed SEP, 16-9-2026 | [P] |

**Por qué**: energía (directa). La subyacente sube poco pero sube; el BCE revisó al alza 2027–2028 [O].
**Qué lo cambiaría**: precio del petróleo/gas; salarios; expectativas.
**Riesgos**: inflación persistente que obligue a más subidas.
**Implicación**: el efectivo y los depósitos pierden poder adquisitivo mientras la inflación supere su rentabilidad; los bonos con tipo fijo largo comprados antes de 2026 han sufrido.
**Qué NO podemos concluir**: que la inflación seguirá en el 5 % en España (el propio INE habla de avance; la energía puede revertir).

### 1.3 Tipos de interés y bancos centrales

| Indicador | Valor | Fecha | Fuente | Tipo |
|---|---|---|---|---|
| BCE · facilidad de depósito | 2,50 % (desde 16-9-2026; antes 2,25 % desde 17-6-2026; 2,00 % desde 11-6-2025) | 10-9-2026 | BCE, tabla oficial | [O] |
| Fed · fondos federales | 3,75–4,00 % (+25 pb, 12-0) | 16-9-2026 | Fed | [O] |
| Fed · mediana tipo fin 2026 / 2027 / largo plazo | 4,1 % / 4,1 % / 3,2 % | 16-9-2026 | Fed SEP | [P] |
| Treasury 10 años | 5,24 % (30-9: 5,29 %) | 1-10-2026 | FRED DGS10 | [O] |
| Bund 10 años | >3,3 %, máximos desde 2011 | principios sept. 2026 | prensa (LSEG vía Euronews) | [2ª] |
| Euríbor 12 meses | 3,303 % | 1-10-2026 | Banco de España (vía pipeline de Finax) | [O] |
| Letras del Tesoro 12 meses | tipo medio 2,832 % | subasta 1-9-2026 | prensa | [2ª] |
| Depósitos a plazo hogares (nuevas operaciones) | ≈1,75–1,80 % | verano 2026 | prensa citando BdE | [2ª] |

**Por qué** [I, BCE/Fed]: los bancos centrales responden a una inflación que «se mantendrá muy por encima del objetivo durante un periodo prolongado» (BCE). La Fed describe una economía que crece «a un ritmo sólido» con inversión robusta. El BCE (Lane) atribuye parte del alza de tipos largos globales al auge de inversión en IA y a la prima por plazo.
**Qué lo cambiaría**: desescalada energética; debilidad del empleo (el informe de empleo de EE. UU. de septiembre fue flojo: +29.000 empleos, paro 4,2 % [2ª, BLS 2-10-2026]); tensiones de deuda pública.
**Riesgos**: más subidas; repunte adicional de tipos largos (la OCDE lo cita como riesgo bajista para el crecimiento [P/I]).
**Implicación**: los bonos ofrecen hoy rentabilidades iniciales mucho más altas que en 2020–2021; la rentabilidad inicial es el mejor predictor conocido de la rentabilidad a 5–10 años de un fondo de bonos de calidad (§6). El coste de las hipotecas variables en España sube (Euríbor ≈3,3 %).
**Qué NO podemos concluir**: el próximo movimiento de tipos (el BCE dice explícitamente que no se compromete a una senda); que «los bonos ya han tocado fondo».

**Tipo real ex post [D]**: BCE 2,50 % − HICP 3,8 % ≈ −1,3 pp; EE. UU. 10 años 5,24 % − inflación implícita 2,36 % ≈ +2,9 pp (aproximación de tipo real ex ante, no es un dato publicado como tal).

### 1.4 Crecimiento y empleo

- FMI (WEO julio 2026): crecimiento mundial 3,0 % en 2026 y 3,4 % en 2027; «el shock bélico pesa sobre importadores de energía; la demanda ligada a IA impulsa a los integrados en la cadena tecnológica» [P/I, FMI].
- OCDE (Interim sept. 2026): mundo 2,9 % (2026) y 3,0 % (2027); inflación G20 4,1 % (2026); riesgos: perturbaciones prolongadas en Oriente Medio, El Niño fuerte, más subidas de tipos largos, **retornos de la inversión en IA por debajo de lo esperado** [P/I, OCDE vía resultados de búsqueda; verificar en el PDF].
- BCE (sept. 2026): PIB eurozona 0,9 % (2026), 1,4 % (2027), 1,5 % (2028); paro 6,4 % en julio [P/O].
- Eurozona PIB 2T 2026: +0,6 % trimestral (revisado desde 0,4 %) [2ª, Eurostat vía prensa].
- España: paro EPA 2T 2026 9,87 % [O, INE, 28-7-2026]. Banco de España (marzo 2026): PIB 2,2 % e inflación 3,0 % en 2026, con un escenario adverso cercano al 6 % de inflación si se prolongaba la guerra [P, vía prensa; no se ha localizado aún la proyección de septiembre].
- EE. UU.: Fed SEP PIB 2,3 % (2026); paro 4,1 % [P]. Empleo de septiembre débil y con revisiones a la baja [2ª].

**Qué NO podemos concluir**: recesión o no recesión. Hay señales mixtas (crecimiento resistente en Europa, empleo flojo en EE. UU.).

### 1.5 Renta variable

| Indicador | Valor | Fecha | Fuente | Tipo |
|---|---|---|---|---|
| MSCI ACWI (USD, neto) | 1 mes −1,11 %; 3 meses +1,60 %; año +13,03 %; 1 año +16,75 %; 10 años anualizado +12,38 % | 30-9-2026 | MSCI factsheet | [O] |
| MSCI ACWI valoración | PER 21,35; PER adelantado 16,28; P/VC 3,77; dividendo 1,58 % | 30-9-2026 | MSCI | [O] |
| MSCI ACWI composición | EE. UU. 64,21 %; tecnología 33,21 %; 10 mayores = 25,40 % | 30-9-2026 | MSCI | [O] |
| MSCI World | año +11,75 %; PER adelantado 17,92 | 30-9-2026 | MSCI | [O] |
| MSCI Emergentes | año +23,38 %; PER adelantado 9,72 | 30-9-2026 | MSCI | [O] |
| MSCI ACWI caída máxima histórica (desde 2000) | −58,38 % (oct. 2007 – mar. 2009) | — | MSCI | [O] |
| S&P 500 | 7.722,72 | 2-10-2026 | FRED (SP500) | [O] |
| S&P 500 PER adelantado | 19,0 (media 5 años 19,8; 10 años 19,1) | ≈2-10-2026 | FactSet | [O/derivado de previsiones] |
| S&P 500 BPA esperado | +29,5 % 3T26; +32,4 % 2026 | ≈2-10-2026 | FactSet (consenso) | [P] |
| S&P 500 en 3T | +2,3 % trimestre; ≈+12,8 % en el año | 30-9-2026 | prensa/gestoras | [2ª] |
| STOXX Europe 600 | ≈+9 % en el año (principios oct.) | oct. 2026 | proveedores de índice/agregadores | [2ª] |
| IBEX 35 | 19.005,3 | 1-10-2026 | Banco de España (pipeline Finax) | [O] |
| EURO STOXX 50 (media mensual) | 6.316,39 | sept. 2026 | BCE (pipeline Finax) | [O] |
| VIX | 15,31 | 2-10-2026 | FRED | [O] |

**Qué ocurre e interpretación**
- El agregado sube, impulsado por grandes tecnológicas ligadas a la IA y por **beneficios que crecen con fuerza** (consenso FactSet). Que el PER adelantado del S&P 500 esté *por debajo* de su media de 5 años se debe a que el denominador (beneficio esperado) ha crecido mucho, no a que los precios hayan caído [D/I].
- **Concentración**: el top 10 del ACWI pesa el 25,4 % del índice *mundial* [O]. En el S&P 500, prensa y gestoras sitúan el top 10 entre el 38 y el 41 % (récord histórico; ≈26 % en el pico de 2000) [2ª, varias fuentes coincidentes; no verificado en S&P DJI].
- **Amplitud débil**: según una gestora, ≈83 % de los valores del S&P 500 cotizaba >10 % por debajo de su máximo de 52 semanas al cierre del 3T [2ª, una sola fuente, tratar con cautela].
- **Volatilidad y crédito tranquilos** pese al shock: VIX 15,3; diferencial *high yield* EE. UU. 3,10 % [O, FRED]. Mercados en calma con tipos reales altos y energía cara: la calma es un dato, no una garantía.

**Por qué**: beneficios (especialmente tecnología y energía), inversión en IA (≈725.000 M$ de capex conjunto de los hiperescaladores en 2026 según agregadores [2ª]), economía resistente.
**Qué lo cambiaría**: decepción en los retornos de la inversión en IA (BoE y FMI lo señalan como riesgo de estabilidad [I]); subida adicional de tipos largos (comprime valoraciones); recesión.
**Riesgos**: corrección amplificada por la concentración y por posiciones correlacionadas (Banco de Inglaterra, Informe de Estabilidad Financiera de julio de 2026 [I]); deuda emitida para IA (≈450.000 M$, el doble que en 2025, según el BoE vía prensa [2ª]).
**Largo plazo**: un índice mundial ponderado por capitalización hoy es, en la práctica, en gran parte una apuesta por EE. UU. y por tecnología. Diversificar «por índice» ya no garantiza diversificación sectorial o geográfica equilibrada. Esto es un **matiz importante para AXIS** al hablar de «diversificación».
**Qué NO podemos concluir**: que haya una burbuja ni que no la haya; que «el mercado está caro» implique caídas inminentes (§7); que los emergentes «baratos» vayan a hacerlo mejor.

### 1.6 Bonos y crédito

- Treasury 10 años 5,24 % (1-10) [O, FRED]; 30 años en máximos desde 2002–2004 [2ª, CNBC]; Bund >3,3 % [2ª].
- Inflación implícita moderada (2,36 %), por lo que gran parte del alza son tipos **reales** y prima por plazo [D/I].
- Diferencial *high yield* EE. UU. 3,10 % (estrecho en términos históricos) [O]: el crédito no descuenta estrés.

**Implicación**: para dinero a 1–5 años, los instrumentos de renta fija de calidad y corto plazo vuelven a tener rentabilidades nominales razonables; la duración larga añade sensibilidad a los tipos (2022 recordó que un bono largo puede caer con fuerza). **Qué NO podemos concluir**: que «ahora es el momento de comprar bonos largos».

### 1.7 Oro y materias primas

| Indicador | Valor | Periodo | Fuente | Tipo |
|---|---|---|---|---|
| Oro (media mensual, USD/oz) | 5.014,65 (feb. 2026, máximo mensual de la serie) → 4.237,07 (jun.) → 4.075,10 (jul.) → 4.418,54 (ago.) | 2025-09 a 2026-08 | FMI PCPS | [O] |
| Oro, máximo intradía | ≈5.590–5.608 (enero 2026) y caída posterior ≈22 % | 2026 | prensa sectorial | [2ª] |
| Compras netas de bancos centrales | 289 t en 2T 2026 (+62 % interanual) | 2T 2026 | World Gold Council | [O citado] |
| ETF de oro | salidas de 45 t en 2T 2026 | 2T 2026 | WGC | [O citado] |

**Discrepancia explicada**: el FMI publica **medias mensuales** (máximo 5.015 $ en febrero), la prensa cita **máximos intradía** (≈5.600 $ en enero). Ambas son correctas; miden cosas distintas. AXIS debe decir siempre qué mide la cifra.
**Interpretación**: el oro subió con fuerza en 2025–26 y ha corregido con la subida de tipos reales, sostenido por compras oficiales [I, WGC]. **No puede concluirse** su evolución: no genera flujos, su valoración no tiene ancla clara y su volatilidad es alta.

### 1.8 Divisas

- EUR/USD 1,1204; EUR/JPY 177,28; EUR/GBP 0,8472; EUR/CHF 0,9311 [O, BCE, referencia 5-10-2026].
- Prensa y agregadores daban para finales de septiembre valores entre 1,135 y 1,152 [2ª]. La horquilla muestra lo poco fiables que son algunas fuentes secundarias para datos tan básicos.
- **Implicación para un inversor en euros**: un fondo mundial no cubierto tiene ≈64 % en activos en USD; los movimientos del dólar añaden volatilidad (en ambos sentidos). **No se puede concluir** la dirección del tipo de cambio.

### 1.9 Inmobiliario (solo contexto)

- España, IPV 2T 2026: +12,2 % interanual (nueva +7,4 %; usada +12,9 %) [O, INE, 7-9-2026]; seis trimestres seguidos por encima del 12 % [2ª].
- Euríbor 12 meses ≈3,3 % (1-10-2026) [O] encarece hipotecas variables.
- **Para AXIS**: dato de contexto de coste de vida y de objetivos (entrada de vivienda), no un activo a recomendar.

### 1.10 Liquidez y activos de bajo riesgo (España)

| Instrumento | Rentabilidad aproximada | Fecha | Tipo | Comentario |
|---|---|---|---|---|
| Cuenta/depósito medio | ≈1,8–2,3 % TIN | verano 2026 | [2ª] | Media; ofertas puntuales hasta ≈4 % TAE para nuevos clientes [2ª] |
| Letras 12 meses | ≈2,8 % | subasta 1-9-2026 | [2ª] | Secundario cercano al 3 % [2ª] |
| Fondos monetarios | no verificado | — | — | Orientativamente siguen el €STR (cerca del tipo de depósito del BCE) [Op] |
| Garantía | FGD hasta 100.000 € por titular y entidad | vigente | [O, ampliamente documentado] | Cubre depósitos, no fondos |

**[D]** Con IPC al 4,9 %, la rentabilidad real *ex post* del efectivo es negativa (≈ −2 a −3 pp). Con la inflación prevista por el BCE para 2027 (2,5 %), unas Letras al ≈2,8 % rondarían el 0 % real *ex ante*. **Para dinero de corto plazo, la prioridad sigue siendo la disponibilidad y la ausencia de pérdidas nominales, no ganarle a la inflación.**

### 1.11 IA y tecnología como motor de mercado

- Capex conjunto de Amazon, Alphabet, Microsoft y Meta ≈725.000 M$ en 2026 (+77 % vs 2025) [2ª, agregadores; cifras de guía corporativa].
- El BCE estima que la inversión ligada a IA aporta ≈un cuarto del crecimiento del crédito en 2026 en la eurozona y que el auge global de IA está **empujando al alza los tipos largos** [I, Lane, 5-10-2026].
- Banco de Inglaterra (julio 2026): valoraciones de IA más tensionadas; riesgo de corrección amplificado por concentración y apalancamiento [I].
- FMI (GFSR abril 2026): valoraciones exigentes y concentración elevan riesgos bajistas [I].
- **Para AXIS**: la IA es hoy el principal factor de concentración del índice mundial. Esto hace más importante, no menos, hablar de diversificación y de horizonte. **No puede concluirse** si la inversión dará los retornos que descuentan los precios.

### 1.12 Riesgos geopolíticos (contexto)

Conflicto en Oriente Medio con Irán (desde marzo de 2026, con escaladas en septiembre) [O citado por EIA/BCE/FMI]; guerra de Rusia en Ucrania continúa (citada por el BCE como riesgo al alza de inflación) [O citado]; El Niño fuerte (OCDE) [P/I]. **Regla para AXIS**: la geopolítica explica el contexto; nunca debe ser el gatillo de una recomendación de comprar o vender.

---

## 2. Fuentes y calidad de los datos

### 2.1 Jerarquía usada y qué aportó cada nivel

| Nivel | Fuentes usadas | Calidad observada |
|---|---|---|
| 1. Bancos centrales y organismos oficiales | BCE (tabla de tipos, declaración 10-9, discurso Lane 5-10), Fed (declaración y SEP 16-9), FMI (WEO, PCPS), OCDE, Banco de Inglaterra | Máxima. Fechas explícitas. Distinguen proyección y dato. |
| 2. Estadísticos | Eurostat, INE, BLS, FRED (como distribuidor), EIA | Máxima; **cuidado con los cambios de serie** (ECOICOP v2 en 2026). |
| 3. Reguladores | ESMA, CNMV, BOE (vía resúmenes) | Alta; algunos documentos inaccesibles directamente. |
| 4. Proveedores de índices | MSCI (factsheet), FactSet, S&P DJI (bloqueado, 403) | Alta; licencias restrictivas. |
| 5. Gestoras/instituciones | Vanguard, Schwab, J.P. Morgan, AQR, UBS/DMS, WGC | Útil para evidencia; sesgo comercial posible. |
| 6. Prensa de calidad | CNBC, Reuters (vía terceros), Euronews | Útil para fechas y causas; verificar cifras. |
| 7. Agregadores | tradingeconomics, portales de Euríbor, blogs | **Inconsistentes**: tres cifras distintas de Euríbor de septiembre (3,079 / 3,223 / 3,251 %) y de EUR/USD (1,1355 / 1,152). |

### 2.2 Discrepancias detectadas y su causa

| Dato | Discrepancia | Causa | Lección para AXIS |
|---|---|---|---|
| Oro máximo | 5.015 vs ≈5.600 $ | media mensual vs intradía | Etiquetar «media mensual»/«cierre»/«intradía». |
| Treasury 10 años | 5,10 % «máximo» (23-9) vs 5,29 % (30-9) | fechas distintas; la subida continuó | Cada cifra con su fecha. |
| Euríbor septiembre | 3,079 / 3,223 / 3,247 / 3,251 % | media provisional vs definitiva vs diaria | Usar la fuente oficial y decir qué es (media mensual o diario). |
| EUR/USD | 1,1204 (BCE 5-10) vs 1,1355 / 1,152 | días distintos y fuentes no oficiales | Tipo de referencia del BCE. |
| Inflación en el pipeline de Finax | 2,9 % / 2,0 % (dic. 2025) vs 4,9 % / 3,8 % (sept. 2026) | serie discontinuada | Validar frescura **por indicador** (§15). |
| Tabla de tipos BCE | El resumidor automático la describió como «tendencia bajista» | interpretación errónea de un resumen IA | **Nunca dejar a un LLM interpretar una tabla sin validar contra los números** (§8). |

### 2.3 Registro de datos importantes

Ver tablas de §1 (fuente, fecha, periodo y tipo en cada fila) y §19 (URLs).

---

## 3. Qué información necesita realmente AXIS

Criterio: **¿cambia este dato lo que AXIS haría o diría a una persona con su situación?** Si no cambia nada, es ruido para AXIS aunque sea interesante.

### 3.A Datos realmente útiles

| Dato | Utilidad para AXIS | Frecuencia | Horizonte | Errores de interpretación posibles |
|---|---|---|---|---|
| **Inflación (IPC/IPCA España; HICP eurozona), general y subyacente** | Poder adquisitivo del efectivo; tipo real de depósitos y Letras; contexto de gasto | Mensual (avance a fin de mes) | Corto/medio | Confundir avance con definitivo; general con subyacente; usar series discontinuadas |
| **Tipo de depósito del BCE y Euríbor 12M** | Rentabilidad esperable del efectivo; coste de hipotecas variables | BCE: cada reunión (~6 semanas); Euríbor diario/mensual | Corto | Creer que el tipo oficial es lo que paga el banco; ignorar el diferencial |
| **Rentabilidad de Letras 3–12 meses y bonos españoles 2–10 años** | Alternativa sin riesgo de crédito relevante para dinero a 1–5 años; rentabilidad inicial ≈ rentabilidad esperada de bonos | Subastas quincenales/mensuales; diario en secundario | Corto/medio | Comparar TIR de un bono largo con un depósito sin hablar de duración |
| **Remuneración media de depósitos (BdE)** | Contexto realista de lo que paga el efectivo | Mensual (con retraso) | Corto | Comparar con ofertas promocionales |
| **Valoración agregada (PER adelantado, CAPE, rentabilidad por dividendo) de índices amplios** | Moderar **expectativas** a 10 años; explicar por qué la rentabilidad futura puede ser menor | Mensual basta | Largo (10 años) | Usarla para timing a 1 año (R² ≈0,05 a 1 año según AQR) |
| **Concentración del índice (peso top 10, peso EE. UU., peso tecnología)** | Explicar riesgo de un «índice mundial»; diversificación real | Mensual/trimestral | Largo | Concluir que la concentración implica caída |
| **Caída desde máximo y volatilidad realizada de índices amplios** | Explicar riesgo vivido y normalizar caídas; detectar «el usuario mira una caída» | Diario/semanal | Corto (explicación) | Convertir una caída en señal de comprar/vender |
| **Tipo de cambio EUR/USD (referencia BCE)** | Explicar variaciones de un fondo global en euros | Diario | Corto/medio | Atribuir a la gestión lo que es divisa |
| **Proyecciones oficiales (BCE, BdE, FMI, OCDE) con escenarios** | Contexto macro con incertidumbre explícita | Trimestral / semestral | Medio | Presentar proyecciones como datos |
| **Diferencial de crédito (*high yield*, grado de inversión)** | Indicador de estrés financiero (contexto) | Diario | Corto | Usarlo como predictor de bolsa |
| **Costes de productos (TER/OCF) y fiscalidad española** | Diferencia real y predecible en el resultado | Cuando cambian | Largo | Ignorar que los costes se acumulan año a año |

### 3.B Datos que parecen interesantes pero probablemente son ruido para AXIS

| Dato | Por qué es ruido aquí |
|---|---|
| Movimientos diarios de índices y titulares de «el mercado hoy» | No cambian ninguna decisión de largo plazo; aumentan la ansiedad |
| Precios intradía y en tiempo real | AXIS no ejecuta operaciones; el retraso de un día es irrelevante para sus decisiones |
| Previsiones de precio de analistas (objetivo del S&P, del oro, del Brent) | Dispersión enorme y revisiones frecuentes (todas las grandes casas recortaron su previsión de oro para 2026 [2ª]) |
| Análisis técnico, medias móviles, «soportes» | Sin respaldo como base de decisiones para un ahorrador |
| Datos de una sola acción, ratings de analistas | Lleva a selección de valores; la mayoría de acciones rinde menos que las Letras a lo largo de su vida (Bessembinder) |
| Flujos de ETF semanales, posicionamiento de fondos | Interesante para profesionales; no accionable para el usuario |
| Indicadores de sentimiento (miedo/codicia) | Fácil de convertir en timing |
| Calendarios de bancos centrales «qué hará la Fed» | El BCE dice que no se compromete; AXIS no debe adivinar |

### 3.C Datos que podrían ser peligrosos si se interpretan mal

| Dato | Riesgo de mala interpretación | Salvaguarda |
|---|---|---|
| **CAPE/PER «caro» o «barato»** | «Está caro → no inviertas / vende»; «está barato → invierte todo» | Solo modula expectativas a 10 años; nunca la decisión de invertir ni el momento |
| **Rentabilidades pasadas** («+13 % este año») | Extrapolación; atraer dinero que se necesita pronto | Mostrar siempre caídas máximas (−58 % ACWI 2007-09) junto a rentabilidades |
| **«Missing the best days»** | Usarlo como prueba absoluta contra vender | Explicar que los mejores días suelen ir pegados a los peores; el argumento real es la imposibilidad de acertar ambos |
| **Probabilidad de pérdida por horizonte** («0 % a 15 años») | Muestra centrada en EE. UU.; Japón tardó 34 años en recuperar su máximo de 1989 (feb. 2024) | Presentar como evidencia histórica de varios mercados, con contraejemplos |
| **Rentabilidad del oro o materias primas recientes** | Perseguir lo que ha subido | No recomendar activos por su comportamiento reciente |
| **Proyecciones oficiales** | Presentarlas como hechos | Etiqueta «previsión de X, fecha» obligatoria |
| **Noticias geopolíticas** | «Guerra → vende» | La geopolítica no es un disparador de recomendaciones |
| **Inflación alta** | «El dinero pierde valor → invierte el colchón» | El colchón es colchón aunque pierda poder adquisitivo |
| **Datos con fecha antigua presentados como actuales** | Es justo el fallo actual del pipeline de Finax | Frescura por indicador y fecha visible siempre |

---

## 4. Motor de decisión (modelo conceptual)

**No implementado.** Diseño para una fase futura, compatible con Decision First (las reglas deciden, el modelo solo expresa).

### 4.1 Principio de diseño

> La decisión de **qué hacer con el dinero** depende de la situación financiera del usuario. El mercado **no abre ni cierra** la puerta a invertir: como mucho, cambia **cómo se explica** (expectativas, riesgos, ritmo de aportación sugerido) y añade incertidumbres.

Consecuencias explícitas:
- **«El mercado parece barato» por sí solo NO significa «invierte».** Si el usuario no tiene colchón o necesita el dinero en un año, la respuesta sigue siendo no invertir ese dinero.
- **«El mercado ha subido mucho» por sí solo NO significa «vende».** Si el dinero es de largo plazo y la cartera está diversificada, la respuesta sigue siendo mantener, y como mucho revisar el reparto si se ha desviado de lo que el usuario decidió.

### 4.2 Escalera de prioridades (orden determinista)

Cada peldaño debe estar razonablemente cubierto antes de considerar el siguiente. Todas son **reglas deterministas**:

| # | Peldaño | Condición de entrada (datos de Finax) | Acción conceptual | Datos de mercado que influyen |
|---|---|---|---|---|
| 0 | **Datos suficientes** | ≥3 meses cerrados con movimientos; saldo inicial | Si no: «registra más datos antes de decidir» | Ninguno |
| 1 | **Estabilidad del flujo** | Gasto habitual > ingreso habitual (meses cerrados) | **Reducir gasto** / revisar presupuesto | Inflación (explica subida de gastos) |
| 2 | **Colchón de emergencia** | Liquidez disponible < N meses de gasto habitual (N según estabilidad de ingresos: 3 estables, 6 irregulares) | **Crear/reforzar colchón** en instrumentos líquidos sin riesgo de pérdida nominal | Tipos de depósitos/Letras (dónde se guarda, no si se guarda) |
| 3 | **Deudas caras** | *Finax no registra deudas hoy* | (Futuro) amortizar deuda cara antes de invertir | Euríbor (hipoteca variable) |
| 4 | **Objetivos de corto plazo** (< 2 años) | Objetivos con fecha cercana o colchón de objetivos | **Mantener liquidez/ahorrar** (cuenta, depósito, Letras) | Tipos a corto |
| 5 | **Objetivos de medio plazo** (2–7 años) | Objetivos con fecha media | **Ahorro + renta fija de calidad, corto/medio plazo**; renta variable solo si el usuario acepta poder no llegar | Rentabilidad de bonos 2–5 años |
| 6 | **Dinero de largo plazo** (> 7 años, no comprometido) | Excedente tras 1–5, sin objetivo cercano | **Invertir diversificado y barato**, preferiblemente de forma periódica | Valoración (solo expectativas), concentración (diversificación) |
| 7 | **Mantenimiento** | Ya hay inversiones | **Revisar/diversificar** si hay concentración o desviación del reparto elegido; **no hacer nada** si está en plan | Concentración, caídas (explicar) |

**«No hacer nada y esperar»** es una salida válida en cualquier peldaño cuando el plan está en marcha y no hay desviaciones, o cuando faltan datos. No equivale a «esperar a que caiga el mercado».

### 4.3 Variables y cómo intervienen

| Variable | Fuente | Papel |
|---|---|---|
| Dinero líquido | Finax (`liquidCents`) | Base del colchón y del reparto |
| Gasto habitual | Finax (mediana meses cerrados, Fase 5) | Tamaño del colchón |
| Ingresos e ingresos recurrentes | Finax + memoria | Capacidad de ahorro; **la previsión nunca cuenta como dinero** |
| Estabilidad de ingresos | Memoria (`irregularIncome`) + variabilidad observada | Meses de colchón (3 vs 6) |
| Objetivos (meta, fecha, prioridad, reparto) | Finax (Fase A/B) | Separan dinero comprometido del libre |
| Horizonte temporal | Fecha de objetivo; memoria `horizon` | Peldaño 4/5/6 |
| Necesidad de liquidez | Memoria `minLiquidity` + colchón | Mínimo intocable |
| Tolerancia al riesgo | Memoria `riskAttitude` (hoy solo matiza texto) | Mezcla renta variable/fija **dentro** del peldaño 6, nunca saltarse peldaños |
| Patrimonio y dinero ya invertido | Finax (posiciones manuales) | Concentración y peso de inversión |
| Concentración | Posiciones (peso por activo) + concentración del índice | Peldaño 7 |
| Situación de mercado | Capa de mercado (con frescura por indicador) | **Solo** expectativas, explicación, incertidumbre; nunca la decisión |
| Costes | Futuro: TER declarado por el usuario | Diferencia predecible; señal si es alta |
| Impuestos | Reglas generales España (base del ahorro 19–30 %; traspasos entre fondos sin tributar, ETF sí tributan) | Explicación; nunca planificación fiscal personalizada |
| Incertidumbre | Calidad de datos + frescura + dispersión | Baja la confianza; puede convertir una recomendación en «revisar» |

### 4.4 Cómo puede (y no puede) intervenir el mercado

| Situación de mercado | Lo que AXIS **puede** hacer | Lo que AXIS **no** debe hacer |
|---|---|---|
| Valoraciones altas | Decir que las expectativas a 10 años son históricamente más bajas cuando se parte de valoraciones altas; reforzar diversificación | Decir «espera a que baje» o «no inviertas» por eso |
| Valoraciones bajas / caída fuerte | Recordar que el plan de largo plazo sigue; normalizar caídas; recordar el colchón | Decir «aprovecha, mete todo» |
| Volatilidad alta | Explicar que es normal; sugerir que el ritmo periódico reduce el arrepentimiento | Recomendar salir |
| Tipos altos | Señalar que el efectivo y la renta fija corta pagan más; mejorar la rentabilidad del colchón | Convertirlo en «todo a bonos» |
| Inflación alta | Explicar pérdida de poder adquisitivo del efectivo | Usarla para invertir el colchón |
| Contexto desactualizado | Advertir, no emitir lecturas de mercado | Usar datos viejos como actuales |

### 4.5 Por qué separar ritmo y decisión

Si el usuario decide invertir dinero de largo plazo y le da miedo hacerlo de golpe, la evidencia (Vanguard) indica que invertir de una vez gana ≈2 de cada 3 veces a repartirlo en 12 meses, pero repartirlo reduce el arrepentimiento si hay una caída inmediata. Ambas son **aceptables**; AXIS puede describir el trade-off sin elegir por el mercado. Lo que no es aceptable es mantener el dinero indefinidamente en efectivo esperando una caída (§7).

---

## 5. Horizonte temporal

### 5.1 Clasificación propuesta [Op, basada en evidencia de §6–7]

| Horizonte | Plazo | Para qué | Activos conceptualmente razonables | Riesgos principales |
|---|---|---|---|---|
| **Corto** | < 2 años (o dinero que puede necesitarse en cualquier momento) | Colchón, gastos previstos, objetivos cercanos | Cuenta remunerada, depósitos ≤ 100.000 € por entidad (FGD), Letras del Tesoro, fondos monetarios | Inflación (pérdida real), riesgo de entidad por encima de la garantía, tipos que bajan al renovar |
| **Medio** | 2–7 años | Entrada de vivienda, coche, formación | Renta fija de calidad con vencimiento similar al objetivo (bonos/Letras escalonados, fondos de renta fija corto/medio plazo); parte de renta variable solo si el objetivo es flexible | Tipos (duración), crédito, caída de bolsa justo antes de la fecha |
| **Largo** | > 7 años y sin uso previsto | Patrimonio, jubilación, libertad financiera | Renta variable global diversificada de bajo coste, combinada con renta fija según tolerancia | Caídas de −40/−60 % (ACWI −58 % en 2007-09); décadas planas en un solo país (Japón 1989–2024); concentración; divisa |

### 5.2 Evidencia que sostiene la frontera

- **Bonos**: correlación ≈0,94 entre la rentabilidad inicial del índice agregado de EE. UU. y su rentabilidad a 5 años; ≈0,87 en grado de inversión euro (gestoras, [2ª]). A 1 año la relación es débil. ⇒ para 5+ años la renta fija de calidad tiene un resultado razonablemente previsible a partir de su rentabilidad inicial.
- **Acciones**: probabilidad de pérdida en periodos móviles del S&P 500 (1975–2025): 18 % a 1 año, 11 % a 5, 10 % a 10, 0 % a 15+ [2ª, gestoras]; renta variable global (1991–2016): 16 % a 3 años, 14 % a 5, 3 % a 10 [2ª]. **Matiz obligatorio**: muestras centradas en mercados exitosos; Japón tardó 34 años (1989 → 22-2-2024) en recuperar su máximo nominal.
- **Prima de riesgo de largo plazo**: ≈3,5 % geométrica sobre Letras para un inversor global a futuro (UBS/Dimson-Marsh-Staunton 2026 [I]); renta variable global real ≈3,5 % anual en los últimos 25 años [O citado].

### 5.3 Matices

- El horizonte es **del dinero, no de la persona**: un joven puede tener dinero de corto plazo (colchón).
- Un objetivo de medio plazo flexible (sin fecha dura) tolera más riesgo que uno con fecha fija.
- El paso del tiempo **acorta** el horizonte: un objetivo de largo plazo se convierte en medio y corto; el reparto debería volverse más conservador al acercarse (propuesta para fases futuras).

---

## 6. Inversión pasiva y diversificación: qué tiene respaldo

| Principio | Evidencia | Solidez |
|---|---|---|
| **La mayoría de fondos activos no bate a su índice a largo plazo** | SPIVA Europa (fin 2025): ≈98 % de fondos de renta variable global en euros por debajo de su índice a 10 años [2ª; el informe primario bloquea el acceso automático]. Críticas metodológicas existen (elección del índice de referencia), pero el resultado se repite en todas las ediciones y regiones | **Sólido** |
| **Los costes importan y son lo más predecible** | ESMA (3-3-2026): los costes corrientes bajan sobre todo por fondos nuevos más baratos; los costes se restan año a año del resultado. El efecto acumulado de un 1 % anual de diferencia en 20–30 años es grande [D, aritmética] | **Sólido** |
| **Diversificar reduce el riesgo idiosincrático** | Bessembinder: la mayoría de acciones (55 % EE. UU., 57 % fuera, 1991–2020) rinde menos que las Letras del Tesoro de EE. UU. a lo largo de su vida; la riqueza la crean pocas. Tener «el mercado» evita perderse a esas pocas | **Sólido** |
| **Diversificación por capitalización = diversificación equilibrada** | En 2026, el top 10 pesa el 25 % del ACWI y EE. UU. el 64 % [O, MSCI] | **Discutible hoy**: un índice mundial está concentrado; diversificar puede requerir conciencia de ello |
| **Invertir de golpe vs aportaciones periódicas** | Vanguard: invertir de golpe gana ≈2/3 de las veces (62–74 % según mercado) a repartir en 12 meses; ventaja media ≈1,2–2,4 pp | **Sólido como promedio**; la elección depende del arrepentimiento que tolere la persona |
| **Aportaciones periódicas desde el sueldo** | No es una estrategia de timing: es la única forma de invertir para quien ahorra cada mes | **Sólido** (es aritmética del flujo) |
| **Brecha de comportamiento** | Morningstar *Mind the Gap* 2025: ≈1,2 pp/año (≈15 % de la rentabilidad) perdida por entradas y salidas. **Rebatido** por Fulkerson et al. (*Financial Analysts Journal*, 12-5-2026): con los mismos datos estiman ≈0,10 pp/año | **Discutible en magnitud**; el sentido (comprar caro tras subidas, vender tras caídas) es plausible, el tamaño no está claro |
| **El horizonte largo reduce la probabilidad de pérdida** | Datos históricos (§5.2) con contraejemplos (Japón) | **Sólido con matices** |
| **Rebalanceo periódico** | Mantiene el riesgo elegido; la mejora de rentabilidad es pequeña e inconsistente | **Sólido para riesgo, débil para rentabilidad** |
| **Valoración y rentabilidad futura** | CAPE explica ≈24–43 % de la varianza de rentabilidades a 10 años según periodo; ≈5 % a 1 año; ≈0 % a 1 mes (AQR, Vanguard) | **Sólido a 10 años, inútil para timing** |
| **Fiscalidad española favorece fondos frente a ETF para cambiar de fondo** | Traspasos entre fondos sin tributar (art. 94 LIRPF); ETF tributan al vender [2ª coincidente; verificar en AEAT] | **Sólido como norma**; la elección depende de costes y del uso de traspasos |

---

## 7. Market timing

### 7.1 Evidencia

- **Perfecto vs inmediato vs nunca** (Schwab, 20 años, 2.000 $/año): el inversor con timing perfecto acabó con ≈15.500 $ más que quien invertía al recibir el dinero (≈700 $/año); quien se quedó en efectivo esperando el momento acabó ≈104.000 $ **por detrás incluso del peor timing** posible (invertir cada año en el máximo) [I, Schwab]. **Conclusión: el coste de esperar supera de largo el beneficio de acertar.**
- **Invertir en máximos históricos** (1926–2025): rentabilidades a 1, 3 y 5 años tras un mes de máximo comparables a las de cualquier mes (13,8 / 10,6 / 10,4 % vs 12,5 / 10,8 / 10,4 %); el 31 % de los cierres mensuales fueron máximos [2ª, Dimensional y otros]. A 10 años la valoración pesa más.
- **Valoración como señal de timing**: a 1 año, poder explicativo ≈5 %; a 1 mes, ≈0 (AQR). Asness («Sin a little»): usar valoraciones para pequeños ajustes de largo plazo añade poco y con mucho error de seguimiento.
- **Mejores días**: perder los 10 mejores días de 20 años reduce mucho el resultado (J.P. Morgan), pero 7 de los 10 mejores días ocurrieron a menos de dos semanas de los 10 peores. **El argumento correcto** no es «nunca vendas por los mejores días», sino «nadie identifica de antemano ni los peores ni los mejores, y salir suele hacer perder ambos».
- **Efectivo esperando una caída**: el efectivo tiene coste de oportunidad cuando la prima de riesgo es positiva en promedio; además, quien espera una caída suele no invertir tampoco cuando llega (no hay evidencia cuantitativa sólida localizada sobre este segundo punto; **[Op]** plausible pero no probado).
- **LLM y predicción**: la capacidad aparente de los LLM para predecir rentabilidades se debe en parte a memorización de datos de entrenamiento (sesgo de anticipación); fuera de muestra, la mayoría de estrategias no bate comprar y mantener (Gao-Jiang-Yan 2025; KDD 2026 [2ª]).

### 7.2 Cómo debe hablar AXIS (guía de estilo)

| No decir | Decir |
|---|---|
| «Va a caer, espera.» | «Nadie puede saber si el mercado bajará en los próximos meses. Si este dinero es de largo plazo, esperar tiene un coste; si lo necesitas antes de X años, no debería estar en bolsa de todas formas.» |
| «Está muy caro, no inviertas.» | «Las valoraciones actuales son altas respecto a su historia; históricamente eso se ha asociado a rentabilidades más bajas a 10 años, no a caídas en una fecha concreta.» |
| «Es buen momento para comprar.» | «Las caídas forman parte de invertir a largo plazo. Si tu plan y tu colchón no han cambiado, la caída no cambia el plan.» |
| «El oro va a seguir subiendo.» | «El oro ha subido mucho en 2025–26 y ha corregido después; no genera rentas y su precio es difícil de anticipar.» |
| «Invierte ya para no perderte la subida.» | «Si es dinero de largo plazo, invertirlo de una vez ha funcionado mejor la mayoría de las veces; repartirlo unos meses reduce el arrepentimiento si cae justo después. Las dos opciones son razonables.» |

**Regla de redacción**: toda afirmación de mercado lleva **fecha + fuente + tipo** (dato/previsión/interpretación). Ninguna lleva futuro indicativo («subirá», «caerá»). Esto ya existe parcialmente en `lib/text/certainty.ts` y en `parseMarketResearch()`.

---

## 8. IA y mercado

### 8.1 Usos útiles (con IA)

| Uso | Valor | Condición |
|---|---|---|
| **Resumir comunicados oficiales** (BCE, Fed, INE) | Alto: textos largos, lenguaje técnico | Cifras extraídas por código, no por el modelo; el modelo solo redacta |
| **Detectar cambios de régimen macro** | Medio | La detección es determinista (umbrales); la IA solo describe |
| **Comparar escenarios oficiales** (BCE base vs adverso) | Medio-alto | Solo escenarios publicados; nunca inventados |
| **Extraer datos de documentos** | Medio | Validación contra la fuente; FinanceBench mostró hasta 81 % de fallos con RAG (2023) |
| **Detectar anomalías en los datos** (series congeladas, saltos imposibles) | **Alto y barato**: se puede hacer sin IA | Reglas deterministas (§9.4) |
| **Analizar la cartera del usuario** (concentración, solapamientos) | Alto | Cálculo determinista; IA solo explica |
| **Explicar riesgos** en lenguaje claro | Alto | Plantillas + Decision First |

### 8.2 Riesgos

| Riesgo | Ejemplo real visto en esta investigación |
|---|---|
| **Alucinación / mala lectura de tablas** | El resumidor automático describió la tabla de tipos del BCE como «tendencia bajista de 2025 a 2026» cuando el BCE ha **subido** en 2026 |
| **Datos desactualizados** | Pipeline de Finax con inflación de diciembre de 2025 etiquetada como contexto «fresco» |
| **Correlaciones falsas** | «El oro sube porque suben los tipos reales» (en 2026 se desacopló por compras oficiales) |
| **Sobreconfianza** | Previsiones de precio citadas como hechos |
| **Predicciones sin fundamento** | Memorización/sesgo de anticipación en LLM |
| **Noticia → recomendación** | «Ataque en Ormuz → vende bolsa» |
| **Fuentes secundarias contradictorias** | Tres Euríbor distintos para el mismo mes |

### 8.3 Salvaguardas propuestas

1. **Los números nunca los produce el modelo**: vienen de la capa de datos con fuente y fecha (ya es el principio del Market Research Engine actual).
2. **El modelo no decide**: Decision First ya lo garantiza para AXIS; extenderlo a la capa de mercado (el modelo nunca emite `stance` que active recomendaciones sin una regla determinista que lo respalde).
3. **Licencia cerrada de cifras** (como `figures.ts`): el texto de mercado solo puede citar cifras de la capa de datos.
4. **Lista de verbos prohibidos y certeza** (`certainty.ts`) aplicada también a interpretación de mercado; añadir patrones de timing («espera a», «aprovecha la caída», «antes de que suba»).
5. **Frescura por indicador** y **fecha visible** en cada cifra.
6. **Validación cruzada** de cifras críticas con dos fuentes cuando existan (p. ej., HICP de Eurostat vs el del BCE).
7. **Registro (trazabilidad)**: guardar qué datos, qué versión de reglas y qué modelo produjeron cada lectura.
8. **Sin herramientas ni búsqueda libre para el modelo** (ya es así en el diseño actual).

---

## 9. Arquitectura futura para Finax

### 9.1 Capas

```
DATOS            → observaciones crudas: valor, unidad, periodo, fecha de publicación, fuente, licencia, fetchedAt
   │  (determinista: fetch aislado por fuente, validación de esquema, unidades)
HECHOS           → datos validados y normalizados + derivados deterministas
   │              (variación interanual, tipo real aproximado, percentil frente a 10 años, distancia a máximo)
   │  (determinista: frescura POR indicador, detección de series congeladas, coherencia entre fuentes)
INTERPRETACIÓN   → clasificación de régimen por reglas con umbrales documentados
   │              («inflación por encima del objetivo y subiendo», «tipos reales positivos», «valoración alta vs su historia»)
   │              + narrativa opcional de IA, limitada a citar hechos (licencia de cifras)
DECISIÓN         → motor de AXIS (§4): situación del usuario primero; mercado solo como modulador explicativo
   │  (determinista; en el dispositivo; nunca sale a la IA de mercado)
RECOMENDACIÓN    → Decision First: el modelo expresa, AXIS valida (cifras, certeza, consejos, cobertura)
```

### 9.2 Qué es determinista y qué puede delegarse a IA

| Componente | Determinista | IA (opcional) |
|---|---|---|
| Recogida de datos, validación, frescura, derivados | ✅ | ❌ |
| Detección de anomalías y de series congeladas | ✅ | ❌ |
| Clasificación de régimen (umbrales) | ✅ | ❌ |
| Resumen de comunicados oficiales y noticias | — | ✅ (sin cifras propias) |
| Decisión para el usuario | ✅ | ❌ |
| Redacción final | plantilla local | ✅ con Decision First |

### 9.3 Encaje con lo existente

- Reutilizar `scripts/market/sources/*`, `lib/market/validate.ts`, `freshness.ts`, `relevance.ts` y el patrón de presupuesto (`budget.ts`).
- Extender `MarketIndicator` con: `period` (lo que mide) separado de `publishedAt`, `kind` (`observed` | `projection` | `derived`), `license` (`open-reuse` | `restricted`), y frescura propia (`fresh`/`aging`/`stale` según la cadencia esperada de **esa** serie: un IPC mensual es «fresco» hasta ~45 días tras su periodo; un tipo diario, unos pocos días).
- `MarketContext` reducido sigue siendo la única entrada de AXIS; añadir `regimes` deterministas.

### 9.4 Validaciones de calidad propuestas

| Validación | Ejemplo que habría detectado |
|---|---|
| **Serie congelada**: último periodo más antiguo que la cadencia esperada + margen | Inflación INE/Eurostat parada en 2025-12 |
| **Salto imposible**: variación fuera de rango plausible | Errores de unidades |
| **Coherencia entre fuentes**: dos fuentes oficiales del mismo dato no difieren más de X | HICP Eurostat vs BCE |
| **Fuente caída persistente**: la misma fuente falla N ejecuciones seguidas | BCE (DFR) y BCE (Euríbor) en `failedSources` |
| **Etiqueta de periodo**: media mensual vs cierre vs intradía | Oro |

---

## 10. Proveedores de datos

**Precios y límites tomados de fuentes secundarias en octubre de 2026: verificar en la web del proveedor antes de cualquier decisión.**

| Proveedor | Cobertura | Calidad | Frecuencia | Coste / límites (verificar) | Histórico | ETF/índices | Acciones | Bonos | Macro | Noticias | Integración | Licencia / redistribución |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **BCE Data Portal** | Tipos, Euríbor (mensual), tipos de cambio, EURO STOXX 50 (media mensual), rendimientos soberanos | Oficial | Diaria/mensual | Gratis, sin clave | Largo | Parcial | No | Curvas soberanas | Sí | RSS | SDMX (ya integrado) | **Reutilización libre citando fuente, sin modificar** |
| **Eurostat** | HICP, PIB, paro | Oficial | Mensual/trimestral | Gratis | Largo | No | No | No | Sí | No | JSON-stat (integrado; **cambiar a `prc_hicp_minr`**) | Abierta |
| **INE** | IPC, IPV, EPA | Oficial | Mensual/trimestral | Gratis | Largo | No | No | No | Sí | Notas de prensa | API Tempus (integrado; **actualizar a base 2025**) | Abierta (verificar condiciones) |
| **Banco de España** | Euríbor diario, tipos de depósitos, IBEX (tablas) | Oficial | Diaria/mensual | Gratis | Largo | IBEX | No | Tipos | Sí | RSS | CSV (integrado) | Política del SEBC; **IBEX puede ser dato de terceros** (BME): verificar |
| **Tesoro Público** | Resultados de subastas de Letras y bonos | Oficial | Por subasta | Gratis | Largo | No | No | **Sí** | No | No | Web/PDF (sin API conocida, verificar) | Abierta (verificar) |
| **FRED** | Macro EE. UU., Treasuries, VIX, diferenciales, S&P 500 (10 años) | Distribuidor oficial | Diaria | Gratis con clave | Largo (S&P solo 10 años) | Algunos índices | No | Sí | Sí | No | JSON (integrado opcional) | **Mixta: S&P 500 «reproducción prohibida sin permiso»; ICE BofA con restricciones** |
| **FMI (PCPS/SDMX)** | Materias primas (oro, petróleo) mensual | Oficial | Mensual | Gratis | Largo | No | No | No | Sí | No | SDMX CSV | Abierta (verificar) |
| **EIA** | Petróleo, gas, previsiones STEO | Oficial | Semanal/mensual | Gratis con clave | Largo | No | No | No | Energía | Sí | API | Dominio público EE. UU. |
| **GDELT DOC 2.0** | Noticias globales | Variable | Continua | Gratis, 1 petición/5 s | 3 meses | — | — | — | — | **Sí** | URL simple | Abierta; contenidos de terceros |
| **Alpha Vantage** | Acciones/ETF (EE. UU. sobre todo), FX, macro | Media | Diaria/intradía | Gratis 25 peticiones/día; premium desde ≈50 $/mes | Largo | Sí (EE. UU.) | Sí | Limitado | Algo | Sí | REST | Uso no comercial en gratuito; **redistribución no** |
| **Tiingo** | EOD acciones/ETF/fondos | Buena | Diaria | Gratis 1.000/día, 500 símbolos/mes; ≈10 $/mes power | Largo | Sí | Sí | No | No | De pago | REST | **Solo uso personal interno**; redistribución bajo licencia |
| **EODHD** | EOD global incl. ETF europeos (Xetra, etc.) | Buena | Diaria | Desde ≈20 $/mes; todo-en-uno ≈100 $/mes | Largo | **Sí (UCITS)** | Sí | Algo | Algo | Sí | REST | **Uso personal**; redistribución con licencia |
| **Twelve Data** | Global; Europa en planes de pago | Buena | Tiempo real/diaria | Gratis 800 créditos/día (EE. UU.); Europa desde ≈79 $/mes | Medio | Sí | Sí | No | No | No | REST/WebSocket | Restringida |
| **Yahoo Finance (no oficial)** | Amplia | Variable | — | — | — | — | — | — | — | — | — | **Descartado**: no permite acceso automatizado (ya descartado en `SPIKE_GOLD_SOURCES.md`) |
| **Stooq** | — | — | — | — | — | — | — | — | — | — | — | **Descartado** (desafío anti-bot; ya descartado) |
| **MSCI factsheets** | Valoración, pesos, composición mensual | Alta | Mensual | Gratis (PDF) | — | Sí | No | No | No | No | PDF → texto (frágil) | **Restrictiva**; usar solo como referencia citada, no redistribuir |

**Hallazgo de licencias**: el diseño actual publica `latest.json` en una **rama pública** de GitHub. Eso es compatible con BCE/Eurostat/INE (reutilización libre con cita), pero **no** con datos de S&P DJI vía FRED, ni con proveedores comerciales de «uso personal». Ver §15 y §16.

**Recomendación [Op]**: priorizar fuentes oficiales para macro, tipos e inflación (ya integradas). Para el precio de ETF concretos del usuario, si algún día se necesita, usarlos **solo en el dispositivo o en el servidor sin republicar**, con un proveedor de uso personal (EODHD o Tiingo) y bajo una decisión explícita.

---

## 11. Regulación y seguridad

**Aviso: esto no es asesoramiento jurídico.** Resume fuentes públicas; si Finax se ofrece a terceros, hay que consultarlo con la CNMV o con un profesional.

### 11.1 Información frente a asesoramiento (UE/España)

- **Asesoramiento en materia de inversión** (MiFID II, art. 4.1.4; Reglamento Delegado 2017/565, art. 9): prestar **recomendaciones personalizadas** a un cliente sobre operaciones con **instrumentos financieros concretos**. Es personalizada si se presenta **como idónea** para esa persona o se basa en sus circunstancias. Lo decisivo es **cómo se presenta**, no si es realmente adecuada (ESMA, supervisory briefing ESMA35-43-3861, 11-7-2023).
- **CNMV**: los elementos son (1) dirigida a un inversor concreto y basada en sus circunstancias, (2) sobre operaciones e instrumentos específicos, (3) por un canal no genérico. Si falta alguno, es **información o recomendación genérica**, fuera del concepto de servicio de inversión. El asesoramiento personalizado requiere autorización.
- **Implicación para AXIS**:
  - Hablar de **clases de activo** («renta variable global diversificada», «renta fija de corto plazo», «depósito») y de **principios** está, en general, del lado de la información o educación.
  - Recomendar un **producto concreto** (ISIN, nombre de un fondo o ETF) como adecuado para la situación del usuario se acerca mucho al asesoramiento.
  - El uso **estrictamente personal** (el usuario construye una herramienta para sí mismo) no es «prestar un servicio a clientes»; **si Finax se abre a otras personas, cambia el análisis**.

### 11.2 Otras piezas relevantes

| Norma / guía | Qué implica para AXIS | Estado |
|---|---|---|
| **ESMA, declaración pública sobre IA en servicios de inversión minorista** (30-5-2024) | Si una empresa usa IA en servicios de inversión: actuar en el mejor interés del cliente, transparencia, gobernanza, registro. Riesgos citados: sesgos, opacidad, dependencia excesiva y privacidad | Vigente |
| **Reglamento de IA, art. 50** | Los chatbots deben informar de que el usuario interactúa con una IA, salvo que sea evidente. **Aplicable desde el 2-8-2026** (no aplazado por el Digital Omnibus, según varias fuentes) | Vigente |
| **Reglamento de IA, alto riesgo (Anexo III)** | Incluye solvencia y precios de seguros, **no** el asesoramiento de inversión como tal; calendario aplazado a diciembre de 2027 por el Omnibus [2ª] | Revisar si cambia |
| **Estrategia de Inversión Minorista (RIS)** | Marco de *value for money* en MiFID II; acuerdo político en diciembre de 2025, texto respaldado por el Consejo en junio de 2026, pendiente de pleno y publicación; aplicación ≈2028 [2ª] | En curso |
| **Recomendaciones de inversión (MAR) y *finfluencers*** | La CNMV ha publicado guías sobre los límites entre recomendación, asesoramiento y marketing | Vigente |

### 11.3 Límites propuestos para AXIS [Op]

1. **Nunca** recomendar un instrumento concreto (ISIN, nombre comercial) como idóneo. Como mucho, categorías y criterios («busca bajo coste, amplia diversificación, entiende la divisa»).
2. **Nunca** ejecutar ni simular la ejecución de operaciones (ya es así).
3. Recomendaciones de **finanzas personales** (colchón, gasto, objetivos) sí, con las mismas reglas deterministas de hoy.
4. Toda lectura de mercado con **fecha, fuente y tipo**; aviso fijo «no es asesoramiento financiero» (ya existe en el pipeline).
5. **Trazabilidad**: guardar en el dispositivo qué datos y qué versión de reglas produjeron cada recomendación.
6. **Transparencia de IA**: ya se identifica el motor («Motor local de reglas» / IA); mantenerlo siempre visible.
7. **Revisión humana**: antes de abrir Finax a terceros, revisión jurídica del perímetro de asesoramiento.

---

## 12. Experiencia: «Tengo 500 € disponibles, ¿qué hago?»

### 12.1 Comprobaciones en orden (deterministas)

1. **¿Son realmente disponibles?** ¿Están ya destinados a un objetivo (reparto en cascada, Fase A/B)? ¿Por debajo de la liquidez mínima declarada?
2. **¿El flujo mensual es positivo?** (meses cerrados: gasto habitual < ingreso habitual).
3. **¿Hay colchón?** Liquidez libre ≥ N meses de gasto habitual (3/6 según estabilidad).
4. **¿Hay objetivos con fecha cercana** que no estén cubiertos?
5. **¿Qué horizonte tendría este dinero?** (pregunta al usuario si no se sabe).
6. **¿Hay inversiones existentes y concentración?**
7. **Contexto de mercado**: solo si todo lo anterior apunta a dinero de largo plazo, y solo como explicación.

### 12.2 Estructura de la respuesta (Decision First)

1. **Lectura** (hechos): «Tienes X € líquidos; Y € están destinados a tus objetivos; tu gasto habitual es Z €/mes.»
2. **Clasificación de los 500 €** (sin inventar cifras):
   - *Dinero que debería conservar*: lo que falte para el colchón.
   - *Dinero para objetivos*: lo que el reparto asignaría (es automático).
   - *Dinero que podría ahorrar sin riesgo*: corto plazo.
   - *Dinero que podría invertir*: solo el excedente de largo plazo.
   - *Dinero que no debería arriesgar*: el que necesite antes de 2 años.
3. **Recomendación** (una sola, determinista).
4. **Alternativas** razonables.
5. **Incertidumbres** (datos y mercado con fecha).
6. **Siguiente paso** ejecutable en Finax.

### 12.3 Ejemplos de salida (conceptuales)

- **Sin colchón**: «Con tu gasto habitual de 900 €/mes, tu colchón cubriría menos de un mes. **No invertiría estos 500 € ahora**: lo prioritario es tener al menos tres meses disponibles sin riesgo. Puede estar en una cuenta o depósito; hoy esos instrumentos rinden menos que la inflación (IPC 4,9 %, INE, septiembre de 2026), pero su función es estar disponibles.»
- **Con colchón y objetivo cercano**: «Tus 500 € entran automáticamente en «Viaje» (1.º del reparto), que necesitas en 8 meses. Para ese plazo, lo razonable es mantenerlos sin riesgo.»
- **Con colchón, sin objetivos cercanos y horizonte largo declarado**: «Este dinero podría tener horizonte largo. La evidencia favorece una inversión diversificada y de bajo coste, y hacerlo de forma periódica si te preocupa entrar justo antes de una caída. Las valoraciones actuales son altas respecto a su historia (MSCI ACWI, PER adelantado 16,3, 30-9-2026): eso apunta a expectativas más moderadas a 10 años, no a una caída en una fecha concreta. No puedo recomendarte un producto concreto.»

---

## 13. Casos de prueba (24 escenarios)

Formato: **Contexto → Detectar → Recomendar (conceptual) → NO recomendar.**

| # | Contexto | AXIS debería detectar | Recomendación conceptual | NO debería recomendar |
|---|---|---|---|---|
| 1 | 30.000 € líquidos, sin objetivos, gasto 1.200 €/mes, ingresos estables | Colchón sobrado (25 meses); excedente sin destino | Fijar objetivos; separar colchón (3–6 meses) y valorar el resto como largo plazo | «Invierte los 30.000 € ya en X»; productos concretos |
| 2 | 800 € líquidos, gasto 1.500 €/mes > ingreso 1.400 € | Flujo negativo; colchón insuficiente | Reducir gasto; reforzar colchón | Invertir; «compensa con rentabilidad» |
| 3 | Objetivo «entrada piso» 15.000 € en 10 meses, cubierto al 80 % | Horizonte corto | Mantener sin riesgo; seguir ahorrando | Renta variable para «llegar antes» |
| 4 | Objetivo «jubilación» sin fecha, a 25 años | Horizonte largo | Inversión diversificada periódica si hay colchón | Liquidez indefinida «por si cae» |
| 5 | Ingresos estables, colchón de 4 meses, excedente mensual 300 € | Capacidad de ahorro estable | Aportaciones periódicas del excedente de largo plazo | Esperar al «momento» |
| 6 | Ingresos irregulares (autónomo), colchón de 3 meses | Colchón insuficiente para irregulares | Subir colchón a ~6 meses antes de invertir | Mismo umbral que un asalariado |
| 7 | Mercado cayendo −20 % en un mes; usuario con cartera diversificada de largo plazo y colchón | Caída; plan intacto | Mantener; explicar que es normal; seguir aportaciones | «Vende para protegerte»; «compra todo ahora» |
| 8 | Mercado +30 % en un año; usuario pregunta si vender | Subida; ¿desviación del reparto elegido? | Rebalancear solo si se ha desviado del reparto que eligió; si no, mantener | «Vende, está caro» |
| 9 | Valoraciones altas (CAPE en percentil alto); usuario con dinero de largo plazo | Expectativa a 10 años más baja | Invertir igualmente si encaja; moderar expectativas; diversificar | «No inviertas hasta que baje» |
| 10 | Valoraciones bajas tras caída; usuario sin colchón | Sin colchón | Colchón primero | «Aprovecha, es barato» |
| 11 | 90 % del patrimonio invertido en una sola acción | Concentración extrema | Revisar diversificación (sin vender por timing); explicar riesgo idiosincrático | «Mantén, ha subido mucho» o «vende ya» |
| 12 | Cartera en un fondo mundial indexado + colchón | Diversificado (con concentración del índice) | No hacer nada; explicar que el índice mundial pesa 64 % EE. UU. | Cambiar de producto sin motivo |
| 13 | Usuario sin experiencia, pregunta «¿qué es un ETF?» | Pregunta educativa | Explicación genérica + riesgos + horizonte | Recomendar un ETF concreto |
| 14 | Usuario: «Quiero esperar a que caiga para entrar» con dinero de largo plazo | Intención de timing | Explicar el coste de esperar (evidencia) y la opción periódica | «Buena idea, espera» o «error, entra ya todo» |
| 15 | Usuario quiere invertir dinero que necesita en 6 meses | Horizonte corto incompatible | No invertir ese dinero; alternativa sin riesgo | Cualquier activo volátil |
| 16 | Contexto de mercado desactualizado (stale) | Datos viejos | Advertir; recomendaciones solo personales | Lecturas de mercado |
| 17 | Inflación 5 %, colchón en depósito al 1,8 % | Rentabilidad real negativa del colchón | Mantener el colchón; mejorar rentabilidad sin riesgo (depósito mejor, Letras) | Invertir el colchón en bolsa |
| 18 | Tipos altos (Letras ≈3 %), objetivo a 2 años | Renta fija corta atractiva | Instrumentos sin riesgo de plazo similar | «Bonos largos porque pagan más» |
| 19 | Noticia geopolítica grave (ataque en Ormuz) | Evento | Contexto con fecha; plan intacto | «Vende» / «compra oro» |
| 20 | Usuario con liquidez mínima declarada de 5.000 € y 6.000 € líquidos | Margen libre de 1.000 € | Solo el margen es disponible | Usar el mínimo |
| 21 | Objetivo cubierto al 100 % por el reparto pero aún no conseguido | «Cubierto» | No mover; recordar marcar «Conseguido» al usarlo | Invertir ese dinero |
| 22 | Ingreso recurrente previsto de 35 €/mes, sin ingresos reales este mes | Previsión ≠ dinero | Planificar con dinero real; previsión solo como horizonte | Contar la previsión como disponible |
| 23 | Usuario con 3 fondos que replican casi el mismo índice | Falsa diversificación | Explicar solapamiento | «Añade un cuarto» |
| 24 | Usuario pregunta «¿subirá el oro?» | Petición de predicción | Explicar qué mueve el oro, sin predecir; fecha del dato | Cualquier predicción |

---

## 14. Conclusiones

### 14.1 Los 10 descubrimientos más importantes

1. **2026 es un entorno de shock energético con inflación al alza y bancos centrales subiendo tipos** (BCE 2,50 %, Fed 3,75–4,00 %), no de bajadas.
2. **Los tipos largos están en máximos de casi 20 años** (Treasury 10 años 5,24 %), en parte por el auge inversor en IA según el BCE.
3. **El índice mundial está muy concentrado**: EE. UU. 64 %, tecnología 33 %, top 10 25 % del ACWI. Un fondo mundial ya no es tan «neutral» como parece.
4. **El efectivo pierde poder adquisitivo hoy** (depósitos ≈1,8 %, Letras ≈2,8 % frente a IPC 4,9 %), sin que eso convierta el colchón en dinero invertible.
5. **El pipeline de mercado de Finax muestra una inflación congelada en diciembre de 2025** por un cambio de series oficiales, y no sabe que el BCE ha subido tipos.
6. **La frescura medida por investigación, no por indicador, oculta datos viejos.**
7. **El mayor riesgo de una capa de mercado no es la falta de datos, sino la mala interpretación**: medias frente a intradía, avances frente a definitivos, proyecciones presentadas como datos y resúmenes de IA erróneos.
8. **La evidencia sólida está en la gestión personal** (colchón, horizonte, costes, diversificación, constancia), no en la lectura del mercado.
9. **Algunas «verdades» populares son discutibles en magnitud**: la brecha de comportamiento del 15 % (rebatida en el FAJ 2026), los «mejores días» y el «0 % de pérdidas a 15 años» (sesgo hacia EE. UU.).
10. **Las licencias importan**: publicar en abierto datos de S&P DJI o de proveedores de «uso personal» es un riesgo con la arquitectura actual de rama pública.

### 14.2 Los 10 principios que deberían gobernar AXIS

1. **La estabilidad va primero**: flujo positivo y colchón antes que invertir.
2. **El dinero tiene horizonte**: corto (< 2 años) no se arriesga; largo (> 7 años) puede invertirse.
3. **El mercado no decide, contextualiza**: nunca abre ni cierra la puerta a invertir por sí solo.
4. **Barato no significa «invierte»; caro no significa «vende».**
5. **Diversificar y vigilar costes** son las palancas más fiables, sabiendo que un índice mundial también está concentrado.
6. **Nada de predicciones**: sin futuros indicativos; incertidumbre explícita.
7. **Cada cifra con fecha, fuente y tipo** (dato, previsión o interpretación).
8. **Las reglas deciden y la IA explica** (Decision First), con una licencia cerrada de cifras.
9. **Clases de activo, no productos**: sin ISIN ni nombres comerciales.
10. **«No hacer nada» es una respuesta válida** cuando el plan está en marcha.

### 14.3 Datos de mercado prioritarios

1. Inflación de España y de la eurozona, general y subyacente, con avance y definitivo.
2. Tipo de depósito del BCE y Euríbor 12M.
3. Letras del Tesoro y bonos españoles a 2, 5 y 10 años.
4. Remuneración media de depósitos (Banco de España).
5. Valoración y concentración de un índice global amplio (mensual).
6. Caída desde máximos y volatilidad de ese índice.
7. EUR/USD (tipo de referencia del BCE).
8. Proyecciones del BCE y del Banco de España con sus escenarios.

### 14.4 Mejores fuentes

BCE (Data Portal y comunicados), Eurostat (`prc_hicp_minr`), INE (base 2025), Banco de España, Tesoro Público, FRED solo para series de dominio público, FMI PCPS, EIA, MSCI (factsheets, solo como referencia citada) y, como evidencia, Vanguard, AQR, UBS/DMS, ESMA y SPIVA.

### 14.5 Arquitectura recomendada

DATOS → HECHOS → INTERPRETACIÓN → DECISIÓN → RECOMENDACIÓN (§9):
- Determinista en todo salvo la redacción.
- Frescura por indicador.
- Licencia por dato.
- La decisión siempre en el dispositivo.

### 14.6 Principales riesgos

1. Datos viejos presentados como actuales.
2. Una IA que convierta noticias en recomendaciones.
3. Cruzar la línea del asesoramiento personalizado.
4. Licencias de datos.
5. Sobreconfianza en relaciones históricas (CAPE, probabilidades de pérdida).
6. Que el usuario use AXIS como predictor.

### 14.7 Qué implementar primero (propuesta de orden)

1. **Corregir las series de inflación** (Eurostat `prc_hicp_minr`, INE base 2025) y las fuentes caídas del BCE (§15).
2. **Frescura por indicador** y detección de series congeladas.
3. **Etiquetas de tipo y periodo** en `MarketIndicator` (observado, proyección o derivado; media, cierre o avance).
4. **Revisar licencias** del contenido publicado en la rama pública.
5. **Peldaños 1 y 2 del motor** (flujo y colchón), que se apoyan en datos que Finax ya tiene (Fase 5) y no necesitan mercado.
6. Tipos de Letras y depósitos como contexto del colchón.

### 14.8 Qué NO construir todavía

Ver §18.

---

## 15. Hallazgos sobre el código actual de Finax

**Ninguno se ha corregido. Se documentan para decidir.**

| # | Hallazgo | Evidencia | Impacto | Corrección propuesta |
|---|---|---|---|---|
| H1 | **La inflación de la eurozona está congelada en diciembre de 2025** | `scripts/market/sources/inflation.ts` consulta `prc_hicp_manr`; la API devuelve como último periodo 2025-12 (dataset actualizado el 6-2-2026). Eurostat lo sustituyó por `prc_hicp_minr` (dimensión `coicop18`, total `TOTAL`), que devuelve 2026-07: 2,9; 08: 3,2; 09: 3,8 (comprobado el 5-10-2026, solo lectura) | AXIS muestra un 2,0 % cuando el dato es 3,8 % | Cambiar a `prc_hicp_minr?geo=EA&coicop18=TOTAL&unit=RCH_A` |
| H2 | **El IPC de España está congelado en diciembre de 2025** | La serie `IPC251856` devuelve 2025-10/11/12 (3,1 / 3,0 / 2,9 %). El INE implantó la base 2025 con ECOICOP v2 en enero de 2026 | AXIS muestra un 2,9 % cuando el avance de septiembre es 4,9 % | Localizar el código de la serie equivalente en base 2025 (no identificado en esta investigación) |
| H3 | **Fallan las fuentes BCE (DFR) y BCE (Euríbor)** | `latest.json` 2026-W40: `failedSources` | AXIS no sabe que el BCE subió en junio y en septiembre | Diagnosticar el endpoint (posible cambio de clave de serie) |
| H4 | **La frescura se mide por `generatedAt` de la investigación, no por indicador** | `lib/market/freshness.ts` / `rules/market.ts` | Una investigación «fresca» transmite datos de hace 9 meses sin avisar | Frescura por indicador según su cadencia (§9.3) |
| H5 | **Riesgo de licencia en la rama pública** | FRED marca el S&P 500 como «reproducción prohibida sin permiso»; `fred.ts` incluye S&P 500 y Nasdaq 100 si existe `FRED_API_KEY`; la rama `market-data` es pública | Posible incumplimiento de licencia si se activa | No publicar series con licencia restrictiva; mantenerlas fuera del JSON público |
| H6 | **IBEX 35 vía Banco de España** | Las tablas del BdE incluyen el IBEX, que es un índice de BME; la política del SEBC excluye los «datos de terceros» de la reutilización libre | Incertidumbre de licencia | Verificar condiciones con BdE/BME |
| H7 | **AXIS no tiene datos de deudas** | No hay entidad de deuda en Finax | El peldaño 3 del motor no es evaluable | Fase futura, si se considera necesario |
| H8 | **`riskAttitude` y `horizon` solo matizan texto** | Fases anteriores | No pueden aún modular un reparto | Definir su papel en el peldaño 6 (con aprobación) |

Además, durante la investigación **se detuvo el servidor de desarrollo** (`pnpm dev`) al agotar su límite de tiempo en segundo plano; no se ha reiniciado.

---

## 16. Decisiones pendientes de aprobación

| # | Decisión | Opciones | Recomendación [Op] |
|---|---|---|---|
| D1 | ¿Corregimos ya las series de inflación (H1/H2) y el BCE (H3)? | Ahora / en la próxima fase de mercado | **Ahora**, en un cambio pequeño y aislado: es un error de datos visible |
| D2 | Frescura por indicador (H4) | Sí / no | Sí, antes de cualquier ampliación |
| D3 | Política de licencias de la rama pública (H5/H6) | Solo fuentes abiertas / repositorio privado / sin republicar | **Solo fuentes de reutilización abierta** en el JSON público |
| D4 | ¿AXIS hablará de clases de activo concretas? | Nunca / clases genéricas / productos | **Clases genéricas**, nunca productos |
| D5 | Meses de colchón | 3/6 fijos / configurables / según estabilidad observada | 3 con ingresos estables, 6 con irregulares, ajustable por el usuario |
| D6 | Frontera de horizontes | < 2 / 2–7 / > 7 años u otra | Esta, documentada y visible |
| D7 | ¿Añadir deudas a Finax para el peldaño 3? | Sí / no | Valorarlo en una fase de producto aparte |
| D8 | ¿Usar `riskAttitude` para la mezcla de renta variable y fija? | Solo texto / reparto orientativo | Solo texto hasta resolver D4 y §11 |
| D9 | Proveedor de precios de ETF (si alguna vez se necesita) | Ninguno / EODHD / Tiingo | **Ninguno por ahora**; las posiciones siguen siendo manuales |
| D10 | ¿Se abrirá Finax a otras personas? | No / sí | Si sí, **revisión jurídica previa** del perímetro de asesoramiento (§11) |

---

## 17. Ideas para futuras fases

1. **Detector de series congeladas**: alerta automática en el workflow `market-light` (sin IA).
2. **«Tipo real del colchón»**: mostrar en Mi Dinero lo que rinde el efectivo frente a la inflación, con fecha, sin recomendar invertirlo.
3. **Escenarios oficiales en lenguaje claro**: base y adverso del BCE y del Banco de España, citados tal cual.
4. **Explicador de la concentración del índice**: «si tienes un fondo mundial, el X % está en EE. UU.».
5. **Diario de decisiones del usuario**: guardar por qué decidió invertir o esperar, para revisarlo después y reducir el sesgo retrospectivo.
6. **Modo «pregunta de timing»**: plantilla Decision First específica para «¿espero a que baje?» (§7.2).
7. **Glidepath de objetivos**: un objetivo que se acerca a su fecha pasa de largo a medio y corto plazo, y AXIS lo comunica.
8. **Validación cruzada de cifras críticas** entre dos fuentes oficiales.
9. **Registro de procedencia** en cada lectura de AXIS (datos, reglas y modelo).
10. **Calendario de publicaciones oficiales** (IPC, BCE) para saber cuándo un dato quedará viejo.

---

## 18. No implementar todavía

- Recomendaciones de inversión en AXIS (ni clases de activo ni productos), hasta aprobar D4 y revisar §11.
- Conexión con APIs comerciales de precios.
- Precios en tiempo real o intradía.
- Señales basadas en valoración, momentum o sentimiento que activen recomendaciones.
- Predicciones de precio, de tipos o de recesión, en cualquier forma.
- Uso de IA para extraer cifras o decidir; sí, en su caso, para redactar.
- Búsqueda libre en internet por parte del modelo.
- Ampliar la rama pública con datos de licencia restringida.
- Asignación automática de cartera o rebalanceo automático.
- El colchón dentro del reparto de objetivos (pendiente de la Fase B de objetivos).

---

## 19. Fuentes consultadas

Consultadas el 5-10-2026 salvo indicación. «2ª» = fuente secundaria.

**Bancos centrales y organismos oficiales**
- BCE · tipos de interés oficiales: https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html
- BCE · decisiones y declaración de política monetaria, 10-9-2026: https://www.ecb.europa.eu/press/press_conference/monetary-policy-statement/shared/pdf/ecb.ds260910~fbf0ab9b8d.en.pdf
- BCE · P. R. Lane, «Diagnostic Challenges for ECB Monetary Policy», 5-10-2026: https://www.ecb.europa.eu/press/key/date/2026/html/ecb.sp261005~1d8d998ef4.en.html
- BCE · tipos de cambio de referencia (5-10-2026): https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html
- BCE · política de reutilización de estadísticas del SEBC: https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.es.html
- Fed · comunicado del FOMC, 16-9-2026: https://www.federalreserve.gov/newsevents/pressreleases/monetary20260916a.htm
- Fed · proyecciones (SEP), 16-9-2026: https://www.federalreserve.gov/monetarypolicy/fomcprojtabl20260916.htm
- FMI · WEO Update, julio de 2026: https://www.imf.org/en/publications/weo/issues/2026/07/08/world-economic-outlook-update-july-2026
- FMI · GFSR, abril de 2026: https://www.imf.org/en/publications/gfsr/issues/2026/04/14/global-financial-stability-report-april-2026
- FMI · PCPS, oro mensual: https://api.imf.org/external/sdmx/2.1/data/IMF.RES,PCPS/G001.PGOLD.USD.M?startPeriod=2025-09&format=csv
- OCDE · Economic Outlook Interim, septiembre de 2026: https://www.oecd.org/en/publications/oecd-economic-outlook-interim-report-september-2026_f751d02b-en.html
- Banco de Inglaterra · Financial Stability Report, julio de 2026: https://www.bankofengland.co.uk/financial-stability-report/2026/july-2026
- EIA · *Today in Energy*, 3T 2026 (5-10-2026): https://www.eia.gov/todayinenergy/detail.php?id=68245
- EIA · STEO: https://www.eia.gov/outlooks/steo/

**Estadísticos**
- Eurostat · inflación flash de septiembre de 2026 (2-10-2026): https://ec.europa.eu/eurostat/web/products-euro-indicators/w/2-02102026-ap
- Eurostat · API `prc_hicp_minr` (comprobada): https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=EA&coicop18=TOTAL&unit=RCH_A&lastTimePeriod=3&format=JSON
- Eurostat · información sobre los conjuntos de datos del HICP (ECOICOP v2): https://ec.europa.eu/eurostat/web/hicp/information-data
- INE · IPC indicador adelantado de septiembre de 2026: https://www.ine.es/dyngs/Prensa/adIPC0926.htm
- INE · IPV 2T 2026: https://www.ine.es/dyngs/Prensa/IPV2T26.htm
- INE · EPA 2T 2026: https://www.ine.es/dyngs/Prensa/EPA2T26.htm
- INE · cambio de base del IPC 2025: https://www.ine.es/normativa/leyes/cse/proyecto_CambiodeBaseIPC2025.pdf
- BLS · IPC de agosto de 2026: https://www.bls.gov/news.release/cpi.nr0.htm
- BLS · empleo de septiembre de 2026: https://www.bls.gov/news.release/empsit.nr0.htm (cifras vía 2ª)
- FRED · DGS10, T10YIE, BAMLH0A0HYM2, VIXCLS, SP500: https://fred.stlouisfed.org/series/DGS10 (y equivalentes)

**Proveedores de índices y datos**
- MSCI · fichas del ACWI y del World (30-9-2026): https://www.msci.com/documents/10199/255599/msci-acwi-net.pdf
- FactSet · S&P 500 Earnings Season Preview 3T 2026 (2-10-2026): https://insight.factset.com/sp-500-earnings-season-preview-q3-2026
- World Gold Council · Gold Demand Trends 2T 2026: https://www.gold.org/download/file/20967/GDT-Q2-2026-Executive-Summary.pdf
- Pipeline de Finax · `latest.json` 2026-W40: https://raw.githubusercontent.com/Alex808keoic/echo/market-data/latest.json

**Evidencia sobre inversión**
- S&P DJI · SPIVA Europa (acceso bloqueado; cifra vía 2ª): https://www.spglobal.com/spdji/en/spiva/article/spiva-europe
- Morningstar · Mind the Gap 2025: https://www.morningstar.com/personal-finance/fund-investors-who-kept-it-simple-captured-more-return
- Fulkerson, Jordan, Riley y Yan · «Bad Timing Does Not Cost Investors 15% of Their Funds' Returns», FAJ, 12-5-2026: https://rpc.cfainstitute.org/research/financial-analysts-journal/2026/bad-timing-does-not-cost-investors-funds-returns
- Vanguard · cost averaging vs. invertir de una vez: https://corporate.vanguard.com/content/dam/corp/research/pdf/cost_averaging_invest_now_or_temporarily_hold_your_cash.pdf
- Schwab · «Does Market Timing Work?»: https://www.schwab.com/learn/story/does-market-timing-work
- AQR · «Market Timing: Sin a Little»: https://www.aqr.com/-/media/AQR/Documents/Insights/White-Papers/Market-Timing-Sin-a-Little.pdf
- Bessembinder · «Do stocks outperform Treasury bills?»: https://wpcarey.asu.edu/department-finance/faculty-research/do-stocks-outperform-treasury-bills
- UBS / Dimson-Marsh-Staunton · Global Investment Returns Yearbook 2026: https://www.ubs.com/global/en/media/display-page-ndp/en-20260303-global-investment-returns-yearbook-2026.html
- ESMA · Costs and Performance of EU Retail Investment Products 2025 (3-3-2026): https://www.esma.europa.eu/press-news/esma-news/new-investment-funds-drive-reduction-costs-investors
- Dimensional · «Why a Stock Peak Isn't a Cliff»: https://www.dimensional.com/ie-en/insights/why-a-stock-peak-isnt-a-cliff
- Vanguard · rentabilidad inicial y resultado de los bonos: https://www.vanguard.co.uk/professional/insights-education/insights/what-do-higher-starting-yields-mean-for-the-bond-outlook
- Investigación de la Fed sobre ahorro líquido (FEDS 2021-076): https://www.federalreserve.gov/econres/feds/files/2021076pap.pdf

**IA y finanzas**
- FinanceBench (Islam et al., 2023): https://www.alphaxiv.org/abs/2311.11944v1
- Gao, Jiang y Yan · «Detecting Lookahead Bias in LLM Forecasts» (dic. 2025): https://arxiv.org/abs/2512.23847
- IOSCO · AI in Capital Markets (consulta, 12-3-2025): https://www.iosco.org/news/pdf/IOSCONEWS761.pdf

**Regulación**
- ESMA · Supervisory briefing sobre la definición de asesoramiento (ESMA35-43-3861, 11-7-2023): https://www.esma.europa.eu/sites/default/files/2023-07/ESMA35-43-3861_Supervisory_briefing_on_understanding_the_definition_of_advice_under_MiFID_II.pdf
- ESMA · declaración pública sobre IA y servicios de inversión (30-5-2024): https://www.esma.europa.eu/sites/default/files/2024-05/ESMA35-335435667-5924__Public_Statement_on_AI_and_investment_services.pdf
- CNMV · guía sobre asesoramiento en materia de inversión: https://www.cnmv.es/docportal/guias_perfil/guiaasesoramientoinversion.pdf
- Reglamento de IA, art. 50 (resúmenes de despachos): https://www.addleshawgoddard.com/en/insights/insights-briefings/2026/technology/ai-transparency-ai-act-what-businesses-need-know-before-2-august-2026/
- Estrategia de Inversión Minorista (resúmenes de despachos): https://cms.law/en/int/legal-updates/EU-Retail-Investment-Strategy-Political-Agreement-Key-Points-and-Implications-for-EU-and-non-EU-Firms

**Prensa y agregadores (2ª, usados con cautela)**
- CNBC (Treasuries y bolsa, septiembre de 2026); Euronews (Bund, 1-9-2026); Al Jazeera (Ormuz, 14-9-2026); prensa española (Euríbor, Letras, depósitos, IPV); goldsilver.com (oro); agregadores de capex en IA y de precios de APIs. URLs en el historial de la investigación; ninguna cifra crítica depende solo de ellos sin marcarla como [2ª].

**Límites de esta investigación**
- No se pudo acceder directamente a SPIVA (403), a la ficha de S&P DJI ni al PDF del STEO; sus cifras van marcadas como [2ª] o «verificar».
- No se localizaron las proyecciones de septiembre de 2026 del Banco de España (solo las de marzo).
- No se identificó el código de la serie del IPC en base 2025 para la API Tempus del INE.
- Los precios de las APIs comerciales son orientativos y pueden haber cambiado.
