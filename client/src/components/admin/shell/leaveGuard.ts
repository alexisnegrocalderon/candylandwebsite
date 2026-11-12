/* «¿Salir igual?» antes de cambiar de pantalla en el panel.
 *
 * Una pantalla con trabajo sin guardar (el editor del Estudio) deja acá su pregunta; el panel la hace antes de abrir otra
 * sección (barra de abajo, pestañas, buscador, atajos). Una sola a la vez: la de la pantalla que está abierta. */

let guard: (() => boolean) | null = null;

/** Deja la pregunta puesta; devuelve cómo quitarla. `ask` responde true si se puede salir. */
export function setLeaveGuard(ask: () => boolean): () => void {
  guard = ask;
  return () => { if (guard === ask) guard = null; };
}

/** ¿Se puede salir de la pantalla actual? Sin pregunta puesta, siempre. Si la pregunta falla, también: nunca deja a nadie encerrado. */
export function canLeave(): boolean {
  if (!guard) return true;
  try { return guard(); } catch { return true; }
}
