# Finax V1

Tu dinero, con sentido. Aplicación de finanzas personales, offline-first y sin login.
Todos los datos viven en el dispositivo (IndexedDB vía Dexie).

## Ejecutar

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm typecheck  # tsc --noEmit
pnpm build      # build de producción
pnpm start      # servir el build
```

## Estructura

```
app/page.tsx                 shell de la app (pestañas + hoja inferior)
components/finax/            UI (diseño del prototipo v0)
  screens/                   Inicio, Mi Dinero, Movimientos, Estadísticas, AXIS,
                             Objetivos, Inversiones, Ajustes
  forms/                     formularios (movimiento, objetivo, inversión, saldo inicial)
  charts/                    gráficos SVG propios
hooks/use-financial-overview  panorama financiero derivado (única fuente para todas las pantallas)
hooks/use-axis               estado de AXIS
lib/types.ts                 modelo de datos (céntimos enteros, fechas YYYY-MM-DD)
lib/db/                      Dexie: movimientos, objetivos, posiciones, config, backup, demo
lib/finance/                 cálculos (patrimonio, evolución, resúmenes, categorías)
lib/axis/                    contrato de AXIS + motor local de reglas (sin IA)
```

## Decisiones clave

- Importes en céntimos enteros; formato visible `3.486,70 €` (`lib/format.ts`, `lib/money.ts`).
- Categorías cerradas: gasto (Comida, Restaurantes, Salidas, Caprichos, Ropa, Otros) e
  ingreso (Trabajo, Regalos, Otros). «Otros» exige motivo. Nota opcional solo en el detalle.
- Saldo inicial como punto de partida del patrimonio; no es un movimiento.
- Evolución del patrimonio solo con datos reales (mínimo 3 días con movimientos).
- Inversiones manuales (activo, importe, fecha, valor actual); sin cotizaciones ni brokers.
- AXIS: DATOS → INTERPRETACIÓN → RECOMENDACIÓN → ALTERNATIVAS → INCERTIDUMBRE → CONCLUSIÓN.
  Motor actual: reglas locales, identificado como tal en la interfaz. Para conectar IA,
  implementar `AxisEngine` y devolverlo en `lib/axis/engine.ts`.
- Backup: exportar/importar JSON versionado desde Ajustes.
- Datos de demostración separados (`lib/db/demo-seed.ts`), solo en instalación vacía y
  marcados como demo.
