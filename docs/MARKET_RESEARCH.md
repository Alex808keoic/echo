# Market Research Engine — diseño definitivo

Objetivo: que AXIS disponga de contexto de mercado actualizado con coste ≈ 0 €,
sin llamar a ninguna IA cuando el usuario abre la app, y sin enviar datos
personales a ningún servicio. **Finax está diseñado para no poder generar
gastos automáticamente.**

## 1. Arquitectura

```
        GitHub Actions (cron)                       Rama `market-data`                   Finax (cliente)
┌────────────────────────────────┐        ┌────────────────────────────┐       ┌──────────────────────────────┐
│ market-light · L–V 07:30 UTC   │        │ latest.json                │       │ hooks/use-market.ts          │
│  fuentes oficiales → heurística│ commit │ history.json (≤ 8 resúm.)  │ fetch │  si online y caché > 24 h    │
│  SIN IA → ¿evento relevante?   ├───────►│ history/YYYY-Www.json (≤12)│──────►│  → Dexie `market`            │
│  → dispara deep si procede     │ (solo  │ budget.json (ledger)       │ (raw, │                              │
│                                │ si hay │ light.json                 │ ETag) │ lib/market/relevance.ts      │
│ market-deep · sábado 06:00 UTC │ cambio)│                            │       │  investigación + posiciones  │
│  kill switch → secret →        │        └────────────────────────────┘       │  (en el dispositivo)         │
│  presupuesto → fuentes →       │                                              │  → MarketContext reducido    │
│  compactar → estimar tokens →  │             Netlify solo construye `main`:   │                              │
│  presupuesto → Gemini          │             la investigación NO despliega    │ AXIS: motor local / IA       │
│  (→ Groq una vez) → validar    │                                              │ (con o sin MarketContext)    │
└────────────────────────────────┘                                              └──────────────────────────────┘
```

Principios:

1. **Una investigación para todos los usuarios**, en el cron; la app solo descarga JSON.
2. **Dos niveles**: ligera **sin IA** (L–V) y profunda **con IA** (sábado, o antes
   si la ligera detecta un acontecimiento; máx. 1 extra/semana y 6 profundas/mes).
3. **La IA no busca**: recibe las fuentes ya recopiladas y compactadas por
   nuestros scripts y **solo sintetiza**. Sin Google Search grounding ni
   herramientas del modelo.
4. **Presupuesto de cuatro capas** (§5) comprobado **antes de cada llamada**.
5. **Privacidad por construcción** (§7): el engine nunca ve datos del usuario.
6. **Fiabilidad explícita**: fecha/hora, periodo, fuentes, frescura,
   incertidumbres, advertencias, fuentes caídas; validación estricta que
   rechaza predicciones presentadas como certezas.

## 2. Código

| Capa | Archivos | Se ejecuta en |
|---|---|---|
| Modelo y lógica pura | `lib/market/types.ts`, `validate.ts`, `freshness.ts`, `relevance.ts`, `schema.ts` | app y scripts |
| Engine | `scripts/market/limits.ts`, `budget.ts`, `store.ts`, `sources/*`, `material.ts`, `light.ts`, `deep.ts`, `publish.ts`, `cli.ts`, `providers/{gemini,groq,mock}.ts` | GitHub Actions (Node + tsx) |
| Workflows | `.github/workflows/market-light.yml`, `market-deep.yml` | GitHub |
| Cliente | `lib/db/market.ts` (Dexie v2, tabla `market`), `hooks/use-market.ts` | navegador |
| AXIS | `lib/axis/rules/market.ts`, `types.ts` (`MarketContext`), `ai/prompt.ts`, `engine.ts`, `hooks/use-axis.ts` | navegador |
| UI (mínima) | línea de mercado en la pantalla AXIS; fila en Ajustes | navegador |

## 3. Investigación

### Ligera (`scripts/market/light.ts`, L–V, sin IA)

1. Recopila indicadores y titulares de las fuentes (§6), cada una aislada.
2. Compara con `latest.json` y detecta: movimiento de índice ≥ 3 % respecto al
   último valor publicado, cambio de tipo oficial, dato de inflación de un
   periodo nuevo, titular con palabras clave de alto impacto.
3. Escribe `light.json` (indicadores frescos + eventos detectados) y actualiza
   los indicadores numéricos de `latest.json` **sin tocar** `generatedAt`.
4. Commit solo si el diff no es vacío. Si hay evento y hay cupo de extra
   semanal, dispara `market-deep` (`workflow_dispatch`, `reason: event`).

### Profunda (`scripts/market/deep.ts`, sábado o por evento)

Orden estricto: (1) kill switch `MARKET_AI_ENABLED === 'true'` → (2) secret
presente → (3) `assertBudget()` → (4) fuentes → (5) compactar material →
(6) estimar tokens → (7) `assertBudget()` de nuevo → (8) **registrar intento** →
(9) Gemini Flash-Lite → validar → si falla por rate limit/timeout/error
temporal/respuesta inválida: (7)-(8) otra vez → Groq **una sola vez** →
validar → (10) publicar. Si todo falla: se conserva la última investigación
(la frescura se degrada sola con la edad) y se anota la advertencia.

## 4. Resultado (`MarketResearch`)

`id`, `kind`, `generatedAt`, `coversFrom/coversTo`, `region`, `overview`,
`indicators` (índices, tipos, inflación: de las fuentes, no de la IA),
`events`, `trends`, `assetClasses`, `uncertainties`, `warnings`, `sources`,
`failedSources`, `provider`, `budget`. `freshness` se calcula al leer:
`fresh` ≤ 7 días, `aging` ≤ 21, `stale` después.

`parseMarketResearch()` valida forma, recorta, limpia y **rechaza** textos con
lenguaje de certeza («va a subir», «subirá», «garantizado», «seguro que»,
«sin duda»…). Las advertencias fijas: no es asesoramiento; datos con posible
retraso; sintetizado con IA a partir de fuentes públicas.

## 5. Presupuesto de cuatro capas

1. **Imposibilidad de cobro en el proveedor**: cuenta Gemini **sin billing**
   (al agotar la cuota devuelve 429 y para); Groq plan free **sin tarjeta**.
   Checklist obligatorio antes de crear los secrets (§11).
2. **Plataforma**: GitHub spending limit 0 $ (por defecto) y repo público;
   Netlify no construye la rama `market-data`.
3. **Kill switches**: variable de repositorio `MARKET_AI_ENABLED` (≠ `true` →
   el job termina sin hacer nada) y ausencia del secret → sin llamada.
4. **Presupuesto en código** (`scripts/market/limits.ts` + ledger `budget.json`):

| Límite | Valor |
|---|---|
| `MAX_DEEP_RESEARCH_PER_MONTH` | 6 |
| `MAX_AI_REQUESTS_PER_DAY` | 2 |
| `MAX_AI_REQUESTS_PER_MONTH` | 8 |
| `MAX_INPUT_TOKENS` (por llamada) | 30 000 |
| `MAX_OUTPUT_TOKENS` (por llamada, forzado al proveedor) | 6 000 |
| `MAX_TOTAL_TOKENS` (por mes) | 250 000 |
| `MAX_EVENT_RESEARCH_PER_WEEK` | 1 |

`assertBudget()` se ejecuta **antes de cada llamada** (también del fallback).
El intento se registra **antes** de llamar; un error de red cuenta; el
reintento (máx. 1, a Groq) también cuenta. Ledger corrupto ⇒ bloqueado.
Bloqueado ⇒ no se llama a nadie; se usa la última investigación y se marca la
causa en `warnings`.

## 6. Fuentes (públicas, sin autenticación, sin scraping)

| Fuente | Qué | Endpoint |
|---|---|---|
| BCE Data Portal | tipo de depósito (DFR, diario), Euríbor 12M (media mensual), EURO STOXX 50 (media mensual) | `data-api.ecb.europa.eu` (SDMX-JSON) |
| Banco de España | Euríbor 12M (diario, tabla `ti_1_7`), IBEX 35 (diario, tabla `ti_1_6`) | CSV público (latin1) |
| INE | IPC general, variación anual (serie `IPC251856`) | API Tempus (JSON) |
| Eurostat | HICP eurozona, variación anual | API dissemination (JSON-stat) |
| FRED | Fed funds, S&P 500, Nasdaq 100 | API JSON (clave gratuita opcional; sin ella se omite) |
| RSS oficiales | BCE prensa, Fed prensa, Banco de España noticias | RSS |

Stooq quedó descartado: sirve un desafío JavaScript en lugar del CSV (equivaldría a scraping).

Cada fuente tiene timeout propio (10 s) y se ejecuta con `Promise.allSettled`;
una caída no rompe la investigación y queda en `failedSources`.

## 7. Privacidad

- `FinancialContext` **nunca** sale del dispositivo hacia el engine: el job corre
  en GitHub sin acceso a Dexie ni a usuarios; el cliente solo descarga JSON.
- El engine trabaja **solo con información pública**.
- Las posiciones del usuario se usan **solo en el dispositivo**
  (`lib/market/relevance.ts`) para elegir qué partes del contexto son relevantes.
- AXIS recibe un `MarketContext` **reducido**: ≤ 6 indicadores, ≤ 3 eventos,
  ≤ 4 investigaciones históricas, clases de activo relevantes.
- Sin claves en la app: ni `NEXT_PUBLIC_*`, ni Dexie, ni localStorage, ni
  `/api`. Las claves existen **solo en GitHub Actions Secrets**
  (`GEMINI_API_KEY`, `GROQ_API_KEY`, opcional `FRED_API_KEY`).
- Free tier de Gemini: el contenido enviado «se usa para mejorar productos».
  Solo se envían datos públicos de mercado; queda anotado en `warnings`.

## 8. Cliente y AXIS

- `use-market.ts`: al abrir la app, lee Dexie; si hay conexión y la caché tiene
  más de 24 h, descarga `latest.json` y `history.json` desde
  `NEXT_PUBLIC_MARKET_DATA_URL` (URL pública de la rama `market-data`, con
  `If-None-Match`). Sin conexión, usa la caché. **Abrir Finax = 0 llamadas de IA.**
- `relevance.ts` construye el `MarketContext` reducido; AXIS lo recibe en
  `AxisInput.market`. La caché de AXIS se indexa por instantánea de datos **y**
  por `research.id`.
- Motor local (`rules/market.ts`): con `fresh`/`aging` aporta hechos
  (indicadores) e incertidumbre («contexto de hace N días»); solo con `fresh`
  y una clase de activo en `caution` que cruce con una posición emite una
  recomendación de prudencia («revisa antes de ampliar»), nunca comprar/vender.
  Con `stale` **no** hay recomendaciones de mercado, solo la advertencia.
- El motor local funciona igual sin `MarketContext`.
- IA de AXIS (cuando exista proveedor): recibe el mismo contexto reducido con
  la regla «el mercado tiene fecha; no lo presentes como actual si no es
  `fresh`; no conviertas tendencias en certezas».

## 9. Proveedores (implementados en `scripts/market/providers/`)

| | Principal | Fallback | Prueba |
|---|---|---|---|
| Proveedor | **Gemini** `gemini-2.5-flash-lite` (REST `generateContent`, sin SDK) | **Groq** `openai/gpt-oss-120b` (API compatible OpenAI) | `mock` (sin IA, determinista) |
| Salida | `responseMimeType: application/json` + `responseJsonSchema` | `response_format: json_schema` con `strict: true` | JSON fijo a partir del material |
| Herramientas | **Ninguna**: sin `tools`, sin Google Search grounding, sin ejecución de código | **Ninguna** | — |
| Tope de salida | `maxOutputTokens = MAX_OUTPUT_TOKENS` | `max_completion_tokens = MAX_OUTPUT_TOKENS` | — |
| Errores | 429 → `rate-limit`; 401/403 → `unavailable`; timeout; `MAX_TOKENS` → `malformed`; bloqueo → `refusal` | igual | — |
| Uso | Se usa cuando Gemini falla por `rate-limit`, `timeout`, `http`, `malformed` o `unavailable`, **una sola vez**, tras `assertBudget` | | Solo `--provider mock` en local; nunca desde el cron |

Los modelos pueden cambiarse con las variables de repositorio `MARKET_GEMINI_MODEL`
y `MARKET_GROQ_MODEL` (sin tocar código ni límites).

## 10. Workflows (`.github/workflows/`)

| | `market-light.yml` | `market-deep.yml` |
|---|---|---|
| Cron | `30 7 * * 1-5` (L–V 07:30 UTC) | `0 6 * * 6` (sábado 06:00 UTC) + `workflow_dispatch` (`reason`: scheduled / event / manual) |
| Condición | siempre (no usa IA) | `if: vars.MARKET_AI_ENABLED == 'true'` |
| Secrets | `FRED_API_KEY` (opcional) | `GEMINI_API_KEY`, `GROQ_API_KEY`, `FRED_API_KEY` (opcional) |
| Pasos | checkout `main` → checkout/creación de la rama huérfana `market-data` → `pnpm install` → `cli.ts light` → commit **solo si hay diff** → si `trigger_deep` y `MARKET_AI_ENABLED`, `gh workflow run market-deep.yml -f reason=event` | igual con `cli.ts deep` (el ledger se commitea aunque la investigación falle: un intento consumido queda registrado) |
| Protecciones | `concurrency: market` (nunca dos a la vez), `timeout-minutes` 10 / 15, permisos `contents: write` (+ `actions: write` en light para el dispatch), commits `[skip ci]`, `GITHUB_TOKEN` (sus pushes no disparan otros workflows) | |

Los workflows están creados pero **no se han ejecutado todavía** en GitHub.

## 11. Operación

Checklist antes de activar (`MARKET_AI_ENABLED=true`):
1. Proyecto Gemini en una cuenta **sin método de pago**; AI Studio muestra
   «Free tier». Sin billing enlazado. Leer las cuotas del proyecto en AI Studio.
2. Cuenta Groq en plan free, **sin tarjeta**.
3. Secrets en GitHub: `GEMINI_API_KEY`, `GROQ_API_KEY` (opcional `FRED_API_KEY`).
4. Variable de repositorio `MARKET_AI_ENABLED=true` (opcionales `MARKET_GEMINI_MODEL`, `MARKET_GROQ_MODEL`).
5. GitHub spending limit en 0 $ (por defecto). Repo público (para la lectura raw).
6. `NEXT_PUBLIC_MARKET_DATA_URL` en Netlify apuntando a
   `https://raw.githubusercontent.com/<usuario>/<repo>/market-data`.
7. Primera ejecución manual de `market-light` (sin IA) para crear la rama;
   después, `market-deep` con `reason=manual`.

Prueba local sin claves: `pnpm market:light` y `pnpm market:deep` (proveedor
mock) escriben en `public/market-data-local/` (ignorado en Git); con
`NEXT_PUBLIC_MARKET_DATA_URL=/market-data-local` en `.env.local` la app lo lee.

## 12. Verificación de seguridad de costes (repetir al cerrar cada fase)

- Sin `billing`/`prepay` en el código; sin `tools`, `google_search` ni grounding en los proveedores.
- Las URLs de Gemini/Groq solo aparecen en `scripts/market/providers/`; el cliente no las contiene.
- `.next/static` sin `GEMINI_API_KEY`, `GROQ_API_KEY`, `FRED_API_KEY` ni endpoints de IA;
  único `process.env` en cliente: `NEXT_PUBLIC_MARKET_DATA_URL` (URL pública).
- `assertBudget()` antes de cada `completeWithUsage()` (también en el fallback); `recordAttempt()` antes de llamar.
- `FinancialContext` no aparece en `scripts/market/`.
- Abrir y navegar por Finax: 0 llamadas de IA (solo descarga de JSON estático, máx. 1 vez/24 h).

## 13. Riesgos conocidos

1. Las cuotas free de Gemini no se publican y cambian; el diseño usa ≤ 2/día.
2. Posible restricción regional del free tier: verificar el tier del proyecto desde España.
3. El cron puede retrasarse: la frescura se mide por `generatedAt`.
4. Groq 8K TPM: el material se compacta a ≤ 20 000 caracteres (~7K tokens) antes de llamar.
5. Endpoints de fuentes que cambian: cada fuente aislada; se anota en `failedSources`.
   INE y Eurostat publican con retraso (hoy, datos hasta 2025-12); el EURO STOXX 50 del
   BCE es media mensual; S&P 500 / Nasdaq 100 solo con `FRED_API_KEY`.
6. Contenido enviado al free tier de Gemini se usa para mejorar productos (solo datos públicos).
7. La lectura raw exige repo/rama pública; alternativa: repo de datos público separado.
8. En repos públicos el cron se desactiva tras 60 días sin actividad: los commits de la investigación cuentan como actividad.
9. La validación de certezas es por patrones (español e inglés); un texto que sortee los patrones no se detecta.

## 14. Fuera de alcance

Trading o ejecución automática, recomendaciones de compra/venta, scraping,
cambios de navegación o diseño, chat de AXIS, memoria persistida.
