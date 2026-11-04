/* El atajo «Pregúntale al asistente» (el «+» del celular y Atajos del iPad) abre el chat encima de la pantalla donde estés.
 * El panel lo monta una sola vez (AdminShell) y escucha este aviso. */
let listener: (() => void) | null = null;
export function onAssistantRequest(fn: () => void): () => void {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}
export function requestAssistant() { listener?.(); }
