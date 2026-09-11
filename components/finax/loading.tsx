/** Estado de carga discreto mientras se leen los datos locales. */
export function ScreenLoading() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center">
      <p className="text-[13px] font-medium text-muted-foreground">Cargando tus datos…</p>
    </div>
  )
}
