'use client'

import { cn } from '@/lib/utils'
import { HomeIcon, MoneyIcon, MovementsIcon, StatsIcon } from './icons'
import { AxisSphere } from './axis-sphere'

export type TabKey = 'inicio' | 'dinero' | 'movimientos' | 'estadisticas' | 'axis'

/** Pantallas secundarias accesibles desde las pestañas principales. «plan» no es una pantalla: abre AXIS en «Tu plan». */
export type ScreenKey = TabKey | 'objetivos' | 'inversiones' | 'ajustes' | 'memoria' | 'plan' | 'resumen' | 'guia' | 'deudas' | 'simulador' | 'fijos'

interface Tab {
  key: TabKey
  label: string
  icon: (props: { className?: string }) => React.ReactElement
}

const tabs: Tab[] = [
  { key: 'inicio', label: 'Inicio', icon: (p) => <HomeIcon {...p} /> },
  { key: 'dinero', label: 'Mi Dinero', icon: (p) => <MoneyIcon {...p} /> },
  { key: 'movimientos', label: 'Movimientos', icon: (p) => <MovementsIcon {...p} /> },
  { key: 'estadisticas', label: 'Estadísticas', icon: (p) => <StatsIcon {...p} /> },
  { key: 'axis', label: 'AXIS', icon: () => <span /> },
]

/** Posición de la pestaña en la barra (la transición entra por ese lado). */
export function tabIndex(key: TabKey): number {
  return tabs.findIndex((t) => t.key === key)
}

/** Pestañas principales. */
export function isTab(screen: ScreenKey): screen is TabKey {
  return tabs.some((t) => t.key === screen)
}

interface BottomNavigationProps {
  active: TabKey
  onChange: (key: TabKey) => void
}

export function BottomNavigation({ active, onChange }: BottomNavigationProps) {
  const index = tabIndex(active)
  return (
    <nav aria-label="Navegación principal" className="border-t border-border bg-card/95 px-3 pb-5 pt-2.5 backdrop-blur">
      <div className="relative flex items-stretch justify-between">
        {/* Pastilla que se desliza hasta la pestaña activa, detrás de su icono. */}
        <span
          aria-hidden
          className="slide-indicator pointer-events-none absolute left-0 top-0 flex w-1/5 justify-center"
          style={{ transform: `translateX(${index * 100}%)` }}
        >
          <span
            className={cn(
              'slide-indicator -mt-1 h-8 w-14 rounded-full',
              active === 'axis' ? 'bg-axis-soft' : 'bg-finax-soft',
            )}
          />
        </span>
        {tabs.map((tab) => {
          const isActive = tab.key === active
          const isAxis = tab.key === 'axis'
          const activeColor = isAxis ? 'text-axis-violet' : 'text-finax'
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex flex-1 flex-col items-center gap-1 transition-transform duration-150 active:scale-95"
            >
              <span
                className={cn(
                  'flex h-6 items-center justify-center transition-[color,scale] duration-200',
                  isActive ? cn(activeColor, 'scale-110') : 'text-muted-foreground',
                )}
              >
                {isAxis ? (
                  isActive ? (
                    <AxisSphere size={22} glow={false} />
                  ) : (
                    <span className="h-[18px] w-[18px] rounded-full border-[1.6px] border-current opacity-90" />
                  )
                ) : (
                  <tab.icon className="h-[22px] w-[22px]" />
                )}
              </span>
              <span
                className={cn(
                  'text-[10px] font-semibold tracking-tight transition-colors',
                  isActive ? activeColor : 'text-muted-foreground',
                )}
              >
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
