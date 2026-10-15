/* Tema "Bubble" del Estudio: el estilo oficial de la marca (letras gruesas
 * estilo globo, rosa y blanco con contorno, fondos lisos, íconos grandes y
 * poco texto). Es el de los carruseles que mejor rindieron en la cuenta
 * ("No es solo una fiesta", "¿Qué es realmente una fiesta liberal?").
 * Acá vive lo PURO (colores, gráficos, reparto del titular en líneas); lo
 * visual está en client/src/components/admin/studio/StudioSlideView.tsx. */

/** Fondos del tema. El celeste es el de la marca (el mismo de los demás
 * carruseles); el azul rey y el lila son los de los dos carruseles ganadores. */
export const BUBBLE_PALETTES = [
  { key: 'celeste', label: 'Celeste', bg: '#07A2FC', pill: '#0070D6' },
  { key: 'azul', label: 'Azul rey', bg: '#0366E7', pill: '#0090E8' },
  { key: 'lila', label: 'Lila', bg: '#CF71DB', pill: '#0090E8' },
] as const;

/** `palette = -1` (automático) = celeste, el de la marca. */
export function resolveBubblePalette(palette: number): (typeof BUBBLE_PALETTES)[number] {
  return BUBBLE_PALETTES[palette >= 0 && palette < BUBBLE_PALETTES.length ? palette : 0];
}

/** Gráficos grandes dibujados por el Estudio. Cualquier otro texto del campo
 * (un emoji: 🔥 🍸 🎃) se dibuja tal cual, grande. */
export const BUBBLE_HEROES = [
  { key: 'interrogacion', label: 'Signo de pregunta' },
  { key: 'puerta', label: 'Puerta' },
  { key: 'corazon', label: 'Corazón' },
  { key: 'estrella', label: 'Estrella' },
  { key: 'caramelo', label: 'Caramelo' },
  { key: 'check', label: 'Check' },
  { key: 'mansion', label: 'Mansión' },
  { key: 'aro', label: 'Aro' },
  { key: 'chat', label: 'Globo de chat' },
  { key: 'corazon-cuadro', label: 'Corazón en cuadro' },
  { key: 'musica', label: 'Nota musical' },
  { key: 'fuego', label: 'Fuego' },
  { key: 'corazon-neon', label: 'Corazón (línea brillante)' },
  { key: 'manos-neon', label: 'Manos (línea brillante)' },
  { key: 'mano-neon', label: 'Mano con corazón (línea brillante)' },
  { key: 'chat-neon', label: 'Chat (línea brillante)' },
] as const;

export type BubbleHeroKey = (typeof BUBBLE_HEROES)[number]['key'];

export function isBubbleHeroKey(value: string): value is BubbleHeroKey {
  return BUBBLE_HEROES.some((h) => h.key === value);
}

/** Ancho promedio de una letra mayúscula de Fredoka Bold, en "em". */
export const BUBBLE_CHAR_WIDTH = 0.68;
export const BUBBLE_LINE_HEIGHT = 0.98;

export interface BubbleHeadline {
  lines: string[];
  size: number;
}

/** Reparte un titular en líneas y elige el tamaño de letra más grande que
 * cabe en la caja. Si el texto trae saltos de línea, se respetan; si no, se
 * prueban de 1 a 4 líneas y gana la que deja la letra más grande. */
export function layoutBubbleHeadline(
  text: string,
  box: { width: number; height: number },
  opts: { max: number; min: number; maxLines?: number } = { max: 190, min: 60 },
): BubbleHeadline {
  const clean = text.replace(/[ \t]+/g, ' ').trim().toUpperCase();
  if (!clean) return { lines: [], size: opts.max };

  const sizeFor = (lines: string[]) => {
    const longest = Math.max(...lines.map((l) => l.length), 1);
    const bySide = box.width / (longest * BUBBLE_CHAR_WIDTH);
    const byHeight = box.height / (lines.length * BUBBLE_LINE_HEIGHT);
    return Math.max(opts.min, Math.min(opts.max, bySide, byHeight));
  };

  if (clean.includes('\n')) {
    const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
    return { lines, size: Math.round(sizeFor(lines)) };
  }

  const words = clean.split(' ');
  let best: BubbleHeadline | null = null;
  for (let n = 1; n <= Math.min(opts.maxLines ?? 4, words.length); n++) {
    const lines = splitBalanced(words, n);
    const size = sizeFor(lines);
    if (!best || size > best.size + 0.5) best = { lines, size };
  }
  return { lines: best!.lines, size: Math.round(best!.size) };
}

/** Parte las palabras en `n` líneas seguidas dejando la línea más larga lo
 * más corta posible (programación dinámica; son pocas palabras). */
export function splitBalanced(words: string[], n: number): string[] {
  const count = words.length;
  if (n <= 1 || count <= 1) return [words.join(' ')];
  const lines = Math.min(n, count);
  const len = (from: number, to: number) => words.slice(from, to).join(' ').length;
  const INF = Number.POSITIVE_INFINITY;
  const cost: number[][] = Array.from({ length: lines + 1 }, () => new Array(count + 1).fill(INF));
  const cut: number[][] = Array.from({ length: lines + 1 }, () => new Array(count + 1).fill(0));
  cost[0][0] = 0;
  for (let k = 1; k <= lines; k++) {
    for (let j = k; j <= count; j++) {
      for (let i = k - 1; i < j; i++) {
        const c = Math.max(cost[k - 1][i], len(i, j));
        if (c < cost[k][j]) { cost[k][j] = c; cut[k][j] = i; }
      }
    }
  }
  const out: string[] = [];
  let j = count;
  for (let k = lines; k >= 1; k--) {
    const i = cut[k][j];
    out.unshift(words.slice(i, j).join(' '));
    j = i;
  }
  return out;
}
