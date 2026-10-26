/* Dosier de tragos del aniversario (Mansión Playroom): insumos, preparaciones y
 * stock de partida, transcritos de la tabla, la infografía de la barra y la lista
 * de stock.
 *
 * Una PREPARACIÓN del dosier (Aperol Spritz, Piscolón…) no es un producto de la
 * Carta: es la base con que se preparan los tragos que sí se venden (Aperol,
 * Piscolón Mistral 35, Piscolón Mistral Nobel…). El importador del panel sugiere a
 * qué productos de la Carta aplica cada una y la copia a los que elijas; después la
 * receta de cada producto se edita sola (insumo y ml).
 *
 * Es una CARGA INICIAL: todo se edita a mano en el panel. Las medidas están en ml
 * (1 oz = 30 ml, ver JIGGER_ML en shared/insumos.ts).
 *
 * Lógica pura, sin base de datos (shared/dosier.test.ts). */
import { normalizeName, type GlassId, type InsumoUnit } from './insumos';

export interface DosierInsumo {
  key: string;
  name: string;
  unit: InsumoUnit;
  /** Envase de compra (lista de compras y costo). */
  containerSize: number;
  containerLabel: string;
  /** Tamaños de botella con que llega. */
  sizes: number[];
  alertDrinks: number;
  /** Stock de partida en la unidad del insumo, con de dónde sale (de la lista de stock de la barra). */
  stock?: { amount: number; from: string };
}

export interface DosierLinea {
  insumo: string;
  /** ml (o unidades) por trago. */
  amount: number;
  /** El dosier no da la medida: es un cálculo mío, hay que confirmarlo. */
  estimated?: boolean;
}

export interface DosierReceta {
  /** Nombre de la preparación como en el dosier. */
  product: string;
  /** `preparacion`: base de tragos de la Carta. `tal_cual`: se vende como viene (1 unidad por venta). */
  kind: 'preparacion' | 'tal_cual';
  /** Otros nombres con que puede estar en la Carta. */
  aliases?: string[];
  /** Palabras que debe tener el nombre de un producto de la Carta para sugerírselo (todas, sin tildes ni mayúsculas). */
  palabras: string[];
  /** Si el nombre tiene alguna de estas, no se sugiere. */
  excluir?: string[];
  glass: GlassId;
  /** El dosier no dice el vaso: supuesto a confirmar. */
  glassAssumed?: boolean;
  lines: DosierLinea[];
}

const spirit = (key: string, name: string, stock?: DosierInsumo['stock'], sizes = [750, 1000]): DosierInsumo => ({
  key, name, unit: 'ml', containerSize: sizes[0], containerLabel: 'botella', sizes, alertDrinks: 15, stock,
});
const mixer = (key: string, name: string, containerSize: number, stock?: DosierInsumo['stock'], sizes = [containerSize]): DosierInsumo => ({
  key, name, unit: 'ml', containerSize, containerLabel: containerSize >= 1000 ? 'botella' : 'envase', sizes, alertDrinks: 15, stock,
});
/** Lo que se vende por unidad (cerveza, lata): 1 por venta. */
const unidad = (key: string, name: string, label: string, stock?: DosierInsumo['stock']): DosierInsumo => ({
  key, name, unit: 'un', containerSize: 1, containerLabel: label, sizes: [], alertDrinks: 10, stock,
});

export const DOSIER_INSUMOS: DosierInsumo[] = [
  spirit('aperol', 'Aperol', { amount: 1.5 * 750, from: '1,5 botellas (supuse 750 ml)' }),
  spirit('ramazzotti', 'Ramazzotti'),
  mixer('espumante', 'Espumante', 750, { amount: 6 * 750, from: '6 botellas de 750 ml' }),
  mixer('agua', 'Agua mineral', 1500),
  spirit('pisco', 'Pisco Mistral 35 / Nobel', { amount: 4.4 * 1000, from: '4 botellas de 1 L + 0,4 abierta (Mistral 35)' }),
  spirit('pisco_alto', 'Pisco Alto (1 L)', { amount: 1000, from: '«1 alto de litro» (supuse Pisco Alto del Carmen de 1 L)' }, [1000, 750]),
  mixer('bebida', 'Bebida de mezcla (cola, tónica…)', 1500, { amount: 6 * 1500 + 8 * 350 + 2 * 1500, from: 'Coca-Cola 1,5 L ×6 + latas 350 cc ×8 + tónica 1,5 L ×2' }, [350, 1500]),
  spirit('gin', 'Gin Beefeater', { amount: 1.4 * 750, from: '1 botella + 0,4 abierta (supuse 750 ml)' }),
  mixer('pulpa_tropical', 'Pulpa tropical (Tropical Gin)', 1000),
  unidad('redbull', 'Red Bull Tropical (lata)', 'lata', { amount: 6, from: '6 Red Bull Yellow (supuse latas sueltas)' }),
  mixer('ginger_ale', 'Ginger Ale', 1500),
  spirit('johnnie_walker', 'Whisky Johnnie Walker'),
  spirit('jack_daniels', 'Jack Daniels', { amount: 0.2 * 750, from: '0,2 abierta (supuse 750 ml)' }),
  spirit('tequila', 'Tequila Olmeca'),
  spirit('cuervo_dorado', 'José Cuervo dorado', { amount: 1.2 * 750, from: '1 botella + 0,2 abierta (supuse 750 ml)' }),
  spirit('cuervo_silver', 'José Cuervo silver', { amount: 0.4 * 750, from: '0,4 abierta (supuse 750 ml)' }),
  spirit('shot_licor', 'Fireball / Jägermeister (shots)', { amount: 750, from: '1 Jäger (supuse 750 ml)' }),
  spirit('triple_sec', 'Triple sec', { amount: 1.4 * 750, from: '1 botella + 0,4 abierta (supuse 750 ml)' }),
  spirit('bacardi_anejo', 'Bacardí añejo', { amount: 750, from: '1 botella (supuse 750 ml)' }),
  spirit('bacardi_pro', 'Bacardí pro', { amount: 0.9 * 750, from: '0,9 abierta (supuse 750 ml)' }),
  spirit('disco', 'Disco (¿qué es?)', { amount: 750, from: '«1 Disco» (no sé qué es: confírmalo; supuse 750 ml)' }),
  mixer('pulpa_hibiscus', 'Pulpa de hibiscus', 1000),
  mixer('limon', 'Jugo de limón', 1000),
  mixer('sprite', 'Sprite', 1500, { amount: 1500, from: '1 Sprite 1,5 L' }),
  spirit('ron', 'Ron blanco', { amount: 3 * 750, from: '3 Bacardí blanco (el dosier dice Havana; supuse 750 ml)' }),
  mixer('goma', 'Goma', 1000),
  mixer('sirope_arandanos', 'Sirope de arándanos', 1000),
  mixer('sirope_manzana', 'Sirope de manzana verde', 1000),
  mixer('pulpa_arandanos', 'Pulpa de arándanos', 1000),
  unidad('peroni', 'Peroni', 'botella', { amount: 24, from: '24 Peroni alcohol' }),
  unidad('peroni_zero', 'Peroni Sin Alcohol', 'botella', { amount: 3, from: '3 Peroni Zero' }),
  unidad('score', 'Energética Score', 'lata', { amount: 3, from: '3 Score' }),
  unidad('torobayo', 'Kunstmann Torobayo', 'botella', { amount: 2, from: '2 Torobayo' }),
  unidad('gatorlite', 'Gatorlite Isotónica', 'botella', { amount: 12, from: '12 Gatorlite' }),
];

/** 1 oz = 30 ml. */
const oz = (n: number) => n * 30;

export const DOSIER_RECETAS: DosierReceta[] = [
  { product: 'Aperol Spritz', kind: 'preparacion', palabras: ['aperol'], glass: 'copa', lines: [{ insumo: 'aperol', amount: oz(2) }, { insumo: 'espumante', amount: oz(3) }, { insumo: 'agua', amount: oz(1) }] },
  { product: 'Ramazzotti', kind: 'preparacion', palabras: ['ramazzotti'], glass: 'copa', lines: [{ insumo: 'ramazzotti', amount: oz(2) }, { insumo: 'espumante', amount: oz(3) }, { insumo: 'agua', amount: oz(1) }] },
  { product: 'Piscolón', kind: 'preparacion', palabras: ['piscolon'], glass: 'vaso', lines: [{ insumo: 'pisco', amount: oz(3) }, { insumo: 'bebida', amount: 200 }] },
  { product: 'Cuba Libre', kind: 'preparacion', palabras: ['cuba libe'], glass: 'vaso', glassAssumed: true, lines: [{ insumo: 'ron', amount: oz(3) }, { insumo: 'bebida', amount: 300 }] },
  { product: 'Tropical Gin RedBull', kind: 'preparacion', aliases: ['Tropical Gin Red Bull'], palabras: ['tropical gin'], glass: 'copa', lines: [{ insumo: 'gin', amount: oz(2) }, { insumo: 'pulpa_tropical', amount: oz(1) }, { insumo: 'redbull', amount: 1 }] },
  { product: 'Tropical Gin con Pulpa', kind: 'preparacion', palabras: ['tropical gin', 'pulpa'], glass: 'copa', lines: [{ insumo: 'gin', amount: oz(2) }, { insumo: 'pulpa_tropical', amount: oz(1) }, { insumo: 'ginger_ale', amount: 200 }] },
  { product: 'Johnnie Walker + Bebida', kind: 'preparacion', palabras: ['johnnie'], glass: 'vaso', lines: [{ insumo: 'johnnie_walker', amount: oz(2) }, { insumo: 'bebida', amount: 200, estimated: true }] },
  { product: 'Jack Daniels + Bebida', kind: 'preparacion', palabras: ['jack daniel'], glass: 'vaso', glassAssumed: true, lines: [{ insumo: 'jack_daniels', amount: oz(2) }, { insumo: 'bebida', amount: 200, estimated: true }] },
  { product: 'Shot Tequila Olmeca', kind: 'preparacion', palabras: ['olmeca'], glass: 'shot', lines: [{ insumo: 'tequila', amount: oz(1) }] },
  { product: 'Shot José Cuervo Reposado', kind: 'preparacion', palabras: ['cuervo', 'reposado'], glass: 'shot', lines: [{ insumo: 'cuervo_dorado', amount: oz(1) }] },
  { product: 'Shot José Cuervo Silver', kind: 'preparacion', palabras: ['cuervo', 'silver'], glass: 'shot', lines: [{ insumo: 'cuervo_silver', amount: oz(1) }] },
  { product: 'Shot Jägermeister', kind: 'preparacion', palabras: ['jagermeister'], excluir: ['trio'], glass: 'shot', lines: [{ insumo: 'shot_licor', amount: oz(1) }] },
  { product: 'Shot Fireball', kind: 'preparacion', palabras: ['fireball'], excluir: ['trio', 'room'], glass: 'shot', lines: [{ insumo: 'shot_licor', amount: oz(1) }] },
  { product: 'Trío Shots', kind: 'preparacion', palabras: ['trio'], glass: 'shot', lines: [{ insumo: 'shot_licor', amount: oz(3) }] },
  {
    product: 'PlayRoom', kind: 'preparacion', palabras: ['playroom'], excluir: ['aros', 'cover', 'cumplea', 'hand'], glass: 'copa',
    lines: [{ insumo: 'gin', amount: oz(2) }, { insumo: 'pulpa_hibiscus', amount: oz(2) }, { insumo: 'limon', amount: oz(1) }, { insumo: 'sprite', amount: 150, estimated: true }],
  },
  {
    product: 'Mojito Candy', kind: 'preparacion', palabras: ['mojito', 'sabores'], glass: 'vaso', glassAssumed: true,
    lines: [
      { insumo: 'ron', amount: oz(3) }, { insumo: 'limon', amount: oz(0.5) }, { insumo: 'goma', amount: oz(0.5) },
      { insumo: 'sirope_arandanos', amount: oz(1) }, { insumo: 'sirope_manzana', amount: oz(0.5) }, { insumo: 'ginger_ale', amount: oz(4) },
    ],
  },
  {
    product: 'Toxic Daikiri', kind: 'preparacion', aliases: ['Toxic Daiquiri'], palabras: ['daikiri'], glass: 'vaso', glassAssumed: true,
    lines: [
      { insumo: 'ron', amount: oz(3) }, { insumo: 'limon', amount: oz(1) }, { insumo: 'goma', amount: oz(0.5) },
      { insumo: 'sirope_arandanos', amount: oz(0.5) }, { insumo: 'sirope_manzana', amount: oz(0.5) },
    ],
  },
  { product: 'Mocktail Candy', kind: 'preparacion', palabras: ['mocktail', 'candy'], glass: 'vaso', glassAssumed: true, lines: [{ insumo: 'pulpa_arandanos', amount: oz(2) }, { insumo: 'limon', amount: oz(1) }, { insumo: 'agua', amount: 200 }] },
  { product: 'Mocktail Toxic', kind: 'preparacion', palabras: ['mocktail', 'toxic'], glass: 'vaso', glassAssumed: true, lines: [{ insumo: 'pulpa_hibiscus', amount: oz(2) }, { insumo: 'limon', amount: oz(1) }, { insumo: 'agua', amount: 200 }] },
  // Lo que se vende tal cual: cada venta gasta 1 unidad del inventario.
  { product: 'Peroni', kind: 'tal_cual', palabras: ['peroni'], excluir: ['sin alcohol', 'zero'], glass: 'vaso', lines: [{ insumo: 'peroni', amount: 1 }] },
  { product: 'Peroni Sin Alcohol', kind: 'tal_cual', palabras: ['peroni', 'sin alcohol'], glass: 'vaso', lines: [{ insumo: 'peroni_zero', amount: 1 }] },
  { product: 'Energética Score', kind: 'tal_cual', palabras: ['score'], glass: 'vaso', lines: [{ insumo: 'score', amount: 1 }] },
  { product: 'Kunstmann Torobayo', kind: 'tal_cual', palabras: ['torobayo'], glass: 'vaso', lines: [{ insumo: 'torobayo', amount: 1 }] },
  { product: 'Gatorlite Isotónica', kind: 'tal_cual', palabras: ['gatorlite'], glass: 'vaso', lines: [{ insumo: 'gatorlite', amount: 1 }] },
];

/** Lo que hay que confirmar o que no se pudo cargar: se muestra antes de aplicar. */
export const DOSIER_SUPUESTOS: string[] = [
  'Las preparaciones no son productos de la Carta: son la base de los que sí se venden. Elige a qué productos aplica cada una (ya te sugiero los que coinciden por nombre) y queda una receta propia en cada producto, editable.',
  'Piscolón: la tabla dice 200 ml de bebida y la infografía 300 ml. Cargué 200 ml (tabla). Cuba Libre sí lleva 300 ml (infografía).',
  'Mojito Candy: la tabla dice 3 oz de ron y la infografía 2 oz. Cargué 3 oz (tabla). Un Mojito Tradicional no está en el dosier.',
  'Mocktails: la infografía menciona 1 oz de goma que la tabla no tiene. Cargué lo de la tabla (sin goma).',
  'Johnnie Walker, Jack Daniels (200 ml de bebida) y PlayRoom (150 ml de Sprite) no traen la medida del relleno: son estimaciones mías. Jack Daniels sale de la infografía (2 oz).',
  'Mojito Candy, Toxic Daikiri, Cuba Libre, Jack Daniels y los mocktails no dicen el vaso: puse vaso 500 ml.',
  'El dosier pide Ron Blanco Havana y en tu stock hay Bacardí blanco: conté el Bacardí blanco como «Ron blanco». José Cuervo dorado lo usé para el shot Reposado.',
  'Los tamaños de botella que no dijiste los supuse de 750 ml. «1 alto de litro» lo cargué como Pisco Alto de 1 L y «1 Disco» no sé qué es (queda como «Disco (¿qué es?)»).',
  'No cargué la «promo Pink and Blue» (no sé qué incluye). No se descuentan hierbabuena, bitter, pepino ni hielo (sin medida de compra).',
  'Los tragos que no están en el dosier (Té, Gin con Gin, Lucky Click, Mojito Tradicional, Piscola sin alcohol…) quedan sin receta: no gastan insumos hasta que les armes una en la pestaña Recetas.',
];

// --- Plan de carga ---

export interface DosierProducto { id: number; name: string; groupName?: string | null }

const stripGlass = (name: string) => normalizeName(name.replace(/\([^)]*\)/g, ''));

/** Qué tan bien calza un producto de la Carta con una preparación (0 = no calza). El nombre
 * idéntico gana siempre; si no, que estén todas las palabras y ninguna de las que se excluyen. */
export function puntajeProducto(receta: DosierReceta, productName: string): number {
  const name = stripGlass(productName);
  if ([receta.product, ...(receta.aliases ?? [])].some((n) => stripGlass(n) === name)) return 10_000;
  if (receta.excluir?.some((x) => name.includes(normalizeName(x)))) return 0;
  const words = receta.palabras.map(normalizeName);
  if (words.length === 0 || !words.every((w) => name.includes(w))) return 0;
  return words.length * 100 + words.join('').length;
}

export interface DosierPlan {
  insumos: { key: string; name: string; action: 'crear' | 'existe'; id: number | null; stock: { amount: number; from: string } | null; loadStock: boolean }[];
  recetas: {
    product: string; kind: DosierReceta['kind']; glass: GlassId; glassAssumed: boolean; lines: DosierLinea[];
    /** Productos de la Carta a los que se la sugiero (cada producto, a una sola preparación). */
    sugeridos: number[];
  }[];
  /** Los tragos de la Carta entre los que se puede elegir. */
  productos: { id: number; name: string; groupName: string | null; tieneReceta: boolean }[];
}

/** Qué haría cargar el dosier en este evento. No toca nada: solo compara.
 * - Un insumo que ya existe (mismo nombre) no se vuelve a crear.
 * - El stock de partida solo se carga a insumos sin ningún movimiento (nunca pisa un stock en uso).
 * - Cada producto se sugiere a la preparación que mejor calza con su nombre. */
export function planDosier(input: {
  insumos: { id: number; name: string }[];
  productos: DosierProducto[];
  insumosConMovimientos: Set<number>;
  productosConReceta: Set<number>;
}): DosierPlan {
  const insumoByName = new Map(input.insumos.map((i) => [normalizeName(i.name), i.id]));
  const suggested = new Map<string, number[]>();
  for (const p of input.productos) {
    let best: { product: string; score: number } | null = null;
    for (const r of DOSIER_RECETAS) {
      const score = puntajeProducto(r, p.name);
      if (score > 0 && (!best || score > best.score)) best = { product: r.product, score };
    }
    if (best) suggested.set(best.product, [...(suggested.get(best.product) ?? []), p.id]);
  }

  return {
    insumos: DOSIER_INSUMOS.map((d) => {
      const id = insumoByName.get(normalizeName(d.name)) ?? null;
      return {
        key: d.key, name: d.name, action: id === null ? 'crear' : 'existe', id,
        stock: d.stock ?? null, loadStock: !!d.stock && (id === null || !input.insumosConMovimientos.has(id)),
      };
    }),
    recetas: DOSIER_RECETAS.map((r) => ({
      product: r.product, kind: r.kind, glass: r.glass, glassAssumed: !!r.glassAssumed, lines: r.lines, sugeridos: suggested.get(r.product) ?? [],
    })),
    productos: input.productos.map((p) => ({ id: p.id, name: p.name, groupName: p.groupName ?? null, tieneReceta: input.productosConReceta.has(p.id) })),
  };
}
