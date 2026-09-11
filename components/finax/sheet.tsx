'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { IconButton } from './page-header'
import { CloseIcon } from './icons'

interface SheetState {
  title: string
  content: ReactNode
}

interface SheetContextValue {
  sheet: SheetState | null
  open: (title: string, content: ReactNode) => void
  close: () => void
}

const SheetContext = createContext<SheetContextValue | null>(null)

/** Proveedor de la hoja inferior (formularios y confirmaciones). */
export function SheetProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const open = useCallback((title: string, content: ReactNode) => setSheet({ title, content }), [])
  const close = useCallback(() => setSheet(null), [])
  const value = useMemo(() => ({ sheet, open, close }), [sheet, open, close])
  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>
}

export function useSheet(): Pick<SheetContextValue, 'open' | 'close'> {
  const ctx = useContext(SheetContext)
  if (!ctx) throw new Error('useSheet debe usarse dentro de SheetProvider')
  return ctx
}

/**
 * Hoja inferior renderizada dentro del marco del teléfono: fondo atenuado y
 * panel blanco con esquinas superiores redondeadas.
 */
export function SheetOutlet() {
  const ctx = useContext(SheetContext)
  const isOpen = Boolean(ctx?.sheet)
  const close = ctx?.close

  // Escape cierra la hoja.
  useEffect(() => {
    if (!isOpen || !close) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  if (!ctx?.sheet) return null
  const { title, content } = ctx.sheet
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      <button
        aria-label="Cerrar"
        onClick={ctx.close}
        className="absolute inset-0 bg-grafito/35 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="no-scrollbar relative max-h-[88%] overflow-y-auto rounded-t-[2rem] bg-card px-5 pb-8 pt-3 shadow-[0_-12px_40px_-20px_rgba(31,41,55,0.35)]"
      >
        <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-graylight" />
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[19px] font-extrabold tracking-tight text-grafito">{title}</h2>
          <IconButton label="Cerrar" variant="plain" onClick={ctx.close}>
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </div>
        {content}
      </div>
    </div>
  )
}
