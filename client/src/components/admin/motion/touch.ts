/** Pantalla táctil (celular o tablet): ahí las vistas previas pesadas no se montan solas ni en cantidad. */
export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
