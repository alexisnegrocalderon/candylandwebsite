/* Dosier de tragos del aniversario (Mansión Playroom): insumos, recetas y stock
 * de partida, transcritos de la tabla y la infografía de la barra.
 *
 * Es una CARGA INICIAL: el importador del panel (Admin → Stock de Barra → «Cargar
 * dosier») la compara con lo que ya hay y propone qué crear. Después todo se edita
 * a mano en el panel (insumos, recetas, ml, stock). Las medidas están en ml
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
  /** Nombre del trago como en el dosier. */
  product: string;
  /** Otros nombres con que puede estar en la Carta. */
  aliases?: string[];
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

export const DOSIER_INSUMOS: DosierInsumo[] = [
  spirit('aperol', 'Aperol', { amount: 1.5 * 750, from: '1,5 botellas (supuse 750 ml)' }),
  spirit('ramazzotti', 'Ramazzotti'),
  mixer('espumante', 'Espumante', 750, { amount: 6 * 750, from: '6 botellas de 750 ml' }),
  mixer('agua', 'Agua mineral', 1500),
  spirit('pisco', 'Pisco Mistral 35 / Nobel', { amount: 4.4 * 1000, from: '4 botellas de 1 L + 0,4 abierta (Mistral 35)' }),
  mixer('bebida', 'Bebida de mezcla (cola, tónica…)', 1500, { amount: 6 * 1500 + 8 * 350 + 2 * 1500, from: 'Coca-Cola 1,5 L ×6 + latas 350 cc ×8 + tónica 1,5 L ×2' }, [350, 1500]),
  spirit('gin', 'Gin Beefeater', { amount: 1.4 * 750, from: '1 botella + 0,4 abierta (supuse 750 ml)' }),
  mixer('pulpa_tropical', 'Pulpa tropical (Tropical Gin)', 1000),
  { key: 'redbull', name: 'Red Bull Tropical (lata)', unit: 'un', containerSize: 1, containerLabel: 'lata', sizes: [], alertDrinks: 10, stock: { amount: 6, from: '6 Red Bull Yellow (supuse latas sueltas)' } },
  mixer('ginger_ale', 'Ginger Ale', 1500),
  spirit('johnnie_walker', 'Whisky Johnnie Walker'),
  spirit('tequila', 'Tequila Olmeca'),
  spirit('shot_licor', 'Fireball / Jägermeister (shots)', { amount: 750, from: '1 Jäger (supuse 750 ml)' }),
  mixer('pulpa_hibiscus', 'Pulpa de hibiscus', 1000),
  mixer('limon', 'Jugo de limón', 1000),
  mixer('sprite', 'Sprite', 1500, { amount: 1500, from: '1 Sprite 1,5 L' }),
  spirit('ron', 'Ron blanco', { amount: 3 * 750, from: '3 Bacardí blanco (el dosier dice Havana; supuse 750 ml)' }),
  mixer('goma', 'Goma', 1000),
  mixer('sirope_arandanos', 'Sirope de arándanos', 1000),
  mixer('sirope_manzana', 'Sirope de manzana verde', 1000),
  mixer('pulpa_arandanos', 'Pulpa de arándanos', 1000),
];

/** 1 oz = 30 ml. */
const oz = (n: number) => n * 30;

export const DOSIER_RECETAS: DosierReceta[] = [
  { product: 'Aperol Spritz', glass: 'copa', lines: [{ insumo: 'aperol', amount: oz(2) }, { insumo: 'espumante', amount: oz(3) }, { insumo: 'agua', amount: oz(1) }] },
  { product: 'Ramazzotti', aliases: ['Ramazzotti Spritz'], glass: 'copa', lines: [{ insumo: 'ramazzotti', amount: oz(2) }, { insumo: 'espumante', amount: oz(3) }, { insumo: 'agua', amount: oz(1) }] },
  { product: 'Piscolón', aliases: ['Piscolon'], glass: 'vaso', lines: [{ insumo: 'pisco', amount: oz(3) }, { insumo: 'bebida', amount: 200 }] },
  { product: 'Tropical Gin RedBull', aliases: ['Tropical Gin Red Bull'], glass: 'copa', lines: [{ insumo: 'gin', amount: oz(2) }, { insumo: 'pulpa_tropical', amount: oz(1) }, { insumo: 'redbull', amount: 1 }] },
  { product: 'Tropical Gin con Pulpa', glass: 'copa', lines: [{ insumo: 'gin', amount: oz(2) }, { insumo: 'pulpa_tropical', amount: oz(1) }, { insumo: 'ginger_ale', amount: 200 }] },
  { product: 'Johnnie Walker + Bebida', aliases: ['Johnnie Walker', 'Johnnie Walker con Bebida'], glass: 'vaso', lines: [{ insumo: 'johnnie_walker', amount: oz(2) }, { insumo: 'bebida', amount: 200, estimated: true }] },
  { product: 'Shot Tequila Olmeca', aliases: ['Shot Tequila'], glass: 'shot', lines: [{ insumo: 'tequila', amount: oz(1) }] },
  { product: 'Trío Shots', aliases: ['Trio Shots', 'Trío de Shots'], glass: 'shot', lines: [{ insumo: 'shot_licor', amount: oz(3) }] },
  {
    product: 'PlayRoom', aliases: ['Playroom'], glass: 'copa',
    lines: [{ insumo: 'gin', amount: oz(2) }, { insumo: 'pulpa_hibiscus', amount: oz(2) }, { insumo: 'limon', amount: oz(1) }, { insumo: 'sprite', amount: 150, estimated: true }],
  },
  {
    product: 'Mojito Candy', glass: 'vaso', glassAssumed: true,
    lines: [
      { insumo: 'ron', amount: oz(3) }, { insumo: 'limon', amount: oz(0.5) }, { insumo: 'goma', amount: oz(0.5) },
      { insumo: 'sirope_arandanos', amount: oz(1) }, { insumo: 'sirope_manzana', amount: oz(0.5) }, { insumo: 'ginger_ale', amount: oz(4) },
    ],
  },
  {
    product: 'Toxic Daikiri', aliases: ['Toxic Daiquiri'], glass: 'vaso', glassAssumed: true,
    lines: [
      { insumo: 'ron', amount: oz(3) }, { insumo: 'limon', amount: oz(1) }, { insumo: 'goma', amount: oz(0.5) },
      { insumo: 'sirope_arandanos', amount: oz(0.5) }, { insumo: 'sirope_manzana', amount: oz(0.5) },
    ],
  },
  { product: 'Mocktail Candy', aliases: ['Mocktail Candy (sin alcohol)'], glass: 'vaso', glassAssumed: true, lines: [{ insumo: 'pulpa_arandanos', amount: oz(2) }, { insumo: 'limon', amount: oz(1) }, { insumo: 'agua', amount: 200 }] },
  { product: 'Mocktail Toxic', aliases: ['Mocktail Toxic (sin alcohol)'], glass: 'vaso', glassAssumed: true, lines: [{ insumo: 'pulpa_hibiscus', amount: oz(2) }, { insumo: 'limon', amount: oz(1) }, { insumo: 'agua', amount: 200 }] },
];

/** Lo que hay que confirmar o que no se pudo cargar: se muestra antes de aplicar. */
export const DOSIER_SUPUESTOS: string[] = [
  'Piscolón: la tabla dice 200 ml de bebida y la infografía 300 ml. Cargué 200 ml (tabla); se edita en la receta.',
  'Mojito Candy: la tabla dice 3 oz de ron y la infografía 2 oz. Cargué 3 oz (tabla).',
  'Mocktail Candy y Toxic: la infografía menciona 1 oz de goma que la tabla no tiene. Cargué lo de la tabla (sin goma).',
  'Johnnie Walker + Bebida (200 ml de bebida) y PlayRoom (150 ml de Sprite) no traen la medida del relleno: son estimaciones mías.',
  'Mojito Candy, Toxic Daikiri y los mocktails no dicen el vaso: puse vaso 500 ml.',
  'El dosier pide Ron Blanco Havana y en tu stock hay Bacardí blanco: conté el Bacardí blanco como «Ron blanco».',
  'Los tamaños de botella que no dijiste (Aperol, Gin, Jäger, Bacardí…) los supuse de 750 ml.',
  'No se descuentan (sin medida de compra): hierbabuena, bitter de naranja, pepino y el hielo (frappé, cubos).',
  'Del stock no cargué lo que no entra en ninguna receta (Peroni, Score, Toro Bayo, Gatorlite, José Cuervo, Jack Daniels, Disco, Bacardí añejo y pro, Triple sec) ni el «alto de litro» (el dosier pide Mistral 35 o Nobel).',
  'La infografía tiene Cuba Libre y Jack Daniels con bebida, y shots de Jägermeister y Fireball sueltos, que no están en la tabla: no los cargué.',
];

// --- Plan de carga ---

const stripGlass = (name: string) => normalizeName(name.replace(/\([^)]*\)/g, ''));

export interface DosierPlan {
  insumos: { key: string; name: string; action: 'crear' | 'existe'; id: number | null; stock: { amount: number; from: string } | null; loadStock: boolean }[];
  recetas: {
    product: string; productId: number | null; productName: string | null; glass: GlassId; glassAssumed: boolean;
    action: 'cargar' | 'ya_tiene' | 'sin_producto'; lines: DosierLinea[];
  }[];
}

/** Qué haría cargar el dosier en este evento. No toca nada: solo compara.
 * - Un insumo que ya existe (mismo nombre) no se vuelve a crear.
 * - El stock de partida solo se carga a insumos sin ningún movimiento (nunca pisa un stock en uso).
 * - Una receta solo se carga si el trago no tiene (o si se pide reemplazarlas). */
export function planDosier(input: {
  insumos: { id: number; name: string }[];
  productos: { id: number; name: string }[];
  insumosConMovimientos: Set<number>;
  productosConReceta: Set<number>;
  reemplazarRecetas?: boolean;
}): DosierPlan {
  const insumoByName = new Map(input.insumos.map((i) => [normalizeName(i.name), i.id]));
  const productByName = new Map<string, { id: number; name: string }>();
  for (const p of input.productos) if (!productByName.has(stripGlass(p.name))) productByName.set(stripGlass(p.name), p);

  return {
    insumos: DOSIER_INSUMOS.map((d) => {
      const id = insumoByName.get(normalizeName(d.name)) ?? null;
      return {
        key: d.key, name: d.name, action: id === null ? 'crear' : 'existe', id,
        stock: d.stock ?? null, loadStock: !!d.stock && (id === null || !input.insumosConMovimientos.has(id)),
      };
    }),
    recetas: DOSIER_RECETAS.map((r) => {
      const found = [r.product, ...(r.aliases ?? [])].map((n) => productByName.get(stripGlass(n))).find(Boolean) ?? null;
      const action = !found ? 'sin_producto' : input.productosConReceta.has(found.id) && !input.reemplazarRecetas ? 'ya_tiene' : 'cargar';
      return { product: r.product, productId: found?.id ?? null, productName: found?.name ?? null, glass: r.glass, glassAssumed: !!r.glassAssumed, action, lines: r.lines };
    }),
  };
}
