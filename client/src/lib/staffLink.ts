/* Atajos de la sección «Staff» de la App (Perfil): abren caja, puerta, cocina o guardarropía con
 * `?op=<operador>&desde=app`. La pantalla de ingreso deja ese nombre ya elegido (igual se pide el
 * PIN) y muestra «Volver a mi cuenta» para regresar a la App. */

export function staffLink(path: string, operatorId: number): string {
  return `${path}?op=${operatorId}&desde=app`;
}

function param(name: string): string | null {
  try { return new URLSearchParams(window.location.search).get(name); } catch { return null; }
}

/** El operador que viene elegido desde la App, o null. */
export function preselectedOperatorId(): number | null {
  const n = Number(param('op'));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** ¿Se abrió desde la App? (para mostrar el link de vuelta). */
export function openedFromApp(): boolean {
  return param('desde') === 'app';
}
