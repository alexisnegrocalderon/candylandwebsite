/* Ajuste automático del texto de las láminas del Diseñador IA.
 *
 * La IA escribe el HTML sin ver cómo queda dibujado, y Gliker Semi Bold
 * Expanded es una letra MUY ancha: un titular como «HALLOWEEN» a 130 px mide
 * más que la lámina entera y se sale por el borde (pasó en la primera prueba
 * real, 08/10). En vez de confiar en que la IA calcule bien cada ancho, se
 * mide el texto ya dibujado y, si se sale por la derecha, se le baja el
 * tamaño de letra justo lo necesario para que quepa con aire a la derecha.
 *
 * Corre igual sobre el iframe de la vista previa y sobre la lámina que se
 * dibuja para exportar, así lo que se ve en el panel y lo que sale en el PNG es
 * lo mismo. Solo ACHICA y solo lo que se pasa: una
 * lámina bien hecha no se toca. */

/** Aire mínimo a la derecha: el 5% del ancho (54 px en 1080), el mismo criterio
 * de «formatos-instagram» del Design System. Es un piso, no un estilo: los
 * diseños de marca dejan ~90 px y NO deben tocarse (una regla más estricta,
 * de 108 px, achicaba de más los titulares del Desafío). Solo se corrige texto
 * que se sale o queda pegado al borde. */
const SAFE_MARGIN_RATIO = 0.05;
/** Pasadas por elemento: una sola suele alcanzar; el resto cubre el redibujado
 * de líneas (al achicar, un título que antes partía en 2 líneas cambia de ancho). */
const MAX_PASSES = 4;
/** Tamaño mínimo al que se achica algo: más chico ya no se lee en el celular. */
const MIN_FONT_PX = 22;

function textExtent(el: HTMLElement): DOMRect | null {
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
  if (rects.length === 0) return null;
  const left = Math.min(...rects.map((r) => r.left));
  const right = Math.max(...rects.map((r) => r.right));
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  return new DOMRect(left, top, right - left, bottom - top);
}

/** ¿Tiene texto propio (no solo hijos que lo tengan)? */
function hasOwnText(el: HTMLElement): boolean {
  return Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0);
}

export interface FitReport {
  /** Cuántos elementos se achicaron. */
  adjusted: number;
}

/** Achica el texto del `.board` que se sale por la derecha. Idempotente. */
export function fitBoardText(board: HTMLElement): FitReport {
  const boardRect = board.getBoundingClientRect();
  // El iframe va escalado con transform: se trabaja en px del propio diseño.
  const scale = boardRect.width / board.offsetWidth || 1;
  const width = board.offsetWidth;
  let adjusted = 0;

  const elements = Array.from(board.querySelectorAll<HTMLElement>('*')).filter(
    (el) => !el.closest('svg') && hasOwnText(el),
  );

  for (const el of elements) {
    let changed = false;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const box = textExtent(el);
      if (!box) break;
      const left = (box.left - boardRect.left) / scale;
      const right = (box.right - boardRect.left) / scale;
      const limit = width - width * SAFE_MARGIN_RATIO;
      if (right <= limit + 0.5) break;

      const available = limit - Math.max(left, 0);
      const current = parseFloat(el.ownerDocument.defaultView!.getComputedStyle(el).fontSize);
      if (!Number.isFinite(current) || available <= 0) break;
      // Un pelo de más (3%) para que el redondeo de las letras no lo deje al ras.
      const next = Math.max(MIN_FONT_PX, Math.floor(current * (available / (right - Math.max(left, 0))) * 0.97));
      if (next >= current) break;
      el.style.fontSize = `${next}px`;
      changed = true;
    }
    if (changed) adjusted++;
  }
  return { adjusted };
}

/** Pausa con el temporizador de la PÁGINA PRINCIPAL. Nunca el de la ventana de
 * un iframe `sandbox` sin scripts: Safari (iPad) no los ejecuta, y una espera
 * que depende de ellos no termina jamás (la exportación quedaba girando). */
export const sleep = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });

/** Deja que `promise` termine, pero nunca espera más de `ms`. */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise, sleep(ms).then(() => undefined)]);
}

/** Espera fuentes e imágenes de la lámina y recién ahí mide: antes de que
 * cargue Gliker, el texto se mediría con la letra de reemplazo. Todo con tope
 * de tiempo y sin depender de eventos ni temporizadores del documento de la
 * lámina (puede estar en un iframe sin scripts). */
export async function waitForBoardAssets(board: HTMLElement, maxMs = 3000): Promise<void> {
  const doc = board.ownerDocument;
  const pending: Promise<unknown>[] = [];
  if (doc.fonts?.ready) pending.push(doc.fonts.ready);
  for (const img of Array.from(board.querySelectorAll('img'))) {
    if (!img.complete && typeof img.decode === 'function') pending.push(img.decode().catch(() => undefined));
  }
  await withTimeout(Promise.all(pending), maxMs);
  // Un cuadro más: las fuentes recién listas todavía no repartieron las líneas.
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
    window.setTimeout(resolve, 150);
  });
}

/** Espera lo necesario y achica el texto que se sale. Siempre termina. */
export async function fitWhenReady(board: HTMLElement): Promise<FitReport> {
  await waitForBoardAssets(board);
  return fitBoardText(board);
}
