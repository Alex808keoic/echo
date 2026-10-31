# Finax — Handoff para continuar el desarrollo

> Documento de traspaso para otra IA o desarrollador que no conoce las
> conversaciones anteriores. **Empieza por la sección del 2026-10-13**: es el
> estado actual y manda sobre todo lo de debajo. Las secciones antiguas
> (2026-10-02, 2026-09-30 y §0–§15, del 2026-09-27) se conservan como
> historial; varios de sus «problemas conocidos» ya están resueltos (ver la
> tabla de abajo). Si algo de aquí contradice al código, **manda el código**.
> Lo que no se puede verificar desde el repo está marcado como **NO VERIFICABLE**.
>
> Este documento no contiene ni debe contener secretos ni claves de API.

---

## Ecosistema AXIS (2026-10-31)

Finax puede conectarse, si el usuario quiere, con la **app AXIS** (repo `github.com/Alex808keoic/axis`), que une Finax, Axthletics y Mentax. No cambia nada del AXIS consultor de Finax.

- **Ajustes → «Ecosistema AXIS»** (`components/finax/ecosystem-section.tsx`): entrar con Google, elegir en una hoja qué cifras se comparten y confirmar. Después: cambiar la selección, «Dejar de compartir» (borra en AXIS lo recibido) o «Cerrar sesión». Al volver de Google se reabre Ajustes. Solo aparece con Finax ya configurado.
- **Qué sale:** un resumen por semana (contrato `axis.snapshot.v1`, copia en `lib/ecosystem/contract.ts`; no editar ahí): ingresos, gastos, gastos habituales, patrimonio (la misma curva que la gráfica), valor invertido, deudas (solo la semana actual: no hay historial) y número de movimientos, más los objetivos con el mismo reparto que la pantalla. Nunca movimientos sueltos, conceptos, notas, nombres de inversiones ni conversaciones.
- **Cuándo:** al confirmar, toda la historia; después, al abrir y al salir de la app, como mucho cada 5 min (`hooks/use-ecosystem.tsx`). Cada envío sustituye el de su semana.
- **Dónde:** proyecto Supabase compartido del ecosistema (UE), RLS por usuario. La clave publicable está en `lib/ecosystem/client.ts` porque es pública por diseño. `@supabase/supabase-js` se carga solo con una sesión guardada o al volver de Google: sin conectar no hay ninguna petición.
- **Datos:** el consentimiento vive en `AppConfig.ecosystem` (viaja en la copia; sin sesión no se envía nada). `setInitialBalance` lo conserva.

---

## 🟢 Estado al 2026-10-13 (actual)

### Repositorio y producción

| Dato | Valor |
|---|---|
| Carpeta local | `C:\Users\sofia\Projects\finax-v0` (la carpeta `Projects/finax` es un prototipo antiguo de agosto; no usar) |
| Repo | `https://github.com/Alex808keoic/echo.git`, rama `main` |
| Producción | Vercel, proyecto «echo»; **un push a `main` despliega solo** |
| IA de AXIS | Cloudflare Workers AI (Gemma 4) → fallback Groq (`openai/gpt-oss-20b`), Decision First activo |
| IA de Market Research | Desde el 2026-10-13, Cloudflare → Groq (`scripts/market/providers/select.ts`). Necesita los secrets `CF_ACCOUNT_ID` y `CF_API_TOKEN` en GitHub (los añade el usuario; sin ellos, solo Groq). Gemini ya no se usa: fallaba siempre (HTTP 403) |
| Tests | `pnpm test` → **1.425 pasan, 0 fallan** (2026-10-24) |
| Typecheck / build | OK / OK |
| CI | **Sí, desde `92c363e`**: `.github/workflows/ci.yml` (tipos, tests y build en push y PR a `main`). No bloquea a Vercel |
| Lint | No existe |
| Dispositivo principal | **Galaxy S21 FE** del usuario (≈ 412 × 915 CSS px con la configuración de fábrica; hasta 2026-10-23 se creía un S21 de 360 px). Los cambios de UI se comprueban a 412 × 915 y se confirma que nada se rompe a 360 × 800 |

**Subir a GitHub:** `gh` tiene dos cuentas. Solo `Alex808keoic` puede escribir en el repo; con
`gisbertsalminenalex-ship-it` activa, el push da 403. Antes de subir:
`gh auth switch --user Alex808keoic` y después
`git -c credential.helper= -c "credential.helper=!gh auth git-credential" push origin main`.
Si otra sesión necesita la otra cuenta activa, se puede subir sin cambiarla:
`git -c credential.helper= -c 'credential.helper=!f() { echo username=x-access-token; echo "password=$(gh auth token --user Alex808keoic)"; }; f' push origin main`.

**Si un push no se despliega:** cada commit de `main` debe recibir en GitHub el estado «Vercel». Si no
aparece ninguno (ni de error), Vercel no recibe los avisos: el 2026-10-23 se había desconectado el
repo (Vercel → proyecto «echo» → Settings → Git). Tras reconectarlo hace falta un push nuevo.

### Qué se hizo del 2 al 10 de octubre (≈ 60 commits)

Los mensajes de commit son detallados (motivo, alcance, tests, goldens): leer
`git log 293c830..HEAD` para el detalle.

- **Dinero y objetivos**
  - Importes con punto decimal (`1ba851e`).
  - Las inversiones descuentan del líquido con `fromLiquid` (`3d52262`).
  - **Objetivos automáticos:** el líquido se reparte en cascada por prioridad (`allocateObjectives`, `115e946`). `Objective` gana `priority?` y `achievedAt?`; `currentCents` solo queda por compatibilidad. No hay aportaciones manuales: «Aportar» existió (`73b8b07`) y se quitó.
  - «Marcar como conseguido» pide confirmación (`2d6d3a5`).
- **AXIS: perfil y memoria**
  - El perfil llega a `decide()` desde los hechos de memoria (`d186ec8`).
  - Ingreso recurrente como previsión, nunca como dinero real (`3f37e8c`, `9970434`).
  - Extractor determinista de hechos (`a55a9d4`, `8ef247a`).
  - Pantalla «Lo que AXIS sabe de ti» (`140b800`). No hay expulsiones silenciosas: lo pregunta.
  - Backup **v2** con las memorias (`886f34f`).
  - Cuestionario «Tu perfil» con horizonte, riesgo, ingresos estables y mayoría de edad (`79db741`).
- **AXIS: reglas**
  - Objetivos alineados con el reparto automático (`269121a`, `ea50f30`, `de568ea`, `da89801`).
  - `liquidity.negative` (`978b50b`).
  - Conclusión coherente con la recomendación (`c5a7a27`).
- **Chat**
  - Validación completa en el servidor frente a `decide()` (`c5d357f`): cifras, previsiones, ejecución, aportación manual y consejos.
  - Historial compacto de movimientos (`7399432`).
  - Tono por reglas (`aa58cd5`).
  - Tarjetas de acción (`329bc14`).
  - Consultas acotadas a datos locales (`824c705`).
  - Búsqueda de mercado en el servidor con feeds oficiales (`4ca0d5f`).
- **Plan, guía y resumen**
  - Plan de reparto determinista y pantalla «Tu plan» (`7addfe1`, `497b236`, `b09fd6e`).
  - Resumen semanal de mercado: determinista, con redacción IA validada, pantalla y tarjeta (`56aa39f`, `5ea2159`, `b91c7ed`).
  - «Guía para invertir» y su uso en el chat (`f2e9a76`, `6d156b0`). Solo tipos de producto, nunca marcas ni «cómpralo», porque es actividad regulada por la CNMV.
- **Mercado**
  - Series de inflación nuevas: INE base 2025 y Eurostat ECOICOP v2 (`4c36fa6`).
  - Frescura por indicador, también en AXIS (`cf10134`, `43119fc`, `1f047b1`).
  - La clave de caché incluye las fechas de los indicadores (`1c91c0c`).
- **UI**
  - Errores de almacenamiento y carga bloqueada (`c2ed614`).
  - Signo menos en negativos (`98c2206`).
  - Tarjetas en pantalla estrecha (`ba4fcbf`).
  - Contraste WCAG AA y áreas táctiles (`1951ce6`).
  - Foco de las hojas y borrado de movimientos en 3 toques (`97a5686`).
  - Gráfica fiel con eje proporcional, sin inventar valores y eje Y redondo (`a347eeb`, `ff36b2a`, `60d8fa7`, `970d5f3`).
  - Transiciones solo CSS que respetan «reducir movimiento» (`8dda061`).
- **Ajustes**
  - El texto de privacidad dice qué se envía con IA (`886f34f`, `f386686`, `824c705`).
  - La fila de AXIS muestra el estado real de la IA.
- **Abandonado a propósito:** los ejemplos para que el chat proponga hechos de perfil (`722ca83`, revertido en `2d17269`). Gemma proponía hechos del tipo equivocado; ahora manda el extractor determinista.

### Problemas conocidos del 2026-09-27 (§14.4): estado

| # | Problema | Estado |
|---|---|---|
| 1 | Parseo de importes con «.» | ✅ Resuelto (`1ba851e`) |
| 2 | Ajustes decía que los datos no salen / que no hay IA | ✅ Resuelto (`886f34f`, `f386686`) |
| 3 | «Sin cupo de IA» por TPM de Groq | 🟡 Mitigado: Cloudflare es el principal y Groq queda de fallback. Faltan muestras de producción |
| 4 | El perfil no llega a producción | ✅ Resuelto (`d186ec8` y siguientes) |
| 5 | Índices de mercado en puntos rompen la licencia de cifras | ✅ Resuelto el 2026-10-14: `decisionTextFigures` licencia los números desnudos de los textos de AXIS (el hecho «IBEX 35: 15.234,5 pts»); los de la lectura de la investigación siguen sin licenciar. Test en `figures.test.ts` |
| 6 | Investigación por evento sin fallback (`scripts/market/deep.ts`) | ✅ Resuelto el 2026-10-13 (solo el primer intento pide el cupo de evento; test en `engine.test.ts`). Se habían perdido las del 17-09, 01-10 y 05-10 |
| 7 | Curva de líquido frente a cifra de patrimonio total | ✅ Resuelto: la gráfica es de patrimonio total (`3d52262`, `a347eeb`) |
| 8 | Invertir no descontaba liquidez | ✅ Resuelto (`fromLiquid`, `3d52262`) |
| 9 | Memorias expulsadas sin aviso / disponibilidad de la IA cacheada | ✅ La expulsión pide confirmación. Disponibilidad (2026-10-14): un «sí» vale toda la sesión; un «no» se vuelve a comprobar al minuto (`rememberAvailability`, `core/fallback.ts`) |
| 10 | «Todo» en las barras de Estadísticas = 12 meses | ✅ Resuelto el 2026-10-14: desde el primer movimiento (`historyMonthCount`, mínimo 12); con más de 12 meses las barras se desplazan en horizontal y arrancan en el mes actual |

### Pendiente (en orden recomendado)

1. ~~Pasada de diseño para el móvil~~ 2026-10-23, primera pasada para el S21 FE: auditadas todas las pantallas a 412 y 360 px (nada se sale ni se corta). Se arreglaron zonas táctiles (utilidad `tap` en `globals.css` para enlaces de texto; pastillas de `ChipGroup` a 32 px + zona; casillas de «Tu decisión del mes», desplegables «¿Por qué?» y «Datos y lo que no sé», sugerencias del chat ≥ 40 px), texto mínimo de 11 px (barra inferior, ejes de gráficas, etiquetas) y la barra inferior usa `env(safe-area-inset-bottom)` en lugar de 20 px fijos. Si el usuario pide más, siguiente paso: revisar a ojo pantalla por pantalla en su móvil.
2. ~~Que Vercel solo despliegue si pasa la CI~~ ✅ 2026-10-14: `vercel.json` hace que Vercel ejecute `typecheck` y `test` antes de `build`; si fallan, no despliega y producción sigue con la versión anterior.
3. **Medir en producción:**
   - Si el timeout de Cloudflare en el análisis es sistemático.
   - Si el detector de certeza rechaza a menudo a Gemma.
   - Cómo responden en la práctica el chat con consultas y el resumen semanal.
   Ver `[axis] llamada` en `vercel logs`.
4. Comprobar la primera investigación de mercado con Cloudflare (sábado 17-10 o `workflow_dispatch` manual) cuando el usuario haya añadido los secrets: el log dice `proveedores: cloudflare:… → groq:…`.
5. ~~Índices en puntos, «Todo» en Estadísticas y disponibilidad de la IA~~ ✅ 2026-10-14.
6. Si Cloudflare sigue rechazado en el mercado por el detector de certeza (el 14-10 lo fue por «asegurar»), revisar `lib/text/certainty.ts` con tests; no relajarlo a ciegas.
7. Conversación por intención y simulador determinista (fase 3 de `docs/AXIS.md`); un solo pipeline (fase 4).
8. Oro en Market Research (`docs/SPIKE_GOLD_SOURCES.md`).
9. `docs/AXIS_MARKET_INTELLIGENCE.md` (2026-10-05): investigación con decisiones pendientes de aprobar (§16). Parte ya se implementó (frescura, series de inflación); el resto **no está aprobado**.

### Invariantes nuevas (además de §15)

- **Nunca recomendar productos, entidades, marcas ni momentos de compra o venta.** Solo categorías y encaje con el plan. La guía tiene un test que lo comprueba. Excepción decidida por el usuario el 2026-10-17: la pantalla de la guía enseña `examples` de lo que existe (empresas, índices, criptomonedas…) con el aviso de que no son recomendaciones; nunca nombran a quien vende y nunca llegan al chat ni al modelo (tests en `investment-guide.test.ts`).
- **Objetivos:** el reparto automático es la única fuente del progreso. Nada (ni AXIS, ni el chat, ni la UI) aporta a mano. Desde el 2026-10-25 el reparto incluye lo invertido para los objetivos con fecha a más de 12 meses; un mismo euro (líquido o invertido) nunca cuenta dos veces.
- **Previsiones** (ingreso recurrente): nunca se presentan ni se suman como dinero actual.
- **Hechos de perfil del chat:** manda el extractor determinista (`gateProposalFact`), no el modelo. `adult` solo viene del cuestionario.
- **Tarjetas de acción y consultas:** las calcula y ejecuta Finax. Como mucho, una consulta (dos llamadas) por mensaje.
- **Mercado:** solo los indicadores `fresh` se presentan con valor. Las cifras de la lectura de la investigación no licencian nada.
- **Movimientos puntuales** (2026-10-17, `Movement.puntual`): son dinero real (líquido, patrimonio, objetivos), pero no entran en el gasto ni en el ahorro habituales ni en las comparaciones entre meses (`regularExpenseCents`, `decidingChangePct` en `rules/shared.ts`). Gastar más de lo que entra solo por algo puntual da `expenses.one-off`, no `expenses.over-income`. Los meses solo llevan `oneOff*Cents` cuando hay puntuales: sin ellos, contexto y goldens no cambian.
- **Todas las memorias cuentan en «Tu plan»** (decidido por el usuario el 2026-10-17): los tipos de dato con reglas (11 desde el 2026-10-21) (`recurringIncome` hace un plan provisional con un solo mes cerrado y se marca como previsión; `priorities` añade un aviso, nunca reordena). Las notas de texto libre **nunca** deciden: el plan pide convertirlas en un dato con confirmación del usuario («Usar en tu plan», `chat/note-conversion.ts`, sugerencia por reglas fijas) o marcarlas con «No cuenta para el plan» (`UserMemory.planIgnored`).
- **Mezcla de inversión del plan** (decidido por el usuario el 2026-10-17, `plan/mix.ts`): el largo plazo se reparte en TIPOS (renta variable global, renta fija y, con condiciones, una parte arriesgada) según riesgo y plazo; sin objetivos pendientes se invierte más (40/70/90 %). La parte arriesgada es como mucho el 10 % y exige perfil dinámico, plazo largo, colchón completo, ningún objetivo cercano con retraso y dinero parado ≥ 3 meses de gasto; **no exige mayoría de edad** (decisión del usuario), pero lo explica. El dinero parado (líquido por encima del colchón y de todos los objetivos) se propone invertir de una vez o en 6 meses y elige la persona; con plazo corto, ahorro seguro. La Guía (`guide/fit.ts`, `recommend.ts`) sigue la misma mezcla. Siempre tipos, nunca productos ni entidades.
- **Finax como consultor (2026-10-17; de momento la app solo la usa el propio usuario):**
  - «Tu decisión del mes» (`plan/checklist.ts`, `hooks/use-plan-checklist.ts`): el plan como lista marcable con importes; lo marcado se guarda por mes en Dexie **v6** (tabla `planChecks`, fuera del backup, se borra con «Borrar todos los datos»). Marcar no mueve dinero.
  - Tu mezcla real: `Position.assetType` (deducido del nombre si falta, `guessAssetType`). Si se aleja ≥ 10 puntos de la del plan, la aportación va a lo que falta, sin vender (`rebalanceSplit`); la parte arriesgada nunca recibe más de su peso de la aportación. Caída ≥ 15 % de lo invertido: nota tranquila, el plan no cambia.
  - «¿Por qué?» de cada paso (`plan/why.ts`) con las respuestas del cuestionario; llega al chat (`porque` en `plan_de_reparto`) y a la respuesta local.
  - Recomendar productos concretos queda fuera: sería asesoramiento (CNMV) si la app la usaran otras personas.
- **Ciclo del consultor (2026-10-17):**
  - Revisión del mes anterior (`plan/review.ts`, `useMonthReview`): ahorro, inversión, pasos marcados, líquido y coste de la inflación frente a la foto del plan de ese mes (`PlannedMonth` en `planChecks`); sin foto, compara con el plan actual y lo dice.
  - Proyección del patrimonio (`plan/projection.ts`): supuestos de `guide/scenarios.ts` por tipo, percentiles 10/50/90 aplicados a la vez (abanico prudente), líquido al 0 %, «en euros de hoy» y comparación con dejarlo todo quieto.
  - Recordatorios (`lib/reminders.ts`): en Inicio siempre; con la app cerrada, `periodicsync` en `public/sw.js` (Chrome Android con la app instalada; el sistema decide cuándo). **El service worker repite las reglas de `reminders.ts`: cambiarlas en los dos sitios.** `sw.js` pasa a `finax-sw-v2`.
  - Inflación (`plan/inflation.ts`): IPC del INE solo si está `fresh`; si no, el 2 % del BCE dicho como supuesto. Solo textos y la proyección; nunca importes del plan.
- **Consultor completo (2026-10-18; el usuario descartó de momento impuestos y control de gastos/suscripciones):**
  - Deudas (`Debt`, Dexie **v7** tabla `debts`, backup **v3**; `lib/finance/debts.ts`, pantalla «Deudas»). Interés en centésimas de punto (`aprBp`). El contexto lleva `debts` solo si hay alguna (goldens sin cambios). En el plan: una deuda es cara si su interés ≥ lo que cabe esperar de tu mezcla (`expectedMixReturnPct`, supuestos de la Guía) con tope 7 % y suelo 3 %; sin perfil, 7 %. Con deudas caras: colchón mínimo de 1 mes (`fill-cushion` con `starter`) y luego TODO el ahorro a la más cara (`pay-debt`, `longTerm.reason = 'debt-first'`, no se invierte); si hay líquido por encima del colchón completo y de lo apartado para objetivos a ≤ 24 meses, propone devolverla de una vez. Interés medio con inversión: `debt-choice` (elige el usuario). Cuotas > 35 % de los ingresos habituales: `debt-load`.
  - «¿Y si…?» (`plan/simulate.ts`, pantalla `simulador`): compra, préstamo, cambio de sueldo, gasto fijo, meses sin ingresos, vivienda (20 % entrada + 10 % gastos), cambio de trabajo e independizarse. Aplica el cambio a una copia del snapshot/contexto y recalcula decisión, plan y proyección; no guarda nada. Requiere 2 meses cerrados (no simula sobre un plan provisional).
  - Rentabilidad real y comisiones (`plan/returns.ts`, Inversiones): TIR de tus aportaciones con ≥ 1 año, también descontando la inflación; `Position.feeBp` opcional, coste a 20 años frente al 0,2 % y aviso de comisión alta por tipo (umbrales de `guide/fit.ts`).
  - Copia de seguridad: Dexie tabla `meta` (`backup.at`, fuera del backup). Recordatorio `backup` (sin copia y datos de > 7 días, o copia de > 30 días; nunca con demo) y `year-review` (1–15 de enero). Repetidos en `sw.js`, que pasa a `finax-sw-v3`.
  - Revisión mensual ampliada (mayor gasto del mes, lo que debes) y «¿Ha cambiado algo este mes?» (`planChecks.checkIn`; «Revisar mi perfil» o «Nada»). Resumen del año (`plan/year-review.ts`; el año anterior hasta marzo, luego el actual) con propuesta de repetir «Tu perfil» si la respuesta más reciente tiene > 330 días; «Sigue todo igual» refresca la fecha (`touchUserMemories`).

- **Movimientos fijos y primer uso guiado (2026-10-19; el usuario descartó importar extractos del banco):**
  - `RecurringMovement` (Dexie **v8**, tabla `recurring`; backup **v4**; `lib/finance/recurring.ts`, `lib/db/recurring.ts`, pantalla `fijos`). Es una plantilla, **nunca dinero**: cada vez que toca se PROPONE (tarjeta «Por confirmar» en Inicio, Movimientos y Fijos) y el usuario la confirma (crea un `Movement` normal con `recurringId` y `occurrence`), la cambia antes de confirmar o la omite. Sin confirmar no cuenta en líquido, patrimonio, objetivos ni AXIS.
  - Calendario: día (y mes, si es anual) de `startDate`; si el mes no tiene ese día, el último. Lo hecho se guarda como `doneThrough` + `handled` (sueltas fuera de orden); confirmar es una transacción que no duplica con doble toque. Como mucho 24 pendientes por fijo. Al crear, la próxima vez no puede ser pasada (el saldo inicial ya incluye lo anterior); cambiar la próxima vez o la frecuencia reprograma desde esa fecha.
  - Recordatorio `recurring-pending` solo con la app cerrada (`sw.js` → `finax-sw-v4`, que repite el calendario de `recurring.ts`: cambiarlo en los dos sitios). Inicio no lo pasa porque ya enseña la tarjeta.
  - Primer uso (`forms/onboarding.tsx`, botón «Empezar» de Inicio vacío): saldo inicial → fijos (atajos) → «Tu perfil»; los dos últimos se pueden saltar. Quien ya tenía datos ve en Inicio la tarjeta «¿Tienes ingresos o gastos fijos?» hasta que añade uno o la cierra (`meta` `recurring-hint`).
  - En el historial y el detalle se ve el nombre del fijo («Spotify») en lugar de la categoría.
- **Categorías nuevas (2026-10-20, todas decididas por el usuario):**
  - Gasto (15): Supermercado, Restaurantes, Vivienda, Facturas, Transporte, Suscripciones, Caprichos, Ropa, Salud, Deporte, Educación, Viajes, Regalos, Seguros y banco, Otros. «Comida» → «Supermercado» y «Salidas» se junta con «Restaurantes» (`LEGACY_CATEGORIES`, Dexie **v9** migra movimientos y fijos; las copias antiguas se migran al leerlas).
  - Edad: un menor (respuesta `adult: false` en «Tu perfil») solo ve Supermercado, Restaurantes, Caprichos, Ropa, Regalos y Otros (`ADULT_EXPENSE_CATEGORIES`, `categoriesFor(type, { minor, keep })`; al editar se conserva la que ya tenía). **Sin respuesta cuenta como mayor de edad.** `hooks/use-minor.ts`.
  - Necesario / prescindible (`EXPENSE_NEED`, `needSplit`): solo para mayores o sin edad dicha; tarjeta en Estadísticas. «Otros» queda sin clasificar. De momento AXIS y el simulador no lo usan (sería tocar `decide()` y goldens).
  - Ingreso (6, para todas las edades): Paga, Trabajos extra, Ventas, Regalos, Deuda, Otros. «Deuda» = te devuelven lo que te debían: siempre cuenta como puntual (`isOneOff`, que usa `oneOffTotals`), el formulario no ofrece la casilla. Las memorias de ingreso recurrente siguen limitadas a Paga, Regalos y Otros (`RECURRING_INCOME_CATEGORIES`).
  - Donut: las 5 mayores con color propio y «Resto» (se toca para ver el detalle). Con 15 categorías y 5 colores validados ya no hay color fijo por categoría: se reparten por el orden de la lista (`chart-colors.ts`).
  - Primer uso: saldo → «Tu perfil» → fijos (la edad decide las categorías; un menor no ve los atajos de adulto).
- **Evolución del dinero (2026-10-20):**
  - `Position.valueHistory` (sin cambio de versión de Dexie ni del backup: campo opcional, validado en `isPosition`): cada valor apuntado con su fecha, uno por día, como mucho 400 (`lib/finance/position-values.ts`). Se apunta al crear, al cambiar el valor (`updatePosition`) y en «Actualizar valores» (`setPositionValues`, hoja `forms/update-values-form.tsx`, botón en Inversiones), que lo apunta aunque no cambie.
  - `buildWealthSeries`: lo que suben o bajan las inversiones entra el día en que se apuntó cada valor (`revaluationDeltas`); lo que el historial no explica (posiciones de antes) entra en `asOf`, como antes. La curva sigue terminando en el patrimonio. AXIS no usa esta serie (usa la del líquido): goldens sin cambios.
  - Estadísticas → Patrimonio: «Lo que has ahorrado» y «Lo que han hecho tus inversiones» (`wealthSources`), el mismo periodo que la curva; suman su cambio. Lo aportado desde fuera de Finax cuenta como ahorro.
  - «Tu decisión del mes» (ver abajo el mercado): con inversiones, Finax añade «Actualiza el valor de tus inversiones» (`UPDATE_INVESTMENTS_ITEM`, fuera de `monthChecklist`, lo añade `usePlanChecklist`). No se marca a mano: se tacha solo cuando todas tienen un valor apuntado ese mes (`investmentsUpToDate`).

- **El mercado en tu plan (2026-10-21, decidido con el usuario; nunca adivina el mercado ni cambia importes):**
  - Comparación de la bolsa (`lib/market/moves.ts`): la app descarga además `history/<id>.json` de la investigación con ≥ 21 días respecto a la actual (`pickBaselineId`) y guarda sus indicadores en la caché de mercado (`MarketCacheEntry.baseline`). `strongEquityMove`: un índice (`stoxx50`, `ibex`, `spx`, `ndq`) vigente que ha caído ≥ 8 % o subido ≥ 10 % frente a esa base, con 20–50 días entre observaciones del mismo tipo (día con día, mes con mes).
  - Señales (`lib/axis/plan/market-signals.ts`, `hooks/use-market-signals.ts`, tarjeta «El mercado y tu plan» en Tu plan y en «Qué significa para ti» del resumen semanal): `equity-drop`/`equity-rise` (solo si el plan invierte o tienes bolsa; «tu plan no cambia»), `safe-vs-inflation` (tipo de depósito del BCE frente al IPC del INE, ambos vigentes; da el tipo del BCE como referencia para comparar la TAE), `variable-debt:<id>` y, solo en el resumen, `idle-loss` (lo que pierde con la inflación el dinero sin destino; Tu plan ya lo dice en su paso).
  - Notificación con la app cerrada `equity-move` (`sw.js` → `finax-sw-v5`, que repite `strongEquityMove`: cambiarlo en los dos sitios). Una vez por base y dirección; solo si tienes inversiones o tu plan del mes invierte.
  - Proyección: con el tipo del BCE vigente, el ahorro seguro crece a ese tipo (`projectWealth(…, safeRatePct)`); sin él, el supuesto de la Guía.
  - Deudas variables: `Debt.variableSpreadBp` (opcional, validado en el backup, sin cambio de versión). `repricing`: Euríbor 12 m vigente + diferencial, mismo plazo que queda hoy → cuota estimada en Deudas y aviso en el plan si cambia ≥ 2 %. El plan sigue usando `aprBp` para decidir.
  - Simulador de vivienda: con Euríbor vigente propone Euríbor + 1 punto (`HOME_SPREAD_PCT`), dicho en pantalla.
  - Deudas: botón «Eliminar» con texto en el formulario y directo en las ya devueltas (antes solo la papelera dentro de «Editar deuda»).
  - **Local:** `.env.local` apunta a `/market-data-local` (datos de prueba de la semana 37); producción usa la rama `market-data`.

- **AXIS como tu consultor (2026-10-21, decidido con el usuario):** objetivo, que AXIS sea el asesor de la persona, siempre a nivel de tipo (CNMV). El usuario descartó de momento seguros, jubilación, impuestos y presupuesto, y mantener «Resumen de hoy» en Inicio.
  - **Una sola voz:** la pestaña AXIS es «Tu plan» + «Conversación». La antigua pestaña «Análisis» ya no da recomendación, alternativas ni conclusión propias: su lectura (resumen, señales, datos, incertidumbre y confianza) es la tarjeta «Lo que veo en tus números» dentro del plan (`axis-screen.tsx` `Insight`), después de los pasos. `PlanPanel` (`screens/plan-panel.tsx`) es el antiguo `PlanScreen` sin cabecera. La pantalla `plan` ya no existe: `navigate('plan')` abre AXIS en «Tu plan» (`openAxisTab`, `app/page.tsx`); dentro de AXIS cambia de pestaña. Las rutas `to: 'plan'` (recordatorios, chat, guía…) siguen igual.
  - Inicio: una sola tarjeta «AXIS · Tu plan del mes» (titular del plan, revisión y pasos hechos). Ya no pide el análisis de AXIS.
  - AXIS se presenta como «Tu consultor financiero» (no «gestor»: gestionar carteras es otra actividad regulada).
  - **«Tu dinero»** (antes Mi Dinero + Estadísticas, `screens/money-screen.tsx`): vistas Patrimonio (total, evolución, desglose y lista de objetivos, inversiones, deudas y saldo inicial), Gastos e Ingresos (lo de Estadísticas). La barra tiene 4 pestañas (Inicio, Tu dinero, Movimientos, AXIS). `estadisticas` ya no es pantalla: `navigate('estadisticas')` abre «Tu dinero» en Gastos (`openMoneyView`); el destino `estadisticas` de AXIS (esquemas de la IA, reglas) no cambia. Se quitaron las tarjetas de AXIS de las dos pantallas (una sola voz). Etiquetas «Ver Mi Dinero» → «Ver tu dinero» y «Ver estadísticas» → «Ver tus gastos» (golden `profile/con-perfil.json`: solo esa etiqueta).
  - **Resumen semanal eliminado** (decidido: un asesor no te manda la bolsa cada semana). Se borraron la pantalla `resumen`, `hooks/use-weekly-brief.ts`, `lib/axis/brief/` y el modo `weekly-brief` de `/api/axis` (un cliente antiguo que lo pida recibe 400 sin gastar cupo). Lo que quedaba de «Qué significa para ti» es la tarjeta «El mercado y tu plan» de Tu plan, que solo aparece cuando algo te afecta, y la notificación `equity-move` con la app cerrada. `idle-loss` sigue en `market-signals.ts` (con tests) pero la app ya no lo pide. Tests: 1.366 (los 71 que faltan eran del resumen).
  - **Conocerte como un asesor** («Tu perfil» pasa de 4 a 8 preguntas, `profile/questionnaire.ts`): cuatro hechos nuevos que, como `adult`, **solo vienen del cuestionario** (el chat no los propone; sí se pueden convertir desde una nota): `work` (cuenta ajena, por su cuenta, estudia, sin trabajo, jubilación), `dependents`, `investingExperience` (none/some/experienced) y `lossCapacity` (low/high: si una caída le obligaría a cambiar sus planes, distinto de cómo la llevaría). Sin cambio de versión de Dexie ni del backup (validados en `isValidMemoryFact`). Solo cambian «Tu plan», nunca `decide()` (goldens sin cambios):
    - Colchón (`cushionMonthsFor`): 3 meses; 6 con ingresos irregulares, por su cuenta o sin trabajo; +3 con personas a cargo (máximo 9).
    - Riesgo aplicado (`planRisk`): dinámico con `lossCapacity: 'low'` se invierte como equilibrado (porcentaje, mezcla, rentabilidad esperada para las deudas) y por tanto sin parte arriesgada.
    - Parte arriesgada: además, exige no haber respondido «Nunca» a la experiencia (`riskyAllowed.noExperience`).
    - El «¿Por qué?» cita cada una de estas respuestas. Sin responderlas, el plan es el de antes.
  - **«¿Me lo puedo permitir?» y «Me ha pasado algo»** arriba de Tu plan. El primero abre «¿Y si…?» en compra (`openSimulator`). El segundo es una hoja con cambios de vida (`plan/life-events.ts`: trabajo o sueldo, sin trabajo, alguien depende de ti, mudarse, dinero extra, compra grande, deuda nueva), con el consejo y lo que hay que revisar: Tu perfil, Fijos, Deudas, un ingreso puntual (`MovementForm oneOffIncome`) o el simulador. Nunca guarda ni mueve nada por su cuenta.
  - **Guía con tus números** (`lib/axis/guide/invest.ts`, pantalla `guia`; el usuario eligió estos puntos):
    - «Cuánto deberías invertir» (`investEstimate`): al mes (paso `invest-long-term`), ahora de una vez o en 6 meses (dinero sin destino de `idle-money`, si no es ahorro seguro), el total en un año y cuánto de tu líquido se queda para colchón y objetivos. Si aún no toca: por el colchón (meses que faltan y lo que invertirías después, recalculando el plan con el colchón completo: `monthlyWithCushionDone`) o por deudas caras; o por qué no (perfil, plazo corto, sin margen, plan bloqueado).
    - «Tu mezcla, parte por parte» (`sleeveGuide`): cada parte de la mezcla con su peso (el de la mezcla, también cuando el mes reequilibra), lo que recibe al mes, cómo elegir entre sus tipos (`SLEEVE_CHOICE`) y los tipos que encajan (`SLEEVE_TYPES`). Sustituye a la tarjeta «lo que mejor te encaja» cuando hay mezcla.
    - «Cómo reconocer uno bueno»: `ProductType.choose` en 9 tipos (umbrales alineados con `HIGH_FEE_PCT`); también llega al chat (`como_reconocer_uno_bueno`) y licencia sus cifras.
    - Comparador de comisiones de dos opciones (`feeComparison`, con la aportación del plan a esa parte o 100 €/mes, 20 años, crecimiento «normal» del tipo). Sustituye al campo de una sola comisión.
    - Escenarios: empiezan con lo que tu plan invertiría en un año y con tu plazo (solo en lo que sube y baja).
  - **Todo fácil de encontrar (2026-10-23, decidido con el usuario):** cada cosa tiene una sola casa.
    - AXIS tiene 3 pestañas: «Tu plan», «Herramientas» y «Conversación» (`AxisTab`). «Herramientas» (`screens/tools-panel.tsx`): «Para decidir» (¿Me lo puedo permitir?, ¿Y si…?, Me ha pasado algo, Guía para invertir) y «Sobre ti» («Tu perfil», que abre el cuestionario en hoja, y «Lo que AXIS sabe de ti»). Los botones de herramientas, deudas y guía ya no están en el plan.
    - «Tu plan» por importancia: decisión del mes → resumen y pasos → «El mercado y tu plan» → «¿Ha cambiado algo?»; debajo, «Cómo vas»: revisión del mes anterior, «Lo que veo en tus números», proyección y resumen del año.
    - Ajustes conserva atajos a «Tu perfil» y «Lo que AXIS sabe de ti». Filas compartidas en `components/finax/row-list.tsx`; texto del progreso del perfil en `profileProgress` (`profile/questionnaire.ts`).
    - Icono de Ajustes también en «Tu dinero» (ya estaba en Inicio, Movimientos y AXIS).
- **Cómo van las inversiones (2026-10-24, pedido por el usuario):** un vistazo a las 8 familias de la Guía (ahorro seguro, renta fija, fondos, ETF, acciones, materias primas, inmobiliario, cripto) para ver si alguna «ha explotado». Pantalla `mercados` (`screens/markets-screen.tsx`), en AXIS → Herramientas → «Para decidir». No avisa ni entra en «Tu plan» (el mercado solo habla en el plan cuando te afecta).
  - Fuentes nuevas de la investigación (`scripts/market/sources/`): `bonds.ts` (BCE: bono 10 años eurozona AAA diario y España mensual), `housing.ts` (INE IPV1376, variación anual trimestral, base 2025; la serie antigua IPV948 se congeló en 2025-T4), `commodities.ts` (FMI PCPS: oro y Brent, mensual; **el 24-10 el FMI respondía 503**, la fuente queda en `failed` y Materias primas dice que no hay datos), `crypto.ts` (CoinGecko, API pública sin clave, `type: 'data'`: bitcoin y ether en €). FRED (si algún día hay `FRED_API_KEY`) añade Brent diario, que gana al del FMI.
  - Indicadores: grupos nuevos `bond`, `commodity`, `housing`, `crypto`; unidades `USD` y `EUR`; campo opcional `changeDays` (días entre las dos observaciones de `changePct`). IBEX, S&P, Nasdaq y Brent ahora comparan con hace un mes (≥ 28 días), no con 5 sesiones. Fechas trimestrales `YYYY-Qn`, frescas hasta 165 días tras el trimestre. `parseMarketResearch` **descarta** un indicador de grupo o unidad desconocidos en vez de rechazar la investigación (los clientes anteriores a este cambio sí la rechazarían: se actualizan al abrir la app). Máximo 30 indicadores.
  - `lib/market/panorama.ts` (puro, sin IA): por familia, tendencia (`strong-rise`, `strong-drop`, `rise`, `drop`, `calm`, `no-data`, `depends`), frase y cifras, solo con indicadores vigentes y variaciones de 20–50 días. Umbrales en `PANORAMA_THRESHOLDS` (bolsa = los de `MARKET_MOVES`; bonos ±0,5 puntos de rentabilidad, y la tendencia es la del precio; materias ±10 %; cripto ±25 %; vivienda ≥ 10 % interanual). Fondos y ETF van como la bolsa y los bonos. La nota de la investigación por clase solo si es reciente y no dice «sin noticias».
  - La síntesis IA recibe las variaciones «vs. hace N días» (en p.p. si el valor es un %) y en el prompt qué indicador va con cada clase de activo. `decide()` y el análisis no cambian (siguen con los 6 primeros de `KEY_INDICATOR_ORDER`; goldens iguales).
  - **Más fuentes (2026-10-24, «cuantas más mejor»):** `savings.ts` (Banco de España: `be1907` depósitos de hogares a plazo ≤ 1 año y a la vista, mensual, ~2 meses de retraso → `INDICATOR_FRESHNESS.slowMonthlyKeys`, 80 días; `ti_1_3` Letras a 1 año, diario). `parseBdeTable` lee también filas mensuales («AGO 2026»). FRED (con `FRED_API_KEY`, ya configurada): bono de EE. UU. a 10 años (`DGS10`), bonos europeos de alto rendimiento (`BAMLHE00EHYIEY`), cobre (`PCOPPUSDM`) y gas europeo (`PNGASEUUSDM`), mensuales. Oro del día de gold-api.com (no oficial, `type: 'data'`, va antes que el FMI): sin histórico, así que el job apunta cada día su precio en `series.json` de la rama de datos (`scripts/market/sampled.ts`, 70 días) y calcula la variación a un mes cuando hay un dato de ≥ 28 días. El panorama de Ahorro seguro usa los depósitos reales (y el BCE solo si faltan).
  - `assetIndicators` = todo lo que no entra en `keyIndicators` (máx. 20), solo si hay algún grupo nuevo: así el chat también recibe S&P 500, Nasdaq, depósitos y Letras.
  - **El chat sí lo sabe** (2026-10-24): `MarketContext.assetIndicators` (grupos `bond`, `commodity`, `housing`, `crypto`, máx. 8; ausente si no hay ninguno). Con ellos, el prompt lleva `como_van_las_inversiones` (`lib/axis/chat/market-panorama.ts`: el mismo `marketPanorama` de la pantalla, sin las notas de la IA semanal, con instrucciones de describir solo lo pasado y no recomendar) y `contexto_de_mercado` va sin `assetIndicators` para no repetirlos. `buildChatGuard` licencia sus cifras (`panoramaFigures`, también los números desnudos). Sin `assetIndicators` (clientes antiguos, goldens) el prompt es idéntico al de antes. La respuesta local sin IA no lo usa.
  - **Objetivos por plazo (decidido por el usuario el 2026-10-25, bloque 1):** lo invertido cuenta para los objetivos lejanos. `allocateObjectives(objectives, liquid, { cents: valor invertido, asOf })`: primero lo invertido en cascada por prioridad, solo entre objetivos con fecha a más de 12 meses (`INVESTED_GOAL_MIN_MONTHS`, `takesInvested`); después el líquido entre todos para lo que falte. Cada reparto lleva `fromLiquidCents` y `fromInvestedCents`; `availableCents` = líquido − lo repartido del líquido; «Destinado a objetivos» del donut de Tu dinero es solo la parte líquida (lo invertido sigue en «Inversiones»). La tarjeta del objetivo enseña «X en cuenta · Y invertido (puede subir o bajar)». Contexto: `ObjectiveContext.investedCents` (solo si > 0, goldens sin cambios), `reservedForObjectivesCents` = parte líquida, `objectivesForAllocation` rebaja la meta en lo invertido para que las previsiones reproduzcan el reparto. Plan: paso `invest-goal-money` (tras `idle-money`) con el líquido de los objetivos a más de 60 meses (`LONG_GOAL_MONTHS`, también los cubiertos), de una vez o en 6 meses, mezcla a largo plazo sin parte arriesgada.
    - **Bloque 2 (2026-10-25):** el ahorro seguro (posiciones con `assetType` `safe`, o deducido del nombre) es un tercer fondo del reparto: va a cualquier objetivo con fecha no pasada (`takesSafe`), después de lo invertido y antes del líquido; los objetivos sin fecha (el colchón) solo reciben líquido. `goalInvestedPool(positions, asOf)` (`plan/mix.ts`) separa los dos fondos; `fromSafeCents` en el reparto y `ObjectiveContext.safeCents`. Pasos nuevos: `invest-for-goals` (tras los objetivos cercanos, antes del largo plazo: por cada objetivo en curso a más de 60 meses, lo que falta ÷ meses que quedan, sin contar rentabilidad; sale del ahorro antes del % de largo plazo; `atRisk` si no cabe) y `move-goal-to-safe` (justo después del colchón, uno por objetivo con parte invertida a ≤ 36 meses: repartido hasta un año antes, `floor(meses − 12)` meses; acción «Ir a Inversiones», apuntarlo con el tipo «Ahorro seguro»). No hay acción de vender: el usuario baja el valor de la posición y apunta la de ahorro seguro. `monthlyInvestCents(plan)` suma las dos inversiones mensuales (revisión del mes, foto del plan, simulador y proyección). A ≤ 12 meses, lo invertido que puede bajar deja de contar y la barra baja si no se ha pasado (el plan lo avisa desde los 36).
  - **«Cómo debería repartirse» (2026-10-25, decidido con el usuario: sobre todo el patrimonio y comparado con cómo lo tienes):** `lib/axis/plan/ideal-split.ts` (`idealSplit(plan, decision)`, pura, tests en `ideal-split.test.ts`). Llena el patrimonio de hoy (líquido + valor de las inversiones) en este orden: meta del colchón del plan, objetivos por prioridad con su `currentCents` (los de más de 60 meses, invertidos a largo plazo sin parte arriesgada; los demás, «Objetivos cercanos»), la deuda del paso `pay-debt`, y el resto con `mixWeights(riesgo, plazo, parte arriesgada si el plan la tiene)` o en ahorro seguro con plazo corto. Compara por grupos (cuenta + ahorro seguro, renta variable, renta fija, arriesgada, deuda, otras) con lo real; la frase de AXIS habla de la parte que más se aleja (≥ 5 puntos, `SPLIT_GAP_POINTS`) y nunca propone vender. Sin perfil: pide «Tu perfil»; sin colchón calculable: pide un mes de gastos. UI: `components/finax/ideal-split.tsx`, tarjeta en Tu dinero (tras el desglose) y fila «Cómo repartir tu dinero» en Herramientas (abre una hoja; `ToolsPanel` recibe ahora `overview`).
  - **Chat: una respuesta rechazada pasa al siguiente proveedor (2026-10-25).** El usuario recibió el motor local en su primera pregunta del día («¿Qué es la renta fija?»). Probando producción: una vez 502 `malformed: certainty` en 4,5 s (Cloudflare respondió y el detector de certeza lo rechazó) y otra vez 15,6 s con respuesta de Groq (Cloudflare falló en frío). Causa: la validación del chat se hacía DESPUÉS de la cadena, así que un rechazo no probaba Groq. Ahora `LanguageOptions.accept` valida cada intento dentro de la cadena (`fromProvider` lo aplica; `completeLogged` lo aplica si el modelo no lo hizo) y un `malformed` pasa al siguiente. Solo el chat: el análisis Decision First sigue yendo a local tras un rechazo. Tests en `chat-tools.test.ts`. Logs leídos después (cuenta de echo en la CLI): la petición REAL del usuario (11:44:15) pesaba 37.201 caracteres; Cloudflare agotó sus 14 s y Groq respondió **413** (gratuito: 8.000 tokens/min contando petición + tope de salida de 3.000). La frase rechazada en la prueba era «garantizada». Arreglo: `MAX_REQUEST_CHARS_BY_PROVIDER` (`limits.ts`, Groq 18.000) y `AxisLanguageModel.maxRequestChars`: la cadena no intenta un proveedor en el que la petición no cabe ni le reserva tiempo (log `skipped`/`too-large`), así que Cloudflare recibe los 22 s. Tamaños medidos con el mercado real: instrucciones ~8.900, esquema ~2.300, `contexto_de_mercado` ~6.100 y `como_van_las_inversiones` ~4.100 caracteres. Siguiente paso posible: mandar el mercado detallado solo cuando la pregunta va de mercado (el modelo tiene `buscar_mercado`), que bajaría la latencia de Cloudflare y dejaría a Groq de reserva útil. En el mismo log, el análisis Decision First de las 11:44:03 se rechazó (cobertura con un id mal copiado, cifras de mercado no licenciadas, consejo «guardar»): va a local por diseño.
  - **Chat: que casi nunca responda el motor local (2026-10-25, pedido por el usuario).** Tres cambios gratuitos además de los dos anteriores: (1) `MARKET_TOPIC` (`chat/prompt.ts`): «contexto_de_mercado» y «como_van_las_inversiones» (~10.000 caracteres) solo viajan si el mensaje o los dos últimos de la conversación hablan de mercado; si no, el modelo tiene `buscar_mercado` y el resumen sigue en las señales. Goldens `mercado-fresh` y `mercado-stale` actualizados a propósito. (2) Más tiempo solo para el chat: `CHAT_CHAIN_DEADLINE_MS` 37 s (por llamada, `LanguageOptions.deadlineMs`), `TIMEOUT_MS` de cada proveedor 36 s, `DEFAULT_CHAT_TIMEOUT_MS` 40 s en el móvil y `maxDuration = 60` en la ruta; el análisis sigue con 22/25 s. (3) `CHAT_RETRY_WITHIN_MS` (`chat/engine.ts`): si el intento falla en menos de 15 s por error de IA o red, se reintenta una vez dentro del mismo plazo; sin cupo, sin IA o sin conexión, no. Lo que sigue sin cubrir: sin conexión, los dos proveedores caídos o sin cupo, o Groq como reserva de preguntas grandes (su cupo gratuito no las admite). La única forma de acercarse al 100 % es un proveedor de pago como reserva: decisión del usuario.

---

## ✅ Actualización 2026-10-02: Cloudflare → Groq desplegado en producción

Esta sección manda sobre la del 2026-09-30 donde la contradiga.

- **Desplegado:** `main` = `origin/main` = `55ed6a9`, desplegado en producción (despliegue `echo-9ihztnvbc`). `GET /api/axis` → `{"available":true,"mode":"decision-first"}`.
- **Despliegue automático confirmado:** Vercel está conectado a GitHub; un push a `main` despliega a producción.
- **Vercel CLI:** cuenta `alexgisbertsalminen-8804`, equipo `alex-530c` (Hobby), proyecto `echo`.
- **Variables de producción** (todas guardadas como *Secret*: no se pueden leer ni con `vercel env pull` ni en el panel):
  - `AXIS_AI_PROVIDER=cloudflare`
  - `AXIS_AI_FALLBACK_PROVIDER=groq`
  - `AXIS_AI_MODEL_GROQ=openai/gpt-oss-20b`
  - `CF_ACCOUNT_ID`, `CF_API_TOKEN`
  - `GROQ_API_KEY`, `AXIS_DECISION_FIRST`
  - `AXIS_AI_MODEL` **borrada**. Su valor anterior no se pudo leer; se asumió `openai/gpt-oss-20b`.
- **Vuelta atrás:** poner `AXIS_AI_PROVIDER=groq` y redesplegar. Así queda solo Groq, con `AXIS_AI_MODEL_GROQ`.
- **Previews en error de la rama `market-data`:** son los commits de los bots. Esa rama no contiene la app («No Next.js version detected»). Es ruido, no afecta a producción.

### Primeras medidas reales (2026-10-02, 4 peticiones)

| Petición | Proveedor | Resultado | Entrada / salida (tokens) |
|---|---|---|---|
| Análisis Decision First | Cloudflare → **timeout** → Groq (fallback) | ok vía Groq | 3.836 / 1.757 (Groq) |
| Chat ×3 | Cloudflare (Gemma 4) | ok, `finishReason: stop` | 5,6k–5,9k / 150–260 |

- **Cloudflare** gasta unas **55–60 neurons por mensaje de chat**. Con el plan gratuito (10.000 neurons/día, pendiente de confirmar en el panel de Cloudflare) da para unos 170 mensajes al día.
- **Groq confirma 8.000 TPM** en sus cabeceras (`limitTokens: 8000`). Un solo análisis gastó 5.593 tokens, lo que confirma el diagnóstico del 429 de §7.1.
- **El análisis con Cloudflare superó el plazo:** el principal dispone de ~14 s. Con una sola muestra no se sabe si es sistemático. Si lo es, el análisis irá casi siempre a Groq y volverá a consumir sus 8.000 TPM.
- **Un chat de Cloudflare fue rechazado por el detector de certeza** («asegurar», `assurance`) y respondió el motor local. Es el comportamiento previsto (no hay fallback tras un rechazo de validación). Falta saber si Gemma lo provoca más que Groq; el log no guarda el texto.
- **Resuelto respecto a la sección del 2026-09-30:** Cloudflare no envía cabeceras `x-ratelimit-*` en respuestas 200. El formato de su 429 sigue sin observarse.

### Siguiente paso

1. Recoger más muestras de producción: varios análisis y chats, filtrando `[axis] llamada` en los logs.
   Con la CLI: `vercel logs --deployment <url> --since 1h -x`. Sin `--follow`, el comando no se queda escuchando.
2. Según los datos:
   - Si el timeout del análisis es sistemático, dar más plazo al principal o enviar el análisis directamente a Groq.
   - Si «asegurar» salta a menudo con Gemma, revisarlo (sin relajar `certainty.ts` a ciegas).

---

## ⚡ Actualización 2026-09-30: Cloudflare Workers AI + cadena de fallback

Esta sección manda sobre lo que la contradiga más abajo (§1, §6.10, §7, §9 y §14 describen el estado del 2026-09-27).

- **Cadena de proveedores de AXIS:** `AXIS_AI_PROVIDER` (principal), luego `AXIS_AI_FALLBACK_PROVIDER` (opcional), luego el motor local (cliente, sin cambios).
  Valores: `cloudflare` | `groq` | `gemini`. Configuración prevista: `cloudflare` → `groq`.
- **Cloudflare** (`lib/ai/providers/cloudflare.ts`):
  - Credenciales: `CF_ACCOUNT_ID` + `CF_API_TOKEN`.
  - Modelo por defecto: `@cf/google/gemma-4-26b-a4b-it`, con `chat_template_kwargs.enable_thinking: false` y `json_schema strict`.
- **Modelo por proveedor:** `AXIS_AI_MODEL_CLOUDFLARE`, `AXIS_AI_MODEL_GROQ` y `AXIS_AI_MODEL_GEMINI`.
  `AXIS_AI_MODEL` queda como heredada y **solo se aplica al principal**.
  Al pasar el principal a Cloudflare hay que borrarla en Vercel o poner un modelo `@cf/…`.
- **Un proveedor sin credenciales se omite.** Si faltan las de Cloudflare, Groq funciona solo, igual que hoy.
- **Cuándo se pasa al siguiente** (`isProviderFailure` en `lib/axis/language/model.ts`):
  - Solo ante fallos del proveedor: 429, timeout, error de red, 5xx, respuesta vacía, truncada o que no es JSON, y 401/403 (credenciales de ese proveedor).
  - **No** ante otros 4xx (404, 400…) ni negativas.
  - **Nunca** tras un rechazo de validación o licencia de Decision First: eso ocurre fuera de la cadena y va directo al motor local.
- **Plazo total compartido** (`fallbackChain`, en `limits.ts`):
  - La cadena dispone de 22 s en total (el cliente espera 25 s).
  - El principal recibe el plazo menos 8 s de reserva para el fallback.
  - No se empieza un intento con menos de 3 s restantes; ese intento queda registrado como `skipped`.
  - Si el cliente cancela, no se prueba el fallback.
- **Error final:** si todos los proveedores dieron 429, la ruta responde 429 («sin cupo»). En cualquier otro caso usa el último fallo que no fue un 429, y la ruta responde 502.
- **Topes de salida por proveedor** (`AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS_BY_PROVIDER`): Cloudflare 1.200, Groq 3.000, Gemini 3.000. `MAX_OUTPUT_TOKENS` vuelve a 3.000 como valor por defecto.
- **Logs:**
  - Una línea `[axis] llamada:` **por intento**, con `attempt`, `fallback` y `outcome` (`ok`|`error`|`skipped`).
  - Se añade `neurons` (cuota diaria de Cloudflare) a la lista de campos permitidos.
  - Siguen sin registrarse textos, cifras, cuentas ni claves.
- **Etiqueta `engine`:** dice qué proveedor respondió realmente.
- **Cupo por instancia:** se sigue consumiendo **uno por petición del usuario**, no uno por intento.
- **Tests nuevos:** `cloudflare-language.test.ts` y `provider-chain.test.ts`, además de ampliaciones en `server.test.ts`, `call-log.test.ts` y `groq-language.test.ts`.
- **Desplegado el 2026-10-02** (ver la sección anterior). Variables definidas en Vercel:
  - `AXIS_AI_PROVIDER=cloudflare`
  - `AXIS_AI_FALLBACK_PROVIDER=groq`
  - `CF_ACCOUNT_ID`
  - `CF_API_TOKEN`
  - `AXIS_AI_MODEL_GROQ=openai/gpt-oss-20b`
  - y borrar `AXIS_AI_MODEL`.
- **NO VERIFICABLE desde el repo:**
  - El formato real del cuerpo de un 429 de Cloudflare (`rateLimitFromBody` solo entiende el de Groq).
  - Si envía cabeceras `x-ratelimit-*`.
  - Su latencia real con Gemma 4.
- **El arreglo de `advice.ts` ya está commiteado** (`36b18b1`).

---

## 0. Reglas de trabajo que se han seguido (conviene mantenerlas)

- **Dinero siempre en céntimos enteros.** Nunca euros en coma flotante al guardar o calcular.
- **AXIS decide con reglas; el modelo de lenguaje solo redacta.** Nunca dejar que el LLM
  fije recomendación, acción, prioridad, siguiente paso, confianza o cifras.
- **Los goldens son contratos.** Si cambian, se regeneran a propósito
  (`UPDATE_GOLDEN=1 pnpm test`) y se revisa el diff; nunca «para que pase».
- **Dexie: nunca reescribir una versión antigua.** Siempre añadir `db.version(N+1)`.
- **Sin secretos en el cliente** (nada de `NEXT_PUBLIC_` con claves) ni en Git.
- Commits pequeños con mensajes `feat:` / `fix:` / `refactor:` en inglés; textos de UI en español.
- `main` se despliega en Vercel (probablemente de forma automática: NO VERIFICABLE desde el repo).

---

## 1. Estado actual

| Dato | Valor |
|---|---|
| Repositorio | `https://github.com/Alex808keoic/echo.git` |
| Rama | `main` (igual que `origin/main`, 0 por delante / 0 por detrás) |
| Commit actual | `5050aa2` — feat: log AXIS provider calls with token usage and rate-limit details |
| Otras ramas | `axis-usage-logging` (= `5050aa2`, ya fusionada en main), `origin/market-data` (datos de mercado; la escriben los bots) |
| Worktrees / stash | Uno solo / vacío |
| Producción | `https://echo-self-phi.vercel.app` (proyecto Vercel «echo») |
| `GET /api/axis` en producción (2026-09-27) | `{"available":true,"mode":"decision-first"}` |
| Tests | `pnpm test` → **383 pasan, 0 fallan**, 74 suites (con los cambios locales incluidos) |
| Typecheck | `pnpm typecheck` → OK |
| Build | `pnpm build` → OK (Next 16.3.3, Turbopack). Rutas: `/` estática, `/api/axis` dinámica, `/manifest.webmanifest` |
| Lint | **No existe** (no hay ESLint ni script de lint) |
| CI | **No hay CI de tests/build.** Solo existen los workflows de mercado |

### Cambios locales SIN commit (4 archivos, a propósito)

| Archivo | Cambio | Recomendación |
|---|---|---|
| `lib/text/advice.ts` | Nuevo `mentions()`: los nombres de objetivo/posición/categoría se buscan como **palabra completa** y solo si tienen **≥ 3 caracteres**. Corrige un falso positivo real de producción (un objetivo llamado «a» hacía que «ahorra» contara como consejo sobre él y Decision First rechazara respuestas válidas). | **Conservar y commitear** junto con su test |
| `lib/axis/__tests__/advice.test.ts` | 3 tests nuevos para lo anterior | **Conservar** |
| `lib/axis/ai/server/limits.ts` | `MAX_OUTPUT_TOKENS` 3000 → **1200** | **NO commitear todavía.** Los modelos `gpt-oss` razonan y en Groq el razonamiento cuenta dentro de `max_completion_tokens`: 1200 podría truncar respuestas (`finish_reason: length` → fallback «la IA no respondió»). Decidir con datos de los logs (§8) |
| `lib/axis/__tests__/groq-language.test.ts` | El test compara con `AXIS_AI_LIMITS.MAX_OUTPUT_TOKENS` en vez del literal 3000 | Conservar (va con el cambio de límites, pero funciona con cualquier valor) |

Producción sigue con **3000** tokens de salida (lo que hay en `main`).

---

## 2. Cómo ejecutar

```bash
pnpm install          # pnpm 11.24.0 (packageManager); Node 24 en local y en los workflows
pnpm dev              # http://localhost:3000
pnpm test             # node:test + tsx (lib/**/*.test.ts, scripts/**/*.test.ts); sin red
pnpm typecheck
pnpm build
pnpm market:light     # comprobación de mercado en local, sin IA → public/market-data-local/
pnpm market:deep      # investigación con proveedor mock, sin IA
UPDATE_GOLDEN=1 pnpm test   # SOLO para regenerar goldens a propósito
```

Para que la app local lea el mercado local: `NEXT_PUBLIC_MARKET_DATA_URL=/market-data-local` en `.env.local`.

---

## 3. Arquitectura

**Stack:** Next.js 16 (App Router, una sola página cliente), React 19, TypeScript estricto,
Tailwind 4, Dexie 4 (IndexedDB). Componentes de UI propios (no usa shadcn). Offline-first y sin login.

```
app/                page.tsx (shell: navegación por useState, sin router) · layout.tsx · manifest.ts
  api/axis/route.ts ÚNICO backend: IA de AXIS (análisis y chat)
components/finax/   screens/ (8 pantallas) · forms/ · charts/ (SVG propios) · UI base propia
hooks/              use-financial-overview (única fuente derivada) · use-axis · use-axis-chat
                    use-market · use-market-context
lib/
  types.ts money.ts format.ts dates.ts
  db/               Dexie: schema v1–v5, repositorios, backup, demo, memoria/conversación de AXIS
  finance/          patrimonio, resúmenes, objetivos, sugerencia de categoría
  axis/             motor AXIS (ver §6)
    core/           decision.ts expression.ts semantic.ts figures.ts fallback.ts
    rules/          income expenses savings liquidity objectives investments market shared index
    profile/        UserProfile (types.ts, derive.ts)
    chat/           conversación
    ai/             prompt/schemas/transport del análisis · server/{analyze,limits}.ts
    language/       AxisLanguageModel (envuelve el proveedor)
    prompts/        prompts por bloques
  text/             certainty.ts (certeza injustificada) · advice.ts (licencia de consejos)
  ai/providers/     gemini.ts groq.ts types.ts (compartidos por AXIS y Market Research)
  market/           tipos, validación, frescura, relevance (MarketContext)
scripts/market/     Market Research Engine (lo ejecuta GitHub Actions)
.github/workflows/  market-light.yml · market-deep.yml
public/sw.js        service worker (solo en producción)
docs/               AXIS.md · MARKET_RESEARCH.md · SPIKE_GOLD_SOURCES.md · este archivo
```

**Pantallas:** Inicio, Mi Dinero, Movimientos, Estadísticas y AXIS (pestañas); Objetivos,
Inversiones y Ajustes (subpantallas). Formularios en hoja inferior (`SheetProvider`).
En escritorio la app se ve dentro de un marco de teléfono.

---

## 4. Datos (Dexie, `lib/db/db.ts`, base `finax`)

| Versión | Qué añade |
|---|---|
| v1 | `movements: 'id, date, type, category'`, `objectives: 'id'`, `positions: 'id, date'`, `config: 'key'` |
| v2 | `market: 'key'` (caché de mercado, un registro `latest`) |
| v3 | `axisMemory: 'key'` (últimas 5 conclusiones de AXIS) |
| v4 | `axisMemories: 'id, updatedAt'` (memorias aceptadas), `axisConversation: 'key'` (historial) |
| v5 | Sin cambio de schema; `upgrade()` renombra la categoría de ingreso `Trabajo` → `Paga` |

**Entidades** (`lib/types.ts`):
- `Movement` {id, type `ingreso|gasto`, `amountCents` (> 0; el signo lo da `type`), date `YYYY-MM-DD`, category, motivo?, nota?, createdAt, updatedAt}.
- `Objective` {id, name, currentCents, targetCents, targetDate?}.
- `Position` {id, name, investedCents, valueCents (manual), date}.
- `AppConfig` {key `config`, initialBalanceCents, demo?}.

**Categorías cerradas:**
- Gasto: Comida, Restaurantes, Salidas, Caprichos, Ropa, Otros.
- Ingreso: Paga, Regalos, Otros.
- «Otros» exige motivo.
- `LEGACY_CATEGORIES` traduce categorías antiguas.

**Backup** (`lib/db/backup.ts`):
- Exporta JSON `finax-backup` v1 con config, movimientos, objetivos y posiciones.
- La validación es estricta; la restauración es atómica (clear + bulkAdd) y migra categorías.
- **No incluye** el mercado ni nada de AXIS (memorias, conversación, conclusiones), a propósito.
- `clearAllData` borra las 8 tablas.

**Demo** (`lib/db/demo-seed.ts`): solo con la base vacía; marca `config.demo = true` y se ve como tal en la UI.

---

## 5. Modelo financiero, objetivos y gráfica

- **Líquido** = saldo inicial + movimientos con signo (`lib/finance/patrimonio.ts` `computeLiquidCents`).
- **Patrimonio** = líquido + suma de `valueCents` de las posiciones (`hooks/use-financial-overview.ts`).
- **Nada financiero se persiste:** todo se deriva en vivo.
- **Registrar una inversión NO descuenta liquidez.** Si el dinero salió del líquido y no se
  registra también como gasto, se cuenta dos veces. Es una limitación de diseño y no está explicada en la UI.
- **Reservado en objetivos** (solo lo usa AXIS): `min(Σ min(current, target), líquido)` (`lib/axis/context.ts`).
- **Objetivos:** `currentCents` es un número que el usuario edita a mano en el formulario.
  No hay acción de «aportar» ni vínculo con movimientos. La UI muestra progreso, lo que falta y la fecha
  (`components/finax/goal-card.tsx`).
- **Gráfica de patrimonio** (`components/finax/charts/evolution-chart.tsx` + `line-chart.tsx`, SVG propio):
  - Usa la serie de `buildPatrimonioSeries`: un punto por día con movimientos, **solo el líquido**
    (sin inversiones).
  - Periodos: 1M/3M/6M/1A/Todo en Inicio; 6M/1A/Todo en Estadísticas.
  - Antepone el último cierre real anterior al periodo.
  - Con menos de 3 días con movimientos muestra «Aún no hay evolución» (no inventa datos).
  - **Inconsistencia de UX:** la cifra grande de Inicio es el patrimonio **total**, pero la curva y la
    variación son del **líquido** (el texto dice «líquido, en el periodo»).
- **Estadísticas:** donut por categoría, barras mensuales (el rango «Todo» cubre desde el primer movimiento, mínimo 12 meses;
  con más, las barras se desplazan), evolución.
- **Formato:** `lib/format.ts` y `lib/money.ts` (es-ES hecho a mano: `3.486,70 €`).

### ⚠️ Bug conocido de parseo de importes (sin corregir)

`lib/money.ts` `parseDecimalToCents` trata **siempre el punto como separador de miles**.
Comprobado:
- `"12,50"` → 1250 céntimos (correcto).
- **`"12.50"` → 125000 céntimos (1.250,00 €).**
- `"12.5"` → 12500.

El campo usa `inputMode="decimal"` (`components/finax/field.tsx:48`) y muchos teclados móviles muestran «.».
**El importe puede quedar multiplicado por 100 sin avisar.**

---

## 6. AXIS

### 6.1 Flujo real

```
Dexie → FinancialSnapshot → buildFinancialContext (lib/axis/context.ts)
      + MarketContext (hooks/use-market-context → lib/market/relevance.ts)
      + AxisMemory (lib/db/axis-memory.ts getAxisMemory: conclusiones + memorias aceptadas)
      [UserProfile: NO se construye en producción — ver §6.7]

ANÁLISIS (pantalla AXIS; useAxis(overview, {ai:true}))
  local:  decide() → render() (compose.ts) → parseAxisAnalysis (validate.ts)
  ia:     POST /api/axis → servidor:
            legacy:          buildAIRequest → el modelo redacta todo → parseAxisAnalysis
            decision-first:  decide() → buildExpressionRequest → modelo → parseExpression
                             → validateExpression → mergeExpression → parseAxisAnalysis
          cualquier respuesta ≠ 200 → cliente: render(decide(input)) (la MISMA decisión, en local)
CHAT (useAxisChat)
  POST /api/axis {mode:'chat'} → buildChatRequest → modelo → parseChatReply → validateChatReply (solo certeza)
  cualquier fallo → composeLocalReply (motor local, dice el motivo)
```

Las tarjetas de AXIS en Inicio, Mi Dinero y Estadísticas usan **solo el motor local**
(salvo que ya exista un análisis con IA para la misma instantánea). Los resultados se cachean
por identidad del `overview` y por `researchId@freshness` del mercado.

### 6.2 `decide()` y reglas deterministas

**`decide()`** (`lib/axis/core/decision.ts`):
- Salida: señales priorizadas, líder, relevantes (≤ 4), hechos (≤ 5), una recomendación o `null`,
  alternativas (≤ 2), incertidumbres (≤ 3, datos demo primero), confianza, `missing`, `nextStep`, `profile`.
- **Confianza:** `baja` con demo o contexto `limited`; `alta` con ≥ 3 meses y ≥ 15 movimientos; si no, `media`.
- **Nivel:** `none` sin movimientos; `limited` sin mes anterior o con menos de 5 movimientos.
- **Prioridad:** critical > high > medium > low; desempate por dominio savings → objectives → expenses → income → investments → market.
- **Acciones cerradas** (`lib/axis/types.ts`):
  - Verbos: allocate, reserve, define, review, register, adjust, hold, complete-cushion, decide.
  - Destinos: objective, position, category, cushion, data, none.
  - **No existen invest, buy ni sell.**

**Reglas** (umbrales en `rules/shared.ts` `THRESHOLDS`):

| Señal | Condición | Prioridad | Acción |
|---|---|---|---|
| `income.none` | 0 ingresos y gastos > 0 | high (si el mes anterior tuvo ingresos) / medium | register/data |
| `income.drop` | ingresos −20 % o más | high | adjust/none |
| `income.extraordinary` | ingresos +50 % o más | low | — (alternativa) |
| `expenses.over-income` | gastos > ingresos | **critical** | adjust/category |
| `expenses.increase` | gastos +20 % o más | high/medium/low | review/category (solo con margen ajustado) |
| `expenses.concentration` | una categoría ≥ 50 % y margen ajustado | medium | decide/category |
| `savings.no-period-data` | 0 movimientos este mes | medium | register/data |
| `savings.healthy` / `savings.tight` | tasa de ahorro ≥ 20 % / < 20 % | low / medium | allocate/objective o define/objective (healthy) |
| `savings.falling` | ahorro < 50 % del mes anterior | high | — |
| `liquidity.below-min` | **solo con perfil**: líquido < mínimo declarado | high | complete-cushion/cushion |
| `objectives.completed/overdue/pace/near/stale/no-date:<id>` | según progreso y fecha | low/high/low-high/medium/medium/low | decide / adjust / reserve |
| `investments.none/concentration/low-liquidity/manual-values` | cartera | low/medium/medium/low | decide/position, review/cushion |
| `market.stale/snapshot/caution:<key>` | según la frescura del mercado | low/low/medium | hold/position (caution) |

Para añadir una regla: función `Rule` en `lib/axis/rules/`, registrarla en `RULES` (`rules/index.ts`) y cubrirla con tests. Los goldens de decisión cambiarán.

### 6.3 Decision First (activo en producción)

- **Flag:** `AXIS_DECISION_FIRST=true` (sin distinguir mayúsculas; cualquier otro valor = legacy).
  `GET /api/axis` devuelve el `mode`.
- **Solo afecta al análisis, no al chat.**
- **El modelo recibe** (`core/expression.ts`):
  - `decision_de_axis`: señales con id, prioridad, hecho e interpretación; hechos; recomendación (`que`, `por_que_de_axis`, siguiente paso); alternativas; incertidumbres; confianza; si son datos demo.
  - `cifras_permitidas`: **solo las cifras de contexto** (68 en un caso típico).
  - `memoria_relevante`: ≤ 5 notas del usuario y la última conclusión (≤ 300 caracteres).
- **El modelo NO recibe:** el contexto bruto, el mercado (salvo lo que haya en los textos de las señales), la `action` ni el perfil.
- **El modelo devuelve solo redacción** (`ai/schema-expression.ts`): headline, interpretation {summary, signals[{id,text}]}, recommendation_why|null, alternatives, uncertainties, conclusion.
- **La fusión** (`mergeExpression`) toma de la decisión: hechos, ids y prioridades, `recommendation.what`,
  `action`, `nextStep`, nombres de alternativas, títulos de incertidumbres, confianza y demo.
- **Validación** (`core/semantic.ts`): coverage (ids, nombres y títulos exactos), figures, execution, certainty y advice.
- **Si algo falla:** log `[axis] decision-first: expresión rechazada: …` → 502 → el cliente muestra la misma decisión en local.
- **Sin datos** (`level none`): 400 sin consumir cupo.

### 6.4 Licencia de cifras (`lib/axis/core/figures.ts`)

- **Conjunto cerrado y trazable:** `FigureKind` (money/percent/count), `FigureSource` (context/decision-text/message/derived), `DerivedOp` (liquid-minus, free-liquid-minus, savings-minus, amount-over-income).
- **Normalización:** `1.300 €` ≡ `1.300,00 €`; `65 %` ≡ `65%`.
- **Siempre prohibidos:** importes escalados («3 mil €», «2 k€»).
- **Números sin unidad:** se comprueban solo si tienen 4+ dígitos o separador de miles; se aceptan si coinciden con una cifra permitida. Los años 1990–2100 y las fechas se ignoran.
- **Cifras del mensaje y derivadas** (`messageFigures`, `deriveFigures`): implementadas pero **solo se usan en tests** (preparadas para el chat).
- **Limitaciones conocidas:**
  - **Los índices de mercado en puntos** («15.234,5 pts», y el `overview` del mercado «19.659,8 puntos») son números sin unidad **no licenciados**. Si el modelo los repite, Decision First rechaza la respuesta (sin test).
  - «150 al mes» (menos de 4 dígitos sin unidad) y los números escritos en letra no se detectan.

### 6.5 Licencia de consejos (`lib/text/advice.ts`)

- **Léxico cerrado** de 13 clases de verbo, detectado por cláusulas.
- **Destinos:** entidad del usuario (por nombre), external (ETF, bitcoin, Tesla…, o un nombre propio desconocido), cushion, data o none.
- **Qué se licencia:**
  - Un consejo negado.
  - Uno blando (revisar, mantener, esperar) sin destino externo.
  - Uno ejecutable solo si AXIS recomienda y es compatible con `COMPATIBLE[action.verb]` y con el destino, o si cita una alternativa de AXIS.
- **invest, buy y sell nunca se licencian.**
- **Solo se aplica en Decision First** (ni en legacy ni en el chat).
- **Limitación:** solo detecta verbos del léxico («Podrías plantearte un ETF» pasa).
- Una acción sin destino (`target: 'none'`, p. ej. `income.drop` → «ajusta el gasto») acepta cláusulas sobre tus datos (gasto, ingresos): antes se rechazaban y el análisis de Inicio caía al motor local en torno a la mitad de las veces (arreglado el 2026-10-18).
- **Diagnóstico:** un 502 de `/api/axis` lleva `failure` (clase del error y, si la expresión no pasó, los invariantes y el verbo/clase de cada consejo rechazado; nunca nombres ni cifras). Probar con un contexto de prueba gasta cupo diario (40).
- El arreglo de nombres cortos está **sin commit** (§1).

### 6.6 Chat conversacional (`lib/axis/chat/`, `hooks/use-axis-chat.ts`, `components/finax/axis-conversation.tsx`)

- **Contexto en 4 niveles** (`chat/prompt.ts`):
  - `datos_actuales`: contexto sin la serie diaria + señales (id, prioridad, hecho, interpretación) + **mercado completo**.
  - `memoria`: **todas** las memorias aceptadas + ≤ 5 conclusiones.
  - `conversacion_actual`: resumen + últimos 8 mensajes.
  - `consulta_actual`.
- **Historial** (`chat/history.ts`): 20 mensajes íntegros en Dexie; lo anterior se comprime sin IA (≤ 160 caracteres por línea, ≤ 1.500 en total).
- **Validación:** forma (`parseChatReply`) + **solo certeza** (`chat/semantic.ts`).
  **Sin Decision First, sin licencia de cifras ni de consejos, sin perfil, sin detección de intención.**
- **Fallback** (`chat/local-reply.ts`): lectura local + motivo. Etiquetas (`axis-conversation.tsx:44`):
  - `unavailable` → «IA no disponible»
  - `offline` → «sin conexión»
  - **`rate-limited` (cualquier HTTP 429) → «sin cupo de IA por ahora»**
  - `error` → «la IA no respondió»
  - `no-data` → «sin datos suficientes»

### 6.7 Memoria y UserProfile

**Memoria** (`chat/memory.ts`, `lib/db/axis-memories.ts`):
- `UserMemory` {id, content ≤ 240, category, importance, confidence, source, createdAt, updatedAt, fact?}.
- Solo se guarda lo que el usuario acepta («Recordar»).
- `replacesId` actualiza una memoria existente; el contenido equivalente no se duplica.
- Máximo 30: salen primero las menos importantes y más antiguas. La UI **ignora** las expulsadas (desaparecen sin aviso).
- No hay caducidad. Se olvida una a una o con «Borrar todos los datos».
- Además, las 5 últimas conclusiones del análisis se guardan en `axisMemory`.

**UserProfile** (`lib/axis/profile/`) — **implementado y probado, pero inerte en producción**.

> ⚠️ **No confundir con el título del commit `6f4f7a2` «feat: connect AXIS profile to
> deterministic decision».** Ese commit conecta el perfil *dentro de* `decide()`: las reglas
> lo leen si `AxisInput.profile` existe. **No toca a ningún llamador**: solo cambia
> `lib/axis/core/decision.ts`, `lib/axis/rules/*`, `lib/axis/types.ts`, `lib/axis/profile/types.ts`
> y tests/goldens. El commit `16789ca` añadió `deriveProfile`/`reconcileProfile`, también sin
> llamadores. (No existe `lib/axis/decision.ts`; el archivo es `lib/axis/core/decision.ts`.)

Estado verificado en `5050aa2`:

| # | Pregunta | Estado | Evidencia |
|---|---|---|---|
| 1 | ¿Existe? | **Sí** | `lib/axis/profile/types.ts` (`UserProfile`, `ReconciledProfile`, `ProfileInfluence`, `DecisionProfile`, `MemoryFact`); `AxisInput.profile?` en `lib/axis/types.ts`; `Signal.profileInfluence?`; `AxisDecision.profile` |
| 2 | ¿Se deriva? | **Solo en tests** | `deriveProfile` (`profile/derive.ts:31`) no tiene ningún llamador fuera de `lib/axis/__tests__/` |
| 3 | ¿Se reconcilia? | **Sí, dentro de `decide()`**, pero siempre sobre el perfil vacío en la app | `core/decision.ts`: `reconcileProfile(input.profile ?? EMPTY_PROFILE, ctx)` |
| 4 | ¿Llega a `decide()`? | **La vía existe; en la app llega siempre vacío** | Llamadores reales de `decide()`: `local-engine.ts:25` (con `analyzeSnapshot`, `engine.ts:34`: `{context, market, memory}` sin `profile`) y `ai/server/analyze.ts:196` (input de `analyze.ts:173`, sin `profile`). `route.ts` no lee `profile` del cuerpo |
| 5 | ¿Modifica reglas? | **Sí, cuando hay perfil** (probado en tests) | `rules/liquidity.ts`, `savings.ts`, `income.ts`, `objectives.ts`, `investments.ts` vía `rules/shared.ts` (`liquidityShortfall`, `irregularIncomeOf`, `prioritiesOf`, `horizonOf`, `riskAttitudeOf`); suites liquidity, irregular-income, priorities, horizon-risk y profile-decision |
| 6 | ¿Llega a producción? | **No** | Nadie construye el perfil ni lo pasa; y aunque se hiciera, ninguna memoria puede tener `fact`, porque `AXIS_CHAT_SCHEMA` y `parseChatReply` no lo incluyen. El chat ni siquiera pasa perfil a sus señales (`chat/prompt.ts:42`, `chat/local-reply.ts:21`) |

Detalle:
- **Campos:** `horizon` (short/medium/long), `riskAttitude` (conservative/balanced/dynamic), `minLiquidityCents`, `irregularIncome`, `priorities` (ids de objetivos).
- `deriveProfile(memories)` toma solo `UserMemory.fact` válidos (nunca el texto libre); gana la memoria más reciente de cada clase.
- `reconcileProfile` solo quita prioridades de objetivos que ya no existen o están completados.
- **Qué cambia en `decide()` cada campo** (todo trazado en `profileInfluence`):
  - `minLiquidityCents`: crea `liquidity.below-min` y quita la alternativa «Mantener liquidez».
  - `irregularIncome`: baja de high a medium algunas señales de ingresos y cambia textos.
  - `priorities`: elige el objetivo destino.
  - `horizon` y `riskAttitude`: solo cambian textos.
- **Por qué no funciona en producción:**
  1. `deriveProfile` **no se llama** fuera de los tests.
  2. Nadie pasa `profile` a `decide()`: ni `analyzeSnapshot` (`lib/axis/engine.ts`), ni el servidor (`ai/server/analyze.ts`), ni la ruta, ni el chat.
  3. Ninguna memoria puede tener `fact`: `AXIS_CHAT_SCHEMA` (`chat/schema.ts`) no incluye `fact` y `parseChatReply` no lo copia.

### 6.8 Secretos

**`lib/axis/chat/secrets.ts`:**
- Detecta contraseña, PIN, CVV, api key, token, formatos de clave (Google, OpenAI, Groq, GitHub, AWS), IBAN y tarjetas.
- **Se redacta en 4 sitios:** el hook (antes de guardar y enviar), la ventana del historial, el transporte del navegador y el servidor.
- Las propuestas de memoria con secretos se descartan.
- No redacta los nombres de objetivos, posiciones o categorías.

**Auditoría (2026-09-23):** 0 coincidencias de patrones de clave en el historial de Git, en los archivos trackeados y en `.next/static`. Los tests contienen cadenas sintéticas con forma de clave (no son reales). `.env.local` (ignorado) contiene un token de Vercel CLI: no subir nunca.

**`.gitignore`** cubre `.env`, `.env.local`, `.env*.local` y `.vercel/`. **No cubre `.env.production`**, que está trackeado a propósito y hoy solo tiene una URL pública; no añadir ahí secretos.

### 6.9 Fallback local

`lib/axis/core/fallback.ts` `withFallback`: sin modelo → local; con modelo → intento con timeout; si falla → local. Finax funciona completo sin IA.

**La disponibilidad se comprueba una sola vez:**
- Análisis: una vez por carga de la página. `aiEngine` es un singleton del módulo; si el primer `GET` falla, no hay IA hasta recargar.
- Chat: una vez por montaje de la pantalla.

### 6.10 Límites de AXIS

| Límite | Valor | Dónde | Al alcanzarlo |
|---|---:|---|---|
| Peticiones/día | 40 (`AXIS_AI_MAX_REQUESTS_PER_DAY` solo puede bajarlo) | `ai/server/limits.ts`, **por instancia de Vercel**, en memoria | 429 sin llamar al proveedor; log `[axis] sin cupo de la instancia: …` |
| Peticiones/minuto | 12 | ídem | ídem |
| Tamaño del cuerpo | 40.000 caracteres | `route.ts` | 413 |
| Tokens de salida | **3000 en main** (1200 sin commit) | `limits.ts` → análisis y chat | truncado → 502 |
| Timeout del proveedor | 20 s | `limits.ts` | 502 |
| Timeout del cliente | 25 s | `ai-engine.ts`, `chat/engine.ts` | local |
| Chat | mensaje ≤ 1.000, 20 guardados, 8 al modelo, resumen ≤ 1.500, 30 memorias de ≤ 240, respuesta ≤ 2.000 | `chat/types.ts` `CHAT_LIMITS` | recorte / 400 |
| Reintentos | **ninguno** | — | — |

**El análisis y el chat comparten** proveedor, contador y cuota. Cada mensaje de chat consume lo mismo que un análisis.

---

## 7. Proveedor y modelo de IA

**Proveedores** (`lib/ai/providers/`):
- **Groq:** `https://api.groq.com/openai/v1/chat/completions`, `json_schema strict`, sin tools, temperatura 0.2.
- **Gemini:** `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, JSON por esquema.

**Selección en AXIS:**
- `AXIS_AI_PROVIDER` (`groq`|`gemini`) + su clave + `AXIS_AI_ENABLED` distinto de `false`.
- **No hay fallback entre proveedores en AXIS** (sí lo hay en Market Research). *(Superado el 2026-09-30: ver la actualización al principio.)*

**Modelo:**
- `AXIS_AI_MODEL`, compartido por los dos proveedores. Si falta, se usa `openai/gpt-oss-120b` (Groq) o `gemini-2.5-flash-lite` (Gemini).
- `.env.example` indica `openai/gpt-oss-20b` para producción.
- **El modelo real de producción es NO VERIFICABLE desde el repo.** Se ve en DevTools: la respuesta de `POST /api/axis` trae `engine.label = "IA de AXIS (groq:<modelo>)"`; el cliente la sustituye antes de mostrarla. También aparece en los logs nuevos.

**Errores** (`lib/ai/providers/types.ts` `classifyHttpStatus`):
- 429 → `rate-limit` → la ruta responde **429**.
- 401/403 → `unavailable` → 502.
- Otros códigos → `http` → 502.
- Truncado o JSON inválido → `malformed` → 502.
- Timeout → 502.

### 7.1 El «sin cupo de IA por ahora» y los límites de Groq

- La etiqueta sale ante **cualquier 429**, sea del cupo interno o de Groq. El cliente no distingue entre los dos; **el log del servidor sí**.
- **Diagnóstico más probable:** el 429 viene del **límite de tokens por minuto de Groq**. El plan gratuito para `gpt-oss` ronda los 8K TPM según la documentación pública; **confirmarlo en la consola de Groq**.
- **Tamaño medido** de las peticiones (con el código real, estimación por caracteres, 2026-09-23):

| Petición | Tokens de entrada (aprox.) |
|---|---:|
| Chat, primera pregunta | 3,7k – 5,1k |
| Chat, conversación típica | 4,9k – 6,7k |
| Chat, peor caso permitido (30 memorias + 8 mensajes largos) | 10,3k – 14,1k |
| Análisis Decision First | 3,5k – 5,1k |
| Prompt de sistema del chat (fijo en cada llamada) | 1,8k – 2,5k |
| `cifras_permitidas` del análisis | 1,0k – 1,4k |

- Abrir AXIS (análisis) y preguntar enseguida (chat) supera 8K TPM solo con la entrada.
- **Registro de llamadas** (commit `5050aa2`): cada llamada escribe una línea `[axis] llamada: {...}` en los logs de Vercel:
  - Campos: kind (analysis-legacy / analysis-decision-first / chat), model, outcome, requestChars, maxOutputTokens, errorKind.
  - Diagnóstico: promptTokens, completionTokens (incluye razonamiento), finishReason, cabeceras `x-ratelimit-*`, `retry-after` y, en un 429, `limitType` (TPM/TPD/RPM/RPD) con limit/used/requested.
  - **Nunca incluye** textos, cifras financieras, el id de la organización ni claves (lista de campos permitidos + test `lib/axis/__tests__/call-log.test.ts`).
- **Pendiente:** que alguien lea esos logs tras 3–4 preguntas seguidas en producción.
  **Todavía no se han recogido datos.**

---

## 8. Market Research

**Light** (`market-light.yml`, lunes a viernes a las 07:30 UTC, **sin IA**):
- Fuentes: BCE, Banco de España, INE, Eurostat, FRED (opcional) y RSS.
- Detecta eventos, actualiza los indicadores de `latest.json` y escribe `light.json`.
- Commit solo si hay cambios. Si hay evento, dispara el deep.

**Deep** (`market-deep.yml`, sábados a las 06:00 UTC, por evento o manual):
- Orden: kill switch `MARKET_AI_ENABLED` → secret → presupuesto → fuentes → compactar → estimar tokens → presupuesto → registrar intento → Gemini → (Groq una vez) → validar (incluida la certeza) → publicar.

**Límites duros** (`scripts/market/limits.ts`): 10 deep/mes, 2 llamadas/día, 20/mes (subidos el 2026-10-14; antes 6 y 8), 30k tokens de entrada, 6k de salida, 250k tokens/mes, 1 evento/semana, 1 reintento. El ledger vive en `budget.json` dentro de la rama de datos.

**Cliente** (`hooks/use-market.ts`): descarga `latest.json` y `history.json` desde `NEXT_PUBLIC_MARKET_DATA_URL` (rama pública `market-data`) como máximo una vez cada 24 h, con ETag, y los guarda en Dexie. **Abrir Finax nunca llama a una IA.**

**Estado real** (JSON públicos, 2026-09-27):
- `latest` = **2026-W39**, generado el 2026-09-26 por `groq:openai/gpt-oss-120b`.
- Ledger del mes: 7 llamadas, 20.016 tokens, 4 deep.
- **Gemini (`gemini-3.5-flash-lite`) ha fallado en TODOS los intentos**; siempre publica Groq como fallback. **Funciona.**

**Bug confirmado:** en `scripts/market/deep.ts`, el `assertBudget` del fallback reutiliza `eventResearch: true` después de que el primer intento ya contó el evento semanal. **Una investigación por evento nunca puede usar el fallback a Groq**, y como Gemini falla siempre, las investigaciones por evento no publican nunca.

**Oro:** solo existe el spike (`docs/SPIKE_GOLD_SOURCES.md`), sin integrar.

---

## 9. Vercel, producción y variables de entorno

- **Configuración:** no hay `vercel.json` ni `vercel.ts`.
- **`next.config.mjs`:** `images.unoptimized`, `ignoreBuildErrors: false`.
- **API:** `/api/axis` en runtime `nodejs`, `force-dynamic`, `no-store`.
- **PWA:** SW `finax-sw-v1` (versión fija), cache-first para los estáticos y network-first para la navegación y el mercado; nunca cachea `/api`.
- **Sin cabeceras de seguridad** (CSP, etc.).
- **`/api/axis` es público y sin autenticación:** cualquiera puede gastar el cupo y la cuota de Groq.

**NO VERIFICABLE desde el repo:** valores de las variables en Vercel, modelo real, si el despliegue de `main` es automático, número de instancias, reglas de firewall, si Vercel genera previews de la rama `market-data`.

**Variables** (nunca guardar valores reales en Git):

| Variable | Dónde | ¿Obligatoria? | ¿Secreto? | Uso |
|---|---|---|---|---|
| `AXIS_AI_PROVIDER` | Vercel (servidor) | Sí, para usar IA | No | `groq` o `gemini`; otro valor o vacía = solo motor local |
| `GROQ_API_KEY` | Vercel (servidor) | Sí, con groq | **Sí** | Clave de Groq |
| `GEMINI_API_KEY` | Vercel (servidor) | Sí, con gemini | **Sí** | Clave de Gemini |
| `AXIS_AI_MODEL` | Vercel (servidor) | No | No | Modelo; **compartido** entre proveedores (cambiar de proveedor exige cambiarlo) |
| `AXIS_AI_ENABLED` | Vercel (servidor) | No | No | `false` desactiva la IA |
| `AXIS_AI_MAX_REQUESTS_PER_DAY` | Vercel (servidor) | No | No | Solo puede bajar el tope de 40 (**0 = «sin cupo» permanente**) |
| `AXIS_DECISION_FIRST` | Vercel (servidor) | No | No | `true` = Decision First (activo en producción) |
| `NEXT_PUBLIC_MARKET_DATA_URL` | `.env.production` (trackeado) | Ya fijada | No | URL pública de la rama `market-data` |
| `MARKET_AI_ENABLED` | Variable del repo en GitHub | Sí, para el deep | No | Kill switch del deep |
| `MARKET_GEMINI_MODEL` / `MARKET_GROQ_MODEL` | Variables del repo en GitHub | No | No | Modelos de Market Research |
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `FRED_API_KEY` | Secrets de GitHub Actions | Sí / Sí / No | **Sí** | Market Research |

**Combinaciones:**
- **Groq:** `AXIS_AI_PROVIDER=groq` + `GROQ_API_KEY` (+ un `AXIS_AI_MODEL` de Groq).
- **Gemini:** `AXIS_AI_PROVIDER=gemini` + `GEMINI_API_KEY` (+ un `AXIS_AI_MODEL` de Gemini).
- **Solo local:** sin proveedor o sin clave (`GET /api/axis` devuelve `available: false`).

---

## 10. UX/UI

- **Diseño:** propio del prototipo v0. Tokens en `app/globals.css` (verde Finax, violeta AXIS), fuente Plus Jakarta Sans, mobile-first con marco de teléfono en escritorio.
- **Tema:** **solo claro, sin modo oscuro.**
- **Estados de la UI:**
  - Estados vacíos en Inicio, Objetivos e Inversiones.
  - `ScreenLoading` mientras carga Dexie.
  - Banners de demo.
  - Estados del chat (preparando, analizando, respondiendo, error, sin conexión) con el indicador «IA / Motor local» y su motivo.
- **Sugerencia de categoría** al añadir un movimiento: la más usada en 90 días, con al menos 3 movimientos (`lib/finance/suggestions.ts`).
- **Textos incorrectos en Ajustes** (`components/finax/screens/settings-screen.tsx`):
  - «Tus datos … no se envían a ningún sitio» es falso cuando la IA está activa: el contexto financiero, las memorias y el chat van a `/api/axis` y de ahí a Groq.
  - La fila de AXIS usa `getAxisEngine()` (motor local) y **siempre** dice «No hay ningún modelo de IA conectado todavía».
- **La UI no muestra el modelo usado:** el cliente reemplaza `engine` por la etiqueta genérica «IA de AXIS».

---

## 11. Tests y goldens

**383 tests**, sin red (`fetch` sustituido por stubs, `fake-indexeddb` para Dexie).

**Suites principales** (`lib/axis/__tests__/`): engine, core, decision-first, figures, advice, chat, chat-semantic, secrets, server, voice, prompts, profile, profile-decision, liquidity, irregular-income, priorities, horizon-risk, groq-language, ai-engine, call-log, golden, golden-decision. Además: `lib/db/__tests__`, `lib/market/__tests__`, `lib/text/__tests__`, `lib/finance/__tests__`, `scripts/market/__tests__`.

**Goldens:**
- `lib/axis/__tests__/__snapshots__/<escenario>.json` (13 escenarios) congelan: el resultado local, las respuestas locales del chat, las peticiones legacy, de chat y de expresión.
- `__snapshots__/decision/*.json` congela `decide()`.
- `prompt-analysis.txt` y `prompt-chat.txt` congelan los prompts.
- **Si falta un snapshot, el test lo crea y pasa.**

**Huecos:**
- Ningún golden con perfil.
- Ningún test del bug de fallback por evento ni del parseo de importes con «.».
- Sin tests de UI.
- Sin CI.

---

## 12. Historial y fases

| Fase | Commits | Contenido |
|---|---|---|
| Base | 6bf1f0f, 3a0cb8f, 10f65f2 (09-08/11) | Prototipo v0 → Finax V1 con Dexie |
| Motor AXIS | 4510ef3, 8b4403d, 3d097e6 (09-11) | Reglas locales + abstracción de IA |
| Market Research | 6e7c761 (09-13) | Motor + workflows |
| IA + memoria + PWA | 85a11e5 (09-13) | Proveedores, conclusiones, SW |
| Chat | e21da90, fefa276 (09-15) | Conversación + memoria persistente |
| Decisión ≠ lenguaje | 9e69378, 2cbbdd6 (09-17/18) | `decide()`/`render()`, goldens |
| Decision First | 5956df5 (09-19) | El modelo solo expresa |
| Voz y certeza | a421a3b (09-20) | Tono natural, detector compartido |
| Secretos y cifras | da5c253 (09-20) | Redacción y licencia de cifras |
| Perfil y consejos | 16789ca, 307f82c, 6f4f7a2 (09-20/21) | UserProfile, `AxisAction`, licencia de consejos |
| UX/operación | 562abac, 716a7ea, c6067c6, 3992fc5 (09-22) | Ráfaga de 12/min, «Paga», sugerencia de categoría, logo |
| Diagnóstico | **5050aa2 (09-23)** | Registro de llamadas al proveedor |

`docs/AXIS.md` menciona dos fases pendientes: **fase 3**, conversación por intención y simulador determinista; y **fase 4**, un solo pipeline para análisis y chat.

---

## 13. Documentación desactualizada

| Documento | Qué está mal |
|---|---|
| `README.md` | «sin proveedor implementado todavía»; categoría «Trabajo»; no menciona perfil ni licencias |
| `docs/AXIS.md` | Netlify en vez de Vercel; «3 000 tokens»; «no activado en producción»; «sin chat» y «memoria mínima» en Límites; ruta de proveedores antigua; no documenta el perfil, la licencia de consejos ni el registro de llamadas |
| `docs/MARKET_RESEARCH.md` | Netlify; dice que el chat está fuera de alcance |
| Comentarios | `hooks/use-axis.ts:12` («proveedor inexistente»), `lib/axis/profile/types.ts:88` («paso 1»), `lib/axis/profile/derive.ts:14` |

---

## 14. Resumen de estado

### 14.1 Terminado
- App completa offline-first: movimientos, objetivos, inversiones manuales, estadísticas, gráfica, ajustes, backup/restore, demo, PWA.
- Modelo en céntimos y Dexie v1–v5 con migración.
- `decide()` determinista con reglas, acciones cerradas y goldens.
- Decision First del análisis: validación semántica completa y fallback con la misma decisión. **Activo en producción.**
- Detector de certeza compartido; redacción de secretos en 4 puntos; licencia de cifras (análisis); licencia de consejos (análisis).
- Chat con memoria aceptada por el usuario, historial comprimido y fallback con motivo.
- Market Research semanal en producción (vía Groq).
- Registro de llamadas al proveedor (tokens y límites) en los logs de Vercel.

### 14.2 Parcialmente terminado
- **UserProfile:** lógica y tests completos; **no conectado** (§6.7).
- **Chat:** sin Decision First, sin licencia de cifras ni de consejos, sin intención.
- **Cifras del mensaje y derivadas:** implementadas, sin uso.
- **Proveedores:** Gemini configurado pero falla siempre en Market; AXIS no tiene fallback entre proveedores.
- **Diagnóstico del 429:** el registro está desplegado (salvo que Vercel no despliegue `main` automáticamente), pero **aún no se han leído los logs**.
- **Arreglo de nombres cortos en advice:** hecho, **sin commit**.

### 14.3 Pendiente
- Leer los logs `[axis] llamada` y decidir el tope de tokens de salida y los recortes.
- Reducir los tokens del chat: memorias relevantes, historial más corto, mercado compacto, revisar el prompt de sistema (golden).
- Reducir las `cifras_permitidas` que ve el modelo en Decision First (mantener la validación completa en el servidor).
- Gestión inteligente del 429: un reintento solo si `retry-after` es corto y cabe en los 25 s del cliente.
- Corregir el parseo de importes y los textos de Ajustes.
- Conectar el perfil de extremo a extremo.
- Decision First y licencias en el chat (fase 3/4).
- Licenciar los índices de mercado en puntos.
- Corregir el fallback por evento en `scripts/market/deep.ts`.
- CI de tests/build y lint.
- Actualizar la documentación (§13).
- Oro en Market Research.

### 14.4 Problemas conocidos
1. **Parseo de importes con «.»:** importes multiplicados por 100 (`lib/money.ts`).
2. **Ajustes dice que los datos no salen del dispositivo** y que no hay IA (falso).
3. **«Sin cupo de IA por ahora»** en el chat tras varias consultas: 429 de Groq por tokens por minuto (pendiente de confirmar con los logs).
4. **El perfil no llega a producción.**
5. **Los índices de mercado en puntos** hacen fallar la licencia de cifras.
6. **Las investigaciones de mercado por evento** no pueden usar el fallback; Gemini falla siempre.
7. **La curva de Inicio es del líquido** mientras la cifra grande es el patrimonio total.
8. **Registrar una inversión no descuenta liquidez** (posible doble conteo).
9. **Memorias expulsadas sin aviso**; disponibilidad de la IA cacheada hasta recargar.
10. **«Todo» en las barras de Estadísticas** muestra solo 12 meses.

### 14.5 Riesgos
- **`/api/axis` público:** abuso de cuota. Contador por instancia: el límite propio es inconsistente con varias instancias.
- **Bajar `MAX_OUTPUT_TOKENS`** sin medir puede truncar respuestas de modelos de razonamiento; subirlo puede aumentar los 429.
- **Cambiar `AXIS_AI_PROVIDER` sin cambiar `AXIS_AI_MODEL`** provoca 404 en todas las llamadas.
- **`AXIS_AI_MAX_REQUESTS_PER_DAY=0`** o un valor bajo provoca «sin cupo» permanente.
- **Sin CI:** una regresión en `main` llega directa a producción.
- **Tocar prompts o reglas** cambia los goldens: revisar el diff siempre.
- **Posible cuota de Groq compartida** entre AXIS (Vercel) y Market Research (GitHub), si usan la misma organización. NO VERIFICABLE.

### 14.6 Próximas tareas recomendadas (en orden)
1. **Medir:** en producción, abrir AXIS y hacer 3–4 preguntas seguidas; en Vercel → Logs, filtrar `[axis] llamada`. Con `limitType`, `requested`, `promptTokens`, `completionTokens` y `finishReason` se decide el tope de salida y cuánto recortar. Mientras tanto, **no commitear** el cambio a 1200.
2. **Commitear** el arreglo de `lib/text/advice.ts` + `advice.test.ts` (commit aparte).
3. **Corregir los dos problemas críticos:** parseo de importes (aceptar el punto como decimal cuando no hay coma y el formato lo indica, con tests) y textos de privacidad/IA en Ajustes.
4. **Reducir tokens del chat y del análisis** según los datos (memorias relevantes, historial y mercado compactos, `cifras_permitidas` reducidas solo en el prompt). Después, gestión del 429 con un único reintento condicionado a `retry-after`.
5. **Conectar el UserProfile:**
   - Añadir `fact` al esquema del chat y a `parseChatReply`.
   - Construir `deriveProfile(listUserMemories())` en el cliente y enviar `profile`.
   - Validar el perfil en la ruta y pasarlo a `decide()` en el servidor y en el fallback local.
   - Añadir un golden con perfil.
6. **Después:** Decision First en el chat, índices en puntos, bug del fallback por evento, CI, documentación.

---

## 15. Qué no tocar a la ligera (invariantes)

- **`decide()` y las reglas:** cambian los goldens de decisión.
- **Prompts:** el legacy se compara byte a byte; el del chat tiene golden.
- **`figures.ts`, `advice.ts`, `certainty.ts`:** son garantías mecánicas compartidas por AXIS y Market.
- **`mergeExpression`:** la decisión manda; nunca tomar del modelo prioridad, what, nextStep, confidence ni action.
- **Perfil:** solo quita, es idempotente y cada influencia se puede rastrear hasta su memoria.
- **Memoria:** solo lo aceptado; `replacesId`; tope de 30; sin secretos.
- **Contratos de la API:** `POST → {analysis}` / `{reply}`; `GET → {available, mode}`.
- **Códigos 429/503/502/400/413:** el cliente depende de ellos.
- **Dexie:** solo añadir versiones nuevas; conservar `LEGACY_CATEGORIES` y la migración del backup.
- **Market:** el orden kill switch → presupuesto → intento registrado antes de llamar; `LIMITS` como constantes.
- **Registro de llamadas:** mantener la lista de campos permitidos (`safeDiagnostics`); nunca registrar textos ni cuerpos del proveedor.
