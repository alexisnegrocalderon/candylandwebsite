/* Markdown mínimo para las respuestas del Asistente IA: párrafos, títulos, listas, tablas, negritas, cursivas y código.
 * Devuelve bloques (no HTML): la pantalla los dibuja como elementos de React, así un texto nunca inyecta HTML. */

export type Inline = { t: 'text' | 'bold' | 'italic' | 'code'; v: string };
export type MdBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; inline: Inline[] }
  | { kind: 'paragraph'; inline: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][]; align: ('left' | 'right' | 'center')[] };

/** **negrita**, *cursiva* o _cursiva_, `código`. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  // Sin «lookbehind» en la expresión: los iPad con iOS anterior a 16.4 no la entienden y no cargaría el chat.
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  const word = /[A-Za-z0-9À-ÿ]/;
  let last = 0;
  for (const m of Array.from(text.matchAll(re))) {
    const i = m.index ?? 0;
    const s = m[0];
    // _cursiva_ solo si no está pegada a una palabra (ticket_type_id queda como texto).
    if (s.startsWith('_') && (word.test(text[i - 1] ?? '') || word.test(text[i + s.length] ?? ''))) continue;
    if (i > last) out.push({ t: 'text', v: text.slice(last, i) });
    if (s.startsWith('**')) out.push({ t: 'bold', v: s.slice(2, -2) });
    else if (s.startsWith('`')) out.push({ t: 'code', v: s.slice(1, -1) });
    else out.push({ t: 'italic', v: s.slice(1, -1) });
    last = i + s.length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

const splitRow = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isSeparator = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);

export function parseMarkdown(text: string): MdBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push({ kind: 'paragraph', inline: parseInline(para.join(' ')) }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { flush(); continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) { flush(); blocks.push({ kind: 'heading', level: h[1].length as 1 | 2 | 3, inline: parseInline(h[2].trim()) }); continue; }
    // Tabla: una fila con | seguida de la línea de guiones.
    if (line.includes('|') && i + 1 < lines.length && isSeparator(lines[i + 1])) {
      flush();
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left') as 'left' | 'right' | 'center');
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(splitRow(lines[i]).map(parseInline)); i++; }
      i--;
      blocks.push({ kind: 'table', header: header.map(parseInline), rows, align });
      continue;
    }
    const li = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const ordered = !!li[2];
      const prev = blocks[blocks.length - 1];
      if (prev && prev.kind === 'list' && prev.ordered === ordered) prev.items.push(parseInline(li[3]));
      else blocks.push({ kind: 'list', ordered, items: [parseInline(li[3])] });
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return blocks;
}
