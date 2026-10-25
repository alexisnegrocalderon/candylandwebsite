import { useEffect } from 'react';
import { STACK_MIN_COLUMNS, rowLabels } from '@shared/stackTable';

/* Tablas del panel en el celular: en vez de deslizar hacia el lado, cada fila se ve como una tarjeta
 * (el CSS está en index.css, `table[data-stack]`). Aquí solo se les pone a las celdas el nombre de su
 * columna. Se hace una vez en el panel entero, así las ~30 tablas quedan iguales y las nuevas también. */

const rows = (t: HTMLTableElement) => Array.from(t.tBodies).flatMap((b) => Array.from(b.rows));

export function decorateTables(root: ParentNode) {
  root.querySelectorAll('table').forEach((table) => {
    if (table.hasAttribute('data-no-stack')) return;
    const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
    if (!headRow) return;
    const headers = Array.from(headRow.cells).map((c) => c.textContent ?? '');
    for (const tr of rows(table)) {
      const labels = rowLabels(headers, Array.from(tr.cells).map((c) => c.colSpan));
      if (!labels) continue;
      Array.from(tr.cells).forEach((cell, i) => {
        if (cell.getAttribute('data-label') !== labels[i]) cell.setAttribute('data-label', labels[i]);
        // Sin dato (ni texto ni botones o íconos): no ocupa una línea con solo la etiqueta.
        const empty = !(cell.textContent ?? '').trim() && !cell.querySelector('button, a, input, select, textarea, img, svg, canvas');
        if (empty !== cell.hasAttribute('data-empty')) cell.toggleAttribute('data-empty', empty);
      });
    }
    // Aun sin filas con datos (solo «No hay nada todavía») la tabla se apila: si no, el encabezado ancho se desborda.
    if (headers.length >= STACK_MIN_COLUMNS && !table.hasAttribute('data-stack')) table.setAttribute('data-stack', '');
  });
}

/** Mantiene decoradas las tablas de `ref` mientras se dibujan filas nuevas (búsquedas, páginas, pestañas). */
export function useStackTables(ref: { current: HTMLElement | null }) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let frame = 0;
    const run = () => { frame = 0; decorateTables(root); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };
    run();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [ref]);
}
