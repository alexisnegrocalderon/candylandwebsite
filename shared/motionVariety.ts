/* Variedad del Estudio Motion: un ESTILO es un lenguaje visual (colores,
 * tipografía, movimiento); la COMPOSICIÓN cambia en cada pieza y en cada escena.
 *
 * Cada estilo tiene un catálogo de composiciones (dónde va el texto, de qué
 * lado, dónde cae la forma de color). Cada video guarda una semilla: con ella
 * se elige la composición de cada escena (sin repetir la anterior) y se mueven
 * un poco las formas. Misma semilla = mismo resultado, siempre (vista previa,
 * láminas y MP4 se ven igual); otra semilla = otra composición, sin gastar IA.
 *
 * Acá vive solo lo PURO (qué composición toca a cada escena); la geometría de
 * cada una está en motion/layouts.ts. */
import type { MotionSpec, MotionStyle } from './motionSpec';

export interface LayoutOption {
  key: string;
  label: string;
}

/** Composiciones de cada estilo. La PRIMERA es la clásica del estilo. */
export const LAYOUTS: Record<MotionStyle, LayoutOption[]> = {
  kinetic: [
    { key: 'abajo', label: 'Texto abajo' },
    { key: 'arriba', label: 'Texto arriba' },
    { key: 'centro', label: 'Texto al centro' },
    { key: 'derecha', label: 'Alineado a la derecha' },
    { key: 'gigante', label: 'Palabra gigante' },
    { key: 'partido', label: 'Partido (arriba y abajo)' },
  ],
  custom: [
    { key: 'abajo', label: 'Texto abajo' },
    { key: 'arriba', label: 'Texto arriba' },
    { key: 'centro', label: 'Texto al centro' },
    { key: 'derecha', label: 'Alineado a la derecha' },
    { key: 'gigante', label: 'Palabra gigante' },
    { key: 'partido', label: 'Partido (arriba y abajo)' },
  ],
  editorial: [
    { key: 'abajo', label: 'Texto abajo' },
    { key: 'arriba', label: 'Texto arriba' },
    { key: 'centro', label: 'Texto al centro' },
    { key: 'derecha', label: 'Alineado a la derecha' },
    { key: 'gigante', label: 'Palabra gigante' },
    { key: 'partido', label: 'Partido (arriba y abajo)' },
  ],
  poster: [
    { key: 'clasico', label: 'Clásico (palabra clave abajo)' },
    { key: 'invertido', label: 'Invertido (palabra clave arriba)' },
    { key: 'izquierda', label: 'Objeto a la izquierda' },
    { key: 'derecha', label: 'Objeto a la derecha' },
  ],
  softui: [
    { key: 'arriba', label: 'Título arriba, tarjeta abajo' },
    { key: 'abajo', label: 'Tarjeta arriba, título abajo' },
    { key: 'centro', label: 'Tarjeta protagonista' },
    { key: 'izquierda', label: 'Tarjeta inclinada a la izquierda' },
    { key: 'derecha', label: 'Tarjeta inclinada a la derecha' },
  ],
  liquid: [
    { key: 'centro', label: 'Centrado' },
    { key: 'bajo', label: 'Abajo' },
    { key: 'alto', label: 'Arriba' },
    { key: 'izquierda', label: 'A la izquierda' },
    { key: 'derecha', label: 'A la derecha' },
  ],
  arcade: [
    { key: 'centro', label: 'Centrado' },
    { key: 'alto', label: 'Arriba' },
    { key: 'bajo', label: 'Abajo' },
    { key: 'izquierda', label: 'A la izquierda' },
    { key: 'derecha', label: 'A la derecha' },
  ],
  glitch: [
    { key: 'centro', label: 'Centrado' },
    { key: 'bajo', label: 'Abajo' },
    { key: 'alto', label: 'Arriba' },
    { key: 'izquierda', label: 'A la izquierda' },
    { key: 'derecha', label: 'A la derecha' },
  ],
};

export const LAYOUT_AUTO = 'auto';

/** Todas las claves de composición que existen (para validar lo que llega de la IA o de una fila vieja). */
export const ALL_LAYOUT_KEYS: string[] = Array.from(new Set(Object.values(LAYOUTS).flatMap((list) => list.map((l) => l.key))));

/** Generador pseudoaleatorio con semilla (mulberry32): el mismo número da siempre la misma secuencia. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semilla estable a partir de un texto (los videos guardados sin semilla la sacan de su nombre: no cambian de cara). */
export function seedFromText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 1_000_000;
}

export const randomSeed = (): number => Math.floor(Math.random() * 1_000_000);

/** Composiciones con que un gancho (escena 1) pega más fuerte, por estilo. */
const HOOK_PREFERENCE: Partial<Record<MotionStyle, string[]>> = {
  kinetic: ['gigante', 'abajo', 'centro'],
  editorial: ['gigante', 'abajo', 'centro'],
  poster: ['clasico', 'invertido'],
  softui: ['arriba', 'centro'],
};
/** Y la última escena (la acción): quieta y legible. */
const CLOSE_PREFERENCE: Partial<Record<MotionStyle, string[]>> = {
  kinetic: ['abajo', 'centro'],
  editorial: ['abajo', 'centro'],
  poster: ['clasico'],
  softui: ['arriba', 'centro'],
};

/** La composición de cada escena: la que el dueño o la IA fijaron, y para el resto, una elegida con la
 * semilla que nunca repite la de la escena anterior ni la de dos antes. Determinista. */
export function resolveLayouts(spec: Pick<MotionSpec, 'style' | 'seed' | 'scenes'>): string[] {
  const catalog = LAYOUTS[spec.style].map((l) => l.key);
  const rand = seededRandom(spec.seed * 31 + 17);
  const out: string[] = [];
  spec.scenes.forEach((scene, i) => {
    if (scene.layout !== LAYOUT_AUTO && catalog.includes(scene.layout)) {
      out.push(scene.layout);
      return;
    }
    const recent = out.slice(-2);
    let pool = catalog.filter((k) => !recent.includes(k));
    if (pool.length === 0) pool = catalog.filter((k) => k !== out[out.length - 1]);
    if (pool.length === 0) pool = catalog;
    const preferred = (i === 0 ? HOOK_PREFERENCE : i === spec.scenes.length - 1 && spec.scenes.length > 1 ? CLOSE_PREFERENCE : {})[spec.style];
    const liked = preferred ? pool.filter((k) => preferred.includes(k)) : [];
    // El gancho y la acción prefieren (no obligan) las composiciones que mejor se leen.
    const from = liked.length > 0 && rand() < 0.75 ? liked : pool;
    out.push(from[Math.floor(rand() * from.length) % from.length]);
  });
  return out;
}

/** Variación fina de una escena (para que dos con la misma composición no sean idénticas): -1..1 por eje. */
export function sceneJitter(seed: number, index: number): { x: number; y: number; r: number; side: 1 | -1 } {
  const rand = seededRandom(seed * 131 + index * 7919 + 5);
  return { x: rand() * 2 - 1, y: rand() * 2 - 1, r: rand() * 2 - 1, side: rand() < 0.5 ? -1 : 1 };
}
