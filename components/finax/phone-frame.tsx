import type { ReactNode } from 'react'

interface PhoneFrameProps {
  children: ReactNode
  nav: ReactNode
  /** botón de acción flotante (FAB) fijado sobre la navegación */
  floatingAction?: ReactNode
  /** capa superpuesta al contenido (hojas inferiores, diálogos) */
  overlay?: ReactNode
  /** cambia al cambiar de pantalla para reiniciar el scroll */
  contentKey?: string
}

/**
 * Maqueta de dispositivo: marco redondeado, área de contenido con scroll
 * oculto y navegación inferior fija. A pantalla completa en móvil.
 */
export function PhoneFrame({
  children,
  nav,
  floatingAction,
  overlay,
  contentKey,
}: PhoneFrameProps) {
  return (
    <div className="relative mx-auto w-full sm:max-w-[400px]">
      <div
        className="relative flex h-dvh flex-col overflow-hidden bg-background sm:h-[calc(100dvh-2rem)] sm:min-h-[640px] sm:max-h-[860px] sm:rounded-[2.75rem] sm:border-[6px] sm:border-grafito/90 sm:shadow-[0_40px_80px_-30px_rgba(31,41,55,0.45)]"
      >
        <div key={contentKey} className="no-scrollbar flex-1 overflow-y-auto overflow-x-hidden sm:pt-4">
          {children}
        </div>
        {floatingAction && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[92px] z-10 flex justify-end px-5">
            <div className="pointer-events-auto">{floatingAction}</div>
          </div>
        )}
        {nav}
        {overlay}
      </div>
    </div>
  )
}
