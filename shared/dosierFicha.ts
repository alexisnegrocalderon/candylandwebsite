/* Fichas del dosier de barra: lo que ven la barra y el admin en pantalla y lo que dibuja el PDF (server/dosierPdf.ts).
 * Todo puro: sale de las recetas del evento (estadoBarra) y no sabe nada de la base ni del navegador. */
import { esJiggerExacto, formatJiggers, glassInfo, mlAJiggers, pasosSugeridos, type InsumoUnit, type OpcionGrupo } from './insumos';

export interface DosierFicha {
  /** ticketTypeId: sirve para abrir la receta desde el admin. */
  id: number;
  name: string;
  section: string;
  glass: string;
  glassLabel: string;
  glassMl: number;
  lineas: { name: string; unit: string; amount: number; texto: string }[];
  /** «Con qué bebida va»: etiqueta del grupo y opciones, y cuánto (ml) para dibujar la capa. */
  opciones: { label: string; choices: string[]; ml: number }[];
  extras: string[];
  pasos: string[];
  foto: string | null;
  /** Cambia cuando cambia algo de la ficha: la barra ve «actualizado» si no es el que ya vio. */
  hash: string;
}

export interface DosierFichas {
  eventTitle: string;
  fichas: DosierFicha[];
  /** Lo que se vende tal cual, en su botella o lata. */
  talCual: { name: string; section: string }[];
}

const texto = (amount: number, unit: string) => {
  if (unit === 'ml') return esJiggerExacto(amount) ? `${formatJiggers(mlAJiggers(amount))} · ${amount} ml` : `${amount} ml`;
  if (unit === 'un') return amount === 1 ? '1 unidad' : `${amount} unidades`;
  return `${amount} ${unit}`;
};

/** Hash corto y estable (FNV-1a) del contenido de la ficha. */
export function hashFicha(f: Omit<DosierFicha, 'hash'>): string {
  const s = JSON.stringify([f.name, f.section, f.glass, f.lineas, f.opciones, f.extras, f.pasos, f.foto]);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

type Producto = {
  id: number; name: string; groupName: string | null; glass: string;
  receta: { insumoId: number; amount: number }[];
  extras: string[]; opciones: OpcionGrupo[]; pasos: string[]; foto: string | null;
  sinInsumos: boolean; oculto: boolean;
};

/** Arma las fichas de la carta: sin ocultos ni lo que se vende solo; las botellas y latas quedan en `talCual`. */
export function armarFichas(eventTitle: string, productos: Producto[], insumos: { id: number; name: string; unit: InsumoUnit }[]): DosierFichas {
  const insumo = new Map(insumos.map((i) => [i.id, i]));
  const fichas: DosierFicha[] = [];
  const talCual: DosierFichas['talCual'] = [];
  for (const p of productos.filter((x) => !x.oculto && !x.sinInsumos && x.receta.length > 0)) {
    const section = p.groupName || 'Carta';
    if (p.glass === 'botella') { talCual.push({ name: p.name, section }); continue; }
    const g = glassInfo(p.glass);
    const reemplazadas = new Set(p.opciones.map((o) => o.reemplaza).filter((x): x is number => x != null));
    // Sin insumos archivados o borrados: no se pueden nombrar y no son parte de lo que se sirve.
    const lineas = p.receta.filter((r) => !reemplazadas.has(r.insumoId) && insumo.has(r.insumoId)).map((r) => {
      const i = insumo.get(r.insumoId)!;
      return { insumoId: r.insumoId, name: i.name, unit: i.unit as InsumoUnit, amount: r.amount, texto: texto(r.amount, i.unit) };
    });
    const pasos = p.pasos.length ? p.pasos : pasosSugeridos({ glass: p.glass, lineas, extras: p.extras, opciones: p.opciones });
    const base = {
      id: p.id, name: p.name, section, glass: p.glass, glassLabel: g?.label ?? 'Vaso', glassMl: g?.ml ?? 0,
      lineas: lineas.map(({ insumoId: _i, ...l }) => l),
      opciones: p.opciones.map((o) => ({ label: o.label, choices: o.choices.map((c) => c.label), ml: Math.max(0, ...o.choices.filter((c) => insumo.get(c.insumoId)?.unit === 'ml').map((c) => c.amount)) })),
      extras: p.extras, pasos, foto: p.foto,
    };
    fichas.push({ ...base, hash: hashFicha(base) });
  }
  const orden = (a: { section: string; name: string }, b: { section: string; name: string }) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name);
  fichas.sort(orden);
  talCual.sort(orden);
  return { eventTitle, fichas, talCual };
}

/* ─── Dibujo del vaso (igual en el PDF y en pantalla) ───────── */

const LIQUID: [RegExp, string][] = [
  [/coca|cola\b/i, '#4A2416'],
  [/ginger/i, '#E2B85C'],
  [/sprite|soda|agua|t[oó]nica|mineral/i, '#BFE6F2'],
  [/red ?bull|energ|score/i, '#F2C94C'],
  [/aperol/i, '#F26A21'],
  [/ramazzotti|amaro|j[aä]eger|fernet/i, '#7A2E12'],
  [/whisk|jack|johnnie|bourbon|ron negro|ron dorado|dorado|reposado/i, '#C27C2C'],
  [/espumante|champ|prosecco/i, '#F3E3A0'],
  [/lim[oó]n|lima/i, '#E4F07A'],
  [/goma|jarabe|almibar|az[uú]car/i, '#F6EBD3'],
  [/ar[aá]ndano|berr|frutos rojos/i, '#8E1B4E'],
  [/maracuy/i, '#F7B32B'],
  [/hibisc|jamaica/i, '#C2185B'],
  [/tropical|pulpa|mango|pi[nñ]a/i, '#FF9F1C'],
  [/pisco|gin|vodka|ron|tequila|silver|blanco/i, '#D6E4EF'],
];
const FALLBACK = ['#F48FB1', '#81D4FA', '#CE93D8', '#FFCC80', '#A5D6A7'];
const MIXERS = new Set(['#4A2416', '#E2B85C', '#BFE6F2', '#F2C94C', '#F3E3A0']);

export function colorDe(name: string, i = 0): string {
  return LIQUID.find(([re]) => re.test(name))?.[1] ?? FALLBACK[i % FALLBACK.length];
}

export interface Capa { ml: number; color: string }

/** Capas del vaso, de abajo hacia arriba: primero los destilados y arriba las bebidas y rellenos (como se sirve). */
export function capasDeFicha(f: Pick<DosierFicha, 'lineas' | 'opciones'>): Capa[] {
  const capas: Capa[] = [];
  let i = 0;
  for (const l of f.lineas) {
    if (l.unit === 'ml' && l.amount > 0) capas.push({ ml: l.amount, color: colorDe(l.name, i++) });
    // Una lata (Red Bull, bebida) se vierte entera: unos 250 ml.
    else if (l.unit === 'un' && /lata|red ?bull|energ|bebida|score/i.test(l.name)) capas.push({ ml: 250 * l.amount, color: colorDe(l.name, i++) });
  }
  for (const o of f.opciones) if (o.ml > 0) capas.push({ ml: o.ml, color: colorDe(o.choices[0] ?? o.label, i++) });
  return capas.sort((a, b) => Number(MIXERS.has(a.color)) - Number(MIXERS.has(b.color)));
}

export const hieloDeFicha = (f: Pick<DosierFicha, 'extras' | 'glass'>): 'cubos' | 'frappe' | null =>
  f.extras.some((e) => /frapp/i.test(e)) ? 'frappe' : f.extras.some((e) => /cubos/i.test(e)) || f.glass !== 'shot' ? 'cubos' : null;

export const bordeDeFicha = (f: Pick<DosierFicha, 'extras'>): string | null => f.extras.find((e) => /borde/i.test(e)) ?? null;
