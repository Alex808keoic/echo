'use client'

import { useEffect } from 'react'
import { isStorageError, readErrorView } from '@/lib/db/storage-errors'
import { EmptyState } from '@/components/finax/empty-state'
import { Button } from '@/components/finax/button'

/**
 * Error al mostrar Finax. Las lecturas de la base local (`useLiveQuery`) lanzan
 * su error durante el render: sin este límite, la app entera se caía.
 * Un fallo de almacenamiento se reintenta recargando (conexión nueva con
 * IndexedDB); cualquier otro, volviendo a renderizar la pantalla.
 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error('Finax: no se ha podido mostrar la pantalla', error)
  }, [error])

  const view = readErrorView(error)
  const again = () => (isStorageError(error) ? window.location.reload() : retry())

  return (
    <main className="flex min-h-dvh w-full items-center justify-center bg-background px-5">
      <div role="alert" className="w-full max-w-[360px]">
        <EmptyState
          title={view.title}
          description={view.message}
          action={
            <Button onClick={again} className="min-w-[160px]">
              Reintentar
            </Button>
          }
        />
      </div>
    </main>
  )
}
