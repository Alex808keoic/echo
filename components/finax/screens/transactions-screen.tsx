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
import { MOVEMENT_DETAIL_TITLE, MovementDetail } from '../forms/movement-detail'
import { MovementForm } from '../forms/movement-form'
import { ChevronRight, SettingsIcon, SearchIcon } from '../icons'
import { RecurringPending } from '../recurring-pending'
import { useRecurring } from '@/hooks/use-recurring'
import type { ScreenProps } from './types'

const FILTERS = ['Todos', 'Ingresos', 'Gastos'] as const

export function TransactionsScreen({ overview, onNavigate }: ScreenProps) {
  const [filter, setFilter] = useState<string>('Todos')
  const [query, setQuery] = useState('')
  const { open, close } = useSheet()
  const fixed = useRecurring()

  const movements = overview?.movements
  // Nombre de cada fijo, para enseñar «Spotify» en lugar de su categoría.
  const fixedNames = useMemo(() => new Map((fixed?.recurring ?? []).map((r) => [r.id, r.name])), [fixed])
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
        (m.recurringId !== undefined && fixedNames.get(m.recurringId)?.toLowerCase().includes(q)) ||
        m.category.toLowerCase().includes(q)
      return byType && byQuery
    })
  }, [movements, filter, query, fixedNames])
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

      {fixed && <RecurringPending pending={fixed.pending} onSeeAll={() => onNavigate('fijos')} />}

      <button
        type="button"
        onClick={() => onNavigate('fijos')}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/40"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-bold text-grafito">Movimientos fijos</span>
          <span className="block text-[12px] font-medium text-muted-foreground text-pretty">
            {!fixed || fixed.recurring.length === 0
              ? 'Nómina, alquiler, suscripciones: te los proponemos cada vez'
              : `${fixed.recurring.length} fijo${fixed.recurring.length === 1 ? '' : 's'}${fixed.pending.length > 0 ? ` · ${fixed.pending.length} por confirmar` : ''}`}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
      </button>

      <FilterTabs options={FILTERS} value={filter} onChange={setFilter} />

      <SearchBar placeholder="Buscar movimiento..." value={query} onChange={setQuery} />

      {shown.count > 0 && (
        // Cada parte entera: a 360 px se partía entre la cifra y «en gastos».
        <p className="-mt-1 flex flex-wrap gap-x-1 text-[13px] text-muted-foreground">
          <span className="whitespace-nowrap">{shown.count === 1 ? '1 movimiento' : `${shown.count} movimientos`}</span>
          {shown.incomeCents > 0 && <span className="whitespace-nowrap">· {formatCents(shown.incomeCents)} en ingresos</span>}
          {shown.expenseCents > 0 && <span className="whitespace-nowrap">· {formatCents(shown.expenseCents)} en gastos</span>}
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
        // key = filtro: al cambiar Todos/Ingresos/Gastos la lista entra con suavidad (al buscar, no).
        <div key={filter} className="content-swap space-y-5">
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
                      fixedName={m.recurringId ? fixedNames.get(m.recurringId) : undefined}
                      onClick={() => open(MOVEMENT_DETAIL_TITLE, <MovementDetail movement={m} onDone={close} />)}
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
