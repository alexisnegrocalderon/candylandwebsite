/* En «modo app» (la app instalada o el sitio en el celular, ver appMode.ts) la pantalla es fija: no se achica ni se agranda con el
 * pellizco ni con el doble toque, como en cualquier app. En el computador y en los navegadores de escritorio no se toca nada.
 *
 * iPhone ignora `user-scalable=no` del viewport, así que además se cancelan los gestos de pellizco (gesturestart/gesturechange y el
 * toque con dos dedos). El desplazamiento con un dedo no se afecta. */

/** El `content` del viewport con el zoom bloqueado (conserva lo que ya traía, como `viewport-fit=cover`). */
export function lockedViewportContent(content: string | null | undefined): string {
  const keep = (content ?? 'width=device-width, initial-scale=1.0, viewport-fit=cover')
    .split(',').map((s) => s.trim()).filter((s) => s && !/^(maximum-scale|minimum-scale|user-scalable|initial-scale)\s*=/.test(s));
  return [...keep, 'initial-scale=1', 'maximum-scale=1', 'minimum-scale=1', 'user-scalable=no'].join(', ');
}

let installed = false;

export function lockZoom(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (meta) meta.setAttribute('content', lockedViewportContent(meta.getAttribute('content')));
  document.documentElement.style.touchAction = 'manipulation'; // sin zoom por doble toque
  const stop = (e: Event) => e.preventDefault();
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, stop, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
}
