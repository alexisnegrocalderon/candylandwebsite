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
  collage: [
    { key: 'centro', label: 'Centrado' },
    { key: 'bajo', label: 'Abajo' },
    { key: 'alto', label: 'Arriba' },
    { key: 'izquierda', label: 'A la izquierda' },
    { key: 'derecha', label: 'A la derecha' },
  ],
  pizarra: [
    { key: 'centro', label: 'Centrado' },
    { key: 'alto', label: 'Arriba' },
    { key: 'bajo', label: 'Abajo' },
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

/* --- Look: lo que hace que dos videos del MISMO estilo no se vean iguales -------
 * El estilo (liquid, glitch, editorial…) sigue siendo el lenguaje de la marca. El
 * «look» es todo lo demás que se puede combinar encima: cómo se corta de una
 * escena a otra, cómo entra el texto, qué trama lleva el fondo, qué adornos
 * Playroom aparecen (cintas, sellos, stickers), cómo se mueve la cámara y qué
 * forma tiene la etiqueta. Cada uno se elige a mano o queda en «auto», y
 * entonces lo decide la semilla del video: otra semilla = otra combinación.
 *
 * Los videos guardados ANTES de esto no traen look: se quedan con el clásico
 * (LOOK_CLASSIC), así no cambian de cara al abrirlos. */

export const LOOK_AUTO_VALUE = 'auto';

export const LOOK_CUTS = ['estilo', 'barrido', 'iris', 'persianas', 'diagonal', 'cortina', 'flash'] as const;
export type LookCut = (typeof LOOK_CUTS)[number];
export const LOOK_CUT_LABEL: Record<LookCut, string> = {
  estilo: 'La del estilo', barrido: 'Barrido de color', iris: 'Iris (círculo)', persianas: 'Persianas', diagonal: 'Diagonal', cortina: 'Cortina', flash: 'Destello',
};

export const LOOK_ENTRIES = ['estilo', 'mascara', 'rebote', 'enfoque', 'golpe', 'giro', 'maquina'] as const;
export type LookEntry = (typeof LOOK_ENTRIES)[number];
export const LOOK_ENTRY_LABEL: Record<LookEntry, string> = {
  estilo: 'La del estilo', mascara: 'Sube con máscara', rebote: 'Rebote', enfoque: 'Enfoque', golpe: 'Golpe (zoom)', giro: 'Giro 3D', maquina: 'Máquina de escribir',
};

export const LOOK_TEXTURES = ['ninguna', 'puntos', 'rayas', 'cuadros', 'ondas', 'rayos'] as const;
export type LookTexture = (typeof LOOK_TEXTURES)[number];
export const LOOK_TEXTURE_LABEL: Record<LookTexture, string> = {
  ninguna: 'Sin trama', puntos: 'Puntos', rayas: 'Rayas', cuadros: 'Cuadros', ondas: 'Ondas', rayos: 'Rayos',
};

export const LOOK_DECOS = ['ninguno', 'cintas', 'sello', 'esquinas', 'destellos', 'stickers'] as const;
export type LookDeco = (typeof LOOK_DECOS)[number];
export const LOOK_DECO_LABEL: Record<LookDeco, string> = {
  ninguno: 'Sin adornos', cintas: 'Cintas', sello: 'Sello', esquinas: 'Recuadro', destellos: 'Destellos', stickers: 'Stickers',
};

export const LOOK_CAMERAS = ['empuje', 'alejar', 'deriva', 'latido', 'quieta'] as const;
export type LookCamera = (typeof LOOK_CAMERAS)[number];
export const LOOK_CAMERA_LABEL: Record<LookCamera, string> = {
  empuje: 'Se acerca', alejar: 'Se aleja', deriva: 'Deriva lateral', latido: 'Late con la música', quieta: 'Quieta',
};

export const LOOK_KICKERS = ['pildora', 'etiqueta', 'subrayado', 'caja'] as const;
export type LookKicker = (typeof LOOK_KICKERS)[number];
export const LOOK_KICKER_LABEL: Record<LookKicker, string> = {
  pildora: 'Píldora', etiqueta: 'Papelito', subrayado: 'Subrayada', caja: 'Caja con esquinas',
};

type Auto = typeof LOOK_AUTO_VALUE;

/** Lo que se guarda en la receta: cada parte fija, o «auto» (la elige la semilla). */
export interface MotionLook {
  cut: LookCut | Auto;
  entry: LookEntry | Auto;
  texture: LookTexture | Auto;
  deco: LookDeco | Auto;
  camera: LookCamera | Auto;
  kicker: LookKicker | Auto;
}

/** Lo que se dibuja: ya sin «auto». */
export interface ResolvedLook {
  cut: LookCut;
  entry: LookEntry;
  texture: LookTexture;
  deco: LookDeco;
  camera: LookCamera;
  kicker: LookKicker;
}

export type LookPart = keyof MotionLook;
export const LOOK_PARTS: LookPart[] = ['cut', 'entry', 'texture', 'deco', 'camera', 'kicker'];
export const LOOK_PART_LABEL: Record<LookPart, string> = {
  cut: 'Transición', entry: 'Entrada del texto', texture: 'Trama del fondo', deco: 'Adornos', camera: 'Cámara', kicker: 'Etiqueta',
};
export const LOOK_OPTIONS: { [K in LookPart]: readonly ResolvedLook[K][] } = {
  cut: LOOK_CUTS, entry: LOOK_ENTRIES, texture: LOOK_TEXTURES, deco: LOOK_DECOS, camera: LOOK_CAMERAS, kicker: LOOK_KICKERS,
};
export const LOOK_OPTION_LABEL: { [K in LookPart]: Record<ResolvedLook[K], string> } = {
  cut: LOOK_CUT_LABEL, entry: LOOK_ENTRY_LABEL, texture: LOOK_TEXTURE_LABEL, deco: LOOK_DECO_LABEL, camera: LOOK_CAMERA_LABEL, kicker: LOOK_KICKER_LABEL,
};

/** El look de siempre (videos guardados antes de que existiera el look). */
export const LOOK_CLASSIC: ResolvedLook = { cut: 'estilo', entry: 'estilo', texture: 'ninguna', deco: 'ninguno', camera: 'empuje', kicker: 'pildora' };
/** Todo lo decide la semilla (videos nuevos). */
export const LOOK_ALL_AUTO: MotionLook = { cut: 'auto', entry: 'auto', texture: 'auto', deco: 'auto', camera: 'auto', kicker: 'auto' };

export function normalizeLook(raw: unknown): MotionLook {
  if (!raw || typeof raw !== 'object') return { ...LOOK_CLASSIC };
  const r = raw as Record<string, unknown>;
  const out = {} as Record<LookPart, string>;
  for (const part of LOOK_PARTS) {
    const v = r[part];
    out[part] = v === LOOK_AUTO_VALUE || (LOOK_OPTIONS[part] as readonly string[]).includes(v as string) ? (v as string) : LOOK_CLASSIC[part];
  }
  return out as unknown as MotionLook;
}

/** Los estilos cuyo titular lo dibuja la escena genérica: solo en ellos se puede cambiar la entrada del texto
 * (kinetic y póster arman el texto a su manera, es parte de lo que son). */
const ENTRY_STYLES: MotionStyle[] = ['liquid', 'glitch', 'editorial', 'arcade', 'custom', 'softui'];
export const styleHasEntry = (style: MotionStyle): boolean => ENTRY_STYLES.includes(style);

/** Qué puede salir en «auto» según el estilo: solo lo que le queda bien (a mano se puede elegir cualquiera).
 * Una opción repetida pesa más. */
function autoPool<K extends LookPart>(part: K, style: MotionStyle): readonly ResolvedLook[K][] {
  const pools: { [P in LookPart]: readonly ResolvedLook[P][] } = {
    cut: ['estilo', 'estilo', 'barrido', 'iris', 'persianas', 'diagonal', 'cortina', ...(style === 'glitch' || style === 'arcade' ? (['flash'] as const) : [])],
    entry: !styleHasEntry(style) ? ['estilo']
      : style === 'editorial' || style === 'softui' ? ['estilo', 'mascara', 'enfoque', 'giro', 'maquina']
        : style === 'glitch' || style === 'arcade' ? ['estilo', 'estilo', 'golpe', 'maquina', 'mascara']
          : ['estilo', 'rebote', 'enfoque', 'golpe', 'giro', 'mascara'],
    // Collage y pizarra ya traen su propio papel o cuadrícula: la trama va muy de vez en cuando.
    texture: style === 'collage' || style === 'pizarra' ? ['ninguna', 'ninguna', 'ninguna', 'puntos']
      : style === 'arcade' || style === 'custom' ? ['ninguna', 'puntos']
      : style === 'liquid' ? ['ninguna', 'puntos', 'ondas', 'rayos']
        : style === 'softui' ? ['ninguna', 'puntos', 'ondas']
          : ['ninguna', 'puntos', 'rayas', 'cuadros', 'rayos'],
    deco: style === 'softui' ? ['ninguno', 'esquinas', 'destellos']
      : style === 'poster' ? ['ninguno', 'cintas', 'esquinas', 'sello']
        : ['cintas', 'sello', 'esquinas', 'destellos', 'stickers', 'ninguno'],
    camera: ['empuje', 'alejar', 'deriva', 'latido'],
    kicker: style === 'poster' ? ['pildora'] : ['pildora', 'etiqueta', 'subrayado', 'caja'],
  };
  return pools[part];
}

/** El look que se dibuja: lo fijado a mano tal cual; lo «auto», elegido con la semilla. Determinista. */
export function resolveLook(spec: Pick<MotionSpec, 'style' | 'seed' | 'look'>): ResolvedLook {
  const out = {} as Record<LookPart, string>;
  LOOK_PARTS.forEach((part, k) => {
    const v = spec.look?.[part] ?? LOOK_CLASSIC[part];
    if (v !== LOOK_AUTO_VALUE) {
      out[part] = v;
      return;
    }
    // Un generador por parte: fijar una a mano no cambia lo que la semilla eligió para las demás.
    const rand = seededRandom(spec.seed * 53 + k * 104729 + 11);
    const pool = autoPool(part, spec.style);
    out[part] = pool[Math.floor(rand() * pool.length) % pool.length];
  });
  // La entrada solo existe en los estilos de titular genérico.
  if (!styleHasEntry(spec.style)) out.entry = 'estilo';
  return out as unknown as ResolvedLook;
}

/** Huella del look (para no repetir el de los últimos videos). */
/** El papel del estilo Collage que se dibuja: el fijado a mano o, en «auto», uno elegido con la semilla. Determinista. */
export function resolvePaper(spec: Pick<MotionSpec, 'seed' | 'paper'>): Exclude<MotionSpec['paper'], 'auto'> {
  if (spec.paper && spec.paper !== 'auto') return spec.paper;
  const papers = ['rasgado', 'riso', 'scrapbook', 'diario'] as const;
  return papers[Math.floor(seededRandom(spec.seed * 7 + 3)() * papers.length) % papers.length];
}

export function lookSignature(spec: Pick<MotionSpec, 'style' | 'seed' | 'look'> & { paper?: MotionSpec['paper'] }): string {
  const l = resolveLook(spec);
  return [spec.style + (spec.style === 'collage' ? `:${resolvePaper({ seed: spec.seed, paper: spec.paper ?? 'auto' })}` : ''), ...LOOK_PARTS.map((p) => l[p])].join('|');
}

/** En cuántas partes se diferencian dos huellas del mismo estilo (0 = idénticas; otro estilo = todas). */
export function lookDistance(a: string, b: string): number {
  const x = a.split('|');
  const y = b.split('|');
  if (x[0] !== y[0]) return LOOK_PARTS.length;
  return LOOK_PARTS.reduce((n, _, i) => n + (x[i + 1] !== y[i + 1] ? 1 : 0), 0);
}

/** Una semilla cuyo look se parezca lo menos posible a los que se quieren evitar (el actual y los últimos
 * videos). Prueba varias y se queda con la más distinta. `random` se puede pasar para tests. */
export function freshSeed(spec: Pick<MotionSpec, 'style' | 'look'>, avoid: string[], random: () => number = Math.random): number {
  let best = Math.floor(random() * 1_000_000);
  let bestScore = -1;
  for (let i = 0; i < 24; i++) {
    const seed = Math.floor(random() * 1_000_000);
    const sig = lookSignature({ ...spec, seed });
    // Lo más reciente pesa más: `avoid` viene del más nuevo al más viejo.
    const score = avoid.length === 0 ? LOOK_PARTS.length : Math.min(...avoid.map((a, k) => lookDistance(sig, a) + Math.min(k, 3) * 0.25));
    if (score > bestScore) {
      best = seed;
      bestScore = score;
    }
  }
  return best;
}

/** El look en palabras, para mostrarlo en el panel («Barrido de color · Rebote · Cintas»). Omite lo clásico. */
export function lookSummary(spec: Pick<MotionSpec, 'style' | 'seed' | 'look'>): string {
  const l = resolveLook(spec);
  const parts: string[] = [];
  if (l.cut !== 'estilo') parts.push(LOOK_CUT_LABEL[l.cut]);
  if (l.entry !== 'estilo') parts.push(LOOK_ENTRY_LABEL[l.entry]);
  if (l.texture !== 'ninguna') parts.push(LOOK_TEXTURE_LABEL[l.texture]);
  if (l.deco !== 'ninguno') parts.push(LOOK_DECO_LABEL[l.deco]);
  if (l.camera !== 'empuje') parts.push(`Cámara: ${LOOK_CAMERA_LABEL[l.camera].toLowerCase()}`);
  if (l.kicker !== 'pildora') parts.push(`Etiqueta: ${LOOK_KICKER_LABEL[l.kicker].toLowerCase()}`);
  return parts.length ? parts.join(' · ') : 'Clásico del estilo';
}

/** ¿Alguna parte del look la decide la semilla? (si no, «Sorpréndeme» no tendría qué cambiar). */
export const lookHasAuto = (look: MotionLook): boolean => LOOK_PARTS.some((p) => look[p] === LOOK_AUTO_VALUE);
