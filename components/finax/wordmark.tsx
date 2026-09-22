interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Logotipo de Finax: la marca (la «f» con la flecha ascendente) + la palabra
 * «finax». La marca es el mismo archivo que el icono de la aplicación, así
 * que la cabecera y la pantalla de inicio del móvil enseñan exactamente lo
 * mismo. Se regenera con `node scripts/generate-icons.mjs`.
 */
export function Wordmark({ size = 'md' }: WordmarkProps) {
  const mark = size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  const text = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-xl'
  return (
    <div className="flex items-center gap-1.5">
      {/* Decorativa: la palabra que va al lado ya nombra la marca. */}
      <img src="/logo-mark.png" alt="" aria-hidden="true" width={256} height={256} className={`${mark} object-contain`} />
      <span className={`${text} font-extrabold tracking-tight text-grafito`}>finax</span>
    </div>
  )
}
