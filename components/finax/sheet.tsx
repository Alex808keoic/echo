'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { inertOutside } from '@/lib/ui/inert-outside'
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
  /** Elemento que tenía el foco al abrir la hoja (antes de cualquier autoFocus): ahí vuelve al cerrar. */
  opener: { current: HTMLElement | null }
}

const SheetContext = createContext<SheetContextValue | null>(null)

/** Proveedor de la hoja inferior (formularios y confirmaciones). */
export function SheetProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const isOpen = useRef(false)
  const opener = useRef<HTMLElement | null>(null)
  // Cambiar de contenido (p. ej. de detalle a edición) no cambia a quién se devuelve el foco.
  const open = useCallback((title: string, content: ReactNode) => {
    if (!isOpen.current) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    isOpen.current = true
    setSheet({ title, content })
  }, [])
  const close = useCallback(() => {
    isOpen.current = false
    setSheet(null)
  }, [])
  const value = useMemo(() => ({ sheet, open, close, opener }), [sheet, open, close])
  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>
}

export function useSheet(): Pick<SheetContextValue, 'open' | 'close'> {
  const ctx = useContext(SheetContext)
  if (!ctx) throw new Error('useSheet debe usarse dentro de SheetProvider')
  return ctx
}

/** Campos que pueden recibir el foco inicial. Nunca un botón: en una vista de detalle sería una acción (p. ej. Eliminar). */
const FIELDS = 'input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled])'

/**
 * Hoja inferior renderizada dentro del marco del teléfono: fondo atenuado y
 * panel blanco con esquinas superiores redondeadas. Diálogo modal: mientras
 * está abierta, lo de detrás queda inerte; el foco entra en la hoja y, al
 * cerrarla, vuelve a lo que la abrió. Escape, la X y el fondo la cierran.
 */
export function SheetOutlet() {
  const ctx = useContext(SheetContext)
  const sheet = ctx?.sheet ?? null
  const isOpen = sheet !== null
  const close = ctx?.close
  const layerRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  // Escape cierra la hoja.
  useEffect(() => {
    if (!isOpen || !close) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  // Abierta: el resto de la app queda inerte. Al cerrar, todo vuelve y el foco regresa a quien la abrió.
  const opener = ctx?.opener
  useEffect(() => {
    if (!isOpen || !layerRef.current) return
    const release = inertOutside(layerRef.current)
    return () => {
      release()
      const target = opener?.current
      if (target?.isConnected) target.focus({ preventScroll: true })
    }
  }, [isOpen, opener])

  // Cada contenido nuevo: si nada lo ha enfocado (autoFocus), el primer campo; si no hay campos, la propia hoja.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!sheet || !dialog || dialog.contains(document.activeElement)) return
    const target = contentRef.current?.querySelector<HTMLElement>(FIELDS) ?? dialog
    target.focus({ preventScroll: true })
  }, [sheet])

  if (!sheet || !close) return null
  return (
    <div ref={layerRef} className="absolute inset-0 z-30 flex flex-col justify-end">
      {/* Tocar fuera cierra; no es un control más para el teclado ni el lector (ya están la X y Escape). */}
      <button type="button" tabIndex={-1} aria-hidden="true" onClick={close} className="absolute inset-0 bg-grafito/35 backdrop-blur-[2px]" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        className="no-scrollbar relative max-h-[88%] overflow-y-auto overscroll-contain rounded-t-[2rem] bg-card px-5 pb-8 pt-3 shadow-[0_-12px_40px_-20px_rgba(31,41,55,0.35)] focus:outline-none"
      >
        <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-graylight" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="sheet-title" className="text-[19px] font-extrabold tracking-tight text-grafito">
            {sheet.title}
          </h2>
          <IconButton label="Cerrar" variant="plain" onClick={close}>
            <CloseIcon className="h-5 w-5" />
          </IconButton>
        </div>
        <div ref={contentRef}>{sheet.content}</div>
      </div>
    </div>
  )
}
