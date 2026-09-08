/**
 * Iconos lineales minimalistas de Finax.
 * Grosor y estilo coherentes (stroke, currentColor, 24x24 viewBox).
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Base({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

/* --------------------------------- Marca ---------------------------------- */

export function LeafLogo(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M20 4c0 8-5.5 13-13 13-1 0-2-.2-2-.2s.2-9 8-12c3-1.2 7-.8 7-.8Z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M20 4c0 8-5.5 13-13 13M20 4S8 4 5 13c-.7 2-1 4-1 4M20 4c-6 1-11 4-13 9"
        stroke="currentColor"
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* ------------------------------ Navegación -------------------------------- */

export function HomeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1v-8.5Z" />
    </Base>
  )
}

export function MoneyIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 8.5C4 6.6 5.6 5 7.5 5H16c1.1 0 2 .9 2 2M4 8.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M4 8.5C4 10 5 11 6.5 11H18a2 2 0 0 1 2 2v0" />
      <circle cx="16.5" cy="13" r="1.1" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function MovementsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 9h13l-3-3M20 15H7l3 3" />
    </Base>
  )
}

export function StatsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 20V5M4 20h16" />
      <path d="M8 16v-3M12 16v-6M16 16V8M20 16v-2" />
      <path d="M7 10l4-4 3 2 5-5" opacity="0.55" />
    </Base>
  )
}

/* ------------------------------- Interfaz --------------------------------- */

export function SearchIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-3.2-3.2" />
    </Base>
  )
}

export function FilterIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </Base>
  )
}

export function SettingsIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V19a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 17.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 5.3 12H5a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 6.6 5.3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 12 3.3V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8Z" />
    </Base>
  )
}

export function UserIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8.5" r="3.2" />
      <path d="M5 19.5a7 7 0 0 1 14 0" />
    </Base>
  )
}

export function PlusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  )
}

export function ChevronRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="m9 6 6 6-6 6" />
    </Base>
  )
}

export function ArrowUpRight(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 17 17 7M8 7h9v9" />
    </Base>
  )
}

export function ArrowUp(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Base>
  )
}

export function ArrowDown(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Base>
  )
}

export function EyeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.6" />
    </Base>
  )
}

export function TargetIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function LightbulbIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2v.1h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
    </Base>
  )
}

export function SparkIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" />
    </Base>
  )
}

/* -------------------------- Iconos de categorías -------------------------- */

export function GroceriesIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 6h2l1.6 9.5a1 1 0 0 0 1 .8h7.6a1 1 0 0 0 1-.8L20 8H6.5" />
      <path d="M9 6 10 3M15 6l-1-3" />
      <circle cx="9.5" cy="20" r="1" />
      <circle cx="16.5" cy="20" r="1" />
    </Base>
  )
}

export function SalaryIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M6.5 9.5h0M17.5 14.5h0" />
    </Base>
  )
}

export function StreamingIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m10 9.5 5 2.5-5 2.5z" fill="currentColor" stroke="none" />
    </Base>
  )
}

export function TransferIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="6" width="17" height="12" rx="2" />
      <path d="M3.5 10h17" />
      <path d="M7 14.5h3" />
    </Base>
  )
}

export function FuelIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 20V6a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v14M4 20h11" />
      <path d="M14 9h2.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 1.5 1.5v0A1.5 1.5 0 0 0 22 16V9l-2.5-2.5" />
      <path d="M7 8h4" />
    </Base>
  )
}

export function EnergyIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M13 2 5 13h6l-1 9 8-11h-6l1-9Z" />
    </Base>
  )
}

export function RestaurantIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 3v7a2 2 0 0 0 4 0V3M8 10v11" />
      <path d="M16 3c-1.5 0-2.5 1.5-2.5 4.5S14.5 12 16 12v9" />
    </Base>
  )
}

export function HouseCategoryIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 11 12 4l8 7M6 10v9h12v-9" />
    </Base>
  )
}

/* --------------------------- Mapa de categorías --------------------------- */

import type { TransactionIconKey } from '@/lib/demo-data'

export const transactionIconMap: Record<
  TransactionIconKey,
  (props: IconProps) => React.ReactElement
> = {
  groceries: GroceriesIcon,
  salary: SalaryIcon,
  streaming: StreamingIcon,
  transfer: TransferIcon,
  fuel: FuelIcon,
  energy: EnergyIcon,
  restaurant: RestaurantIcon,
}
