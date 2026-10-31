import { useId } from 'react'

// COPIA de github.com/Alex808keoic/axis · components/axis-mark.tsx (símbolo «Three Elements», D-007 del
// ecosistema). No editar aquí: se regenera allí y se vuelve a copiar.
const PIECES = [
  'M 493.4 91 C 475 92.9, 457.9 101.8, 445.9 115.6 C 441.7 120.5, 434.5 134.6, 399.5 207 C 391.9 222.7, 381.7 243.8, 376.8 254 C 361.3 286, 341.9 326.2, 338.5 333.5 C 336.7 337.4, 332 347.3, 328 355.5 C 319 374.3, 317.6 379.4, 319.1 387.2 C 321.7 400.2, 330.5 407.5, 343.6 407.4 C 353.3 407.3, 352.1 408.1, 409.2 364.8 C 436.3 344.2, 464.5 322.7, 471.9 317.1 C 488.4 304.7, 493.2 302.6, 504.5 303.2 C 513.8 303.7, 521.2 307, 526.2 313 C 530.3 317.8, 611.5 471, 623.9 497.2 C 631.1 512.3, 641.6 517.5, 653.8 512 C 664.2 507.3, 664.8 505.8, 676 458.1 C 678.1 449, 682 432.7, 684.6 422 C 690.2 398.8, 691.2 382.5, 687.6 372 C 686.6 369, 657.8 310.8, 623.8 242.6 L 561.8 118.7 554.2 111 C 539.4 96.1, 516.6 88.6, 493.4 91',
  'M 433.5 411.2 C 431.9 411.8, 414.5 420.6, 395 430.8 C 375.5 440.9, 347.1 455.6, 332 463.5 C 316.9 471.3, 295.1 482.6, 283.5 488.6 C 261 500.3, 252.7 506.5, 246.1 516.8 C 243.4 521.1, 205.1 599.7, 192.5 626.9 C 185.6 641.9, 183.8 649.1, 183.8 661.1 C 183.8 695.1, 207.4 722.2, 241.1 727 C 253.2 728.7, 461.1 726.5, 467.5 724.6 C 477.4 721.6, 484.1 713, 484.2 703.2 C 484.2 693, 480.6 689.6, 449.5 670.5 C 436.3 662.4, 419.3 651.9, 411.8 647.3 C 389.7 633.7, 384.4 626.3, 385.1 609.7 L 385.5 601.5 418.9 533 C 437.3 495.3, 454.9 459.3, 457.9 453 C 464.6 439.2, 465.6 429.5, 461.2 421.3 C 456.3 412, 443.9 407.5, 433.5 411.2',
  'M 715.3 448.1 C 707.2 450.4, 706.3 453.7, 697.5 509.5 C 689.1 562.5, 688.1 567.9, 685.1 573.8 C 679.9 583.9, 668.1 593, 658.3 594.5 C 656.2 594.9, 613.5 595.5, 563.5 595.8 L 472.5 596.5 467 599.1 C 454.2 605.1, 448.8 617.3, 453.9 628.6 C 456.2 633.6, 459.5 636.3, 484.5 653.2 C 495.5 660.6, 512.6 672.2, 522.5 679 C 580.7 718.9, 581.2 719.2, 595.5 722.9 C 606.9 725.9, 616.1 726.1, 702 725.2 C 780.9 724.4, 781.5 724.4, 788 722.1 C 818.1 711.7, 835.3 687.6, 835.3 656 C 835.4 638.1, 833.9 634.4, 811 592.1 C 804 579.1, 787.8 548.9, 775 525 C 742.7 464.6, 740.9 461.3, 737.2 456.9 C 731.1 449.7, 722.1 446.1, 715.3 448.1'
] as const

const GRADIENTS = [
  {
    'x1': 430,
    'y1': 110,
    'x2': 660,
    'y2': 510,
    'stops': [
      [
        0,
        '#3AA9F5'
      ],
      [
        0.42,
        '#1A66F4'
      ],
      [
        1,
        '#22C6E4'
      ]
    ]
  },
  {
    'x1': 200,
    'y1': 690,
    'x2': 470,
    'y2': 440,
    'stops': [
      [
        0,
        '#A56DF2'
      ],
      [
        1,
        '#4A5AF0'
      ]
    ]
  },
  {
    'x1': 465,
    'y1': 615,
    'x2': 830,
    'y2': 700,
    'stops': [
      [
        0,
        '#58D7EA'
      ],
      [
        0.55,
        '#18BBD6'
      ],
      [
        1,
        '#12DCC9'
      ]
    ]
  }
] as const

interface AxisMarkProps {
  size?: number
  /** Una sola tinta (toma el color del texto) para tamaños muy pequeños o fondos complicados. */
  mono?: boolean
  className?: string
  title?: string
}

/** El símbolo de AXIS. Está centrado en su centroide, así que puede girar sin bambolearse. */
export function AxisMark({ size = 32, mono = false, className, title }: AxisMarkProps) {
  const id = useId()
  return (
    <svg
      viewBox="105.7 84.3 800 800"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {!mono && (
        <defs>
          {GRADIENTS.map((g, i) => (
            <linearGradient key={i} id={`${id}-${i}`} gradientUnits="userSpaceOnUse" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
              {g.stops.map(([offset, color]) => <stop key={offset} offset={offset} stopColor={color} />)}
            </linearGradient>
          ))}
        </defs>
      )}
      {PIECES.map((d, i) => <path key={i} d={d} fill={mono ? 'currentColor' : `url(#${id}-${i})`} />)}
    </svg>
  )
}
