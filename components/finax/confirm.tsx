'use client'

import { useState } from 'react'
import { Button } from './button'

interface ConfirmProps {
  message: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

/** Confirmación explícita para operaciones destructivas o sensibles. */
export function Confirm({
  message,
  confirmLabel = 'Confirmar',
  destructive,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-5">
      <p className="text-[14px] font-medium leading-snug text-grafito/80 text-pretty">{message}</p>
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
          Cancelar
        </Button>
        <Button
          type="button"
          disabled={busy}
          className={destructive ? 'bg-negative shadow-none hover:bg-negative/90' : undefined}
          onClick={async () => {
            setBusy(true)
            try {
              await onConfirm()
            } finally {
              setBusy(false)
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}
