/* Edición a mano de las láminas del Diseñador IA (tocar el texto, cambiar
 * tamaño y colores sin gastar IA). Acá viven las piezas puras; lo que toca el
 * DOM del iframe está en client/src/components/admin/studio/slideEdit.ts. */

/** Colores de la marca (PlayRoom Design System y los fondos de los carruseles
 * publicados) para elegir con un toque. */
export const BRAND_COLORS: { name: string; hex: string }[] = [
  { name: 'Celeste', hex: '#00A3FF' },
  { name: 'Rosa', hex: '#EF8DFF' },
  { name: 'Magenta', hex: '#FF008E' },
  { name: 'Morado', hex: '#9E20FF' },
  { name: 'Azul tinta', hex: '#0010DF' },
  { name: 'Naranja', hex: '#FFA52D' },
  { name: 'Lima', hex: '#CAFE37' },
  { name: 'Lila pastel', hex: '#E4CCFF' },
  { name: 'Durazno pastel', hex: '#FFDDB0' },
  { name: 'Lima pastel', hex: '#EBFFAE' },
  { name: 'Blanco', hex: '#FFFFFF' },
  { name: 'Negro', hex: '#000000' },
];

export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 320;
export const FONT_SIZE_STEP = 4;

export function clampFontSize(px: number): number {
  if (!Number.isFinite(px)) return FONT_SIZE_MIN;
  return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(px)));
}

/** "#abc" / "#AABBCC" → "#aabbcc"; cualquier otra cosa → null. */
export function normalizeHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (!m) return null;
  const h = m[1];
  return `#${h.length === 3 ? h.split('').map((c) => c + c).join('') : h}`;
}

/** "rgb(255, 0, 142)" / "rgba(255,0,142,1)" → "#ff008e". Con transparencia
 * total (alpha 0) o un formato que no entiende devuelve null. */
export function cssColorToHex(value: string): string | null {
  const hex = normalizeHex(value);
  if (hex) return hex;
  const m = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i.exec(value.trim());
  if (!m) return null;
  if (m[4] !== undefined) {
    const alpha = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    if (!(alpha > 0)) return null;
  }
  const to = (s: string) => Math.min(255, parseInt(s, 10)).toString(16).padStart(2, '0');
  return `#${to(m[1])}${to(m[2])}${to(m[3])}`;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Texto escrito en el panel → HTML de la lámina: se escapa y cada salto de
 * línea pasa a <br>. */
export function textToHtml(text: string): string {
  return text.replace(/\r\n?/g, '\n').split('\n').map(escapeHtml).join('<br>');
}
