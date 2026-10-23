'use client'

import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { listUserMemories } from '@/lib/db/axis-memories'
import { deriveProfile } from '@/lib/axis/profile/derive'
import { profileProgress } from '@/lib/axis/profile/questionnaire'
import { LIFE_EVENTS, type LifeEventAction } from '@/lib/axis/plan/life-events'
import type { ScenarioKind } from '@/lib/axis/plan/simulate'
import { cn } from '@/lib/utils'
import { useSheet } from '../sheet'
import { Button } from '../button'
import { Row, RowGroup } from '../row-list'
import { ProfileForm } from '../forms/profile-form'
import { MovementForm } from '../forms/movement-form'
import { openSimulator } from './simulator-screen'
import type { ScreenProps } from './types'

/**
 * «Herramientas» de AXIS: lo que le preguntarías a un asesor en cualquier
 * momento, sin esperar a la revisión del mes, y lo que AXIS sabe de ti. Aquí
 * vive cada herramienta; el plan solo enlaza a ellas desde sus pasos.
 */
export function ToolsPanel({ onNavigate }: Pick<ScreenProps, 'onNavigate'>) {
  const { open, close } = useSheet()
  const memories = useLiveQuery(listUserMemories, [], [])

  const simulate = (scenario: ScenarioKind) => {
    openSimulator(scenario)
    onNavigate('simulador')
  }
  const openProfile = () => open('Tu perfil', <ProfileForm memories={memories} onDone={close} />)
  const runLifeEvent = (action: LifeEventAction) => {
    switch (action.kind) {
      case 'profile':
        return openProfile()
      case 'one-off-income':
        return open('Nuevo movimiento', <MovementForm oneOffIncome onDone={close} />)
      case 'recurring':
        close()
        return onNavigate('fijos')
      case 'debts':
        close()
        return onNavigate('deudas')
      case 'simulate':
        close()
        return simulate(action.scenario)
    }
  }

  return (
    <div className="space-y-6">
      <RowGroup title="Para decidir">
        <Row title="¿Me lo puedo permitir?" description="Mira cómo quedaría tu plan si compras algo." onClick={() => simulate('purchase')} />
        <Row title="¿Y si…?" description="Simula un cambio: sueldo, préstamo, vivienda, meses sin ingresos…" onClick={() => onNavigate('simulador')} />
        <Row
          title="Me ha pasado algo"
          description="Cuéntame qué ha cambiado en tu vida y te digo qué revisar."
          onClick={() => open('Me ha pasado algo', <LifeEvents onAction={runLifeEvent} />)}
        />
        <Row title="Guía para invertir" description="Cuánto invertir, en qué tipos y cómo reconocer uno bueno." onClick={() => onNavigate('guia')} />
      </RowGroup>

      <RowGroup title="Sobre ti">
        <Row title="Tu perfil" description={profileProgress(deriveProfile(memories))} onClick={openProfile} />
        <Row title="Lo que AXIS sabe de ti" description="Lo que recuerda de tus conversaciones y para qué lo usa." onClick={() => onNavigate('memoria')} />
      </RowGroup>
    </div>
  )
}

function LifeEvents({ onAction }: { onAction: (action: LifeEventAction) => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <div className="space-y-3">
      <p className="text-[12.5px] font-medium leading-snug text-muted-foreground text-pretty">
        Cuando cambia tu vida, cambia tu plan. Elige qué ha pasado y te digo qué revisar.
      </p>
      <ul className="space-y-2">
        {LIFE_EVENTS.map((e) => {
          const expanded = openId === e.id
          return (
            <li key={e.id} className="rounded-2xl border border-border">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpenId(expanded ? null : e.id)}
                className="min-h-11 w-full px-4 py-2.5 text-left text-[13.5px] font-semibold leading-snug text-grafito text-pretty"
              >
                {e.label}
              </button>
              {expanded && (
                <div className="space-y-2.5 px-4 pb-3">
                  <p className="text-[12.5px] font-medium leading-snug text-grafito/80 text-pretty">{e.advice}</p>
                  <div className={cn('grid gap-2', e.actions.length > 1 && 'grid-cols-2')}>
                    {e.actions.map((a, i) => (
                      <Button key={a.label} variant={i === 0 ? 'primary' : 'secondary'} fullWidth className="px-3 py-2.5 text-[13px]" onClick={() => onAction(a.action)}>
                        {a.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
