/**
 * «Me ha pasado algo»: lo que haría un asesor cuando cambia tu vida. Cada
 * cambio dice qué revisar y lleva a donde se hace (tu perfil, tus fijos, tus
 * deudas, un movimiento o el simulador). Reglas fijas, sin IA: nunca mueve
 * dinero ni guarda nada por su cuenta; lo decide y lo hace el usuario.
 */
import type { ScenarioKind } from './simulate'

export type LifeEventAction =
  | { kind: 'profile' }
  | { kind: 'recurring' }
  | { kind: 'debts' }
  | { kind: 'one-off-income' }
  | { kind: 'simulate'; scenario: ScenarioKind }

export interface LifeEvent {
  id: string
  label: string
  /** Qué hacer, como lo diría un asesor. Sin cifras: las pone tu plan. */
  advice: string
  actions: ReadonlyArray<{ label: string; action: LifeEventAction }>
}

export const LIFE_EVENTS: readonly LifeEvent[] = [
  {
    id: 'job-change',
    label: 'He cambiado de trabajo o de sueldo',
    advice:
      'Pon al día tu situación y tus fijos (la nómina nueva). Si ganas más, que la subida vaya al ahorro antes de que se vaya en gasto: tu plan la repartirá en cuanto la registres.',
    actions: [
      { label: 'Revisar mi perfil', action: { kind: 'profile' } },
      { label: 'Revisar mis fijos', action: { kind: 'recurring' } },
    ],
  },
  {
    id: 'job-loss',
    label: 'Me he quedado sin trabajo',
    advice:
      'Ahora manda el colchón: no inviertas lo nuevo y recorta lo prescindible. Indícalo en tu perfil para que tu plan pida un colchón más grande, y mira cuántos meses aguantas.',
    actions: [
      { label: 'Revisar mi perfil', action: { kind: 'profile' } },
      { label: '¿Cuánto aguanto?', action: { kind: 'simulate', scenario: 'no-income' } },
    ],
  },
  {
    id: 'dependents',
    label: 'Alguien depende ahora de mí (pareja, hijo, familia…)',
    advice:
      'Un imprevisto ya no te afecta solo a ti: indícalo en tu perfil y tu plan pedirá un colchón de 3 meses más. Apunta también los gastos fijos nuevos.',
    actions: [
      { label: 'Revisar mi perfil', action: { kind: 'profile' } },
      { label: 'Revisar mis fijos', action: { kind: 'recurring' } },
    ],
  },
  {
    id: 'move',
    label: 'Me mudo o me independizo',
    advice: 'Antes de firmar, prueba el alquiler y los gastos nuevos con tus números. Después, apúntalos como fijos para que tu plan cuente con ellos.',
    actions: [
      { label: 'Probarlo antes', action: { kind: 'simulate', scenario: 'move-out' } },
      { label: 'Revisar mis fijos', action: { kind: 'recurring' } },
    ],
  },
  {
    id: 'windfall',
    label: 'He recibido un dinero extra (herencia, venta, premio…)',
    advice:
      'Apúntalo como ingreso puntual y no decidas en caliente. Tu plan te dirá qué hacer con él: primero el colchón y las deudas caras, luego tus objetivos y, lo que sobre, invertirlo poco a poco o de una vez.',
    actions: [{ label: 'Apuntar el ingreso', action: { kind: 'one-off-income' } }],
  },
  {
    id: 'big-purchase',
    label: 'Quiero comprar algo grande',
    advice: 'Pruébalo antes con tus números: verás si te lo puedes permitir sin tocar tu colchón y cuánto retrasa tus objetivos.',
    actions: [{ label: '¿Me lo puedo permitir?', action: { kind: 'simulate', scenario: 'purchase' } }],
  },
  {
    id: 'new-debt',
    label: 'Tengo una deuda nueva',
    advice: 'Apúntala con su interés y su cuota: si es cara, tu plan te propondrá devolverla antes de invertir.',
    actions: [{ label: 'Añadir la deuda', action: { kind: 'debts' } }],
  },
]
