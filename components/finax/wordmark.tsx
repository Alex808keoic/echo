import { LeafLogo } from './icons'

interface WordmarkProps {
  size?: 'sm' | 'md' | 'lg'
}

/** Logotipo de Finax: hoja + palabra "finax". */
export function Wordmark({ size = 'md' }: WordmarkProps) {
  const leaf = size === 'lg' ? 'h-8 w-8' : size === 'sm' ? 'h-5 w-5' : 'h-6 w-6'
  const text = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-xl'
  return (
    <div className="flex items-center gap-1.5">
      <LeafLogo className={`${leaf} text-finax`} />
      <span className={`${text} font-extrabold tracking-tight text-grafito`}>finax</span>
    </div>
  )
}
