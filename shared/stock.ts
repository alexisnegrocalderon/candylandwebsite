/** Stock "sin tope": el sistema usa 999999 como centinela cuando una fila no
 * tiene cupo real (la tanda que abre el avance automático, extras como
 * Estacionamiento, etc.). Ese número NUNCA debe mostrarse como cupos
 * restantes -- no es un remanente, es "sin límite". */
export const UNLIMITED_STOCK = 999999;

/** Umbral holgado en vez de `=== UNLIMITED_STOCK`: si el admin teclea a mano
 * otro número enorme (1.000.000, 100.000) sigue siendo "sin tope". */
export function isUnlimitedStock(totalStock: number): boolean {
  return totalStock >= 100_000;
}
