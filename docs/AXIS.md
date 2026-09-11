# AXIS — motor de inteligencia financiera de Finax

AXIS no es un chatbot. Convierte los datos locales del usuario en una lectura
estructurada: **DATOS → INTERPRETACIÓN → RECOMENDACIÓN → ALTERNATIVAS →
INCERTIDUMBRE → CONCLUSIÓN / SIGUIENTE PASO**. Analiza y recomienda; nunca
ejecuta operaciones (no crea, edita ni borra nada).

Todo vive en `lib/axis/` y no depende de React ni de Dexie: se ejecuta y se
prueba en Node.

## Flujo

```
Dexie (config, movimientos, objetivos, posiciones)
  └─ FinancialSnapshot ─► buildFinancialContext()  ─► FinancialContext   lib/axis/context.ts
                                                          │
                          AxisInput { context, memory?, market? }
                                                          ▼
                                       getAxisEngine().analyze(input)      lib/axis/engine.ts
                                                          │
             motor local:  reglas ─► señales ─► priorización ─► composición ─► parseAxisAnalysis
                           lib/axis/rules/*    rules/index.ts   compose.ts     validate.ts
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

Toda salida pasa por `parseAxisAnalysis` (`validate.ts`): comprueba forma,
recorta longitudes, limpia textos y descarta destinos de navegación
desconocidos. Es la única puerta hacia la UI, también para una IA futura.

## Reglas actuales (`lib/axis/rules/`)

| Regla | Señal | Prioridad |
|---|---|---|
| income | sin ingresos con gastos · caída ≥ 20 % · subida ≥ 50 % (extraordinario) | high/medium · high · low |
| expenses | gastos > ingresos · subida ≥ 20 % · una categoría ≥ 50 % con margen ajustado | critical · medium/high · medium |
| savings | mes sin movimientos · tasa ≥ 20 % (sólida) / < 20 % (ajustada) · ahorro cae > 50 % | medium · low/medium · high |
| objectives | conseguido · fecha vencida · ritmo mensual necesario vs. ahorro · ≥ 90 % · sin progreso 30 días · sin fecha | low · high · low/high · medium · medium · low |
| investments | sin posiciones · una posición ≥ 70 % · inversiones ≥ 80 % del patrimonio · valores manuales | low · medium · medium · low |

Umbrales en `rules/shared.ts` (`THRESHOLDS`).

**Priorización** (`rules/index.ts`, `compose.ts`): las señales se ordenan
`critical > high > medium > low`; la recomendación principal es la de la
señal más prioritaria que tenga una; la UI recibe como máximo 5 datos,
4 señales, 2 alternativas y 3 incertidumbres.

**Incertidumbre**: se deriva de `quality` (demo, sin mes anterior, histórico
corto, sin objetivos) y de las propias señales (p. ej. «un mes no es una
tendencia», «sin fecha en el objetivo», «valores manuales, sin mercado»).
`confidence` es `baja` con datos demo o contexto limitado, `alta` solo con
≥ 3 meses y ≥ 15 movimientos.

## Límites actuales

- Motor determinista, sin modelo de lenguaje: los textos son plantillas con cifras reales.
- Sin datos de mercado: nunca opina sobre rentabilidad futura, riesgo de mercado ni productos.
- Comparación mes actual vs. mes anterior; no hay medias móviles ni estacionalidad.
- `AxisMemory` y `MarketContext` existen en el contrato pero nadie los rellena todavía.

## Cómo añadir una regla

1. Crear `lib/axis/rules/<tema>.ts` exportando una `Rule` (`(ctx) => Signal[]`).
2. Cada `Signal` lleva `id`, `domain`, `priority`, `fact` (con cifras),
   `interpretation` y, opcionalmente, `recommendation`, `alternative`, `uncertainty`.
3. Añadirla a `RULES` en `rules/index.ts`.
4. Cubrirla en `lib/axis/__tests__/engine.test.ts`.

## Cómo conectar una IA real (pendiente)

1. Implementar `AxisEngine` en `lib/axis/ai-engine.ts`: recibe `AxisInput`
   (contexto + memoria + mercado), construye el prompt a partir de
   `FinancialContext` (y opcionalmente del análisis local como borrador),
   llama al proveedor y pasa la respuesta por `parseAxisAnalysis`.
2. Devolverlo desde `getAxisEngine()` con `info.isAI = true`. La UI ya muestra
   `engine.label` y el aviso correspondiente.
3. Mantener `localRulesEngine` como fallback offline.

## Cómo probarlo

```bash
pnpm test        # node:test + tsx, lib/axis/__tests__
pnpm typecheck
```

Los tests construyen contextos con datos ficticios (`__tests__/fixtures.ts`)
y una fecha fija (`TODAY`), sin tocar Dexie ni React.
