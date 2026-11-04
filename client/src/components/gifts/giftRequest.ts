/* El atajo «Invitar» del «+» abre la hoja «Regalar» encima de la pantalla donde estés, sin cambiar de sección.
 * El panel la monta una sola vez (GiftHost) y escucha este aviso. */
let listener: (() => void) | null = null;
export function onGiftRequest(fn: () => void): () => void {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}
export function requestGift() { listener?.(); }
