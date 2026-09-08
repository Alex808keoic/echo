import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface FinancialCardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean
}

/**
 * Tarjeta base de Finax: fondo blanco, esquinas redondeadas,
 * borde muy sutil y sombra extremadamente suave.
 */
export function FinancialCard({
  padded = true,
  className,
  children,
  ...props
}: FinancialCardProps) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-border bg-card shadow-[0_2px_14px_-8px_rgba(31,41,55,0.14)]',
        padded && 'p-5',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
