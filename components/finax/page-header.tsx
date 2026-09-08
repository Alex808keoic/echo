import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

/**
 * Cabecera de pantalla: título grande + subtítulo opcional a la izquierda,
 * acción (icono) opcional a la derecha.
 */
export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-grafito text-balance">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-[13px] font-medium text-muted-foreground text-pretty">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}

interface SectionHeaderProps {
  title: string
  actionLabel?: string
  onAction?: () => void
}

/** Cabecera de sección con enlace "Ver todos / Ver todas" a la derecha. */
export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[17px] font-bold tracking-tight text-grafito">{title}</h2>
      {actionLabel && (
        <button
          onClick={onAction}
          className="text-[13px] font-semibold text-finax transition-colors hover:text-finax-dark"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}

interface IconButtonProps {
  children: ReactNode
  label: string
  onClick?: () => void
  variant?: 'plain' | 'circle'
}

/** Botón de icono redondo usado en cabeceras (perfil, ajustes...). */
export function IconButton({ children, label, onClick, variant = 'circle' }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={
        variant === 'circle'
          ? 'flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-grafito shadow-[0_2px_8px_-6px_rgba(31,41,55,0.3)] transition-colors hover:bg-muted'
          : 'flex h-9 w-9 items-center justify-center rounded-full text-grafito transition-colors hover:bg-muted'
      }
    >
      {children}
    </button>
  )
}
