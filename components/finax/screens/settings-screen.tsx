'use client'

import { useRef, useState } from 'react'
import { clearAllData, exportBackup, parseBackup, restoreBackup } from '@/lib/db/backup'
import { loadDemoData } from '@/lib/db/demo-seed'
import { getAxisEngine } from '@/lib/axis/engine'
import { SubPageHeader } from '../page-header'
import { FinancialCard } from '../card'
import { ScreenLoading } from '../loading'
import { useSheet } from '../sheet'
import { Confirm } from '../confirm'
import { InitialBalanceForm } from '../forms/initial-balance-form'
import { ChevronRight } from '../icons'
import { cn } from '@/lib/utils'
import type { ScreenProps } from './types'

interface RowProps {
  title: string
  description: string
  onClick?: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
}

function Row({ title, description, onClick, tone = 'default', disabled }: RowProps) {
  const content = (
    <div className="min-w-0 flex-1">
      <p className={cn('text-[14px] font-bold', tone === 'danger' ? 'text-negative' : 'text-grafito')}>{title}</p>
      <p className="text-[12px] font-medium text-muted-foreground text-pretty">{description}</p>
    </div>
  )
  // Fila informativa: no es un control.
  if (!onClick) return <div className="flex items-center gap-3 px-5 py-3.5">{content}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left disabled:opacity-50"
    >
      {content}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
    </button>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[13px] font-bold text-muted-foreground">{title}</h2>
      <FinancialCard padded={false} className="divide-y divide-border overflow-hidden">
        {children}
      </FinancialCard>
    </section>
  )
}

export function SettingsScreen({ overview, onBack }: ScreenProps) {
  const { open, close } = useSheet()
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)

  if (!overview) return <ScreenLoading />

  const isEmpty = overview.movements.length === 0 && overview.objectives.length === 0 &&
    overview.positions.length === 0 && overview.config === null
  const engine = getAxisEngine().info

  async function handleExport() {
    const backup = await exportBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finax-backup-${backup.exportedAt.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMessage({ text: 'Copia exportada.' })
  }

  async function handleImportFile(file: File) {
    try {
      const backup = parseBackup(await file.text())
      const count = backup.movements.length
      open(
        'Restaurar copia',
        <Confirm
          message={`La copia contiene ${count} movimiento${count === 1 ? '' : 's'}, ${backup.objectives.length} objetivos y ${backup.positions.length} inversiones. Restaurarla sustituirá TODOS los datos actuales de este dispositivo.`}
          confirmLabel="Restaurar"
          destructive
          onCancel={close}
          onConfirm={async () => {
            await restoreBackup(backup)
            close()
            setMessage({ text: 'Datos restaurados.' })
          }}
        />,
      )
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'No se pudo leer el archivo.', error: true })
    }
  }

  function handleClear() {
    open(
      'Borrar todos los datos',
      <Confirm
        message="Se eliminarán movimientos, objetivos, inversiones y saldo inicial de este dispositivo. Exporta una copia antes si quieres conservarlos."
        confirmLabel="Borrar todo"
        destructive
        onCancel={close}
        onConfirm={async () => {
          await clearAllData()
          close()
          setMessage({ text: 'Datos eliminados.' })
        }}
      />,
    )
  }

  function handleDemo() {
    open(
      'Datos de demostración',
      <Confirm
        message="Se cargarán movimientos, objetivos e inversiones de ejemplo, claramente marcados como demo. Sirven solo para probar la interfaz; bórralos desde aquí antes de usar Finax con tus datos reales."
        confirmLabel="Cargar demo"
        onCancel={close}
        onConfirm={async () => {
          await loadDemoData()
          close()
          setMessage({ text: 'Datos de demostración cargados.' })
        }}
      />,
    )
  }

  return (
    <div className="space-y-6 px-5 pb-8 pt-3">
      <SubPageHeader title="Ajustes" subtitle="Datos, privacidad e información" onBack={onBack} />

      {overview.config?.demo && (
        <div className="rounded-2xl border border-axis-violet/20 bg-axis-soft px-4 py-3 text-[12.5px] font-semibold text-axis-indigo">
          Estás viendo datos de demostración. No son datos financieros reales.
        </div>
      )}

      {message && (
        <p
          className={cn(
            'rounded-2xl px-4 py-3 text-[12.5px] font-semibold',
            message.error ? 'bg-negative-soft text-negative' : 'bg-finax-soft text-finax-dark',
          )}
        >
          {message.text}
        </p>
      )}

      <Group title="Tus datos">
        <Row
          title="Exportar copia de seguridad"
          description="Descarga un archivo JSON con todos tus datos."
          onClick={handleExport}
          disabled={isEmpty}
        />
        <Row
          title="Importar / restaurar"
          description="Sustituye los datos actuales por los de una copia."
          onClick={() => fileInput.current?.click()}
        />
        <Row
          title="Saldo inicial"
          description="Punto de partida de tu patrimonio. Se recalcula todo al cambiarlo."
          onClick={() =>
            open(
              'Saldo inicial',
              <InitialBalanceForm currentCents={overview.config?.initialBalanceCents} onDone={close} />,
            )
          }
        />
        <Row
          title="Cargar datos de demostración"
          description={isEmpty ? 'Solo para probar la interfaz. Requiere una instalación vacía.' : 'No disponible: ya hay datos guardados.'}
          onClick={isEmpty ? handleDemo : undefined}
        />
        <Row
          title="Borrar todos los datos"
          description="Elimina de forma definitiva todo lo guardado en este dispositivo."
          onClick={handleClear}
          tone="danger"
          disabled={isEmpty}
        />
      </Group>

      <Group title="Privacidad">
        <Row
          title="Todo se guarda en tu dispositivo"
          description="Finax funciona sin cuenta ni servidor. Tus datos viven en el almacenamiento local del navegador y no se envían a ningún sitio."
        />
      </Group>

      <Group title="AXIS">
        <Row
          title={engine.label}
          description={
            engine.isAI
              ? 'Análisis producido por un modelo de IA.'
              : 'Lógica determinista sobre tus datos locales. No hay ningún modelo de IA conectado todavía.'
          }
        />
      </Group>

      <Group title="Información">
        <Row title="Finax V1" description="Tu dinero, con sentido. Analiza · Entiende · Decide · Avanza." />
      </Group>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void handleImportFile(file)
        }}
      />
    </div>
  )
}
