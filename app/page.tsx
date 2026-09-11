'use client'

import { useState } from 'react'
import { PhoneFrame } from '@/components/finax/phone-frame'
import { BottomNavigation, isTab, type ScreenKey, type TabKey } from '@/components/finax/bottom-navigation'
import { HomeScreen } from '@/components/finax/screens/home-screen'
import { MoneyScreen } from '@/components/finax/screens/money-screen'
import { TransactionsScreen } from '@/components/finax/screens/transactions-screen'
import { StatsScreen } from '@/components/finax/screens/stats-screen'
import { AxisScreen } from '@/components/finax/screens/axis-screen'
import { ObjectivesScreen } from '@/components/finax/screens/objectives-screen'
import { InvestmentsScreen } from '@/components/finax/screens/investments-screen'
import { SettingsScreen } from '@/components/finax/screens/settings-screen'
import { Wordmark } from '@/components/finax/wordmark'
import { PlusIcon } from '@/components/finax/icons'
import { SheetOutlet, SheetProvider, useSheet } from '@/components/finax/sheet'
import { MovementForm } from '@/components/finax/forms/movement-form'
import { useFinancialOverview } from '@/hooks/use-financial-overview'

export default function Page() {
  return (
    <SheetProvider>
      <App />
    </SheetProvider>
  )
}

function App() {
  const [screen, setScreen] = useState<ScreenKey>('inicio')
  /** Última pestaña principal visitada: se resalta en la barra y es el destino de «volver». */
  const [origin, setOrigin] = useState<TabKey>('inicio')
  const overview = useFinancialOverview()
  const { open, close } = useSheet()

  const showFab = screen === 'movimientos' || screen === 'estadisticas'
  const openNewMovement = () => open('Nuevo movimiento', <MovementForm onDone={close} />)
  const navigate = (next: ScreenKey) => {
    if (isTab(next)) setOrigin(next)
    setScreen(next)
  }
  const back = () => setScreen(origin)

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

      <div className="flex min-h-dvh items-center justify-center sm:p-4 lg:min-h-[calc(100dvh-5rem)]">
        <PhoneFrame
          nav={<BottomNavigation active={origin} onChange={navigate} />}
          overlay={<SheetOutlet />}
          contentKey={screen}
          floatingAction={
            showFab ? (
              <button
                aria-label="Añadir movimiento"
                onClick={openNewMovement}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-finax text-white shadow-[0_12px_28px_-8px_rgba(14,166,118,0.7)] transition-transform active:scale-95"
              >
                <PlusIcon className="h-6 w-6" />
              </button>
            ) : null
          }
        >
          {screen === 'inicio' && <HomeScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'dinero' && <MoneyScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'movimientos' && <TransactionsScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'estadisticas' && <StatsScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'axis' && <AxisScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'objetivos' && <ObjectivesScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'inversiones' && <InvestmentsScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'ajustes' && <SettingsScreen overview={overview} onNavigate={navigate} onBack={back} />}
        </PhoneFrame>
      </div>
    </main>
  )
}
