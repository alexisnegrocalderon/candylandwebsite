/* Ajuste automático del texto de las láminas del Diseñador IA.
 *
 * La IA escribe el HTML sin ver cómo queda dibujado, y Gliker Semi Bold
 * Expanded es una letra MUY ancha: un titular como «HALLOWEEN» a 130 px mide
 * más que la lámina entera y se sale por el borde (pasó en la primera prueba
 * real, 08/10). En vez de confiar en que la IA calcule bien cada ancho, se
 * mide el texto ya dibujado y, si se sale por la derecha, se le baja el
 * tamaño de letra justo lo necesario para que quepa con el mismo margen que
 * tiene por la izquierda.
 *
 * Corre sobre el DOM del iframe (mismo origen), así lo que se ve en el panel
 * y lo que sale en el PNG es lo mismo. Solo ACHICA y solo lo que se pasa: una
 * lámina bien hecha no se toca. */

/** Margen mínimo y máximo (px) que se deja a la derecha: el que tiene el
 * texto por la izquierda, entre estos topes (las láminas de marca usan 108). */
const MIN_MARGIN = 60;
const MAX_MARGIN = 108;
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
      const margin = Math.min(MAX_MARGIN, Math.max(MIN_MARGIN, left));
      const limit = width - margin;
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

/** Espera fuentes e imágenes de la lámina y recién ahí mide: antes de que
 * cargue Gliker, el texto se mediría con la letra de reemplazo. */
export async function fitWhenReady(doc: Document): Promise<FitReport> {
  const board = doc.querySelector<HTMLElement>('.board');
  if (!board) return { adjusted: 0 };
  await doc.fonts.ready;
  await Promise.all(
    Array.from(doc.images).map((img) => (img.complete ? Promise.resolve() : new Promise<void>((resolve) => { img.onload = img.onerror = () => resolve(); }))),
  );
  // Un cuadro más: las fuentes recién listas todavía no repartieron las líneas.
  // (Con tope de tiempo: en una pestaña oculta el navegador no dibuja cuadros.)
  await new Promise<void>((resolve) => {
    const win = doc.defaultView!;
    win.requestAnimationFrame(() => resolve());
    win.setTimeout(resolve, 150);
  });
  return fitBoardText(board);
}
