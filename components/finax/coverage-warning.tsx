import type { ObjectivesCoverage } from '@/lib/finance/objectives'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * Aviso cuando el líquido ya no cubre todo lo apartado en objetivos. Solo
 * informa: ningún objetivo se modifica. Sin aviso si lo cubre todo.
 */
export function CoverageWarning({ coverage, className }: { coverage: ObjectivesCoverage; className?: string }) {
  if (coverage.covered) return null
  return (
    <p role="status" className={cn('rounded-2xl bg-negative-soft px-4 py-3 text-[12.5px] font-medium text-negative text-pretty', className)}>
      Tu dinero disponible no cubre todo lo apartado. Faltan {formatCents(coverage.shortfallCents)}.
    </p>
  )
}
