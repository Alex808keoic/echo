'use client'

import { useState, type ChangeEvent } from 'react'
import { categoriesFor, type Category } from '@/lib/types'
import { formatCents } from '@/lib/money'
import { formatShortDate, todayISO } from '@/lib/dates'
import { parseStatement } from '@/lib/import/bank-statement'
import { PdfReadError, pdfToText } from '@/lib/import/pdf-text'
import { draftsFrom, kindToType, planImport, type ImportDraft, type ImportKind } from '@/lib/import/plan'
import { listMovements } from '@/lib/db/movements'
import { listCashTransfers, saveImport } from '@/lib/db/cash'
import { attemptWrite } from '@/lib/db/storage-errors'
import { useIsMinor } from '@/hooks/use-minor'
import { useBackLayer } from '@/lib/navigation/use-back'
import { Button } from '../button'
import { cn } from '@/lib/utils'

export const IMPORT_STATEMENT_TITLE = 'Importar extracto del banco'

const KIND_LABELS: Record<ImportKind, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  'retirada-efectivo': 'Sacar efectivo',
  'ingreso-efectivo': 'Ingresar efectivo',
}

const selectClass =
  'min-w-0 rounded-xl border border-border bg-background px-2.5 py-2 text-[12.5px] font-semibold text-grafito focus:border-finax focus:outline-none'

type Step = { name: 'pick'; error?: string } | { name: 'reading' } | { name: 'review'; drafts: ImportDraft[] } | { name: 'done'; movements: number; transfers: number }

/**
 * Importar un extracto en PDF: se lee en el propio móvil, se proponen los
 * movimientos y el usuario revisa cada uno antes de guardar nada.
 */
export function ImportStatement({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>({ name: 'pick' })
  const [saveError, setSaveError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const minor = useIsMinor()
  // Revisando, «atrás» vuelve a elegir archivo, como su botón.
  useBackLayer(step.name === 'review', () => setStep({ name: 'pick' }))

  async function readFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setStep({ name: 'reading' })
    try {
      const text = await pdfToText(file)
      const rows = parseStatement(text, todayISO())
      if (rows.length === 0) {
        setStep({ name: 'pick', error: 'No hemos encontrado movimientos en este PDF. Prueba con el extracto de movimientos de la cuenta (no con un recibo o un certificado).' })
        return
      }
      const [movements, transfers] = await Promise.all([listMovements(), listCashTransfers()])
      setStep({ name: 'review', drafts: draftsFrom(rows, movements, transfers, minor) })
    } catch (error) {
      setStep({ name: 'pick', error: error instanceof PdfReadError ? error.message : 'No se ha podido leer el PDF. Prueba con otro archivo.' })
    }
  }

  if (step.name === 'reading') {
    return <p className="py-8 text-center text-[13.5px] font-semibold text-muted-foreground">Leyendo el extracto…</p>
  }

  if (step.name === 'done') {
    const parts = [
      step.movements > 0 ? `${step.movements} movimiento${step.movements === 1 ? '' : 's'}` : null,
      step.transfers > 0 ? `${step.transfers} traspaso${step.transfers === 1 ? '' : 's'} de efectivo` : null,
    ].filter(Boolean)
    return (
      <div className="space-y-4">
        <p className="text-[14px] font-semibold text-grafito text-pretty">Listo: añadidos {parts.join(' y ')}.</p>
        <Button fullWidth onClick={onDone}>
          Ver movimientos
        </Button>
      </div>
    )
  }

  if (step.name === 'pick') {
    return (
      <div className="space-y-4">
        <p className="text-[13px] font-medium leading-snug text-muted-foreground text-pretty">
          Descarga el extracto de movimientos en PDF desde la app o la web de tu banco y elígelo aquí. Te enseñaremos lo que encontremos para que lo revises antes de añadir nada.
        </p>
        <p className="rounded-2xl border border-border bg-background px-4 py-3 text-[12px] font-medium leading-snug text-muted-foreground text-pretty">
          El PDF se lee en tu móvil: no se envía a ningún sitio. Lo que pagaste con tarjeta entra como tarjeta; lo que sacaste del cajero pasa a tu efectivo.
        </p>
        {step.error && (
          <p role="alert" className="text-[12.5px] font-medium text-negative text-pretty">
            {step.error}
          </p>
        )}
        <label className="flex w-full cursor-pointer items-center justify-center rounded-full bg-finax-dark px-5 py-3 text-sm font-semibold text-white transition-all active:scale-[0.98]">
          Elegir PDF
          <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={readFile} />
        </label>
      </div>
    )
  }

  const drafts = step.drafts
  const update = (key: string, patch: Partial<ImportDraft>) =>
    setStep({ name: 'review', drafts: drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)) })
  const selected = drafts.filter((d) => d.selected)
  const allSelected = selected.length === drafts.length
  const duplicates = drafts.filter((d) => d.duplicate).length

  async function save() {
    const plan = planImport(drafts)
    setBusy(true)
    setSaveError(null)
    const result = await attemptWrite(() => saveImport(plan.movements, plan.transfers))
    setBusy(false)
    if (result.ok) setStep({ name: 'done', movements: plan.movements.length, transfers: plan.transfers.length })
    else setSaveError(result.message)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-muted-foreground">
          {drafts.length} encontrado{drafts.length === 1 ? '' : 's'}
          {duplicates > 0 && ` · ${duplicates} ya los tenías`}
        </p>
        <button
          type="button"
          className="shrink-0 text-[12.5px] font-bold text-finax-dark"
          onClick={() => setStep({ name: 'review', drafts: drafts.map((d) => ({ ...d, selected: !allSelected })) })}
        >
          {allSelected ? 'Quitar todos' : 'Marcar todos'}
        </button>
      </div>

      <ul className="divide-y divide-border rounded-2xl border border-border">
        {drafts.map((d) => {
          const type = kindToType(d.kind)
          const categories = type ? categoriesFor(type, { minor }) : []
          const positive = d.kind === 'ingreso'
          return (
            <li key={d.key} className={cn('space-y-2 px-3.5 py-3', !d.selected && 'opacity-55')}>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={d.selected}
                  onChange={(e) => update(d.key, { selected: e.target.checked })}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-finax"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-grafito">{d.concept}</span>
                  <span className="block text-[11.5px] font-medium text-muted-foreground tabular-nums">
                    {formatShortDate(d.date)}
                    {d.duplicate && ' · Puede que ya lo tengas'}
                  </span>
                </span>
                <span className={cn('shrink-0 text-[13.5px] font-bold tabular-nums', positive ? 'text-finax-dark' : type ? 'text-negative' : 'text-grafito')}>
                  {type ? formatCents(positive ? d.amountCents : -d.amountCents, true) : formatCents(d.amountCents)}
                </span>
              </label>
              {d.selected && (
                <div className="flex gap-2 pl-7">
                  <select
                    aria-label="Tipo"
                    value={d.kind}
                    className={cn(selectClass, 'flex-1')}
                    onChange={(e) => {
                      const kind = e.target.value as ImportKind
                      const nextType = kindToType(kind)
                      const keep = nextType && categoriesFor(nextType, { minor }).includes(d.category)
                      update(d.key, { kind, ...(keep ? {} : { category: 'Otros' as Category }) })
                    }}
                  >
                    {(Object.keys(KIND_LABELS) as ImportKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                  {type ? (
                    <select
                      aria-label="Categoría"
                      value={d.category}
                      className={cn(selectClass, 'flex-1')}
                      onChange={(e) => update(d.key, { category: e.target.value as Category })}
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="flex flex-1 items-center text-[11.5px] font-medium leading-tight text-muted-foreground">
                      {d.kind === 'retirada-efectivo' ? 'Del banco a tu efectivo' : 'De tu efectivo al banco'}
                    </span>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="text-[11.5px] font-medium leading-snug text-muted-foreground text-pretty">
        Sacar o ingresar efectivo no es un gasto ni un ingreso: solo cambia dónde está tu dinero. El concepto del banco se guarda como nota.
      </p>

      {saveError && (
        <p role="alert" className="text-[12.5px] font-medium text-negative">
          {saveError}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="secondary" onClick={() => setStep({ name: 'pick' })}>
          Otro PDF
        </Button>
        <Button type="button" fullWidth disabled={busy || selected.length === 0} onClick={save}>
          {selected.length === 0 ? 'Marca alguno' : `Añadir ${selected.length}`}
        </Button>
      </div>
    </div>
  )
}
