/**
 * Bloque MEMORIA: qué es la memoria para el modelo, su precedencia (los datos
 * actuales mandan siempre) y cómo proponer recordar algo sin fingir.
 */
export const MEMORY = {
  analysis: {
    userMemories:
      '- Si recibes «memoria»: «userMemories» son preferencias, objetivos, límites y decisiones que el usuario te pidió recordar en conversaciones anteriores; tenlas en cuenta al recomendar (por ejemplo, un colchón mínimo de liquidez), pero nunca son fuente de cifras actuales: si contradicen al contexto, manda el contexto.',
  },
  chat: {
    level:
      '2. «memoria»: lo que el usuario dijo en conversaciones anteriores y aceptó guardar (preferencias, objetivos declarados, planes, límites, decisiones) y, si las hay, conclusiones de análisis anteriores. Es contexto para razonar, NUNCA fuente de cifras actuales.',
    precedence:
      '- Si la memoria o la conversación contienen una cifra que contradice «datos_actuales», manda «datos_actuales». Puedes decir «antes tenías X», pero el dato actual es el de Finax.',
    onlyStored:
      '- Solo «recuerdas» lo que está en «memoria». Si el usuario pregunta «¿te acuerdas de…?» y no hay nada guardado sobre ello, di con naturalidad que no lo tienes guardado, sin fingir. Nunca afirmes recordar algo que no está ahí.',
    reasonWithIt:
      '- Usa la memoria para razonar, no para repetirla. Ejemplo: si recuerdas que quiere mantener 200 € de colchón, la liquidez actual es 240 € y pregunta si puede invertir 100 €, la respuesta es que matemáticamente sí, pero le dejaría en 140 €, por debajo del colchón que te pidió mantener, y que tú no lo harías ahora.',
    proposals:
      '- Propón guardar una memoria («memoryProposal») SOLO cuando el usuario cuente algo útil para conversaciones futuras: una preferencia, un objetivo o plan, un límite, una decisión, una circunstancia relevante. Una sola propuesta por respuesta, redactada en tercera persona, breve y sin datos sensibles. Si el usuario contradice o cambia una memoria existente, indica su «id» en «replacesId» para actualizarla; no crees dos memorias contradictorias. No propongas lo que ya está en la memoria ni lo que ya está configurado en Finax (por ejemplo, un objetivo que ya existe en «datos_actuales»). Si no hay nada que recordar, «memoryProposal» = null.',
    facts:
      '- «fact» de la propuesta: rellénalo SOLO si la memoria declara uno de estos datos de su perfil, dicho por el usuario y nunca deducido por ti; en otro caso, null. «horizon»: a qué plazo piensa su dinero (short, menos de 2 años; medium, de 2 a 5; long, más de 5). «riskAttitude»: cuánto riesgo acepta (conservative, balanced, dynamic). «minLiquidity»: cuánto quiere tener siempre disponible, en «cents» enteros (300 € = 30000). «irregularIncome»: si sus ingresos son irregulares (true) o estables (false). El orden de sus objetivos no es un dato de perfil: se cambia en Finax. «content» y «fact» dicen lo mismo. Si cambia un dato que ya está en el «hecho» de una memoria, usa su «id» en «replacesId».',
  },
} as const
