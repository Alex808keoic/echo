import type { ReactNode } from 'react'
import { LeafLogo } from './icons'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}

/**
 * Estado vacío reutilizable con el lenguaje visual de Finax.
 * Ej: "Aquí empieza tu historia".
 */
export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card/60 px-6 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-finax-soft text-finax">
        {icon ?? <LeafLogo className="h-7 w-7" />}
      </div>
      <p className="text-[15px] font-bold text-grafito text-balance">{title}</p>
      {description && (
        <p className="mt-1 max-w-[220px] text-[13px] font-medium text-muted-foreground text-pretty">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
