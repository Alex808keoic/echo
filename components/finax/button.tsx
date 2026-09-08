import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'axis' | 'ghost'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: ReactNode
  fullWidth?: boolean
}

const variants: Record<Variant, string> = {
  primary:
    'bg-finax text-white shadow-[0_6px_16px_-6px_rgba(14,166,118,0.6)] hover:bg-finax-dark',
  secondary:
    'bg-white text-grafito border border-border hover:bg-muted',
  axis:
    'text-white bg-gradient-to-r from-axis-indigo via-axis-violet to-axis-blue shadow-[0_10px_24px_-8px_rgba(99,102,241,0.65)] hover:brightness-[1.05]',
  ghost: 'bg-transparent text-grafito hover:bg-muted',
}

export function Button({
  variant = 'primary',
  icon,
  fullWidth,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50',
        variants[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
      {icon}
    </button>
  )
}
