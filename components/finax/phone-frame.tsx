import type { ReactNode } from 'react'

function StatusBar({ dark }: { dark?: boolean }) {
  const color = dark ? 'text-white' : 'text-grafito'
  return (
    <div className={`flex items-center justify-between px-7 pt-3 pb-1 text-[13px] font-semibold ${color}`}>
      <span className="tabular-nums">9:41</span>
      <div className="flex items-center gap-1.5">
        {/* Señal */}
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" aria-hidden="true">
          <rect x="0" y="7" width="3" height="4" rx="1" />
          <rect x="4.5" y="5" width="3" height="6" rx="1" />
          <rect x="9" y="2.5" width="3" height="8.5" rx="1" />
          <rect x="13.5" y="0" width="3" height="11" rx="1" />
        </svg>
        {/* Wifi */}
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor" aria-hidden="true">
          <path d="M8 11 5.6 8.3a3.2 3.2 0 0 1 4.8 0L8 11Z" />
          <path
            d="M8 3.4c1.9 0 3.7.7 5 2l-1.4 1.5A5.3 5.3 0 0 0 8 5.4a5.3 5.3 0 0 0-3.6 1.5L3 5.4c1.3-1.3 3.1-2 5-2Z"
            opacity="0.9"
          />
          <path d="M8 0c2.8 0 5.4 1.1 7.3 3l-1.4 1.4A8.3 8.3 0 0 0 8 2 8.3 8.3 0 0 0 2.1 4.4L.7 3C2.6 1.1 5.2 0 8 0Z" />
        </svg>
        {/* Batería */}
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none" aria-hidden="true">
          <rect x="0.5" y="0.5" width="22" height="11" rx="3" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="18" height="8" rx="1.6" fill="currentColor" />
          <rect x="24" y="4" width="2" height="4" rx="1" fill="currentColor" opacity="0.5" />
        </svg>
      </div>
    </div>
  )
}

interface PhoneFrameProps {
  children: ReactNode
  nav: ReactNode
  /** botón de acción flotante (FAB) fijado sobre la navegación */
  floatingAction?: ReactNode
  /** cabecera con status bar sobre fondo oscuro (pantalla AXIS) */
  darkStatusBar?: boolean
  frameClassName?: string
}

/**
 * Maqueta de dispositivo: marco redondeado con barra de estado,
 * área de contenido con scroll oculto y navegación inferior fija.
 */
export function PhoneFrame({
  children,
  nav,
  floatingAction,
  darkStatusBar,
  frameClassName,
}: PhoneFrameProps) {
  return (
    <div className="relative mx-auto w-full max-w-[400px]">
      <div
        className={`relative flex h-[calc(100dvh-2rem)] max-h-[860px] min-h-[640px] flex-col overflow-hidden rounded-[2.75rem] border-[6px] border-grafito/90 bg-background shadow-[0_40px_80px_-30px_rgba(31,41,55,0.45)] ${frameClassName ?? ''}`}
      >
        <StatusBar dark={darkStatusBar} />
        <div className="no-scrollbar flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
        {floatingAction && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[92px] z-10 flex justify-end px-5">
            <div className="pointer-events-auto">{floatingAction}</div>
          </div>
        )}
        {nav}
      </div>
    </div>
  )
}
