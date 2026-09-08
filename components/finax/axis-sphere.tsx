import { cn } from '@/lib/utils'

interface AxisSphereProps {
  size?: number
  className?: string
  /** halo luminoso alrededor de la esfera */
  glow?: boolean
}

/**
 * Esfera/burbuja luminosa que representa a AXIS.
 * Construida con gradientes radiales en capas para dar profundidad,
 * brillo interno y una sensación de inteligencia.
 */
export function AxisSphere({ size = 120, className, glow = true }: AxisSphereProps) {
  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      {glow && (
        <div
          className="axis-pulse absolute inset-0 rounded-full blur-2xl"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(129,140,248,0.55), rgba(99,102,241,0.25) 45%, transparent 70%)',
            transform: 'scale(1.6)',
          }}
        />
      )}
      <div
        className="axis-float relative rounded-full"
        style={{
          width: size,
          height: size,
          background:
            'radial-gradient(circle at 32% 28%, #c7cbff 0%, #818cf8 26%, #6366f1 52%, #4f46e5 74%, #3730a3 100%)',
          boxShadow:
            'inset -8px -10px 22px rgba(30,27,75,0.55), inset 10px 12px 26px rgba(255,255,255,0.4), 0 18px 40px -14px rgba(79,70,229,0.6)',
        }}
      >
        {/* Brillo principal */}
        <span
          className="absolute rounded-full"
          style={{
            top: '14%',
            left: '18%',
            width: '38%',
            height: '32%',
            background:
              'radial-gradient(circle at 40% 40%, rgba(255,255,255,0.95), rgba(255,255,255,0) 70%)',
            filter: 'blur(2px)',
          }}
        />
        {/* Reflejo inferior sutil */}
        <span
          className="absolute rounded-full"
          style={{
            bottom: '14%',
            right: '16%',
            width: '46%',
            height: '38%',
            background:
              'radial-gradient(circle at 60% 60%, rgba(165,180,252,0.6), rgba(165,180,252,0) 70%)',
            filter: 'blur(3px)',
          }}
        />
        {/* Anillo orbital tenue */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            border: '1px solid rgba(255,255,255,0.25)',
            transform: 'rotate(-18deg) scaleY(0.42)',
          }}
        />
      </div>
    </div>
  )
}
