'use client'

import { useMemo, useState } from 'react'
import { transactionGroups, movementFilters } from '@/lib/demo-data'
import { PageHeader, IconButton } from '../page-header'
import { FilterTabs } from '../filter-tabs'
import { SearchBar } from '../search-bar'
import { FinancialCard } from '../card'
import { TransactionRow } from '../transaction-row'
import { EmptyState } from '../empty-state'
import { SettingsIcon, FilterIcon, SearchIcon } from '../icons'

export function TransactionsScreen() {
  const [filter, setFilter] = useState<string>('Todos')
  const [query, setQuery] = useState('')

  const filteredGroups = useMemo(() => {
    return transactionGroups
      .map((group) => ({
        ...group,
        transactions: group.transactions.filter((t) => {
          const byType =
            filter === 'Todos' ||
            (filter === 'Ingresos' && t.type === 'income') ||
            (filter === 'Gastos' && t.type === 'expense')
          const byQuery =
            query.trim() === '' ||
            t.name.toLowerCase().includes(query.toLowerCase()) ||
            t.category.toLowerCase().includes(query.toLowerCase())
          return byType && byQuery
        }),
      }))
      .filter((group) => group.transactions.length > 0)
  }, [filter, query])

  return (
    <div className="space-y-5 px-5 pb-8 pt-3">
      <PageHeader
        title="Movimientos"
        action={
          <IconButton label="Ajustes">
            <SettingsIcon className="h-5 w-5" />
          </IconButton>
        }
      />

      <FilterTabs options={movementFilters} value={filter} onChange={setFilter} />

      <SearchBar
        placeholder="Buscar movimiento..."
        value={query}
        onChange={setQuery}
        trailing={
          <IconButton label="Filtrar">
            <FilterIcon className="h-5 w-5" />
          </IconButton>
        }
      />

      {filteredGroups.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="No hemos encontrado movimientos con estos filtros."
          icon={<SearchIcon className="h-6 w-6" />}
        />
      ) : (
        <div className="space-y-5">
          {filteredGroups.map((group) => (
            <section key={group.label}>
              <h2 className="mb-2 text-[13px] font-bold text-muted-foreground">{group.label}</h2>
              <FinancialCard padded={false} className="px-4">
                <div className="divide-y divide-border">
                  {group.transactions.map((t) => (
                    <TransactionRow key={t.id} transaction={t} />
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
