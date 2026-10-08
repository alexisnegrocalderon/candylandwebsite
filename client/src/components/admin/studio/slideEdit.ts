import { clampFontSize, cssColorToHex, textToHtml } from '@shared/slideEdit';

/* Edición a mano de una lámina del Diseñador IA, sobre el DOM del iframe
 * (mismo origen: el panel puede leerlo y cambiarlo; el HTML de la lámina sigue
 * sin poder correr scripts). Cada función recibe el elemento y cambia SOLO su
 * estilo en línea, que gana sobre el CSS compartido sin tocarlo, así un
 * cambio en una lámina no se cuela en las demás. */

export const SELECTED_ATTR = 'data-studio-sel';

/** Estilos que se inyectan en el iframe para marcar el elemento elegido. No
 * van dentro del .board, así que no se guardan con la lámina. */
export const EDITOR_STYLE = `[${SELECTED_ATTR}]{outline:6px dashed #ff2ea6 !important;outline-offset:4px !important}
.board *{cursor:pointer}.board{cursor:default}`;

export function installEditorStyle(doc: Document) {
  if (doc.getElementById('studio-editor-style')) return;
  const style = doc.createElement('style');
  style.id = 'studio-editor-style';
  style.textContent = EDITOR_STYLE;
  doc.head.appendChild(style);
}

export function getBoard(doc: Document): HTMLElement | null {
  return doc.querySelector<HTMLElement>('.board');
}

/** Qué elemento se elige al tocar `target`: el mismo elemento, o el <svg> entero
 * si se tocó una parte de un ícono; fuera del .board (o en el fondo vacío), la
 * lámina completa. */
export function pickTarget(board: HTMLElement, target: EventTarget | null): HTMLElement {
  if (!(target instanceof (board.ownerDocument.defaultView as Window & typeof globalThis).Element)) return board;
  const svg = target.closest('svg');
  const el = (svg ?? target) as HTMLElement;
  return board.contains(el) ? el : board;
}

export function select(board: HTMLElement, el: HTMLElement | null) {
  board.ownerDocument.querySelectorAll(`[${SELECTED_ATTR}]`).forEach((n) => n.removeAttribute(SELECTED_ATTR));
  el?.setAttribute(SELECTED_ATTR, '');
}

const isText = (n: ChildNode): n is Text => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0;

export interface TextModel {
  /** Se puede editar el texto de este elemento. */
  editable: boolean;
  text: string;
  /** El elemento tiene otras partes con estilo propio (ej. «A» en otro color):
   * al editar, solo se cambia su texto principal y esas partes quedan como están. */
  partial: boolean;
}

/** Texto editable de un elemento. Si solo tiene texto y <br> se edita todo
 * (cada <br> es un salto de línea); si mezcla otros elementos, se edita su
 * texto propio más largo. */
export function readText(el: HTMLElement): TextModel {
  const kids = Array.from(el.childNodes);
  const others = kids.filter((n) => n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName !== 'BR');
  if (others.length === 0) {
    const text = kids.map((n) => (n.nodeType === Node.ELEMENT_NODE ? '\n' : n.textContent ?? '')).join('');
    return { editable: text.trim().length > 0, text, partial: false };
  }
  const own = kids.filter(isText);
  if (own.length === 0) return { editable: false, text: '', partial: true };
  const main = own.reduce((a, b) => ((b.textContent ?? '').length > (a.textContent ?? '').length ? b : a));
  return { editable: true, text: (main.textContent ?? '').trim(), partial: true };
}

export function writeText(el: HTMLElement, text: string) {
  const kids = Array.from(el.childNodes);
  const others = kids.filter((n) => n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName !== 'BR');
  if (others.length === 0) {
    el.innerHTML = textToHtml(text);
    return;
  }
  const own = kids.filter(isText);
  if (own.length === 0) return;
  const main = own.reduce((a, b) => ((b.textContent ?? '').length > (a.textContent ?? '').length ? b : a));
  // Se conservan los espacios de los bordes (separan el texto de sus vecinos).
  const raw = main.textContent ?? '';
  const lead = /^\s*/.exec(raw)?.[0] ?? '';
  const trail = /\s*$/.exec(raw)?.[0] ?? '';
  main.textContent = `${lead}${text.replace(/\s*\n\s*/g, ' ')}${trail}`;
}

export interface StyleModel {
  fontSize: number;
  /** Color del texto (#rrggbb). */
  color: string;
  /** Color de fondo propio del elemento, o null si no tiene. */
  background: string | null;
}

export function readStyle(el: HTMLElement): StyleModel {
  const cs = el.ownerDocument.defaultView!.getComputedStyle(el);
  return {
    fontSize: Math.round(parseFloat(cs.fontSize) || 0),
    color: cssColorToHex(cs.color) ?? '#000000',
    background: cssColorToHex(cs.backgroundColor),
  };
}

export function setFontSize(el: HTMLElement, px: number) {
  el.style.fontSize = `${clampFontSize(px)}px`;
}

export function setTextColor(el: HTMLElement, hex: string) {
  el.style.color = hex;
}

/** `hex` null: se quita el fondo que se puso a mano y vuelve el del CSS. */
export function setBackground(el: HTMLElement, hex: string | null) {
  if (hex === null) el.style.removeProperty('background-color');
  else el.style.setProperty('background-color', hex);
}

/** Nombre corto para mostrar qué hay elegido. */
export function describe(board: HTMLElement, el: HTMLElement): string {
  if (el === board) return 'Fondo de la lámina';
  if (el.tagName === 'IMG') return 'Foto';
  if (el.tagName === 'svg' || el.tagName === 'SVG') return 'Ícono o dibujo';
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text ? `«${text.length > 34 ? `${text.slice(0, 34)}…` : text}»` : 'Bloque';
}

/** El HTML de la lámina tal como se guarda: sin la marca de selección. */
export function serializeBoard(doc: Document): string | null {
  const board = getBoard(doc);
  if (!board) return null;
  const clone = board.cloneNode(true) as HTMLElement;
  clone.removeAttribute(SELECTED_ATTR);
  clone.querySelectorAll(`[${SELECTED_ATTR}]`).forEach((n) => n.removeAttribute(SELECTED_ATTR));
  return clone.outerHTML;
}
