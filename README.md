# Finax V1

Tu dinero, con sentido. Aplicación de finanzas personales, offline-first y sin login.
Todos los datos viven en el dispositivo (IndexedDB vía Dexie). Sin analítica. AXIS, el asistente,
decide con reglas deterministas en el dispositivo y usa IA opcional en el servidor solo para redactar
(Cloudflare Workers AI con Groq de respaldo en producción; si falla, motor local).

Stack: Next.js 16 (App Router, una sola ruta) · React 19 · TypeScript estricto · Tailwind 4 · Dexie.
Producción: Vercel (proyecto «echo»); cada push a `main` se despliega solo. Dispositivo principal: Galaxy S21 (~360 px).

## Ejecutar

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm typecheck  # tsc --noEmit
pnpm test       # tests unitarios (node:test, sin red)
pnpm market:light   # comprobación ligera de mercado en local (sin IA)
pnpm market:deep    # investigación profunda en local con proveedor de prueba (sin IA)
pnpm build      # build de producción
pnpm start      # servir el build
UPDATE_GOLDEN=1 pnpm test   # SOLO para regenerar goldens a propósito (revisar el diff)
```

CI (`.github/workflows/ci.yml`): tipos, tests y build en cada push y pull request a `main`.
No bloquea el despliegue de Vercel.

## Estructura

```
app/page.tsx                 shell de la app (pestañas + subpantallas + hoja inferior)
app/api/axis/route.ts        único backend: IA de AXIS (análisis, chat, resumen semanal)
components/finax/            UI propia (diseño del prototipo v0)
  screens/                   Inicio, Mi Dinero, Movimientos, Estadísticas, AXIS (pestañas);
                             Objetivos, Inversiones, Ajustes, Tu plan, Guía para invertir,
                             Resumen semanal, Lo que AXIS sabe de ti (subpantallas)
  forms/                     movimiento, objetivo, inversión, saldo inicial, memoria, perfil
  charts/                    gráficos SVG propios
hooks/use-financial-overview  panorama financiero derivado (única fuente para todas las pantallas)
hooks/use-axis, use-axis-chat análisis y conversación de AXIS
hooks/use-allocation-plan, use-weekly-brief, use-market, use-market-context
lib/types.ts                 modelo de datos (céntimos enteros, fechas YYYY-MM-DD)
lib/db/                      Dexie: movimientos, objetivos, posiciones, config, backup, demo, memoria de AXIS
lib/finance/                 patrimonio, resúmenes, reparto automático de objetivos, desglose
lib/axis/                    motor de AXIS (ver docs/AXIS.md)
  core/ rules/               decide(): decisión determinista; validación de lo que redacta el modelo
  profile/                   perfil (cuestionario, hechos de memoria, extractor determinista)
  plan/ guide/ brief/        plan de reparto, guía para invertir, resumen semanal
  chat/                      conversación: contexto, memoria, historial, consultas acotadas, fallback local
  language/ prompts/         modelo de lenguaje intercambiable y prompts por bloques
lib/ai/providers/            Cloudflare, Groq y Gemini (compartidos por AXIS y Market Research)
lib/market/                  modelo, validación, frescura, relevancia y búsqueda de mercado
scripts/market/              Market Research Engine (GitHub Actions; ver docs/MARKET_RESEARCH.md)
docs/                        AXIS.md · MARKET_RESEARCH.md · HANDOFF_POST_CLAUDE.md (estado y pendientes)
```

## Decisiones clave

- Importes en céntimos enteros; formato visible `3.486,70 €` (`lib/format.ts`, `lib/money.ts`).
  Al escribir se acepta coma o punto decimal («12,50» y «12.50»).
- Categorías cerradas: gasto (Comida, Restaurantes, Salidas, Caprichos, Ropa, Otros) e
  ingreso (Paga, Regalos, Otros). «Otros» exige motivo. Nota opcional solo en el detalle.
- Saldo inicial como punto de partida del patrimonio; no es un movimiento.
- Inversiones manuales (activo, importe, fecha, valor actual); sin cotizaciones ni brokers.
  Por defecto descuentan lo invertido del líquido (`fromLiquid`).
- Objetivos automáticos: el líquido se reparte en cascada por el orden de los objetivos;
  no hay aportaciones a mano. Se pueden marcar como conseguidos (con confirmación).
- Gráfica de patrimonio total solo con datos reales (mínimo 3 días con movimientos).
- AXIS: DATOS → INTERPRETACIÓN → RECOMENDACIÓN → ALTERNATIVAS → INCERTIDUMBRE → CONCLUSIÓN.
  AXIS decide con reglas; el modelo solo redacta y su texto se valida mecánicamente (cifras,
  consejos, certeza, ejecución). Ante cualquier fallo, la misma decisión en local.
  Nunca recomienda productos, entidades ni momentos (actividad regulada); solo categorías.
  Memorias solo con confirmación del usuario. Arquitectura, seguridad y tests: `docs/AXIS.md`.
- Backup: exportar/importar JSON versionado desde Ajustes (v2 incluye las memorias de AXIS).
- Mercado: investigación semanal compartida (cron), publicada como JSON estático y cacheada en Dexie;
  presupuesto de coste con límites duros; sin datos personales. Ver docs/MARKET_RESEARCH.md.
- PWA: manifest + service worker (shell y datos de mercado en caché; nunca /api ni datos del usuario).
- Datos de demostración separados (`lib/db/demo-seed.ts`), solo en instalación vacía y
  marcados como demo.
