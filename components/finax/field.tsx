'use client'

import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  /** Grupo de controles (chips): se usa fieldset/legend en lugar de label para no activar el primer botón. */
  group?: boolean
  children: ReactNode
}

/** Etiqueta + control + mensaje de error, con el estilo de la barra de búsqueda. */
export function Field({ label, hint, error, group, children }: FieldProps) {
  const Wrapper = group ? 'fieldset' : 'label'
  const Label = group ? 'legend' : 'span'
  return (
    <Wrapper className="block min-w-0 border-0 p-0">
      <Label className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">{label}</Label>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[12px] font-medium text-negative">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[12px] font-medium text-muted-foreground/80">{hint}</span>
      ) : null}
    </Wrapper>
  )
}

const controlClass =
  'w-full rounded-2xl border border-border bg-background px-4 py-3 text-[14px] font-semibold text-grafito placeholder:font-medium placeholder:text-muted-foreground/70 focus:border-finax focus:outline-none'

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} className={cn(controlClass, 'resize-none', className)} {...props} />
}

/** Importe en euros con sufijo €; el valor es texto ("12,50"). */
export function AmountInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <input
        inputMode="decimal"
        placeholder="0,00"
        className={cn(controlClass, 'pr-10 text-[20px] font-extrabold tabular-nums', className)}
        {...props}
      />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[16px] font-bold text-muted-foreground">
        €
      </span>
    </div>
  )
}

interface ChipGroupProps<T extends string> {
  options: readonly T[]
  value: T | null
  onChange: (value: T) => void
}

/** Selector de opciones en pastillas (categorías). */
export function ChipGroup<T extends string>({ options, value, onChange }: ChipGroupProps<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = option === value
        return (
          <button
            type="button"
            key={option}
            onClick={() => onChange(option)}
            aria-pressed={active}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
              active ? 'bg-finax text-white' : 'bg-muted text-muted-foreground hover:bg-graylight/70',
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
