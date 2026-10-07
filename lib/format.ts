/**
 * Formateo de números y moneda en formato español (es-ES).
 * Implementado manualmente para garantizar el separador de miles (.)
 * y el separador decimal (,) con independencia de los datos de
 * localización (ICU) disponibles en el entorno de ejecución.
 */

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

function formatNumber(value: number, decimals: number): string {
  const fixed = Math.abs(value).toFixed(decimals)
  const [intPart, decPart] = fixed.split('.')
  const grouped = groupThousands(intPart)
  return decPart ? `${grouped},${decPart}` : grouped
}

/**
 * Importe en euros. Un negativo lleva SIEMPRE su «-» (un patrimonio o un
 * líquido negativo no puede leerse como positivo); `withSign` añade además
 * el «+» a los positivos.
 */
export function formatCurrency(value: number, withSign = false): string {
  const euro = `${formatNumber(value, 2)} €`
  // Lo que redondea a cero se muestra «0,00 €», nunca «-0,00 €».
  if (value < 0 && euro !== '0,00 €') return `-${euro}`
  if (withSign && value > 0) return `+${euro}`
  return euro
}

export function formatPct(value: number, withSign = false): string {
  const decimals = value % 1 === 0 ? 0 : 1
  const formatted = formatNumber(value, decimals)
  if (withSign) {
    return `${value >= 0 ? '+' : '-'}${formatted}%`
  }
  return `${formatted}%`
}
