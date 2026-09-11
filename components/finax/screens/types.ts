import type { FinancialOverview } from '@/hooks/use-financial-overview'
import type { ScreenKey } from '../bottom-navigation'

export interface ScreenProps {
  /** `undefined` mientras cargan los datos locales. */
  overview: FinancialOverview | undefined
  onNavigate: (screen: ScreenKey) => void
  /** Vuelve a la pestaña principal desde la que se abrió una pantalla secundaria. */
  onBack: () => void
}
