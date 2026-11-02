'use client'

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { formatCents } from '@/lib/money'
import { describeSchedule } from '@/lib/finance/recurring'
import { listUserMemories } from '@/lib/db/axis-memories'
import { useRecurring } from '@/hooks/use-recurring'
import { ADULT_EXPENSE_CATEGORIES, type RecurringMovementInput } from '@/lib/types'
import { useIsMinor } from '@/hooks/use-minor'
import { Button } from '../button'
import { useSheet } from '../sheet'
import { InitialBalanceForm } from './initial-balance-form'
import { RecurringForm } from './recurring-form'
import { ProfileForm } from './profile-form'
import { MovementForm } from './movement-form'
import { cn } from '@/lib/utils'
import { useEcosystem } from '@/hooks/use-ecosystem'
import { AxisMark } from '../axis-mark'
import { ShieldIcon, UserIcon } from '../icons'

export const ONBOARDING_TITLE = 'Empezar en Finax'

type Step = 'balance' | 'fixed' | 'profile' | 'axis' | 'done'
const STEPS: readonly Step[] = ['balance', 'profile', 'fixed', 'axis']

/** Atajos del paso de fijos: rellenan lo típico y el resto lo eliges tú. */
const PRESETS: ReadonlyArray<{ label: string; preset: Partial<RecurringMovementInput> }> = [
  { label: 'Nómina o paga', preset: { name: 'Nómina', type: 'ingreso', category: 'Paga' } },
  { label: 'Alquiler', preset: { name: 'Alquiler', type: 'gasto', category: 'Vivienda' } },
  { label: 'Suscripción', preset: { type: 'gasto', category: 'Suscripciones' } },
  { label: 'Factura (luz, móvil…)', preset: { type: 'gasto', category: 'Facturas' } },
  { label: 'Otro', preset: {} },
]

/**
 * Primer uso guiado, en la misma hoja: saldo inicial → «Tu perfil» → fijos
 * (la edad del perfil decide qué categorías se ven en los fijos) → conectar con
 * el ecosistema AXIS. Solo el saldo es obligatorio (sin él no hay punto de
 * partida); los otros pasos se pueden saltar y hacer después.
 */
export function Onboarding() {
  const [step, setStep] = useState<Step>('balance')
  const { close } = useSheet()

  return (
    <div className="space-y-5">
      {step !== 'done' && <Progress step={step} />}
      {step === 'balance' && (
        <section className="space-y-4">
          <StepIntro title="Tu dinero de hoy" text="¿Cuánto tienes ahora mismo en tus cuentas? Es tu punto de partida. Las inversiones no: esas se añaden en «Tu dinero»." />
          <InitialBalanceForm submitLabel="Siguiente" onDone={() => setStep('profile')} />
        </section>
      )}
      {step === 'profile' && <ProfileStep onNext={() => setStep('fixed')} />}
      {step === 'fixed' && <FixedStep onNext={() => setStep('axis')} />}
      {step === 'axis' && <AxisStep onSkip={() => setStep('done')} />}
      {step === 'done' && <DoneStep onClose={close} />}
    </div>
  )
}

function Progress({ step }: { step: Step }) {
  const index = STEPS.indexOf(step)
  return (
    <div>
      <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-finax-dark">
        Paso {index + 1} de {STEPS.length}
      </p>
      <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${STEPS.length}, minmax(0, 1fr))` }} aria-hidden>
        {STEPS.map((s, i) => (
          <span key={s} className={cn('h-1 rounded-full', i <= index ? 'bg-finax-dark' : 'bg-muted')} />
        ))}
      </div>
    </div>
  )
}

function StepIntro({ title, text }: { title: string; text?: string }) {
  return (
    <div>
      <h2 className="text-[17px] font-bold tracking-tight text-grafito">{title}</h2>
      {text && <p className="mt-1 text-[13px] font-medium leading-snug text-muted-foreground text-pretty">{text}</p>}
    </div>
  )
}

function FixedStep({ onNext }: { onNext: () => void }) {
  const fixed = useRecurring()
  const [adding, setAdding] = useState<Partial<RecurringMovementInput> | null>(null)
  const list = fixed?.recurring ?? []
  // Un menor no ve los atajos de categorías de adulto (alquiler, facturas, suscripciones).
  const minor = useIsMinor()
  const presets = PRESETS.filter((p) => !minor || !p.preset.category || !(ADULT_EXPENSE_CATEGORIES as readonly string[]).includes(p.preset.category))

  if (adding) {
    return (
      <section className="space-y-4">
        <StepIntro title="Nuevo fijo" text="Pon la próxima vez que toca: ese día Finax te lo propondrá para que lo confirmes." />
        <RecurringForm preset={adding} onDone={() => setAdding(null)} />
        <Button type="button" variant="ghost" fullWidth onClick={() => setAdding(null)}>
          Volver
        </Button>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <StepIntro
        title="Lo que entra y sale siempre"
        text="Tu nómina, el alquiler, las suscripciones… Apúntalos una vez y Finax te los propondrá cada vez que toquen: los confirmas con un toque y no se te olvida ninguno."
      />
      {list.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border px-4">
          {list.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block break-words text-[13.5px] font-bold text-grafito">{r.name}</span>
                <span className="block text-[12px] font-medium text-muted-foreground">{describeSchedule(r)}</span>
              </span>
              <span className={cn('shrink-0 text-[13.5px] font-bold tabular-nums', r.type === 'ingreso' ? 'text-finax-dark' : 'text-negative')}>
                {formatCents(r.type === 'ingreso' ? r.amountCents : -r.amountCents, true)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setAdding(p.preset)}
            className="rounded-full bg-muted px-3.5 py-2 text-[12.5px] font-semibold text-grafito transition-colors hover:bg-graylight/70"
          >
            + {p.label}
          </button>
        ))}
      </div>
      <Button type="button" fullWidth variant={list.length > 0 ? 'primary' : 'secondary'} onClick={onNext}>
        {list.length > 0 ? 'Siguiente' : 'Ahora no'}
      </Button>
    </section>
  )
}

function ProfileStep({ onNext }: { onNext: () => void }) {
  const memories = useLiveQuery(listUserMemories, [])
  return (
    <section className="space-y-4">
      <StepIntro title="Cómo eres con el dinero" />
      {memories && <ProfileForm memories={memories} onDone={onNext} />}
      <Button type="button" variant="ghost" fullWidth onClick={onNext}>
        Ahora no
      </Button>
    </section>
  )
}

const AXIS_POINTS = [
  { icon: null, title: 'Qué es AXIS', text: 'La app que une Finax con Axthletics y Mentax: cada semana te resume cómo vas en dinero, cuerpo y mente, y te propone un paso para mejorar.' },
  { icon: UserIcon, title: 'Por qué con Google', text: 'Tus datos se guardan en tu cuenta y los tienes en cualquier móvil donde entres. Con la misma cuenta en todas las apps, se conectan solas. Sin contraseñas nuevas.' },
  { icon: ShieldIcon, title: 'Qué se comparte', text: 'Con AXIS, nada hasta que lo confirmes. Después, solo cifras por semana, como lo que ingresas o gastas: nunca tus movimientos, conceptos, notas ni lo que hablas con AXIS.' },
] as const

/**
 * Invitación a conectar con el ecosistema AXIS. Opcional: «Ahora no» sigue al final.
 * Entrar con Google lleva a Google y, al volver, a Ajustes, donde se eligen las cifras:
 * entrar no comparte nada por sí solo. El saldo ya está guardado desde el primer paso.
 */
function AxisStep({ onSkip }: { onSkip: () => void }) {
  const { signIn } = useEcosystem()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3">
        <AxisMark size={40} />
        <StepIntro title="Conecta con AXIS" text="Opcional. Puedes hacerlo cuando quieras desde Ajustes." />
      </div>
      <ul className="space-y-2">
        {AXIS_POINTS.map((point) => (
          <li key={point.title} className="flex items-start gap-3.5 rounded-2xl bg-muted px-4 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-finax-dark" aria-hidden>
              {point.icon ? <point.icon className="h-[18px] w-[18px]" /> : <AxisMark size={18} />}
            </span>
            <div>
              <p className="text-[13.5px] font-bold text-grafito">{point.title}</p>
              <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">{point.text}</p>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-[12.5px] font-medium text-negative">No se ha podido abrir Google: {error}</p>}
      <div className="grid gap-2">
        <Button
          type="button"
          variant="axis"
          fullWidth
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            const failure = await signIn()
            if (failure) {
              setError(failure)
              setBusy(false)
            }
          }}
        >
          Entrar con Google
        </Button>
        <Button type="button" variant="ghost" fullWidth onClick={onSkip} disabled={busy}>
          Ahora no
        </Button>
      </div>
    </section>
  )
}

function DoneStep({ onClose }: { onClose: () => void }) {
  const { open, close } = useSheet()
  return (
    <section className="space-y-4">
      <StepIntro
        title="¡Listo!"
        text="Ahora apunta lo que gastes en el día a día. Con dos meses completos, AXIS te preparará tu plan: cuánto ahorrar, cuánto invertir y en qué tipo de inversión."
      />
      <div className="grid gap-2">
        <Button type="button" fullWidth onClick={() => open('Nuevo movimiento', <MovementForm onDone={close} />)}>
          Apuntar un gasto
        </Button>
        <Button type="button" variant="secondary" fullWidth onClick={onClose}>
          Ir a Inicio
        </Button>
      </div>
    </section>
  )
}
