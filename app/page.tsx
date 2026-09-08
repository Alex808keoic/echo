'use client'

import { useState } from 'react'
import { PhoneFrame } from '@/components/finax/phone-frame'
import { BottomNavigation, type TabKey } from '@/components/finax/bottom-navigation'
import { HomeScreen } from '@/components/finax/screens/home-screen'
import { MoneyScreen } from '@/components/finax/screens/money-screen'
import { TransactionsScreen } from '@/components/finax/screens/transactions-screen'
import { StatsScreen } from '@/components/finax/screens/stats-screen'
import { AxisScreen } from '@/components/finax/screens/axis-screen'
import { Wordmark } from '@/components/finax/wordmark'
import { PlusIcon } from '@/components/finax/icons'

export default function Page() {
  const [tab, setTab] = useState<TabKey>('inicio')

  const showFab = tab === 'movimientos' || tab === 'estadisticas'

  return (
    <main className="min-h-dvh w-full bg-background">
      {/* Marca de escritorio (eco del póster de Finax) */}
      <div className="mx-auto hidden max-w-6xl items-center justify-between px-8 pt-8 lg:flex">
        <div className="flex items-center gap-4">
          <Wordmark size="md" />
          <span className="h-6 w-px bg-border" />
          <p className="text-[15px] font-medium text-muted-foreground">Tu dinero, con sentido.</p>
        </div>
        <p className="text-[13px] font-semibold text-muted-foreground">
          Analiza · Entiende · Decide · Avanza
        </p>
      </div>

      <div className="flex min-h-dvh items-center justify-center p-4 lg:min-h-[calc(100dvh-5rem)]">
        <PhoneFrame
          nav={<BottomNavigation active={tab} onChange={setTab} />}
          floatingAction={
            showFab ? (
              <button
                aria-label="Añadir movimiento"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-finax text-white shadow-[0_12px_28px_-8px_rgba(14,166,118,0.7)] transition-transform active:scale-95"
              >
                <PlusIcon className="h-6 w-6" />
              </button>
            ) : null
          }
        >
          {tab === 'inicio' && <HomeScreen onNavigate={setTab} />}
          {tab === 'dinero' && <MoneyScreen onNavigate={setTab} />}
          {tab === 'movimientos' && <TransactionsScreen />}
          {tab === 'estadisticas' && <StatsScreen onNavigate={setTab} />}
          {tab === 'axis' && <AxisScreen />}
        </PhoneFrame>
      </div>
    </main>
  )
}
