import type { PushState } from './customerPush';

/* El estado de los avisos es del DISPOSITIVO, no de cada componente. Mi cuenta
 * usa `useCustomerPush` en dos lugares a la vez (la pantalla y el aviso de la
 * hoja «Avisos»): cuando la persona activaba los avisos, solo se enteraba el
 * aviso (y desaparecía) y la pantalla seguía creyendo «sin activar», así que la
 * hoja quedaba vacía hasta cerrar y abrir la app. Acá cada cambio se avisa a
 * todos los que estén mirando. */

type Listener = (state: PushState) => void;

const listeners = new Set<Listener>();

export function subscribePushState(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishPushState(state: PushState): void {
  // Una copia: un oyente que se baja mientras se avisa no debe saltarse a otro.
  for (const listener of Array.from(listeners)) listener(state);
}
