'use client'

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

/**
 * Posición del resaltado deslizante de un selector: mide la opción marcada con
 * `data-active="true"` dentro del contenedor y devuelve el estilo del
 * indicador (desplazamiento y ancho). La primera medida no se anima, para que
 * al abrir la pantalla no venga deslizándose desde la izquierda.
 */
export function useSlidingIndicator<T extends HTMLElement>(activeKey: string) {
  const containerRef = useRef<T>(null)
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)
  const [animate, setAnimate] = useState(false)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const measure = () => {
      const active = container.querySelector<HTMLElement>('[data-active="true"]')
      if (!active) return
      setBox({ left: active.offsetLeft, width: active.offsetWidth })
    }
    measure()
    // Tras pintar la primera posición, los cambios ya se animan.
    const id = requestAnimationFrame(() => setAnimate(true))
    // Las fuentes o el ancho del móvil pueden cambiar el tamaño de las opciones.
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => {
      cancelAnimationFrame(id)
      observer.disconnect()
    }
  }, [activeKey])

  const style: CSSProperties = box
    ? { width: box.width, transform: `translateX(${box.left}px)` }
    : { width: 0, opacity: 0 }
  return { containerRef, style, animate }
}
