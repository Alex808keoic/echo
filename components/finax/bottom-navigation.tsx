'use client'

import { cn } from '@/lib/utils'
import { HomeIcon, MoneyIcon, MovementsIcon, StatsIcon } from './icons'
import { AxisSphere } from './axis-sphere'

export type TabKey = 'inicio' | 'dinero' | 'movimientos' | 'estadisticas' | 'axis'

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

interface BottomNavigationProps {
  active: TabKey
  onChange: (key: TabKey) => void
}

export function BottomNavigation({ active, onChange }: BottomNavigationProps) {
  return (
    <nav
      aria-label="Navegación principal"
      className="flex items-stretch justify-between border-t border-border bg-card/95 px-3 pb-5 pt-2.5 backdrop-blur"
    >
      {tabs.map((tab) => {
        const isActive = tab.key === active
        const isAxis = tab.key === 'axis'
        const activeColor = isAxis ? 'text-axis-violet' : 'text-finax'
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            aria-current={isActive ? 'page' : undefined}
            className="flex flex-1 flex-col items-center gap-1"
          >
            <span
              className={cn(
                'flex h-6 items-center justify-center transition-colors',
                isActive ? activeColor : 'text-muted-foreground',
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
    </nav>
  )
}
