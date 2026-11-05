/**
 * La huella de un envío a AXIS: todo su contenido salvo la hora en que se generó,
 * que cambia siempre. Si la huella es la del último envío, no hay nada nuevo que mandar.
 */
export function snapshotsFingerprint(snapshots: readonly { generatedAt: string }[]): string {
  return JSON.stringify(snapshots, (key, value) => (key === 'generatedAt' ? undefined : value))
}
