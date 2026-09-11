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
  reglas ─► señales ─►        │                                  │  transporte ─► POST /api/axis ─► AIProvider (servidor)
  priorización ─► composición │                                  │  ante CUALQUIER fallo ─► motor local
  rules/*  rules/index.ts  compose.ts                            │
                              ▼                                  ▼
                           parseAxisAnalysis (validate.ts) — única puerta hacia la UI
                                                          ▼
                                    AxisResult  = { status: 'analysis', analysis }
                                                | { status: 'no-analysis', message, facts, needs, nextStep }
                                                          ▼
                              hooks/use-axis.ts (cache por instantánea)  ─►  UI (axis-screen, tarjetas)
```

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

## Motor local (`local-engine.ts`, `rules/`, `compose.ts`)

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
  Implementación concreta: `ai/server/anthropic-provider.ts` con el SDK oficial
  (`@anthropic-ai/sdk`), salida estructurada por JSON Schema (`ai/schema.ts`) y
  prompt de sistema estable y cacheado (`ai/prompt.ts`).
- `ai/server/analyze.ts`: lee la configuración, valida la forma del contexto,
  llama al proveedor y pasa la salida por `parseAxisAnalysis` fijando `engine`,
  `generatedAt` y `basedOnDemoData` desde Finax, nunca desde el modelo. El
  cliente vuelve a validar y a fijar esos campos: doble frontera.

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
| `ANTHROPIC_API_KEY` | Clave del proveedor. Sin ella, AXIS es 100 % local. |
| `AXIS_AI_ENABLED` | `false` desactiva la IA aunque haya clave. |
| `AXIS_AI_MODEL` | Modelo (por defecto `claude-opus-5`). |

Nunca: hardcodear la clave, exponerla con `NEXT_PUBLIC_`, guardarla en Dexie o
localStorage, ni subir `.env` / `.env.local` (ignorados en Git). El usuario no
introduce claves en la app. Comprobación: el bundle cliente (`.next/static`)
no contiene `sk-ant`, `ANTHROPIC_API_KEY` ni el SDK.

### Coste

- Solo la pantalla AXIS pide IA (`useAxis(overview, { ai: true })`); las
  tarjetas de Inicio, Mi Dinero y Estadísticas usan el motor local salvo que ya
  exista un análisis con IA para la misma instantánea.
- Resultados cacheados por identidad del `overview`: navegar no genera llamadas;
  cambiar datos sí; «Actualizar análisis» fuerza una nueva.
- Sin contexto (`quality.level === 'none'`) no se llama al proveedor.

## Límites actuales

- Motor local determinista: los textos son plantillas con cifras reales.
- Sin datos de mercado: nunca opina sobre rentabilidad futura, riesgo de mercado ni productos.
- Comparación mes actual vs. mes anterior; sin medias móviles ni estacionalidad.
- `AxisMemory` y `MarketContext` existen en el contrato (y `memory` viaja al
  proveedor si se pasa) pero nadie los rellena todavía.
- Sin chat: AXIS sigue siendo un centro estratégico.

## Cómo añadir una regla

1. Crear `lib/axis/rules/<tema>.ts` exportando una `Rule` (`(ctx) => Signal[]`).
2. Cada `Signal` lleva `id`, `domain`, `priority`, `fact` (con cifras),
   `interpretation` y, opcionalmente, `recommendation`, `alternative`, `uncertainty`.
3. Añadirla a `RULES` en `rules/index.ts`.
4. Cubrirla en `lib/axis/__tests__/engine.test.ts`.

## Cómo cambiar de proveedor de IA

Implementar `AIProvider` (`lib/axis/ai/provider.ts`) para el nuevo proveedor y
devolverla desde `providerFromConfig()` en `lib/axis/ai/server/analyze.ts`.
Prompt, esquema, validación, fallback y UI no cambian.

## Cómo probarlo

```bash
pnpm test        # node:test + tsx, lib/axis/__tests__
pnpm typecheck
pnpm build
```

`engine.test.ts` cubre el motor local y la validación con contextos ficticios
(`fixtures.ts`) y fecha fija. `ai-engine.test.ts` mockea transporte y
proveedor: JSON válido, inválido, incompleto, timeout, proveedor caído, clave
ausente, datos demo, contexto inmutable, salida sin operaciones. Ningún test
llama a Internet.
