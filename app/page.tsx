'use client'

import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { PhoneFrame, type ScreenEnter } from '@/components/finax/phone-frame'
import { BottomNavigation, isTab, tabIndex, type ScreenKey } from '@/components/finax/bottom-navigation'
import { HomeScreen } from '@/components/finax/screens/home-screen'
import { MoneyScreen, openMoneyView } from '@/components/finax/screens/money-screen'
import { TransactionsScreen } from '@/components/finax/screens/transactions-screen'
import { AxisScreen, openAxisTab } from '@/components/finax/screens/axis-screen'
import { ObjectivesScreen } from '@/components/finax/screens/objectives-screen'
import { InvestmentsScreen } from '@/components/finax/screens/investments-screen'
import { SettingsScreen } from '@/components/finax/screens/settings-screen'
import { MemoryScreen } from '@/components/finax/screens/memory-screen'
import { GuideScreen } from '@/components/finax/screens/guide-screen'
import { MarketsScreen } from '@/components/finax/screens/markets-screen'
import { DebtsScreen } from '@/components/finax/screens/debts-screen'
import { SimulatorScreen } from '@/components/finax/screens/simulator-screen'
import { RecurringScreen } from '@/components/finax/screens/recurring-screen'
import { Wordmark } from '@/components/finax/wordmark'
import { PlusIcon } from '@/components/finax/icons'
import { SheetOutlet, SheetProvider, useSheet } from '@/components/finax/sheet'
import { MovementForm } from '@/components/finax/forms/movement-form'
import { FirstRunWelcome } from '@/components/finax/first-run-welcome'
import { RestoreOverlay } from '@/components/finax/restore-overlay'
import { isRestorePending } from '@/lib/ecosystem/use-cloud-sync'
import { useFinancialOverview } from '@/hooks/use-financial-overview'
import { EcosystemProvider } from '@/hooks/use-ecosystem'
import { RETURN_TO_SETTINGS_KEY } from '@/lib/ecosystem/client'
import { useScreenStack, type ScreenChange } from '@/lib/navigation/use-back'

type NavDirection = 'forward' | 'back' | 'left' | 'right'

const FALLBACK_ENTER: Record<NavDirection, ScreenEnter> = { forward: 'forward', back: 'back', left: 'fade', right: 'fade' }

/** Entre pestañas, hacia el lado de la pestaña; al abrir una secundaria, hacia delante; al volver, hacia atrás. */
function directionOf({ from, to, kind }: ScreenChange<ScreenKey>): NavDirection {
  if (isTab(from) && isTab(to)) return tabIndex(to) > tabIndex(from) ? 'right' : 'left'
  return kind === 'pop' || isTab(to) ? 'back' : 'forward'
}

export default function Page() {
  return (
    <SheetProvider>
      <EcosystemProvider>
        <App />
      </EcosystemProvider>
    </SheetProvider>
  )
}

function App() {
  // Animación de entrada: ninguna al abrir la app; después, según de dónde a dónde se va.
  const [enter, setEnter] = useState<ScreenEnter | undefined>(undefined)
  const overview = useFinancialOverview()
  const { open, close } = useSheet()
  // Cada pantalla es una entrada del historial, con Inicio como raíz: desde ella, «atrás» sale de la app.
  const { screens, current: screen, navigate: goTo, back: backScreen } = useScreenStack<ScreenKey>('inicio', Object.is, (update, change) => {
    transition(directionOf(change), update)
  })
  /** Última pestaña principal de la pila: es la que se resalta en la barra. */
  const origin = screens.filter(isTab).at(-1) ?? 'inicio'

  // Al volver de entrar con Google para el ecosistema AXIS, se reabre Ajustes, donde se empezó.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(RETURN_TO_SETTINGS_KEY) === null) return
      window.sessionStorage.removeItem(RETURN_TO_SETTINGS_KEY)
      // Si se entró para recuperar los datos, se queda en Inicio.
      if (!isRestorePending('finax')) goTo('ajustes')
    } catch {
      // Sin sessionStorage se queda en Inicio.
    }
  }, [goTo])

  const showFab = screen === 'movimientos' || screen === 'dinero'
  const openNewMovement = () => open('Nuevo movimiento', <MovementForm onDone={close} />)
  /**
   * Cambia de pantalla con transición. Con View Transitions (Chrome/Android) la pantalla que sale y la
   * que entra se animan a la vez según la dirección (globals.css); sin soporte o con «reducir
   * movimiento», solo la animación de entrada de PhoneFrame.
   */
  const transition = (direction: NavDirection, update: () => void) => {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!doc.startViewTransition || reduce) {
      setEnter(FALLBACK_ENTER[direction])
      update()
      return
    }
    document.documentElement.dataset.nav = direction
    doc.startViewTransition(() =>
      flushSync(() => {
        setEnter(undefined)
        update()
      }),
    )
  }
  const navigate = (target: ScreenKey) => {
    // «Tu plan» es la pestaña principal de AXIS: se entra en AXIS por ella.
    if (target === 'plan') openAxisTab('plan')
    // Estadísticas es la vista de gastos de «Tu dinero».
    if (target === 'estadisticas') openMoneyView('Gastos')
    goTo(target === 'plan' ? 'axis' : target === 'estadisticas' ? 'dinero' : target)
  }
  const back = backScreen

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
          overlay={
            <>
              <FirstRunWelcome overview={overview} />
              <RestoreOverlay overview={overview} />
              <SheetOutlet />
            </>
          }
          contentKey={screen}
          enter={enter}
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
          {screen === 'axis' && <AxisScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'objetivos' && <ObjectivesScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'inversiones' && <InvestmentsScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'ajustes' && <SettingsScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'memoria' && <MemoryScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'guia' && <GuideScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'deudas' && <DebtsScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'simulador' && <SimulatorScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'fijos' && <RecurringScreen overview={overview} onNavigate={navigate} onBack={back} />}
          {screen === 'mercados' && <MarketsScreen onBack={back} />}
        </PhoneFrame>
      </div>
    </main>
  )
}
