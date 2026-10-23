import type { ReactNode } from 'react'
import { FinancialCard } from './card'
import { ChevronRight } from './icons'
import { cn } from '@/lib/utils'

interface RowProps {
  title: string
  description: string
  onClick?: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
}

/** Fila de una lista (Ajustes, Herramientas): título, descripción y, si se puede tocar, flecha. */
export function Row({ title, description, onClick, tone = 'default', disabled }: RowProps) {
  const content = (
    <div className="min-w-0 flex-1">
      <p className={cn('text-[14px] font-bold', tone === 'danger' ? 'text-negative' : 'text-grafito')}>{title}</p>
      <p className="text-[12px] font-medium text-muted-foreground text-pretty">{description}</p>
    </div>
  )
  // Fila informativa: no es un control.
  if (!onClick) return <div className="flex items-center gap-3 px-5 py-3.5">{content}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left disabled:opacity-50"
    >
      {content}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
    </button>
  )
}

/** Grupo de filas con su título. */
export function RowGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-bold text-muted-foreground">{title}</h2>
      <FinancialCard padded={false} className="divide-y divide-border overflow-hidden">
        {children}
      </FinancialCard>
    </section>
  )
}
