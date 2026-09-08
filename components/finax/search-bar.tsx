'use client'

import type { ReactNode } from 'react'
import { SearchIcon } from './icons'

interface SearchBarProps {
  placeholder?: string
  value?: string
  onChange?: (value: string) => void
  trailing?: ReactNode
}

/** Campo de búsqueda con icono de lupa y acción opcional a la derecha. */
export function SearchBar({
  placeholder = 'Buscar...',
  value,
  onChange,
  trailing,
}: SearchBarProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex flex-1 items-center gap-2.5 rounded-full border border-border bg-card px-4 py-3">
        <SearchIcon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[13px] font-medium text-grafito placeholder:text-muted-foreground focus:outline-none"
        />
      </div>
      {trailing}
    </div>
  )
}
