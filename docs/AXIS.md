# AXIS — motor de inteligencia financiera de Finax

AXIS no es un chatbot. Convierte los datos locales del usuario en una lectura
estructurada: **DATOS → INTERPRETACIÓN → RECOMENDACIÓN → ALTERNATIVAS →
INCERTIDUMBRE → CONCLUSIÓN / SIGUIENTE PASO**. Analiza y recomienda; nunca
ejecuta operaciones (no crea, edita ni borra nada).

El núcleo vive en `lib/axis/` y no depende de React ni de Dexie: se ejecuta y
se prueba en Node. Hay dos motores con el mismo contrato: el **motor local de
reglas** (siempre disponible, offline) y el **motor de IA** (una capa de
interpretación prescindible: si desaparece, Finax sigue igual).

## Flujo

```
Dexie (config, movimientos, objetivos, posiciones)
  └─ FinancialSnapshot ─► buildFinancialContext()  ─► FinancialContext      lib/axis/context.ts
                                                          │
                          AxisInput { context, memory?, market? }
                                                          ▼
                       getAxisEngine('local' | 'ai').analyze(input)            lib/axis/engine.ts
                              │                                  │
  motor local (siempre)       │                                  │  motor de IA (prescindible)   lib/axis/ai-engine.ts
  decide() ─► AxisDecision ─► │                                  │  transporte ─► POST /api/axis ─► AxisLanguageModel (servidor)
  render()                    │                                  │  ante CUALQUIER fallo ─► motor local (core/fallback.ts)
  rules/*  core/decision.ts  compose.ts                          │
                              ▼                                  ▼
                           parseAxisAnalysis (validate.ts) — única puerta hacia la UI
                                                          ▼
                                    AxisResult  = { status: 'analysis', analysis }
                                                | { status: 'no-analysis', message, facts, needs, nextStep }
                                                          ▼
                              hooks/use-axis.ts (cache por instantánea)  ─►  UI (axis-screen, tarjetas)
```

## Arquitectura: AXIS no es Gemini

Principio: **AXIS decide; el modelo de lenguaje, si lo hay, redacta.** Gemini
(o Groq, o ninguno) es un motor lingüístico intercambiable. Arquitectura
objetivo, por capas:

```
Usuario
  ▼
AXIS Conversation   intención estructurada (fase 3)               lib/axis/chat/
  ▼
AXIS Context        datos, nunca conclusiones                     lib/axis/context.ts · lib/market/relevance.ts
  ▼
AXIS Memory         aceptada · conversación · conclusiones        lib/db/axis-*.ts · lib/axis/chat/{memory,history}.ts
  ▼
AXIS Decision       decide(): AxisDecision, solo reglas           lib/axis/core/decision.ts · rules/
  ▼
AXIS Safety         validación estructural (y semántica, fase 2)  lib/axis/validate.ts · chat/validate.ts · chat/secrets.ts
  ▼
AXIS Personality    cómo comunica, nunca qué decide               lib/axis/personality.ts
  ▼
¿Hace falta LLM?    NO → render() local                           lib/axis/compose.ts · chat/local-reply.ts
                    SÍ → AxisLanguageModel                        lib/axis/language/ (fromProvider · noModel)
  ▼
AXIS Response       AxisResult · ChatReply
```

Estado por fases:

- **Fase 0 (hecha)**: tests dorados (`__tests__/golden.test.ts`, 13 escenarios:
  resultado local, respuesta local del chat y peticiones efectivas al modelo)
  y `AxisDecision` (`types.ts`).
- **Fase 1 (hecha, sin cambio de comportamiento)**: `decide()` separado de
  `render()`; `AxisLanguageModel` con `fromProvider` (envuelve Gemini/Groq sin
  tocarlos), `noModel` y `languageModelFromConfig`; prompts ensamblados por
  bloques (`prompts/{contract,safety,memory,output}.ts` + `personality.ts`)
  byte a byte iguales a los originales (`__tests__/prompts.test.ts`);
  `withFallback()` común a los dos motores (`core/fallback.ts`).
- **Fase 2 (hecha, tras flag)**: Decision First en el análisis — con
  `AXIS_DECISION_FIRST=true` el modelo recibe la `AxisDecision` y solo la
  expresa; hechos, prioridades, `recommendation.what`, siguiente paso,
  confianza y demo los fija AXIS; validación semántica mecánica; ante
  cualquier fallo, la misma decisión en local. Ver «Decision First» más abajo.
- **Fase 3 (pendiente)**: conversación por intención (`EXPLAIN_CURRENT_SITUATION`,
  `SIMULATE_SCENARIO`, `CREATE_GOAL`, …), plan de respuesta, simulador
  determinista, respuesta local sin LLM cuando la intención está cubierta.
- **Fase 4 (pendiente)**: un solo pipeline para análisis y conversación.

Regla de oro de las fases 0–1: Finax se usa exactamente igual que antes; solo
cambia que, por dentro, existe una decisión separada del lenguaje y un modelo
de lenguaje intercambiable.

### `AxisDecision` (`core/decision.ts`)

`decide(input)` es determinista y no usa ningún modelo: señales priorizadas,
señal líder, señales relevantes (≤ 4), hechos (≤ 5), una recomendación o
`null` (no actuar), alternativas (≤ 2), incertidumbres (≤ 3, demo primero),
confianza, qué falta (`missing`, solo sin datos) y siguiente paso. `render()`
(`compose.ts`) la convierte en `AxisResult` poniendo solo palabras (titular,
resumen, conclusión). Hoy el motor local es `render(decide(input))`; el motor
de IA todavía no recibe la decisión (fase 2).

### Decision First (`AXIS_DECISION_FIRST=true`)

**El LLM no decide. AXIS decide y el LLM expresa.** Flujo en el servidor
(`ai/server/analyze.ts`, `analyzeDecisionFirst`):

```
POST /api/axis {context, market, memory}   (cliente sin cambios)
  ▼
decide({context, market})                  → AxisDecision                       core/decision.ts
  ▼
buildExpressionRequest(decision, memory)   → { decision_de_axis, cifras_permitidas, memoria_relevante }   core/expression.ts
  ▼
AxisLanguageModel.complete(…)              → salida cruda (esquema de expresión, solo texto)   ai/schema-expression.ts · prompts/expression.ts
  ▼
parseExpression                            → Expression (forma)                 core/expression.ts
  ▼
validateExpression(decision, expression)   → ok | violaciones                   core/semantic.ts
  ▼
mergeExpression(decision, expression)      → AxisAnalysis (la decisión manda)   core/expression.ts
  ▼
parseAxisAnalysis                          → 200 { analysis }
```

Contrato con el modelo. Recibe: la decisión (señal principal, señales
relevantes con prioridad y textos de AXIS, hechos, recomendación —`que`
verbatim, `por_que_de_axis`, siguiente paso—, alternativas, incertidumbres,
confianza, demo), `cifras_permitidas` (lista cerrada con etiqueta, calculada
por AXIS: patrimonio, flujos, categorías, variaciones, objetivos, posiciones,
recuentos; `core/figures.ts`) y `memoria_relevante` (≤ 5 notas del usuario y
la última conclusión, en cualitativo). **No** recibe el contexto bruto ni el
mercado. Devuelve solo redacción: `headline`, `interpretation.summary`,
`interpretation.signals[{id,text}]`, `recommendation_why | null`,
`alternatives[{name,summary}]`, `uncertainties[{title,detail}]`, `conclusion`.

Fusión (`mergeExpression`): hechos, ids y prioridades de las señales,
`recommendation.what` y `nextStep`, nombres de alternativas, títulos de
incertidumbres, confianza, `basedOnDemoData`, `engine` y `generatedAt` salen
de la decisión; cualquier `priority`, `nextStep`, `confidence`,
`recommendation` o `facts` que devuelva el modelo se descarta.

Invariantes mecánicas (`validateExpression`): toda cifra escrita (importes,
porcentajes, recuentos con unidad) ∈ cifras permitidas, normalizando formato
(`1.300 €` ≡ `1.300,00 €`, `65 %` ≡ `65%`); ninguna afirmación de haber
ejecutado u ofrecerse a ejecutar una operación; ningún lenguaje de certeza
(patrones de `lib/market/validate.ts`) ni incertidumbre negada; cobertura
exacta de ids de señal, nombres de alternativa y títulos de incertidumbre;
`recommendation_why` null ⇔ AXIS no recomienda. La memoria no aporta cifras
permitidas: una cifra tomada de ella que no esté en los datos falla.

Si algo falla (proveedor, timeout, 429, forma, invariantes): el servidor
registra `[axis] decision-first: expresión rechazada: …` y responde 502; el
cliente muestra `render(decide(input))`, **la misma decisión** en redacción
local. La disponibilidad del modelo solo cambia la calidad de la prosa, nunca
el contenido decidido. Con `level none` la ruta responde 400 sin consumir cupo.

Con `AXIS_DECISION_FIRST` ausente o distinto de `true`: comportamiento
anterior (prompt y esquema completos), byte a byte (tests dorados).
`GET /api/axis` expone `mode: 'legacy' | 'decision-first'` para verificarlo
en producción sin cambios de UI. No se hace ninguna segunda llamada al modelo.

### `AxisLanguageModel` (`language/`)

`{ id, available, complete(request, { maxOutputTokens, signal }) }`.
`fromProvider()` adapta cualquier `AIProvider`/`MarketAIProvider` existente;
`noModel` no está disponible y rechaza con `unavailable`;
`languageModelFromConfig()` (solo servidor) elige según `AXIS_AI_PROVIDER`.
El servidor (`ai/server/analyze.ts`, `app/api/axis/route.ts`) solo conoce
esta interfaz.

## Qué recibe: `FinancialContext`

- `wealth`: patrimonio total, líquido, invertido, reservado en objetivos, saldo inicial.
- `flows`: mes actual y anterior (ingresos, gastos, ahorro, tasa de ahorro,
  distribución por categoría), variación % de ingresos y gastos, evolución
  real del patrimonio (un punto por día con movimientos).
- `objectives`: por objetivo, meta, actual, restante, progreso, fecha, meses
  restantes y aportación mensual necesaria (solo si hay fecha futura).
- `investments`: posiciones con peso sobre la cartera, totales y peso sobre el patrimonio.
- `quality`: `level` (`none` | `limited` | `sufficient`), saldo inicial, nº de
  movimientos, días y meses con datos, si hay mes anterior, objetivos,
  inversiones, y si son **datos demo**.

Nada se inventa: lo que no existe queda vacío, `null` o como flag en `quality`.

## Qué devuelve: `AxisResult`

- `no-analysis` cuando `quality.level === 'none'` (sin movimientos): mensaje,
  hechos conocidos (p. ej. saldo inicial), qué necesita y un siguiente paso.
- `analysis`: `AxisAnalysis` con `headline` (tarjetas), `data.facts`,
  `interpretation` (resumen + señales), `recommendation | null`,
  `alternatives`, `uncertainty` (items + `confidence`), `conclusion`,
  `basedOnDemoData`, `engine`.

Toda salida — local o de IA — pasa por `parseAxisAnalysis` (`validate.ts`):
comprueba forma, recorta longitudes, limpia textos y descarta destinos de
navegación desconocidos. Es la única puerta hacia la UI.

## Motor local (`local-engine.ts`, `rules/`, `core/decision.ts`, `compose.ts`)

| Regla | Señal | Prioridad |
|---|---|---|
| income | sin ingresos con gastos · caída ≥ 20 % · subida ≥ 50 % (extraordinario) | high/medium · high · low |
| expenses | gastos > ingresos · subida ≥ 20 % (accionable solo con margen ajustado) · una categoría ≥ 50 % con margen ajustado | critical · low/medium/high · medium |
| savings | mes sin movimientos · tasa ≥ 20 % (sólida) / < 20 % (ajustada) · ahorro cae > 50 % | medium · low/medium · high |
| objectives | conseguido · fecha vencida · ritmo mensual necesario vs. ahorro · ≥ 90 % · sin progreso 30 días · sin fecha | low · high · low/high · medium · medium · low |
| investments | sin posiciones · una posición ≥ 70 % · inversiones ≥ 80 % del patrimonio · valores manuales | low · medium · medium · low |

Umbrales en `rules/shared.ts` (`THRESHOLDS`).

**Priorización**: `critical > high > medium > low`, con desempate por dominio
(ahorro → objetivos → gastos → ingresos → inversiones). La recomendación
principal es la de la señal más prioritaria que tenga una; la UI recibe como
máximo 5 datos, 4 señales, 2 alternativas y 3 incertidumbres.

**Incertidumbre**: se deriva de `quality` (demo, sin mes anterior, histórico
corto, sin objetivos) y de las propias señales («un mes no es una tendencia»,
«sin fecha en el objetivo», «valores manuales, sin mercado»). `confidence` es
`baja` con datos demo o contexto limitado, `alta` solo con ≥ 3 meses y ≥ 15 movimientos.

## Motor de IA (`ai-engine.ts`, `ai/`)

La IA **interpreta** el `FinancialContext` ya calculado y las señales del motor
local; no recalcula ni sustituye la lógica financiera.

- `createAIEngine({ transport, fallback })` implementa `AxisEngine`. Comprueba
  la disponibilidad una vez por sesión y, ante **cualquier** problema — IA no
  configurada, clave ausente, timeout (25 s), error de red o HTTP, límite de
  peticiones, JSON inválido, análisis que no pasa la validación — responde el
  motor local. Nunca muestra errores técnicos al usuario.
- `ai/browser-transport.ts`: el navegador solo habla con `/api/axis`
  (`GET` → `{ available }`, `POST { context }` → `{ analysis }`). No conoce
  proveedor ni clave.
- `app/api/axis/route.ts` (servidor Next, runtime Node): único lugar donde se
  usa la clave. 503 sin proveedor, 400 con cuerpo no válido, 502/429 si el
  proveedor falla; sin trazas ni secretos en la respuesta.
- `ai/provider.ts`: abstracción `AIProvider` (`complete(request) → unknown`).
  Implementaciones compartidas con el Market Research Engine en
  `lib/ai/providers/`: **Gemini** (REST, JSON por esquema, sin `tools`) y
  **Groq** (`json_schema` strict, sin `tools`). El servidor elige una con
  `AXIS_AI_PROVIDER`; sin ella, `providerFromConfig()` devuelve `null`,
  `/api/axis` responde «no disponible» y AXIS usa siempre el motor local.
- `ai/server/analyze.ts`: lee la configuración, valida la forma del contexto,
  llama al proveedor con `MAX_OUTPUT_TOKENS` fijo y pasa la salida por
  `parseAxisAnalysis` fijando `engine`, `generatedAt` y `basedOnDemoData` desde
  Finax, nunca desde el modelo. El cliente vuelve a validar: doble frontera.
- `ai/server/limits.ts`: límites del servidor **antes de cada llamada** —
  40 peticiones/día y 4/minuto por instancia (constantes; la variable de
  entorno solo puede reducirlas), contexto ≤ 40 000 caracteres (413 si se
  supera), 3 000 tokens de salida, 20 s de timeout. Sin cupo → 429 y el
  cliente usa el motor local; nunca se llama al proveedor.
- Memoria: la pantalla AXIS guarda las últimas 5 conclusiones en Dexie
  (`lib/db/axis-memory.ts`, tabla `axisMemory`) y las pasa como
  `AxisInput.memory` al siguiente análisis (`memoria` en el prompt). No
  contiene importes, no entra en el backup y se borra con «Borrar todos los datos».

**Prompt de sistema** (`AXIS_SYSTEM_PROMPT`): AXIS no es un chatbot; usa los
importes calculados por Finax sin recalcular; lo que no está en el contexto es
desconocido; sin datos de mercado ni predicciones ni productos; recomendaciones
prudentes; respeta `quality` (histórico corto, demo, sin objetivos, sin fecha,
sin inversiones); nunca ejecuta operaciones; solo JSON.

**Privacidad**: al proveedor viaja el contexto mínimo (sin la serie diaria) y
las señales. No se envían nombres personales, cuentas, credenciales ni datos técnicos.

### Variables de entorno (solo servidor; ver `.env.example`)

| Variable | Efecto |
|---|---|
| `AXIS_AI_PROVIDER` | `groq` (producción) o `gemini`. Sin valor → sin IA (AXIS local). Ambos proveedores viven en `lib/ai/providers/`; el servidor solo conoce `AxisLanguageModel`. |
| `GEMINI_API_KEY` / `GROQ_API_KEY` | Clave del proveedor elegido (cuenta free tier, sin billing ni tarjeta). |
| `AXIS_AI_MODEL` | Modelo (por defecto `gemini-2.5-flash-lite` / `openai/gpt-oss-120b`). |
| `AXIS_AI_ENABLED` | `false` desactiva la IA aunque exista un proveedor. |
| `AXIS_AI_MAX_REQUESTS_PER_DAY` | Solo puede reducir el tope diario por instancia (máx. fijo 40). |

Se configuran en el servidor (Netlify → *Environment variables*, ámbito de
funciones/servidor). Reglas fijas: nunca hardcodearlas, nunca exponerlas con
`NEXT_PUBLIC_`, nunca guardarlas en Dexie o localStorage, nunca subir `.env` /
`.env.local` (ignorados en Git). El usuario no introduce claves en la app.
Comprobación al cerrar cada fase: el bundle cliente (`.next/static`) no
contiene credenciales ni endpoints de proveedores.

**Estado**: implementado y probado con clave falsa (401 → 502 → fallback
local; 4.ª llamada del día con tope 3 → 429 sin llamar). **No activado en
producción** hasta que se configure `AXIS_AI_PROVIDER` y su clave en Netlify.

### Coste

- Solo la pantalla AXIS pide IA (`useAxis(overview, { ai: true })`); las
  tarjetas de Inicio, Mi Dinero y Estadísticas usan el motor local salvo que ya
  exista un análisis con IA para la misma instantánea.
- Resultados cacheados por identidad del `overview`: navegar no genera llamadas;
  cambiar datos sí; «Actualizar análisis» fuerza una nueva.
- Sin contexto (`quality.level === 'none'`) no se llama al proveedor.

## Modo conversacional (`chat/`, `hooks/use-axis-chat.ts`, `components/finax/axis-conversation.tsx`)

AXIS conversa dentro de su propia pantalla, debajo del análisis. No es un
chatbot genérico: responde con el mismo `FinancialContext`, las mismas
señales, el mismo contexto de mercado y la memoria, por el mismo endpoint y
con los mismos límites. Analiza y recomienda; nunca ejecuta operaciones.

```
mensaje del usuario
  └─ hooks/use-axis-chat.ts  (en el dispositivo)
       FinancialContext actual + MarketContext + AxisMemory + ventana de conversación
         └─ createChatEngine (chat/engine.ts) ─► POST /api/axis { mode:'chat', … }
              │                                     └─ chatWithProvider ─► AIProvider ─► parseChatReply
              │  ante CUALQUIER fallo / sin conexión / sin cupo / sin datos ─► composeLocalReply (motor local, lo dice)
              ▼
         parseChatReply (chat/validate.ts) — única puerta hacia la UI
              ▼
         ChatMessage (texto, engine, fallbackReason, nextStep, memoryProposal) ─► Dexie `axisConversation` ─► UI
```

**Contexto en cuatro niveles** (`chat/prompt.ts`, `buildChatRequest`): el modelo
recibe siempre un JSON con `datos_actuales` (contexto mínimo sin la serie
diaria + señales + mercado), `memoria` (memorias aceptadas + conclusiones
anteriores), `conversacion_actual` (resumen de lo antiguo + últimos
`MAX_RECENT_FOR_MODEL` mensajes) y `consulta_actual`. El prompt de sistema
fija la precedencia: para cualquier cifra manda `datos_actuales`; la memoria
es contexto para razonar, nunca fuente de importes; solo «recuerda» lo que está
en `memoria`; nunca ejecuta; propone recordar solo información útil y no sensible.

**Memoria persistente** (`chat/memory.ts`, `lib/db/axis-memories.ts`, tabla
`axisMemories`): entradas `{ id, content, category, importance, confidence,
source:'conversation', createdAt, updatedAt }`, categorías `preference | goal |
financial_plan | constraint | decision | context | other`. Solo entra lo que el
usuario acepta con «Recordar»; una propuesta con `replacesId` **actualiza** la
memoria existente (sin duplicados ni contradicciones); contenido equivalente no
se duplica; máximo 30 (salen primero las menos importantes y, a igual importancia,
las más antiguas; la recién aceptada nunca sale y las expulsadas se devuelven
en `evicted`); nada
que parezca un secreto (`chat/secrets.ts`: contraseñas, claves, tokens, IBAN,
tarjetas) se propone ni se guarda — se filtra en el servidor y en el cliente.
`getAxisMemory()` une conclusiones + memorias, así que el análisis también las
recibe. «Lo que recuerdo» permite ver y olvidar cada nota.

**Historial** (`chat/history.ts`, tabla `axisConversation`): se conservan los
últimos 20 mensajes íntegros; lo anterior se comprime, sin IA, en un resumen
de texto (una línea por mensaje, ≤ 160 caracteres, total ≤ 1 500, conservando
lo más reciente). Persiste entre recargas; «Borrar» lo elimina (las memorias se
conservan); «Borrar todos los datos» elimina memorias, historial, resumen y
conclusiones. Nada de esto entra en el backup.

**Estados reales** (`ChatStatus`): `preparing` (cargando lo local), `analyzing`
(contexto + disponibilidad), `responding` (llamada en curso), `error`; sin
conexión se indica y se responde en local. Cada respuesta lleva un indicador
«IA» o «Motor local» (+ motivo del fallback). No se finge actividad.

**Servidor**: `POST /api/axis` con `mode:'chat'` comparte proveedor, cupo de
instancia (40/día, 4/min), 40 000 caracteres de cuerpo, 3 000 tokens de salida
y 20 s de timeout con el análisis; además valida mensaje ≤ 1 000 caracteres,
resumen ≤ 1 500 y ≤ 8 mensajes recientes (`isChatPayload`). Procesa la
petición y no persiste nada. Nunca se envían backups, credenciales, la serie
diaria de patrimonio ni el historial completo.

## Contexto de mercado (`AxisInput.market`)

AXIS puede recibir un `MarketContext` reducido (≤ 6 indicadores, ≤ 3 eventos,
≤ 4 investigaciones anteriores, clases de activo relevantes) construido en el
dispositivo a partir de la investigación pública del Market Research Engine
(ver `docs/MARKET_RESEARCH.md`). La regla `rules/market.ts` aporta hechos e
incertidumbre; solo con frescura `fresh` y una clase en `caution` que cruce con
una posición emite una recomendación de prudencia («revisa antes de ampliar»);
con `stale` no hay recomendaciones de mercado. Sin `MarketContext`, AXIS
funciona exactamente igual. La caché de `useAxis` se indexa también por
`researchId` y frescura.

## Límites actuales

- Motor local determinista: los textos son plantillas con cifras reales.
- Sin cotizaciones en tiempo real: el mercado llega como síntesis semanal con
  fecha; nunca opina sobre rentabilidad futura, riesgo de mercado ni productos.
- Comparación mes actual vs. mes anterior; sin medias móviles ni estacionalidad.
- Memoria mínima: solo las últimas conclusiones; sin preferencias declaradas por el usuario.
- Sin chat: AXIS sigue siendo un centro estratégico.
- El contador de la IA es por instancia de servidor (serverless puede tener varias); la
  barrera principal sigue siendo la cuenta sin billing y la caché del cliente.

## Cómo añadir una regla

1. Crear `lib/axis/rules/<tema>.ts` exportando una `Rule` (`(ctx) => Signal[]`).
2. Cada `Signal` lleva `id`, `domain`, `priority`, `fact` (con cifras),
   `interpretation` y, opcionalmente, `recommendation`, `alternative`, `uncertainty`.
3. Añadirla a `RULES` en `rules/index.ts`.
4. Cubrirla en `lib/axis/__tests__/engine.test.ts`.

## Cómo añadir un proveedor de IA

1. Implementar `AIProvider` en `lib/axis/ai/server/<proveedor>-provider.ts`:
   `complete(request)` envía `request.system` + `request.user`, exige salida
   JSON conforme a `request.schema` y devuelve el objeto parseado; clasifica
   los errores con `AIProviderError` (`unavailable`, `rate-limit`, `http`,
   `timeout`, `malformed`, `refusal`). Con un nivel gratuito y límites
   estrictos, el `rate-limit` es un fallo normal: el cliente hace fallback al
   motor local sin mostrar errores.
2. Leer sus credenciales en `readAIServerConfig()` (solo servidor) y devolver
   la instancia desde `providerFromConfig()`.
3. Documentar las variables en `.env.example` sin valores.

Prompt, esquema, validación, fallback, coste y UI no cambian.

## Cómo probarlo

```bash
pnpm test        # node:test + tsx, lib/axis/__tests__
pnpm typecheck
pnpm build
```

`engine.test.ts` cubre el motor local y la validación con contextos ficticios
(`fixtures.ts`) y fecha fija. `golden.test.ts` congela el comportamiento (13
escenarios; regenerar solo a propósito con `UPDATE_GOLDEN=1 pnpm test`),
`prompts.test.ts` la igualdad byte a byte de los prompts, `core.test.ts` la
decisión, el modelo de lenguaje y el fallback común, y `decision-first.test.ts`
que nada de lo que devuelva el modelo puede cambiar la decisión y que toda
violación acaba en la misma decisión en local. `chat.test.ts` cubre la conversación (contexto en
cuatro niveles, memoria, multiturno, compresión, fallback, errores, límites,
secretos, servidor) y `lib/db/__tests__/axis-store.test.ts` la persistencia en
Dexie (recarga y borrado completo) con `fake-indexeddb`. `ai-engine.test.ts` mockea transporte y
proveedor: JSON válido, inválido, incompleto, timeout, proveedor caído, clave
ausente, datos demo, contexto inmutable, salida sin operaciones. Ningún test
llama a Internet.
