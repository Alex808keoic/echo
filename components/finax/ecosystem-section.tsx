'use client'

import { useState } from 'react'
import { useEcosystem } from '@/hooks/use-ecosystem'
import { DEFAULT_METRICS, FINAX_METRICS, METRIC_LABELS, type FinaxMetric } from '@/lib/ecosystem/sharing'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Row, RowGroup as Group } from './row-list'
import { useSheet } from './sheet'

const time = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' })

/**
 * Ecosistema AXIS en Ajustes: entrar con Google y elegir qué resumen semanal se
 * comparte con la app AXIS. Nada sale del dispositivo hasta confirmarlo, y Finax
 * funciona igual sin conectar. Sin configurar Finax no aparece: no hay qué compartir.
 */
export function EcosystemSection({ configured }: { configured: boolean }) {
  const { account, sharedMetrics, lastSentAt, failed, signIn, share, stopSharing, signOut } = useEcosystem()
  const { open, close } = useSheet()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  if (!configured) return null

  const run = async (action: () => Promise<string | null>) => {
    setBusy(true)
    setMessage(null)
    const result = await action()
    setBusy(false)
    if (result) setMessage(result)
  }

  const chooseMetrics = () =>
    open(
      sharedMetrics ? 'Qué compartes con AXIS' : 'Compartir con AXIS',
      <MetricsForm
        initial={sharedMetrics ?? [...DEFAULT_METRICS]}
        sharing={sharedMetrics !== null}
        onCancel={close}
        onConfirm={async (metrics) => {
          close()
          await run(async () => ((await share(metrics)) ? null : 'Guardado, pero no he podido enviarlo ahora. Lo intento al volver a abrir Finax.'))
        }}
      />,
    )

  const status = failed
    ? 'No he podido enviar el último resumen. Lo intento otra vez la próxima vez que abras Finax.'
    : lastSentAt
      ? `Último envío a las ${time.format(new Date(lastSentAt))}.`
      : 'El resumen se envía al abrir y al salir de Finax.'

  return (
    <Group title="Ecosistema AXIS">
      <Row
        title="AXIS, la app que une tus apps"
        description="Si quieres, le mandas un resumen de cada semana: solo cifras por semana, nunca tus movimientos, conceptos, notas ni lo que hablas aquí con AXIS."
      />
      {account.status === 'checking' && <Row title="Comprobando la conexión…" description="Un momento." />}
      {account.status === 'signedOut' && (
        <Row
          title="Entrar con Google"
          description={
            sharedMetrics
              ? 'Compartías con AXIS, pero has cerrado la sesión. Vuelve a entrar con la misma cuenta para seguir enviando.'
              : 'Usa la misma cuenta de Google en todas las apps: así se conectan solas.'
          }
          onClick={() => void run(signIn)}
          disabled={busy}
        />
      )}
      {account.status === 'signedIn' && (
        <>
          <Row title="Conectado" description={account.email ?? 'Tu cuenta de Google'} />
          {sharedMetrics ? (
            <>
              <Row title={`Compartiendo ${sharedMetrics.length} cifra${sharedMetrics.length === 1 ? '' : 's'}`} description={status} onClick={chooseMetrics} disabled={busy} />
              <Row
                title="Dejar de compartir"
                description="AXIS borra todo lo que recibió de Finax."
                onClick={() => void run(async () => ((await stopSharing()) ? 'Has dejado de compartir. AXIS ha borrado lo que recibió.' : 'No he podido dejar de compartir. Inténtalo con conexión.'))}
                disabled={busy}
              />
            </>
          ) : (
            <Row title="Elegir qué compartes" description="Nada se envía hasta que lo confirmes." onClick={chooseMetrics} disabled={busy} />
          )}
          <Row title="Cerrar sesión" description="Deja de enviar hasta que vuelvas a entrar." onClick={() => void run(async () => (await signOut(), null))} disabled={busy} />
        </>
      )}
      {message && <Row title="AXIS" description={message} />}
    </Group>
  )
}

function MetricsForm({
  initial,
  sharing,
  onCancel,
  onConfirm,
}: {
  initial: FinaxMetric[]
  sharing: boolean
  onCancel: () => void
  onConfirm: (metrics: FinaxMetric[]) => void
}) {
  const [metrics, setMetrics] = useState<FinaxMetric[]>(initial)
  const toggle = (metric: FinaxMetric) =>
    setMetrics((current) => (current.includes(metric) ? current.filter((m) => m !== metric) : FINAX_METRICS.filter((m) => m === metric || current.includes(m))))

  return (
    <div className="space-y-4">
      <p className="text-[13px] font-medium leading-snug text-muted-foreground text-pretty">
        Cada semana, AXIS recibe estas cifras de esa semana. Las deudas solo tienen dato desde hoy: Finax no guarda cómo eran antes.
      </p>
      <div className="flex flex-wrap gap-2">
        {FINAX_METRICS.map((metric) => {
          const active = metrics.includes(metric)
          return (
            <button
              key={metric}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(metric)}
              className={cn(
                'min-h-11 rounded-2xl border px-4 py-2.5 text-[13px] font-semibold transition-colors',
                active ? 'border-finax-dark bg-finax-dark text-white' : 'border-border bg-card text-grafito hover:bg-muted',
              )}
            >
              {METRIC_LABELS[metric]}
            </button>
          )
        })}
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel} fullWidth>
          Cancelar
        </Button>
        <Button variant="axis" onClick={() => onConfirm(metrics)} disabled={metrics.length === 0} fullWidth>
          {sharing ? 'Guardar' : 'Compartir'}
        </Button>
      </div>
    </div>
  )
}
