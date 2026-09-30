# Finax — Handoff para continuar el desarrollo

> Documento de traspaso para otra IA o desarrollador que no conoce las
> conversaciones anteriores. Todo lo que sigue se ha comprobado en el código
> real del repositorio el **2026-09-27**. Si algo de aquí contradice al código,
> **manda el código**. Lo que no se puede verificar desde el repo está marcado
> como **NO VERIFICABLE**.
>
> Este documento no contiene ni debe contener secretos ni claves de API.

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
- **Sin desplegar todavía.** Variables que habrá que definir en Vercel antes de desplegar:
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
- **Estadísticas:** donut por categoría, barras mensuales (el rango «Todo» muestra solo 12 meses,
  `stats-screen.tsx:32`), evolución.
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

**Límites duros** (`scripts/market/limits.ts`): 6 deep/mes, 2 llamadas/día, 8/mes, 30k tokens de entrada, 6k de salida, 250k tokens/mes, 1 evento/semana, 1 reintento. El ledger vive en `budget.json` dentro de la rama de datos.

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
- Ningún test de Decision First con índices de mercado en puntos.
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
