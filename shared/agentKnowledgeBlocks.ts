/* El conocimiento del agente se guarda como texto largo (`brandNotes` y `salesPlaybook`). El panel lo muestra en
 * bloques que se abren y cierran (Sobre la marca, Preguntas frecuentes, Tipos de cliente, Objeciones…) y los vuelve a
 * juntar en el mismo texto al guardar, así no hace falta migrar nada. Lo que no calza con ningún bloque queda en el
 * bloque «resto» (lo de antes de la primera sección) y nunca se pierde. */

export interface BlockDef {
  key: string;
  /** Línea de encabezado con que se guarda el bloque (en mayúsculas, termina en «:»). */
  heading: string;
  /** Cómo se reconoce ese encabezado en el texto que ya existe (sin tildes ni mayúsculas). */
  match: RegExp;
}

export const BRAND_BLOCKS: BlockDef[] = [
  { key: 'faq', heading: 'PREGUNTAS FRECUENTES:', match: /^preguntas frecuentes\b/ },
];
export const SALES_BLOCKS: BlockDef[] = [
  { key: 'clientTypes', heading: 'TIPOS DE CLIENTE Y CÓMO ACOMPAÑAR A CADA UNO:', match: /^tipos de cliente\b/ },
  { key: 'objections', heading: 'OBJECIONES TÍPICAS:', match: /^objeciones\b/ },
];

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const isHeading = (line: string) => /^[^\n]{2,90}:\s*$/.test(line.trim());

/** Parte el texto en el «resto» (lo que va antes de la primera sección conocida) y un texto por sección. */
export function splitBlocks(text: string, defs: BlockDef[]): { rest: string; blocks: Record<string, string> } {
  const lines = (text ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: Record<string, string[]> = {};
  const rest: string[] = [];
  let current: string | null = null;
  for (const line of lines) {
    const def = isHeading(line) ? defs.find((d) => d.match.test(plain(line))) : undefined;
    if (def && !(def.key in blocks)) { current = def.key; blocks[current] = []; continue; }
    (current ? blocks[current] : rest).push(line);
  }
  const clean = (l: string[]) => l.join('\n').replace(/^\n+|\s+$/g, '');
  return { rest: clean(rest), blocks: Object.fromEntries(defs.map((d) => [d.key, clean(blocks[d.key] ?? [])])) };
}

/** Junta el «resto» y los bloques en el texto que se guarda (un bloque vacío no deja su encabezado). */
export function joinBlocks(rest: string, blocks: Record<string, string>, defs: BlockDef[]): string {
  const parts: string[] = [];
  if (rest.trim()) parts.push(rest.replace(/\s+$/g, ''));
  for (const d of defs) {
    const body = (blocks[d.key] ?? '').replace(/^\n+|\s+$/g, '');
    if (body) parts.push(`${d.heading}\n${body}`);
  }
  return parts.join('\n\n');
}
