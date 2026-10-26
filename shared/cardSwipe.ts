/* Deslizar de lado en «Mi cuenta». Hasta ahora cambiaba de pestaña; con las tarjetas en carrusel, deslizar
 * avanza de tarjeta en tarjeta y, ya en la última, un deslizar más pasa a la pestaña siguiente (encadenado).
 * Los umbrales son los de siempre, para que el gesto se sienta igual. */

export const SWIPE_MIN_DX = 60;
export const SWIPE_HORIZONTAL_RATIO = 1.5;

/** 'left' = el dedo fue hacia la izquierda (avanza); null si no fue un deslizar horizontal claro. */
export function horizontalSwipe(dx: number, dy: number): 'left' | 'right' | null {
  if (Math.abs(dx) < SWIPE_MIN_DX || Math.abs(dx) < Math.abs(dy) * SWIPE_HORIZONTAL_RATIO) return null;
  return dx < 0 ? 'left' : 'right';
}

/** ¿El carrusel ya está en su última tarjeta? (con un poco de holgura por el redondeo del snap). */
export function isAtScrollEnd(scrollLeft: number, clientWidth: number, scrollWidth: number, slack = 3): boolean {
  return scrollLeft + clientWidth >= scrollWidth - slack;
}

/** Pasar a la pestaña siguiente: el gesto empezó con el carrusel en su última tarjeta y fue hacia la izquierda.
 * (En la primera tarjeta, deslizar a la derecha no hace nada: PlayCard es la primera pestaña.) */
export function shouldChainToNextTab(args: { dx: number; dy: number; atEndAtStart: boolean }): boolean {
  return args.atEndAtStart && horizontalSwipe(args.dx, args.dy) === 'left';
}
