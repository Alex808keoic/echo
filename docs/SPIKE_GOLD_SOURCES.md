# Spike: fuentes públicas para el precio del oro (fase 0)

Objetivo: comprobar, antes de diseñar la investigación bajo demanda, si existe
una fuente pública, sin scraping y sin API de pago, que dé **precio/serie del
oro, fecha del dato y variaciones a 30 y 90 días**. Comprobado el 2026-09-20
con peticiones HTTP reales desde el entorno de desarrollo. Nada de esto está
integrado en producción.

## Resultado

| Fuente | Formato | Frecuencia | Clave | Disponibilidad comprobada | Sirve para el oro |
|---|---|---|---|---|---|
| **FMI · Primary Commodity Price System (PCPS)** `https://api.imf.org/external/sdmx/2.1/data/IMF.RES,PCPS/G001.PGOLD.USD.M?startPeriod=YYYY-MM&format=csv` | SDMX 2.1 (CSV o XML), USD por onza troy, **media mensual** | Mensual; última observación 2026‑M08 publicada el 2026‑09‑08 | **No** | HTTP 200, datos desde 1990; `INDEX_PCH` da la variación % mensual ya calculada | **Sí (recomendada)**: oficial, estable, sin clave, con fecha del dato. Limitación: media mensual y ~1 mes de retraso, así que «30 días» = variación mes a mes y «90 días» = 3 meses; no sirve para el precio intradía |
| **Banco Mundial · Pink Sheet** (`CMO-Historical-Data-Monthly.xlsx`) | XLSX (hoja «Monthly Prices», columna «Gold ($/troy oz)») | Mensual | No | HTTP 200 (765 KB). La URL cambia cada año (`…-0350012021/…` sirve un archivo que llega solo a 2024‑M12); hay que descubrir la URL vigente | Sí como **contraste** mensual; **no** como fuente primaria: URL inestable y exige parsear XLSX (zip + XML; viable sin dependencias, pero frágil) |
| **FRED · LBMA Gold Price** (`GOLDAMGBD228NLBM`, `GOLDPMGBD228NLBM`) | JSON | Diaria | Sí (`FRED_API_KEY`, ya soportada) | **Retirada de FRED en enero de 2022** por licencia de ICE Benchmark Administration (la URL redirige al aviso) | **No** |
| **FRED · «Global price of Gold» (FMI)** (`PGOLDUSDM`) | JSON | — | Sí | HTTP 404: no existe en FRED | **No** |
| **BCE Data Portal** (`EXR/D.XAU.EUR…`) | SDMX | — | No | HTTP 404: el BCE no publica precio del oro en EXR | **No** |
| **Stooq** (`stooq.com/q/d/l/?s=xauusd`) | CSV diario | Diaria | No | Devuelve un desafío JavaScript anti‑bot (no un CSV) | **No** (equivaldría a scraping) |
| **Yahoo Finance chart API** (`GC=F`) | JSON | Diaria/intradía | No | HTTP 200 | **No**: API no oficial; sus condiciones de uso no permiten el acceso automatizado |
| **gold-api.com** (`api.gold-api.com/price/XAU`) | JSON `{ price, updatedAt }` | Spot (cache 3 s) | No | HTTP 200; sin histórico (`/symbols` solo lista activos) | **Solo como complemento opcional** para el spot del día: tercero sin garantías de continuidad ni licencia clara; nunca como única fuente ni para variaciones |

## Recomendación

1. **Fuente primaria: FMI PCPS `G001.PGOLD.USD.M`** (y `G001.PGOLD.INDEX_PCH.M`
   para la variación mensual). Cumple todo lo exigido salvo la granularidad
   diaria: precio con fecha (`TIME_PERIOD`), sin clave, oficial, formato CSV
   trivial de parsear con las utilidades ya existentes (`fetchText` +
   `splitCsvLine` de `scripts/market/sources/shared.ts`). Encaja como una
   `Source` más del recopilador (`indicators` con `group` nuevo `commodity`,
   `unit` nueva `USD/oz` → exige ampliar `MarketIndicator` en una fase futura).
2. **Variaciones 30/90 días**: con PCPS son mes a mes y a 3 meses (medias
   mensuales). Si en el futuro se quiere una serie diaria propia, la
   comprobación ligera (L–V) puede **muestrear** el spot de una fuente
   secundaria y acumular la serie en la rama `market-data`; las variaciones se
   calcularían con `pctChange` sobre puntos propios, con fecha. No se decide
   ahora.
3. **AXIS debe decir siempre la fecha del dato** («media de agosto de 2026»,
   publicada en septiembre): es la única forma honesta de usar una serie
   mensual para una pregunta de «cómo está el oro».

## Fuera de esta fase

No se ha añadido ninguna fuente ni indicador al recopilador, ni tema «oro»,
ni endpoint, ni caché, ni llamadas al proveedor. Este documento es la entrada
para diseñar la fase de investigación bajo demanda.
