/* Medidas de texto sin tocar el DOM (la composición se dibuja igual en el navegador y en la grabación). */

/** Ancho aproximado en «em» de Syne 800 (muy ancha): las angostas pesan menos. */
export function syneWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    if (/[iljtfrí1.,'!¡:;|]/.test(ch)) w += 0.5;
    else if (/[mwMW]/.test(ch)) w += 1.45;
    else if (/[A-ZÁÉÍÓÚÑ]/.test(ch)) w += 1.15;
    else if (ch === ' ') w += 0.3;
    else w += 1.02;
  }
  return w;
}

/** Alto aproximado (px) de un grupo de palabras Syne que se acomodan en líneas dentro de `usable` px. */
export function wrappedHeight(words: string[], size: number, usable: number, lineHeight: number, gapEm = 0.25): number {
  let lines = 1;
  let x = 0;
  for (const w of words) {
    const wide = syneWidth(w) * size;
    if (x > 0 && x + size * gapEm + wide > usable) { lines += 1; x = wide; } else x += (x > 0 ? size * gapEm : 0) + wide;
  }
  return lines * size * lineHeight;
}

/** El tamaño más grande (≤ `start`) con el que el grupo de palabras cabe en `maxHeight`. */
export function fitBlockSize(words: string[], start: number, usable: number, maxHeight: number, lineHeight: number, floor = 56): number {
  let size = start;
  while (size > floor && wrappedHeight(words, size, usable, lineHeight) > maxHeight) size = Math.round(size * 0.92);
  return size;
}

