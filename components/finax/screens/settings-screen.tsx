'use client'

import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { clearAllData, exportBackup, parseBackup, restoreBackup } from '@/lib/db/backup'
import { exportErrorMessage } from '@/lib/db/storage-errors'
import { loadDemoData } from '@/lib/db/demo-seed'
import { browserTransport } from '@/lib/axis/ai/browser-transport'
import { listUserMemories } from '@/lib/db/axis-memories'
import { useMarket } from '@/hooks/use-market'
import { FRESHNESS_LABEL } from '@/lib/market/freshness'
import { formatShortDate } from '@/lib/dates'
import { SubPageHeader } from '../page-header'
import { FinancialCard } from '../card'
import { ScreenLoading } from '../loading'
import { useSheet } from '../sheet'
import { Confirm } from '../confirm'
import { InitialBalanceForm } from '../forms/initial-balance-form'
import { ChevronRight } from '../icons'
import { cn } from '@/lib/utils'
import type { ScreenProps } from './types'
import { disableReminders, enableReminders, reminderStatus, type ReminderStatus } from '@/lib/notifications'
import { getLastBackupAt, setLastBackupAt } from '@/lib/db/meta'
import { toISODate } from '@/lib/dates'

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

/** Activar o desactivar las notificaciones de recordatorio con la app cerrada. */
function RemindersRow() {
  const [status, setStatus] = useState<ReminderStatus | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void reminderStatus().then(setStatus)
  }, [])
  if (!status) return <Row title="Notificaciones" description="Comprobando…" />
  const inApp = 'Además, al abrir Finax verás en Inicio lo que toca: tu decisión del mes, ingresos sin registrar, inversiones sin actualizar, pasos pendientes, copia de seguridad y resumen del año.'
  if (status.support === 'unsupported') return <Row title="Notificaciones no disponibles" description={`Este navegador no permite notificaciones. ${inApp}`} />
  if (status.denied)
    return <Row title="Notificaciones bloqueadas" description={`Has bloqueado las notificaciones de Finax: puedes permitirlas en los ajustes del navegador. ${inApp}`} />
  if (status.support === 'in-app-only')
    return (
      <Row
        title="Notificaciones con la app cerrada no disponibles"
        description={`Necesitan Chrome en Android con Finax instalada en la pantalla de inicio. ${inApp}`}
      />
    )
  const toggle = async () => {
    setBusy(true)
    setStatus(await (status.enabled ? disableReminders() : enableReminders()))
    setBusy(false)
  }
  return (
    <Row
      title={status.enabled ? 'Notificaciones activadas' : 'Activar notificaciones'}
      description={
        status.enabled
          ? `Finax comprueba una vez al día, en el móvil, si toca recordarte algo. Android decide la hora exacta y puede saltarse días. Nada sale del dispositivo. Toca para desactivarlas. ${inApp}`
          : `Un aviso en el móvil cuando toque: tu decisión del mes, ingresos sin registrar, inversiones sin actualizar o pasos pendientes. Se comprueba en el móvil, sin enviar nada. ${inApp}`
      }
      onClick={() => void toggle()}
      disabled={busy}
    />
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

export function SettingsScreen({ overview, onNavigate, onBack }: ScreenProps) {
  const { open, close } = useSheet()
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null)
  const market = useMarket()
  const memoryCount = useLiveQuery(async () => (await listUserMemories()).length, [], 0)
  const lastBackupAt = useLiveQuery(getLastBackupAt, [], null)
  const [aiStatus, setAiStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')
  useEffect(() => {
    let cancelled = false
    browserTransport
      .isAvailable()
      .then((ok) => !cancelled && setAiStatus(ok ? 'available' : 'unavailable'))
      .catch(() => !cancelled && setAiStatus('unavailable'))
    return () => {
      cancelled = true
    }
  }, [])

  if (!overview) return <ScreenLoading />

  const isEmpty = overview.movements.length === 0 && overview.objectives.length === 0 &&
    overview.positions.length === 0 && overview.config === null
  // Las memorias también son datos: con ellas hay algo que exportar o borrar.
  const nothingStored = isEmpty && memoryCount === 0

  async function handleExport() {
    let backup: Awaited<ReturnType<typeof exportBackup>>
    try {
      backup = await exportBackup()
    } catch (error) {
      console.error('Finax: no se ha podido exportar', error)
      setMessage({ text: exportErrorMessage(error), error: true })
      return
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `finax-backup-${backup.exportedAt.slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    // Para el recordatorio de copia: se cuenta como hecha al descargarla.
    await setLastBackupAt().catch(() => {})
    setMessage({ text: `Copia exportada. Incluye ${backup.memories?.length ?? 0} memoria${backup.memories?.length === 1 ? '' : 's'} de AXIS: guárdala como información personal.` })
  }

  async function handleImportFile(file: File) {
    try {
      const backup = parseBackup(await file.text())
      const count = backup.movements.length
      const incoming = backup.memories?.length
      // v2: las memorias de la copia sustituyen a las actuales. v1: no trae memorias y las actuales se conservan.
      const memoriesNote =
        incoming === undefined
          ? ' Es una copia antigua sin memorias de AXIS: las que tienes ahora se conservan.'
          : ` Esta copia contiene ${incoming} memoria${incoming === 1 ? '' : 's'} de AXIS. Al restaurarla, sustituirá ${memoryCount === 1 ? 'la memoria' : `las ${memoryCount} memorias`} que tienes actualmente.`
      open(
        'Restaurar copia',
        <Confirm
          message={`La copia contiene ${count} movimiento${count === 1 ? '' : 's'}, ${backup.objectives.length} objetivos, ${backup.positions.length} inversiones${backup.debts ? ` y ${backup.debts.length} deudas` : ''}. Restaurarla sustituirá tus movimientos, objetivos, inversiones${backup.debts ? ', deudas' : ''} y saldo inicial de este dispositivo.${memoriesNote}`}
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
        message="Se eliminarán movimientos, objetivos, inversiones, deudas, saldo inicial y toda la memoria y conversación de AXIS de este dispositivo. Exporta una copia antes si quieres conservar tus datos."
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
          description={`Descarga un archivo JSON con tus datos, tus deudas y las memorias que AXIS tiene guardadas sobre ti. Puede contener información personal. Tus datos solo están en este móvil: guárdala fuera de él (por ejemplo, en tu nube o tu correo). ${lastBackupAt ? `Última copia: ${formatShortDate(toISODate(new Date(lastBackupAt)))}.` : 'Aún no has hecho ninguna.'}`}
          onClick={handleExport}
          disabled={nothingStored}
        />
        <Row
          title="Importar / restaurar"
          description="Sustituye los datos actuales por los de una copia. Si la copia trae memorias de AXIS, también sustituye las actuales."
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
          disabled={nothingStored}
        />
      </Group>

      <Group title="Privacidad">
        <Row
          title="Tus datos se guardan en este dispositivo"
          description="Finax funciona sin cuenta: movimientos, objetivos, inversiones y memorias de AXIS viven en el almacenamiento local del navegador, y la app funciona sin conexión con el motor local de AXIS."
        />
        <Row
          title="Qué sale del dispositivo al usar AXIS con IA"
          description="Cuando AXIS responde con IA, el contexto necesario para la respuesta se envía al servidor de Finax y a un proveedor de IA. Puede incluir tus cifras financieras, tus memorias de AXIS, la conversación y, en el chat, un resumen de tus movimientos recientes con algunos de ellos (fecha, importe, categoría y concepto). Si AXIS necesita un dato concreto para responder, consulta tus movimientos en este dispositivo y solo envía el resultado (por ejemplo, el gasto de un mes o hasta 5 movimientos, sin tus notas). Con el motor local no se envía nada fuera del dispositivo. El contexto de mercado se descarga de una fuente pública y no lleva datos tuyos."
        />
      </Group>

      <Group title="Recordatorios">
        <RemindersRow />
      </Group>

      <Group title="AXIS">
        <Row
          title="Lo que AXIS sabe de ti"
          description="Lo que recuerda de tus conversaciones o de lo que añadas tú, y para qué lo usa. Puedes añadir, editar y eliminar."
          onClick={() => onNavigate('memoria')}
        />
        <Row
          title={aiStatus === 'available' ? 'IA de AXIS disponible' : aiStatus === 'checking' ? 'Comprobando la IA de AXIS…' : 'IA de AXIS no disponible ahora'}
          description={
            aiStatus === 'available'
              ? 'AXIS responde con IA cuando puede y, si la IA falla o no hay conexión, con su motor local de reglas, que siempre está disponible.'
              : aiStatus === 'checking'
                ? 'El motor local de reglas siempre está disponible.'
                : 'Sin conexión o sin IA configurada: AXIS responde con su motor local de reglas, que siempre está disponible.'
          }
        />
        {market.status !== 'disabled' && (
          <Row
            title="Contexto de mercado"
            description={
              market.research && market.freshness
                ? `Investigación del ${formatShortDate(market.research.generatedAt.slice(0, 10))} (${FRESHNESS_LABEL[market.freshness]}). Fuentes públicas; sin datos personales. Toca para comprobar si hay una nueva.`
                : market.offline
                  ? 'Sin conexión: no se ha podido descargar la investigación de mercado.'
                  : 'Todavía no hay ninguna investigación descargada. Toca para comprobar.'
            }
            onClick={() => {
              void market.refresh().then(() => setMessage({ text: 'Contexto de mercado comprobado.' }))
            }}
          />
        )}
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
