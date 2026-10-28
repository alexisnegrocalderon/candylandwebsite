/* Stock de la barra por INSUMOS (ron, vodka, jugo, hielo…), no por trago.
 *
 * Un trago de la carta (`ticketTypes` consumo) tiene una receta: cuánto gasta
 * de cada insumo. Cada venta en /caja descuenta del insumo, así dos tragos que
 * usan la misma base gastan del mismo contador, y "cuántos tragos quedan" sale
 * del insumo que se acaba primero. El stock de cada insumo es la suma de su
 * libro de movimientos (carga, compra, venta, anulación, conteo…).
 *
 * Lógica pura, sin base de datos ni React (shared/insumos.test.ts). */

export type InsumoUnit = 'ml' | 'g' | 'un';

export const INSUMO_UNITS: { id: InsumoUnit; label: string; short: string }[] = [
  { id: 'ml', label: 'Mililitros', short: 'ml' },
  { id: 'g', label: 'Gramos', short: 'g' },
  { id: 'un', label: 'Unidades', short: 'un' },
];

export interface Insumo {
  id: number;
  name: string;
  unit: InsumoUnit;
  /** Cuánto trae un envase (botella de 750 ml, bolsa de 2000 g, pack de 24 un). */
  containerSize: number;
  /** "botella", "lata", "bolsa", "pack"… */
  containerLabel: string;
  /** Tamaños de envase con que llega este insumo (botellas de 750, 1000 y 1500 ml).
   * `containerSize` es el de compra (lista de compras y costo); siempre está incluido. */
  sizes?: number[] | null;
  costPerContainer?: number | null;
  /** Avisa cuando este insumo alcance para menos de esta cantidad de tragos. 0 = no avisa. */
  alertDrinks: number;
}

export interface RecetaLinea {
  ticketTypeId: number;
  insumoId: number;
  /** Cuánto gasta UN trago, en la unidad del insumo. */
  amount: number;
  /** El vaso en que sale este trago (todas las líneas de un trago comparten el mismo). Vacío = vaso. */
  glass?: string | null;
}

/** Vasos en que sale un trago. Cada trago viene en su vaso (unos en vaso, otros en copa, otros en shot)
 * y se define en su receta: no es una opción que elija el cliente al comprar. */
export type GlassId = 'vaso' | 'copa' | 'copa_xl' | 'shot' | 'botella';
export const GLASSES: { id: GlassId; label: string; ml: number; emoji: string }[] = [
  { id: 'vaso', label: 'Vaso', ml: 500, emoji: '🥃' },
  { id: 'copa', label: 'Copa', ml: 400, emoji: '🍷' },
  // La copa grande del Tropical Gin XL.
  { id: 'copa_xl', label: 'Copa XL', ml: 600, emoji: '🍷' },
  { id: 'shot', label: 'Shot', ml: 30, emoji: '🥂' },
  // Lo que se vende tal cual, en su botella o lata (cerveza, bebida, energética): no se sirve en un vaso.
  { id: 'botella', label: 'Botella o lata', ml: 0, emoji: '🍺' },
];
export const DEFAULT_GLASS: GlassId = 'vaso';

export const glassInfo = (id: string | null | undefined) => GLASSES.find((g) => g.id === (id || DEFAULT_GLASS));
const glassKey = (r: { glass?: string | null }) => r.glass || DEFAULT_GLASS;

/** Vaso(s) con receta de un trago (en la práctica uno solo). */
export function glassesDeProducto(recetas: { ticketTypeId: number; glass?: string | null }[], ticketTypeId: number): string[] {
  const present = new Set(recetas.filter((r) => r.ticketTypeId === ticketTypeId).map(glassKey));
  return [...GLASSES.map((g) => g.id).filter((g) => present.has(g)), ...Array.from(present).filter((g) => !GLASSES.some((x) => x.id === g))];
}

/** La receta de un trago y el vaso en que sale. */
export function recetaDe<T extends { ticketTypeId: number; glass?: string | null }>(recetas: T[], ticketTypeId: number, glass?: string | null): { glass: string; lines: T[] } {
  const glasses = glassesDeProducto(recetas, ticketTypeId);
  const chosen = glass && glasses.includes(glass) ? glass : (glasses[0] ?? DEFAULT_GLASS);
  return { glass: chosen, lines: recetas.filter((r) => r.ticketTypeId === ticketTypeId && glassKey(r) === chosen) };
}

/** La receta de cada trago, una sola por trago. */
export function recetasPrincipales<T extends { ticketTypeId: number; glass?: string | null }>(recetas: T[]): T[] {
  return Array.from(new Set(recetas.map((r) => r.ticketTypeId))).flatMap((id) => recetaDe(recetas, id).lines);
}

/** El jigger de la barra: la medida con que se sirven los destilados (30 ml = 1 onza). */
export const JIGGER_ML = 30;

/** Las recetas se guardan siempre en ml; en la barra se piensan en jiggers (1,5 jigger = 45 ml). */
export const jiggersAMl = (jiggers: number): number => Math.round(jiggers * JIGGER_ML * 100) / 100;
export const mlAJiggers = (ml: number): number => Math.round((ml / JIGGER_ML) * 100) / 100;

/** ¿Esta cantidad en ml se lee bien en jiggers? (múltiplo de ¼ de jigger: 7,5 ml). */
export const esJiggerExacto = (ml: number): boolean => ml > 0 && Math.abs(ml / (JIGGER_ML / 4) - Math.round(ml / (JIGGER_ML / 4))) < 1e-6;

/** "1,5 jigger (45 ml)" para los ml que se miden en jiggers; "200 ml" para el resto. */
export function formatPorcion(amount: number, unit: InsumoUnit): string {
  if (unit === 'ml' && esJiggerExacto(amount)) {
    const j = mlAJiggers(amount);
    return `${j.toLocaleString('es-CL')} ${j === 1 ? 'jigger' : 'jiggers'} (${amount.toLocaleString('es-CL')} ml)`;
  }
  return `${amount.toLocaleString('es-CL')} ${unit}`;
}

/** Para elegir insumos tocando, se agrupan en categorías (sin tener que cargarlas a mano). */
export type CategoriaInsumo = 'licores' | 'mezclas' | 'jarabes' | 'unidades';
export const CATEGORIAS_INSUMO: { id: CategoriaInsumo; label: string; emoji: string }[] = [
  { id: 'licores', label: 'Licores', emoji: '🥃' },
  { id: 'mezclas', label: 'Bebidas y jugos', emoji: '🥤' },
  { id: 'jarabes', label: 'Jarabes y pulpas', emoji: '🍓' },
  { id: 'unidades', label: 'Unidades', emoji: '🥫' },
];

const LICORES = ['pisco', 'ron', 'gin', 'whisky', 'whiskey', 'tequila', 'aperol', 'ramazzotti', 'jack daniel', 'jager', 'fireball', 'vodka', 'triple sec', 'licor', 'bacardi', 'cuervo', 'johnnie', 'beefeater', 'espumante', 'champagne', 'campari', 'disco', 'cerveza', 'vino'];
const JARABES = ['sirope', 'jarabe', 'goma', 'pulpa', 'miel', 'azucar', 'maracuy', 'arandan', 'hibiscus', 'frambuesa'];

/** ¿El nombre trae esta palabra? Las cortas («gin», «ron») van completas para no confundir «ginger» con un licor. */
function tienePalabra(name: string, word: string): boolean {
  if (word.includes(' ')) return name.includes(word);
  return name.split(/[^a-z0-9]+/).some((t) => (word.length <= 4 ? t === word : t.startsWith(word)));
}

/** En qué categoría cae un insumo según su nombre y su unidad. */
export function categoriaInsumo(name: string, unit: InsumoUnit): CategoriaInsumo {
  if (unit !== 'ml') return 'unidades';
  const n = normalizeName(name);
  if (JARABES.some((w) => tienePalabra(n, w))) return 'jarabes';
  if (LICORES.some((w) => tienePalabra(n, w))) return 'licores';
  return 'mezclas';
}

/** Con cuánto parte un insumo al agregarlo a una receta (se ajusta con +/−): 2 jiggers de licor, ½ jigger de jarabe,
 * limón o amargo, 120 ml de bebida o jugo y 1 unidad de lo que se cuenta por unidades. */
export function cantidadInicial(name: string, unit: InsumoUnit): { jigger: boolean; value: number } {
  if (unit !== 'ml') return { jigger: false, value: 1 };
  const c = categoriaInsumo(name, unit);
  if (c === 'licores') return { jigger: true, value: 2 };
  const n = normalizeName(name);
  if (c === 'jarabes' || /\b(limon|lima|bitter|amargo)\b/.test(n)) return { jigger: true, value: 0.5 };
  return { jigger: false, value: 120 };
}

/** Cantidades rápidas para un insumo en ml, en jiggers (licores y jarabes) o en ml (bebidas y jugos). */
export const JIGGERS_RAPIDOS = [0.25, 0.5, 1, 1.5, 2, 3] as const;
export const ML_RAPIDOS = [60, 100, 120, 150, 200] as const;

/** Extras de un trago que no se miden ni llevan stock: el borde de Tajín, el hielo, la hierbabuena… Van solo
 * anotados en el producto (en `ticketTypes.metadata.extras`), así no entran al conteo de la barra ni generan avisos. */
export const HIELOS = ['Hielo en cubos', 'Hielo frappé'] as const;
export const EXTRAS_SUGERIDOS = [
  'Borde de Tajín', 'Hierbabuena (5 hojas)', 'Rodaja de limón', 'Rodaja de naranja', 'Pepino (2 rebanadas)',
  'Bitter de naranja (2 gotas)', 'Sal en el borde', 'Azúcar en el borde',
] as const;

/** Los extras guardados en el JSON `metadata` de un producto. */
export function extrasDeMetadata(metadata: unknown): string[] {
  let obj: unknown = metadata;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { return []; } }
  const raw = obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as { extras?: unknown }).extras : null;
  return Array.isArray(raw) ? raw.filter((e): e is string => typeof e === 'string').map((e) => e.trim()).filter(Boolean).slice(0, 20) : [];
}

/** El `metadata` del producto con estos extras, sin tocar nada más de lo que ya tenga (`null` si queda vacío). */
export function metadataConExtras(metadata: unknown, extras: string[]): Record<string, unknown> | null {
  let obj: unknown = metadata;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { obj = null; } }
  const base: Record<string, unknown> = obj && typeof obj === 'object' && !Array.isArray(obj) ? { ...(obj as Record<string, unknown>) } : {};
  const clean = Array.from(new Set(extras.map((e) => e.trim()).filter(Boolean))).slice(0, 20);
  if (clean.length) base.extras = clean; else delete base.extras;
  return Object.keys(base).length ? base : null;
}

/** Para qué sirve un producto de la carta: los que no son tragos (cigarros, merch, comida…) no llevan insumos. */
export const TIPOS_PRODUCTO = [
  { id: 'trago', label: 'Trago o bebida', emoji: '🍹', seccion: null, help: 'Lleva insumos: arma su receta.' },
  { id: 'comida', label: 'Comida', emoji: '🍕', seccion: 'Comida', help: 'Se vende sola, sin insumos de barra.' },
  { id: 'cigarros', label: 'Cigarros', emoji: '🚬', seccion: 'Cigarros', help: 'Se vende solo, sin insumos de barra.' },
  { id: 'merch', label: 'Merch', emoji: '🎁', seccion: 'Merch', help: 'Recuerdos y accesorios: sin insumos.' },
  { id: 'otro', label: 'Otro', emoji: '📦', seccion: null, help: 'Cualquier otra cosa que se vende sola.' },
] as const;
export type TipoProducto = (typeof TIPOS_PRODUCTO)[number]['id'];

/** ¿Este producto se vende solo (sin receta ni insumos)? Lo marcado a mano manda; si no, se deduce de la categoría y la sección. */
export function productoSinInsumos(category: string | null | undefined, groupName: string | null | undefined, metadata: unknown): boolean {
  let obj: unknown = metadata;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { obj = null; } }
  const flag = obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as { sinInsumos?: unknown }).sinInsumos : undefined;
  if (typeof flag === 'boolean') return flag;
  if (category && category !== 'consumo') return true;
  return /cigarr|merch|comida|premio|cumplea[ñn]er/i.test(groupName ?? '');
}

/** El `metadata` del producto con la marca «sin insumos» (`null` si queda vacío). */
export function metadataConSinInsumos(metadata: unknown, sinInsumos: boolean): Record<string, unknown> | null {
  let obj: unknown = metadata;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { obj = null; } }
  const base: Record<string, unknown> = obj && typeof obj === 'object' && !Array.isArray(obj) ? { ...(obj as Record<string, unknown>) } : {};
  base.sinInsumos = sinInsumos;
  return base;
}

/** Pasos de preparación guardados en el `metadata` del producto (vacío = se usan los sugeridos). */
export function pasosDeMetadata(metadata: unknown): string[] {
  let obj: unknown = metadata;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { return []; } }
  const raw = obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as { pasos?: unknown }).pasos : null;
  return Array.isArray(raw) ? raw.filter((e): e is string => typeof e === 'string').map((e) => e.trim()).filter(Boolean).slice(0, 12) : [];
}

/** Foto del trago (URL), guardada en el `metadata` del producto. */
export function fotoDeMetadata(metadata: unknown): string | null {
  let obj: unknown = metadata;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { return null; } }
  const raw = obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as { foto?: unknown }).foto : null;
  return typeof raw === 'string' && /^https:\/\//.test(raw) ? raw : null;
}

/** El `metadata` con pasos y foto (sin tocar lo demás). `undefined` = no cambiar ese campo. */
export function metadataConPreparacion(metadata: unknown, pasos: string[] | undefined, foto: string | null | undefined): Record<string, unknown> | null {
  let obj: unknown = metadata;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { obj = null; } }
  const base: Record<string, unknown> = obj && typeof obj === 'object' && !Array.isArray(obj) ? { ...(obj as Record<string, unknown>) } : {};
  if (pasos !== undefined) {
    const clean = pasos.map((p) => p.trim()).filter(Boolean).slice(0, 12).map((p) => p.slice(0, 160));
    if (clean.length) base.pasos = clean; else delete base.pasos;
  }
  if (foto !== undefined) { if (foto) base.foto = foto; else delete base.foto; }
  return Object.keys(base).length ? base : null;
}

/** Pasos de preparación armados desde la receta: hielo, borde, cada insumo en su medida, la bebida elegida y la
 * decoración. Es el punto de partida; en el editor se pueden cambiar. */
export function pasosSugeridos(input: {
  glass: string;
  lineas: { name: string; unit: InsumoUnit; amount: number; insumoId: number }[];
  extras: string[];
  opciones: OpcionGrupo[];
}): string[] {
  const g = glassInfo(input.glass);
  if (input.glass === 'botella') return ['Entregar la botella o lata bien helada.'];
  const pasos: string[] = [];
  const hielo = HIELOS.find((h) => input.extras.includes(h));
  const recipiente = input.glass === 'shot' ? 'el vaso de shot' : `${input.glass === 'vaso' ? 'el vaso' : 'la copa'}${g && g.ml ? ` de ${g.ml} ml` : ''}`;
  const borde = input.extras.filter((e) => /borde/i.test(e));
  for (const b of borde) pasos.push(`Escarchar el borde de ${recipiente} con ${b.replace(/^borde de /i, '').replace(/ en el borde$/i, '').toLowerCase().replace(/^taj[ií]n$/, 'Tajín')}.`.replace(' de el ', ' del '));
  const machacar = input.extras.filter((e) => /hierbabuena|menta/i.test(e));
  if (machacar.length) pasos.push(`Machacar suavemente ${machacar.join(' y ').toLowerCase()} en el fondo.`);
  if (input.glass !== 'shot') pasos.push(hielo === 'Hielo frappé' ? `Llenar ${recipiente} con hielo frappé.` : `Llenar ${recipiente} con hielo${hielo ? ' en cubos' : ''}.`);
  const reemplazadas = new Set(input.opciones.map((o) => o.reemplaza).filter((x): x is number => x != null));
  const relleno = (l: { name: string }) => /bebida|agua|soda|t[oó]nica|ginger|sprite|coca|red ?bull|energ/i.test(l.name);
  const medidas = input.lineas.filter((l) => !reemplazadas.has(l.insumoId) && !relleno(l));
  const rellenos = input.lineas.filter((l) => !reemplazadas.has(l.insumoId) && relleno(l));
  for (const l of medidas) {
    if (l.unit === 'ml') pasos.push(`Servir ${esJiggerExacto(l.amount) ? `${formatJiggers(mlAJiggers(l.amount))} (${l.amount} ml)` : `${l.amount} ml`} de ${l.name}.`);
    else pasos.push(`Agregar ${l.amount} ${l.unit === 'un' ? (l.amount === 1 ? 'unidad' : 'unidades') : l.unit} de ${l.name}.`);
  }
  for (const o of input.opciones) {
    const nombres = o.choices.map((c) => c.label);
    const ml = o.choices.find((c) => c.amount > 1)?.amount;
    pasos.push(`Completar con la bebida que eligió el cliente (${nombres.join(', ')})${ml ? `, unos ${ml} ml` : ''}.`);
  }
  for (const l of rellenos) pasos.push(l.unit === 'ml' ? `Completar con ${l.amount} ml de ${l.name}.` : `Completar con ${l.amount === 1 ? '1 unidad' : `${l.amount} unidades`} de ${l.name}.`);
  if (input.glass !== 'shot' && input.lineas.length > 1) pasos.push('Revolver suave con la bombilla.');
  const deco = input.extras.filter((e) => !HIELOS.includes(e as (typeof HIELOS)[number]) && !/borde|hierbabuena|menta/i.test(e));
  if (deco.length) pasos.push(`Decorar: ${deco.join(', ').toLowerCase()}.`);
  return pasos;
}

/** «3 jiggers», «1½ jigger», «½ jigger». */
export function formatJiggers(j: number): string {
  const ent = Math.floor(j + 1e-9);
  const frac = Math.round((j - ent) * 4) / 4;
  const f = frac === 0.5 ? '½' : frac === 0.25 ? '¼' : frac === 0.75 ? '¾' : '';
  const txt = `${ent > 0 ? ent : ''}${f}` || '0';
  return `${txt} ${j > 1 ? 'jiggers' : 'jigger'}`;
}

/** Cambia el hielo de un trago: cubos o frappé (uno solo), o ninguno. */
export function conHielo(extras: string[], hielo: (typeof HIELOS)[number] | null): string[] {
  const sin = extras.filter((e) => !(HIELOS as readonly string[]).includes(e));
  return hielo ? [hielo, ...sin] : sin;
}

/** Vista "por botella base": marcas qué tragos usan un insumo y cuánto. Devuelve las recetas que cambian
 * (con todas sus líneas, listas para guardar): se agrega o corrige el insumo en los tragos marcados, se quita
 * de los que ya no lo usan y no se toca nada más. Un trago sin receta parte con el vaso de siempre. */
export function aplicarUso(
  recetas: { ticketTypeId: number; insumoId: number; amount: number; glass?: string | null }[],
  insumoId: number,
  usos: { ticketTypeId: number; amount: number }[],
): { ticketTypeId: number; glass: string; lines: { insumoId: number; amount: number }[] }[] {
  const wanted = new Map(usos.filter((u) => u.amount > 0).map((u) => [u.ticketTypeId, u.amount]));
  const current = new Set(recetas.filter((r) => r.insumoId === insumoId).map((r) => r.ticketTypeId));
  const changes: { ticketTypeId: number; glass: string; lines: { insumoId: number; amount: number }[] }[] = [];
  for (const ticketTypeId of Array.from(new Set([...Array.from(current), ...Array.from(wanted.keys())]))) {
    const { glass, lines } = recetaDe(recetas, ticketTypeId);
    const before = lines.find((l) => l.insumoId === insumoId)?.amount;
    const after = wanted.get(ticketTypeId);
    if (before === after) continue;
    const others = lines.filter((l) => l.insumoId !== insumoId).map((l) => ({ insumoId: l.insumoId, amount: l.amount }));
    changes.push({ ticketTypeId, glass: lines.length ? glass : DEFAULT_GLASS, lines: after !== undefined ? [...others, { insumoId, amount: after }] : others });
  }
  return changes;
}

/** Insumos cuyo nombre se parece al de un producto: para los que se venden en su botella o lata, el insumo
 * suele llamarse igual que el producto (Kunstmann Torobayo). Los de unidades van primero si empatan. */
export function insumosParecidos<T extends { id: number; name: string; unit: InsumoUnit }>(productName: string, insumos: T[], max = 3): T[] {
  const ignorar = new Set(['sin', 'con', 'del', 'los', 'las', 'una', 'vaso', 'shot', 'botella', 'lata']);
  const palabras = (s: string) => normalizeName(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !ignorar.has(w));
  const objetivo = new Set(palabras(productName));
  return insumos
    .map((i) => ({ i, comunes: palabras(i.name).filter((w) => objetivo.has(w)).length }))
    .filter((x) => x.comunes >= 1)
    .sort((a, b) => b.comunes - a.comunes || Number(b.i.unit === 'un') - Number(a.i.unit === 'un') || a.i.name.localeCompare(b.i.name))
    .slice(0, max).map((x) => x.i);
}

/** Cuánto líquido suma una receta (solo insumos en ml) frente a la capacidad del vaso. */
export function mlDeReceta(lines: { insumoId: number; amount: number }[], unitOf: (insumoId: number) => InsumoUnit | undefined): number {
  return Math.round(lines.reduce((s, l) => s + (unitOf(l.insumoId) === 'ml' ? l.amount : 0), 0) * 100) / 100;
}

export type MovimientoKind = 'carga' | 'compra' | 'venta' | 'anulacion' | 'conteo_ajuste' | 'merma' | 'ajuste';

export const MOVIMIENTO_LABEL: Record<MovimientoKind, string> = {
  carga: 'Carga inicial',
  compra: 'Compra',
  venta: 'Venta',
  anulacion: 'Venta anulada',
  conteo_ajuste: 'Ajuste por conteo',
  merma: 'Merma',
  ajuste: 'Ajuste manual',
};

/** La botella abierta se cuenta porcionada en 10: 5/10 = a la mitad. */
export const OPEN_PORTIONS = 10;

/** Porciones que se marcan en una botella ABIERTA: del 1 al 9. Con 0 no habría botella y con 10 sería una
 * cerrada (esa se cuenta entre las cerradas). */
export const OPEN_FRACTIONS = Array.from({ length: OPEN_PORTIONS - 1 }, (_, k) => ({
  portions: k + 1,
  value: (k + 1) / OPEN_PORTIONS,
  label: String(k + 1),
}));

/** Tamaños de botella de siempre para los destilados: 750 ml, 1 L y 1,5 L. */
export const COMMON_BOTTLE_SIZES = [750, 1000, 1500] as const;

/** Tamaños de envase de un insumo, de menor a mayor (el de compra siempre está). */
export function insumoSizes(i: Pick<Insumo, 'containerSize' | 'sizes'>): number[] {
  const all = new Set<number>([...(i.sizes ?? []), i.containerSize].filter((s) => Number.isFinite(s) && s > 0));
  return Array.from(all).sort((a, b) => a - b);
}

/** "750 ml", "1 L", "1,5 L" -- como se dice en la barra. */
export function formatSize(size: number, unit: InsumoUnit): string {
  if (unit === 'ml' && size >= 1000) return `${(size / 1000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} L`;
  if (unit === 'g' && size >= 1000) return `${(size / 1000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} kg`;
  return `${size.toLocaleString('es-CL')} ${unit}`;
}

/** Botellas contadas: cerradas por tamaño y abiertas (cada una con su tamaño
 * y cuántas décimas le quedan, 0 a 10). */
export interface ConteoDetalle {
  closed: { size: number; count: number }[];
  open: { size: number; portions: number }[];
}

/** Total de un conteo con botellas de distintos tamaños. */
export function detalleATotal(d: ConteoDetalle): number {
  const closed = d.closed.reduce((s, c) => s + Math.max(0, Math.floor(c.count || 0)) * Math.max(0, c.size || 0), 0);
  const open = d.open.reduce((s, o) => s + (Math.min(OPEN_PORTIONS, Math.max(0, o.portions || 0)) / OPEN_PORTIONS) * Math.max(0, o.size || 0), 0);
  return round(closed + open);
}

/** "2 × 750 ml, 1 × 1,5 L" para la nota de una compra o carga. */
export function describirBotellas(items: { size: number; count: number }[], unit: InsumoUnit): string {
  return items.filter((i) => i.count > 0).map((i) => `${i.count} × ${formatSize(i.size, unit)}`).join(', ');
}

/** Descuadre del conteo de cierre por sobre este % de lo esperado: se avisa. */
export const DESCUADRE_PCT = 10;
/** Umbrales de aviso sobre el stock con que se abrió la noche. */
export const STOCK_PCT_STEPS = [25, 10] as const;
/** Ventana para medir el ritmo de consumo. */
export const RITMO_WINDOW_MIN = 60;

const round = (n: number) => Math.round(n * 100) / 100;

// --- Consumo y stock ---

/** Opciones que la cajera elige al vender un trago (con qué bebida va, qué variante es): cada opción gasta un insumo
 * distinto, y `reemplaza` es la línea de la receta (p. ej. «bebida de mezcla») que deja de gastarse al elegirla. */
export interface OpcionGrupo {
  id: string;
  label: string;
  reemplaza: number | null;
  choices: { id: string; label: string; insumoId: number; amount: number }[];
}

/** Las opciones guardadas en el JSON `metadata` de un producto (descarta lo mal formado). */
export function opcionesDeMetadata(metadata: unknown): OpcionGrupo[] {
  let obj: unknown = metadata;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { return []; } }
  const raw = obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as { opciones?: unknown }).opciones : null;
  if (!Array.isArray(raw)) return [];
  const out: OpcionGrupo[] = [];
  for (const g of raw.slice(0, 5)) {
    if (!g || typeof g !== 'object') continue;
    const o = g as Record<string, any>;
    const choices = (Array.isArray(o.choices) ? o.choices : []).slice(0, 12).flatMap((c: any) => (
      c && typeof c.id === 'string' && typeof c.label === 'string' && Number.isFinite(Number(c.insumoId)) && Number(c.amount) > 0
        ? [{ id: c.id.slice(0, 40), label: c.label.slice(0, 40), insumoId: Number(c.insumoId), amount: Number(c.amount) }] : []));
    if (typeof o.id !== 'string' || choices.length === 0) continue;
    out.push({ id: o.id.slice(0, 40), label: String(o.label ?? 'Opción').slice(0, 40), reemplaza: Number.isFinite(Number(o.reemplaza)) && o.reemplaza !== null ? Number(o.reemplaza) : null, choices });
  }
  return out;
}

/** El `metadata` del producto con estas opciones, sin tocar lo demás (`null` si queda vacío). */
export function metadataConOpciones(metadata: unknown, opciones: OpcionGrupo[]): Record<string, unknown> | null {
  let obj: unknown = metadata;
  if (typeof obj === 'string') { try { obj = JSON.parse(obj); } catch { obj = null; } }
  const base: Record<string, unknown> = obj && typeof obj === 'object' && !Array.isArray(obj) ? { ...(obj as Record<string, unknown>) } : {};
  const clean = opcionesDeMetadata({ opciones });
  if (clean.length) base.opciones = clean; else delete base.opciones;
  return Object.keys(base).length ? base : null;
}

/** Reemplazo de un insumo faltante «por hoy» al vender: va dentro de `opciones` de la venta como `sub:<faltante>:<reemplazo>`,
 * así viaja por la misma cola offline y el mismo descuento que las opciones de siempre, sin tocar la receta guardada. */
export const idSustitucion = (faltanteId: number, reemplazoId: number): string => `sub:${faltanteId}:${reemplazoId}`;

/** Los reemplazos (faltante → reemplazo) que trae la lista de opciones elegidas de una venta. */
export function sustitucionesDe(elegidas: string[] | undefined): Map<number, number> {
  const out = new Map<number, number>();
  for (const e of elegidas ?? []) {
    const m = /^sub:(\d+):(\d+)$/.exec(e);
    if (m && m[1] !== m[2]) out.set(Number(m[1]), Number(m[2]));
  }
  return out;
}

/** Receta de un trago con sus opciones ya elegidas: quita lo que reemplazan y suma lo elegido. Si no se eligió nada
 * de un grupo, queda la receta base (así un trago sin elección igual descuenta algo). Los reemplazos `sub:` cambian
 * el insumo faltante por otro, con la misma cantidad. */
export function recetaConOpciones(
  lines: { insumoId: number; amount: number }[],
  grupos: OpcionGrupo[] | undefined,
  elegidas: string[] | undefined,
): { insumoId: number; amount: number }[] {
  if (!elegidas?.length) return lines;
  let out = lines;
  for (const g of grupos ?? []) {
    const c = g.choices.find((x) => elegidas.includes(x.id));
    if (!c) continue;
    if (g.reemplaza != null) out = out.filter((l) => l.insumoId !== g.reemplaza);
    out = [...out, { insumoId: c.insumoId, amount: c.amount }];
  }
  const subs = sustitucionesDe(elegidas);
  if (subs.size > 0) out = out.map((l) => (subs.has(l.insumoId) ? { ...l, insumoId: subs.get(l.insumoId)! } : l));
  return out;
}

/** Lo que gasta una venta, sumado por insumo (dos tragos con ron = un solo
 * movimiento de ron). `delta` va negativo: es lo que sale del stock. */
export function consumoDeVenta(
  items: { ticketTypeId: number; quantity: number; opciones?: string[] }[],
  recetas: RecetaLinea[],
  opciones?: Record<number, OpcionGrupo[]> | null,
): { insumoId: number; delta: number }[] {
  const byInsumo = new Map<number, number>();
  for (const item of items) {
    for (const r of recetaConOpciones(recetaDe(recetas, item.ticketTypeId).lines, opciones?.[item.ticketTypeId], item.opciones)) {
      if (!(r.amount > 0)) continue;
      byInsumo.set(r.insumoId, (byInsumo.get(r.insumoId) ?? 0) + r.amount * item.quantity);
    }
  }
  return Array.from(byInsumo, ([insumoId, used]) => ({ insumoId, delta: -round(used) }));
}

/** Stock de cada insumo = suma de su libro de movimientos. */
export function stockActual(movimientos: { insumoId: number; delta: number | string }[]): Map<number, number> {
  const stock = new Map<number, number>();
  for (const m of movimientos) stock.set(m.insumoId, round((stock.get(m.insumoId) ?? 0) + Number(m.delta)));
  return stock;
}

/** Cuántos tragos más alcanzan de un producto: el insumo que se acaba primero
 * manda. `null` si el producto no tiene receta (se sigue usando su stock por
 * unidades de siempre). */
export function tragosDisponibles(
  receta: { insumoId: number; amount: number }[],
  stock: Map<number, number>,
): { drinks: number; limitingInsumoId: number } | null {
  let best: { drinks: number; limitingInsumoId: number } | null = null;
  for (const r of receta) {
    if (!(r.amount > 0)) continue;
    const drinks = Math.max(0, Math.floor((stock.get(r.insumoId) ?? 0) / r.amount + 1e-9));
    if (!best || drinks < best.drinks) best = { drinks, limitingInsumoId: r.insumoId };
  }
  return best;
}

/** Un insumo de la receta de un trago con cuánto alcanza. `sinComprar`: nunca tuvo stock cargado (no es lo mismo que haberse acabado). */
export interface InsumoDiagnostico { insumoId: number; name: string; drinks: number; stock: number; sinComprar: boolean }
export interface DiagnosticoProducto {
  /** Tragos que alcanzan (el insumo que se acaba primero manda). */
  drinks: number;
  estado: 'ok' | 'bajo' | 'agotado';
  /** El insumo que manda: el que se acaba primero. */
  limitante: InsumoDiagnostico;
  /** Todos los insumos de la receta que ya no alcanzan para ningún trago. */
  faltantes: InsumoDiagnostico[];
  /** Los que alcanzan para menos de su aviso (`alertDrinks`), sin contar los faltantes. */
  bajos: InsumoDiagnostico[];
}

/** Qué insumo hace que un trago esté agotado o por agotarse: para decir «falta Ginger ale» en vez de solo «sin stock».
 * `null` si la receta no tiene líneas con cantidad. */
export function diagnosticoProducto(
  receta: { insumoId: number; amount: number }[],
  insumos: { id: number; name: string; alertDrinks: number; sinComprar?: boolean }[],
  stock: Map<number, number>,
): DiagnosticoProducto | null {
  const byId = new Map(insumos.map((i) => [i.id, i]));
  const filas: (InsumoDiagnostico & { alertDrinks: number })[] = [];
  for (const r of receta) {
    if (!(r.amount > 0)) continue;
    const i = byId.get(r.insumoId);
    if (!i) continue;
    const s = stock.get(r.insumoId) ?? 0;
    filas.push({ insumoId: i.id, name: i.name, stock: s, drinks: Math.max(0, Math.floor(s / r.amount + 1e-9)), sinComprar: !!i.sinComprar, alertDrinks: i.alertDrinks });
  }
  if (filas.length === 0) return null;
  const limitante = filas.reduce((best, f) => (f.drinks < best.drinks ? f : best), filas[0]);
  const strip = ({ alertDrinks: _a, ...f }: InsumoDiagnostico & { alertDrinks: number }): InsumoDiagnostico => f;
  const faltantes = filas.filter((f) => f.drinks <= 0).map(strip);
  const bajos = filas.filter((f) => f.drinks > 0 && f.alertDrinks > 0 && f.drinks < f.alertDrinks).map(strip);
  return { drinks: limitante.drinks, estado: limitante.drinks <= 0 ? 'agotado' : bajos.length > 0 ? 'bajo' : 'ok', limitante: strip(limitante), faltantes, bajos };
}

export interface Reemplazo { insumoId: number; name: string; drinks: number }

/** Con qué se puede reemplazar un insumo que falta: otro de la misma unidad y categoría (otra bebida por una bebida), con
 * stock y que el trago no use ya. Primero el que más tragos alcanza. */
export function sugerirReemplazos(
  faltanteId: number,
  insumos: { id: number; name: string; unit: InsumoUnit }[],
  stock: Map<number, number>,
  receta: { insumoId: number; amount: number }[],
  max = 3,
): Reemplazo[] {
  const falta = insumos.find((i) => i.id === faltanteId);
  const linea = receta.find((r) => r.insumoId === faltanteId);
  if (!falta || !linea || !(linea.amount > 0)) return [];
  const categoria = categoriaInsumo(falta.name, falta.unit);
  const usados = new Set(receta.map((r) => r.insumoId));
  return insumos
    .filter((i) => i.id !== faltanteId && !usados.has(i.id) && i.unit === falta.unit && categoriaInsumo(i.name, i.unit) === categoria)
    .map((i) => ({ insumoId: i.id, name: i.name, drinks: Math.max(0, Math.floor((stock.get(i.id) ?? 0) / linea.amount + 1e-9)) }))
    .filter((r) => r.drinks > 0)
    .sort((a, b) => b.drinks - a.drinks || a.name.localeCompare(b.name))
    .slice(0, max);
}

/** Cuántos tragos "típicos" alcanzan de un insumo: stock dividido por lo que
 * gasta en promedio un trago que lo usa. `null` si ningún trago lo usa. */
export function tragosPorInsumo(insumoId: number, stockValue: number, recetas: RecetaLinea[]): number | null {
  const amounts = recetasPrincipales(recetas).filter((r) => r.insumoId === insumoId && r.amount > 0).map((r) => r.amount);
  if (amounts.length === 0) return null;
  const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length;
  return Math.max(0, Math.floor(stockValue / avg + 1e-9));
}

// --- Conteo físico ---

/** Total contado = botellas cerradas × tamaño + la abierta (fracción) + suelto. */
export function conteoATotal(closedContainers: number, openFraction: number, containerSize: number, loose = 0): number {
  const closed = Math.max(0, Math.floor(closedContainers || 0));
  const fraction = Math.min(1, Math.max(0, openFraction || 0));
  return round(closed * containerSize + fraction * containerSize + Math.max(0, loose || 0));
}

/** Diferencia entre lo que el sistema esperaba y lo contado. Negativo = falta. */
export function descuadre(expected: number, counted: number): { diff: number; pct: number } {
  const diff = round(counted - expected);
  const pct = expected > 0 ? round((diff / expected) * 100) : counted > 0 ? 100 : 0;
  return { diff, pct };
}

/** "3 botellas + 250 ml" (o "−120 ml" si quedó negativo). */
export function formatCantidad(amount: number, insumo: Pick<Insumo, 'unit' | 'containerSize' | 'containerLabel'>): string {
  const unit = insumo.unit === 'un' ? 'un' : insumo.unit;
  if (amount < 0) return `−${Math.round(-amount).toLocaleString('es-CL')} ${unit}`;
  const size = insumo.containerSize > 0 ? insumo.containerSize : 0;
  if (!size || size === 1) return `${Math.round(amount).toLocaleString('es-CL')} ${unit}`;
  const full = Math.floor(amount / size + 1e-9);
  const rest = Math.round(amount - full * size);
  const label = full === 1 ? insumo.containerLabel : pluralize(insumo.containerLabel);
  if (full === 0) return `${rest.toLocaleString('es-CL')} ${unit}`;
  return rest > 0 ? `${full} ${label} + ${rest.toLocaleString('es-CL')} ${unit}` : `${full} ${label}`;
}

function pluralize(word: string): string {
  if (!word) return word;
  if (/[aeiouáéó]$/i.test(word)) return `${word}s`;
  return `${word}es`;
}

/** Semáforo de un insumo según cuántos tragos alcanzan. */
export function nivelInsumo(drinks: number | null, alertDrinks: number): 'agotado' | 'bajo' | 'ok' | 'sin_uso' {
  if (drinks === null) return 'sin_uso';
  if (drinks <= 0) return 'agotado';
  if (alertDrinks > 0 && drinks < alertDrinks) return 'bajo';
  return 'ok';
}

// --- Proyección de compra ---

export const normalizeName = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

export interface ProyeccionInput {
  /** Fiestas anteriores: cuánta gente fue y cuánto se vendió de cada trago (por nombre,
   * porque cada fiesta tiene sus propios ids de productos). */
  historico: { personas: number; ventas: { name: string; quantity: number }[] }[];
  /** Tragos de la carta de esta fiesta, con su receta. */
  productos: { id: number; name: string; receta: { insumoId: number; amount: number }[] }[];
  insumos: Insumo[];
  stock: Map<number, number>;
  personasObjetivo: number;
  /** Multiplicador sobre lo histórico (1 = igual, 1.2 = 20 % más de margen). */
  factor?: number;
  /** Tragos por persona a mano; si no viene, se saca del histórico. */
  tragosPorPersona?: number | null;
  /** Cantidad esperada a mano para algún trago (gana sobre el mix histórico). */
  overrides?: Record<number, number>;
}

export interface ProyeccionProducto { id: number; name: string; quantity: number; share: number; fromHistory: boolean; /** Cantidad fijada a mano. */ manual: boolean }
export interface ProyeccionInsumo {
  insumoId: number;
  name: string;
  need: number;
  stock: number;
  missing: number;
  containersToBuy: number;
  cost: number | null;
}

export interface Proyeccion {
  tragosPorPersona: number;
  personasHistoricas: number;
  totalTragos: number;
  productos: ProyeccionProducto[];
  insumos: ProyeccionInsumo[];
  costoTotal: number;
  /** Tragos de la carta que nunca se vendieron antes (no entran en el mix). */
  sinHistorial: string[];
  /** Qué parte de lo vendido antes corresponde a tragos de esta carta (0 a 1). */
  cobertura: number;
}

/** Lista de compras: tragos por persona y mix de las fiestas anteriores,
 * escalados a `personasObjetivo` → necesidad por insumo → lo que falta.
 * `productos` son TODOS los tragos de la carta (los que no tienen receta no gastan
 * insumos, pero sí se llevan su parte de los tragos: si no, la de los demás saldría inflada). */
export function proyeccionCompra(input: ProyeccionInput): Proyeccion {
  const factor = input.factor && input.factor > 0 ? input.factor : 1;
  const personasHistoricas = input.historico.reduce((s, h) => s + Math.max(0, h.personas), 0);
  const productNames = new Map(input.productos.map((p) => [normalizeName(p.name), p.id]));

  // Solo cuentan las ventas de tragos que existen en esta carta: el mix es de ESTA carta.
  const soldByProduct = new Map<number, number>();
  let soldTotal = 0;
  let soldAll = 0;
  for (const h of input.historico) {
    for (const v of h.ventas) {
      soldAll += v.quantity;
      const id = productNames.get(normalizeName(v.name));
      if (id === undefined) continue;
      soldByProduct.set(id, (soldByProduct.get(id) ?? 0) + v.quantity);
      soldTotal += v.quantity;
    }
  }

  const historicPerPerson = personasHistoricas > 0 ? soldAll / personasHistoricas : 0;
  const tragosPorPersona = input.tragosPorPersona != null && input.tragosPorPersona >= 0 ? input.tragosPorPersona : historicPerPerson;
  const overrides = input.overrides ?? {};
  const overrideTotal = Object.values(overrides).reduce((s, n) => s + Math.max(0, n), 0);
  // Lo vendido antes de tragos que ya no están en esta carta no se va a vender: no cuenta.
  const cobertura = soldAll > 0 ? soldTotal / soldAll : 1;
  const totalPorRitmo = Math.max(0, Math.round(tragosPorPersona * input.personasObjetivo * factor * cobertura));
  // Lo que no está fijado a mano se reparte según el mix histórico; sin
  // historial de esos tragos, en partes iguales entre los que no tienen cantidad fija.
  const toDistribute = Math.max(0, totalPorRitmo - overrideTotal);
  const free = input.productos.filter((p) => overrides[p.id] === undefined);
  const freeSold = free.reduce((s, p) => s + (soldByProduct.get(p.id) ?? 0), 0);

  const productos: ProyeccionProducto[] = input.productos.map((p) => {
    if (overrides[p.id] !== undefined) {
      const q = Math.max(0, Math.round(overrides[p.id]));
      return { id: p.id, name: p.name, quantity: q, share: 0, fromHistory: false, manual: true };
    }
    const sold = soldByProduct.get(p.id) ?? 0;
    const share = freeSold > 0 ? sold / freeSold : free.length > 0 ? 1 / free.length : 0;
    return { id: p.id, name: p.name, quantity: Math.round(toDistribute * share), share, fromHistory: sold > 0, manual: false };
  });
  // El total es lo que realmente suman los tragos (si fijaste cantidades a mano, manda lo que fijaste).
  const totalTragos = productos.reduce((s, p) => s + p.quantity, 0);
  for (const p of productos) p.share = totalTragos > 0 ? p.quantity / totalTragos : 0;

  const need = new Map<number, number>();
  for (const p of productos) {
    const receta = input.productos.find((x) => x.id === p.id)?.receta ?? [];
    for (const r of receta) need.set(r.insumoId, (need.get(r.insumoId) ?? 0) + r.amount * p.quantity);
  }

  const insumos: ProyeccionInsumo[] = input.insumos
    .filter((i) => need.has(i.id))
    .map((i) => {
      const n = round(need.get(i.id) ?? 0);
      const s = round(input.stock.get(i.id) ?? 0);
      const missing = round(Math.max(0, n - s));
      const containersToBuy = i.containerSize > 0 ? Math.ceil(missing / i.containerSize - 1e-9) : 0;
      const cost = i.costPerContainer != null ? containersToBuy * Number(i.costPerContainer) : null;
      return { insumoId: i.id, name: i.name, need: n, stock: s, missing, containersToBuy, cost };
    })
    .sort((a, b) => b.containersToBuy - a.containersToBuy || a.name.localeCompare(b.name));

  return {
    tragosPorPersona: round(tragosPorPersona),
    personasHistoricas,
    totalTragos,
    productos: productos.sort((a, b) => b.quantity - a.quantity),
    insumos,
    costoTotal: insumos.reduce((s, i) => s + (i.cost ?? 0), 0),
    sinHistorial: input.productos.filter((p) => !soldByProduct.has(p.id)).map((p) => p.name),
    cobertura: Math.round(cobertura * 1000) / 1000,
  };
}

/** Merma de los conteos: lo que faltó frente a lo que las ventas decían que debía quedar, por conteo y por persona.
 * Solo cuentan los faltantes (lo que sobra no es pérdida). El costo sale del precio de compra del envase. */
export function mermaDeConteos(
  conteos: { id: number; kind: string; operatorName: string | null; createdAt: Date | string; lines: { insumoId: number; diff: number }[] }[],
  insumos: { id: number; name: string; unit: InsumoUnit; containerSize: number; containerLabel: string; costPerContainer?: number | null }[],
) {
  const byId = new Map(insumos.map((i) => [i.id, i]));
  const porConteo = conteos.map((c) => {
    const faltantes = c.lines.filter((l) => l.diff < 0 && byId.has(l.insumoId)).map((l) => {
      const ins = byId.get(l.insumoId)!;
      const cantidad = -l.diff;
      const costo = ins.costPerContainer != null && ins.containerSize > 0 ? Math.round((cantidad / ins.containerSize) * Number(ins.costPerContainer)) : null;
      return { insumoId: ins.id, name: ins.name, cantidad, costo, texto: formatCantidad(cantidad, ins) };
    }).sort((a, b) => (b.costo ?? 0) - (a.costo ?? 0));
    return { id: c.id, kind: c.kind, operatorName: c.operatorName ?? '—', createdAt: c.createdAt, faltantes, costo: faltantes.reduce((s, f) => s + (f.costo ?? 0), 0) };
  });
  const porPersona = new Map<string, { operatorName: string; conteos: number; faltantes: number; costo: number }>();
  for (const c of porConteo) {
    const e = porPersona.get(c.operatorName) ?? { operatorName: c.operatorName, conteos: 0, faltantes: 0, costo: 0 };
    e.conteos += 1; e.faltantes += c.faltantes.length; e.costo += c.costo;
    porPersona.set(c.operatorName, e);
  }
  return {
    porConteo,
    porPersona: Array.from(porPersona.values()).sort((a, b) => b.costo - a.costo || b.faltantes - a.faltantes),
    costoTotal: porConteo.reduce((s, c) => s + c.costo, 0),
  };
}

export interface FilaStock {
  name: string; unit: InsumoUnit; containerSize: number; containerLabel: string; sizes?: number[] | null;
  stock: number; drinks: number | null; level: 'agotado' | 'bajo' | 'ok' | 'sin_uso';
  costPerContainer?: number | null;
}

const NIVEL_ICONO: Record<FilaStock['level'], string> = { agotado: '⛔', bajo: '⚠️', ok: '✅', sin_uso: '▫️' };

/** El stock de la barra como texto para mandar por WhatsApp: lo urgente primero. */
export function stockTexto(filas: FilaStock[], titulo: string): string {
  const orden = { agotado: 0, bajo: 1, ok: 2, sin_uso: 3 } as const;
  const lines = [...filas].sort((a, b) => orden[a.level] - orden[b.level] || a.name.localeCompare(b.name)).map((f) =>
    `${NIVEL_ICONO[f.level]} ${f.name}: ${formatCantidad(f.stock, f)}${f.drinks !== null ? ` (~${f.drinks} tragos)` : ''}`);
  return [`📦 ${titulo}`, ...lines].join('\n');
}

/** El stock de la barra como CSV (se abre en Excel o Sheets). */
export function stockCsv(filas: FilaStock[]): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const head = ['Insumo', 'Stock', `Stock (en ml, g o un)`, 'Alcanza para (tragos)', 'Estado', 'Costo por envase'];
  const estado = { agotado: 'Agotado', bajo: 'Queda poco', ok: 'OK', sin_uso: 'Sin receta' } as const;
  const rows = filas.map((f) => [f.name, formatCantidad(f.stock, f), f.stock, f.drinks ?? '', estado[f.level], f.costPerContainer ?? '']);
  return '\uFEFF' + [head, ...rows].map((r) => r.map(q).join(',')).join('\n');
}

/** Lista de compras como texto para mandar por WhatsApp. */
export function listaComprasTexto(p: Proyeccion, insumos: Insumo[], personas: number): string {
  const byId = new Map(insumos.map((i) => [i.id, i]));
  const lines = p.insumos.filter((i) => i.containersToBuy > 0).map((i) => {
    const ins = byId.get(i.insumoId);
    const label = ins ? (i.containersToBuy === 1 ? ins.containerLabel : pluralize(ins.containerLabel)) : '';
    return `• ${i.name}: ${i.containersToBuy} ${label}`.trim();
  });
  if (lines.length === 0) return `Lista de compras para ${personas} personas: no falta nada 🎉`;
  return [`🛒 Lista de compras para ${personas} personas`, ...lines].join('\n');
}

// --- Alertas (las dispara server/caja/alerts.ts) ---

export type InsumoAlertDraft = { kind: string; severity: 'info' | 'warning' | 'critical'; title: string; body: string; dedupeKey: string };

/** Alertas al cambiar el stock de insumos (tras una venta): solo al CRUZAR un
 * umbral, para no repetir en cada trago.
 *  - agotado: llegó a 0;
 *  - alcanza para menos de `alertDrinks` tragos;
 *  - bajó del 25 % y del 10 % del stock con que se abrió la noche. */
export function insumoStockAlerts(
  changes: { insumo: Insumo; before: number; after: number; reference: number | null }[],
  recetas: RecetaLinea[],
  eventId: number,
  contexto?: { afectados?: Map<number, string[]>; reemplazos?: Map<number, string[]> },
): InsumoAlertDraft[] {
  const drafts: InsumoAlertDraft[] = [];
  /** «Afecta: Gin con Gin, PlayRoom. Reemplazo: Tónica (alcanza para 20).» */
  const detalle = (insumoId: number) => {
    const a = contexto?.afectados?.get(insumoId) ?? [];
    const r = contexto?.reemplazos?.get(insumoId) ?? [];
    return `${a.length ? ` Afecta: ${a.slice(0, 4).join(', ')}${a.length > 4 ? '…' : ''}.` : ''}${r.length ? ` Reemplazo posible: ${r.join(' o ')}.` : ''}`;
  };
  for (const { insumo, before, after, reference } of changes) {
    if (after >= before) continue;
    const left = formatCantidad(after, insumo);
    if (after <= 0 && before > 0) {
      drafts.push({
        kind: 'insumo_out', severity: 'critical', dedupeKey: `insumo_out:${eventId}:${insumo.id}`,
        title: `Se acabó: ${insumo.name}`,
        body: `Según las ventas ya no queda. Revisa la barra o carga una compra si hay más en bodega.${detalle(insumo.id)}`,
      });
      continue;
    }
    const drinksBefore = tragosPorInsumo(insumo.id, before, recetas);
    const drinksAfter = tragosPorInsumo(insumo.id, after, recetas);
    if (insumo.alertDrinks > 0 && drinksBefore !== null && drinksAfter !== null && drinksAfter < insumo.alertDrinks && drinksBefore >= insumo.alertDrinks) {
      drafts.push({
        kind: 'insumo_low', severity: 'warning', dedupeKey: `insumo_low:${eventId}:${insumo.id}:${insumo.alertDrinks}`,
        title: `Queda poco: ${insumo.name}`,
        body: `Alcanza para ~${drinksAfter} tragos (${left}).${detalle(insumo.id)}`,
      });
    }
    if (reference && reference > 0) {
      for (const pct of STOCK_PCT_STEPS) {
        const limit = (reference * pct) / 100;
        if (after <= limit && before > limit) {
          drafts.push({
            kind: 'insumo_pct', severity: pct <= 10 ? 'critical' : 'warning', dedupeKey: `insumo_pct:${eventId}:${insumo.id}:${pct}`,
            title: `${insumo.name} bajo el ${pct} %`,
            body: `Queda ${left} de ${formatCantidad(reference, insumo)} con que se abrió la noche.`,
          });
        }
      }
    }
  }
  return drafts;
}

/** Al ritmo de la última hora, ¿se acaba antes del cierre? Un aviso por hora. */
export function insumoRitmoAlerts(
  rows: { insumo: Insumo; stock: number; usedLastWindow: number }[],
  minutesToClose: number,
  eventId: number,
  now: Date,
): InsumoAlertDraft[] {
  if (minutesToClose <= 0) return [];
  const bucket = Math.floor(now.getTime() / 3_600_000);
  const drafts: InsumoAlertDraft[] = [];
  for (const r of rows) {
    if (r.usedLastWindow <= 0 || r.stock <= 0) continue;
    const perMinute = r.usedLastWindow / RITMO_WINDOW_MIN;
    const minutesLeft = r.stock / perMinute;
    if (minutesLeft >= minutesToClose) continue;
    const at = new Date(now.getTime() + minutesLeft * 60_000);
    const hhmm = at.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
    drafts.push({
      kind: 'insumo_ritmo', severity: 'warning', dedupeKey: `insumo_ritmo:${eventId}:${r.insumo.id}:${bucket}`,
      title: `${r.insumo.name} no llega al cierre`,
      body: `Al ritmo de la última hora se acaba cerca de las ${hhmm} (quedan ${formatCantidad(r.stock, r.insumo)}).`,
    });
  }
  return drafts;
}

/** Conteo de cierre que no cuadra con lo vendido. Ignora diferencias menores
 * a un cuarto de envase (no se puede contar más fino que eso a ojo). */
export function descuadreAlerts(
  lines: { insumo: Insumo; expected: number; counted: number }[],
  conteoId: number,
  who: string,
  eventId: number,
): InsumoAlertDraft[] {
  const bad = lines
    .map((l) => ({ ...l, ...descuadre(l.expected, l.counted) }))
    .filter((l) => l.diff < 0 && Math.abs(l.pct) > DESCUADRE_PCT && Math.abs(l.diff) >= l.insumo.containerSize * 0.25);
  if (bad.length === 0) return [];
  const parts = bad.slice(0, 4).map((l) => `${l.insumo.name} faltan ${formatCantidad(-l.diff, l.insumo)} (${Math.round(Math.abs(l.pct))} %)`);
  return [{
    kind: 'insumo_descuadre', severity: 'critical', dedupeKey: `insumo_descuadre:${eventId}:${conteoId}`,
    title: `Descuadre en el conteo de barra (${bad.length})`,
    body: `${parts.join(' · ')}${bad.length > 4 ? '…' : ''} — conteo de ${who}.`,
  }];
}
