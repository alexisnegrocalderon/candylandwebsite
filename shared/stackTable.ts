/* Tablas del panel en el celular: cada fila pasa a ser una tarjeta y cada celda lleva el nombre de su columna.
 * Esto es la parte pura (qué etiqueta lleva cada celda); el DOM y el CSS están en client/src/lib/stackTables.ts
 * y client/src/index.css. */

/** Menos columnas que esto y la tabla se lee bien tal cual en el celular. */
export const STACK_MIN_COLUMNS = 3;

/** La etiqueta de cada celda de una fila, tomada de los encabezados. null si la fila no calza con la tabla
 * (celdas combinadas, como la fila «No hay nada todavía»): esa fila se deja como está. */
export function rowLabels(headers: readonly string[], cellSpans: readonly number[]): string[] | null {
  if (headers.length < STACK_MIN_COLUMNS) return null;
  if (cellSpans.length !== headers.length || cellSpans.some((s) => s !== 1)) return null;
  return headers.map((h) => h.replace(/\s+/g, ' ').trim());
}
