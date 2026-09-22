'use client'

import { useMemo, useState } from 'react'
import { movementLabel } from '@/lib/types'
import { formatCents } from '@/lib/money'
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
  const filtered = useMemo(() => {
    if (!movements) return []
    const q = query.trim().toLowerCase()
    return movements.filter((m) => {
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
  }, [movements, filter, query])
  const groups = useMemo(() => groupByDay(filtered), [filtered])

  /** Lo que el usuario está viendo ahora mismo: cuántos y cuánto suman. */
  const shown = useMemo(() => {
    const incomeCents = filtered.filter((m) => m.type === 'ingreso').reduce((t, m) => t + m.amountCents, 0)
    const expenseCents = filtered.filter((m) => m.type === 'gasto').reduce((t, m) => t + m.amountCents, 0)
    return { count: filtered.length, incomeCents, expenseCents }
  }, [filtered])

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

      {shown.count > 0 && (
        <p className="-mt-1 text-[13px] text-muted-foreground">
          {shown.count === 1 ? '1 movimiento' : `${shown.count} movimientos`}
          {shown.incomeCents > 0 && ` · ${formatCents(shown.incomeCents)} en ingresos`}
          {shown.expenseCents > 0 && ` · ${formatCents(shown.expenseCents)} en gastos`}
        </p>
      )}

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
