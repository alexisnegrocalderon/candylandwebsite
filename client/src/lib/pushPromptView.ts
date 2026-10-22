import type { PushSource, PushState } from './customerPush';

/* Qué se ve del aviso «Activar avisos» según el estado del dispositivo. Vive
 * aparte (sin React) para poder probarlo: la hoja «Avisos» de Mi cuenta se
 * quedaba VACÍA si la persona había cerrado el aviso alguna vez (se esconde
 * 30 días), si el navegador no lo soporta o si el estado no terminaba de
 * cargar -- y el puntito rosa del menú la invitaba a abrirla igual. */

export type PromptView = 'none' | 'prompt' | 'activated' | 'blocked';

export function pushPromptView(opts: { state: PushState; source: PushSource; dismissed: boolean; alwaysShow?: boolean }): PromptView {
  const { state, source, dismissed, alwaysShow = false } = opts;
  if (state === 'loading' || state === 'unsupported') return 'none';
  // En la entrada se muestra el «activado» (y se puede apagar); en el resto, nada.
  if (state === 'enabled') return source === 'ticket' ? 'activated' : 'none';
  if (state === 'denied') return source === 'ticket' ? 'blocked' : 'none';
  // Fuera de la entrada y el pago, cerrar el aviso lo esconde: salvo en un lugar
  // donde la persona lo pidió a propósito (la hoja «Avisos»).
  const dismissible = source !== 'ticket' && source !== 'pago' && !alwaysShow;
  if (dismissible && dismissed) return 'none';
  return 'prompt';
}

export type AvisosNotice = 'enabled' | 'denied' | 'unsupported' | 'loading';

/** El mensaje que la hoja «Avisos» muestra cuando no hay botón para activar. */
export function avisosNotice(state: PushState): AvisosNotice | null {
  if (state === 'enabled') return 'enabled';
  if (state === 'denied') return 'denied';
  if (state === 'unsupported') return 'unsupported';
  if (state === 'loading') return 'loading';
  return null; // «ask» e «ios-install»: lo muestra el aviso con su botón o sus pasos
}
