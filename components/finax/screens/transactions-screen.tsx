'use client'

import { useMemo, useState } from 'react'
import { movementLabel } from '@/lib/types'
import { formatDayHeading, groupByDay } from '@/lib/dates'
import { PageHeader, IconButton } from '../page-header'
import { FilterTabs } from '../filter-tabs'
import { SearchBar } from '../search-bar'
import { FinancialCard } from '../card'
import { TransactionRow } from '../transaction-row'
import { EmptyState } from '../empty-state'
import { Button } from '../button'
import { ScreenLoading } from '../loading'
import { useSheet } from '../sheet'
import { MovementDetail } from '../forms/movement-detail'
import { MovementForm } from '../forms/movement-form'
import { SettingsIcon, SearchIcon } from '../icons'
import type { ScreenProps } from './types'

const FILTERS = ['Todos', 'Ingresos', 'Gastos'] as const

export function TransactionsScreen({ overview, onNavigate }: ScreenProps) {
  const [filter, setFilter] = useState<string>('Todos')
  const [query, setQuery] = useState('')
  const { open, close } = useSheet()

  const movements = overview?.movements
  const groups = useMemo(() => {
    if (!movements) return []
    const q = query.trim().toLowerCase()
    const filtered = movements.filter((m) => {
      const byType =
        filter === 'Todos' ||
        (filter === 'Ingresos' && m.type === 'ingreso') ||
        (filter === 'Gastos' && m.type === 'gasto')
      const byQuery =
        q === '' ||
        movementLabel(m).toLowerCase().includes(q) ||
        m.category.toLowerCase().includes(q)
      return byType && byQuery
    })
    return groupByDay(filtered)
  }, [movements, filter, query])

  if (!overview) return <ScreenLoading />

  const hasAny = overview.movements.length > 0

  return (
    <div className="space-y-5 px-5 pb-24 pt-3">
      <PageHeader
        title="Movimientos"
        action={
          <IconButton label="Ajustes" onClick={() => onNavigate('ajustes')}>
            <SettingsIcon className="h-5 w-5" />
          </IconButton>
        }
      />

      <FilterTabs options={FILTERS} value={filter} onChange={setFilter} />

      <SearchBar placeholder="Buscar movimiento..." value={query} onChange={setQuery} />

      {groups.length === 0 ? (
        hasAny ? (
          <EmptyState
            title="Sin resultados"
            description="No hemos encontrado movimientos con estos filtros."
            icon={<SearchIcon className="h-6 w-6" />}
          />
        ) : (
          <EmptyState
            title="Aquí empieza tu historia"
            description="Registra tu primer ingreso o gasto para empezar a ver tu dinero con sentido."
            action={
              <Button onClick={() => open('Nuevo movimiento', <MovementForm onDone={close} />)}>
                Añadir movimiento
              </Button>
            }
          />
        )
      ) : (
        <div className="space-y-5">
          {groups.map((group) => (
            <section key={group.date}>
              <h2 className="mb-2 text-[13px] font-bold text-muted-foreground">
                {formatDayHeading(group.date)}
              </h2>
              <FinancialCard padded={false} className="px-4">
                <div className="divide-y divide-border">
                  {group.items.map((m) => (
                    <TransactionRow
                      key={m.id}
                      movement={m}
                      onClick={() => open('Detalle', <MovementDetail movement={m} onDone={close} />)}
                    />
                  ))}
                </div>
              </FinancialCard>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
