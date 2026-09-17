/**
 * Bloque SALIDA: forma y límites de lo que el modelo devuelve (solo JSON del
 * esquema, ids de señal, destinos permitidos, cuántos elementos por sección).
 */
export const OUTPUT = {
  analysis: {
    prioritize:
      '- Prioriza: una recomendación principal, como máximo 2 alternativas, como máximo 3 incertidumbres y como máximo 5 hechos. Las señales de Finax ya vienen ordenadas por prioridad; puedes reformularlas y agruparlas, pero no contradigas sus cifras.',
    jsonOnly:
      '- Devuelve únicamente el JSON que exige el esquema. Usa los mismos ids de señal que recibes cuando reutilices una señal de Finax. El campo «to» de cada siguiente paso solo admite: inicio, dinero, movimientos, estadisticas, objetivos, inversiones.',
  },
  chat: {
    fields:
      '- «confidence» refleja la solidez de tu respuesta con los datos disponibles. «nextStep» solo si hay una pantalla de Finax donde continuar; su campo «to» admite únicamente: inicio, dinero, movimientos, estadisticas, objetivos, inversiones.',
    jsonOnly: '- Devuelve únicamente el JSON que exige el esquema.',
  },
} as const
