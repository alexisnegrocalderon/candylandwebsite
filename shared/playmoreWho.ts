/* «¿Con quién vienes?» de PLAYMORE: primero cuántos son (1, 2 o 3) y luego quiénes, que es lo que decide el acceso y si pide
 * código de comunidad. Es la única definición de las opciones: la landing, el selector de tickets y la compra la comparten.
 *
 *  - Vengo solo (hombre) y Dos hombres piden código de comunidad (o la aprobación de soltero, solo para «Vengo solo»). Eso NO se avisa
 *    al elegir: se pide recién al llegar al paso del código, donde dejan su Instagram (obligatorio) y pueden pedir el código por WhatsApp.
 *  - «Dos hombres» es para parejas, no para amigos: esa es la única aclaración que sí se muestra al elegir.
 *  - «duo» es un único acceso en la base: Pareja y Dos hombres se distinguen por la composición, no por otro ticket. */

export type WhoKey = 'soltera' | 'soltero' | 'pareja' | 'dos-mujeres' | 'dos-hombres' | 'trio';
export type WhoComposicion = 'mixta' | 'dos_mujeres' | 'dos_hombres';

export interface WhoOption {
  key: WhoKey;
  label: string;
  /** `accesoSlug` del tipo de entrada que se compra. */
  slug: string;
  composicion: WhoComposicion | null;
  people: 1 | 2 | 3;
  /** Siluetas: f = mujer, m = hombre. */
  figures: string;
  needsCode: boolean;
  note: string | null;
}

export const WHO_OPTIONS: readonly WhoOption[] = [
  { key: 'soltera', label: 'Vengo sola', slug: 'soltera', composicion: null, people: 1, figures: 'f', needsCode: false, note: null },
  { key: 'soltero', label: 'Vengo solo', slug: 'soltero', composicion: null, people: 1, figures: 'm', needsCode: true, note: null },
  { key: 'pareja', label: 'Pareja', slug: 'duo', composicion: 'mixta', people: 2, figures: 'fm', needsCode: false, note: null },
  { key: 'dos-mujeres', label: 'Dos mujeres', slug: 'duo_mujeres', composicion: 'dos_mujeres', people: 2, figures: 'ff', needsCode: false, note: null },
  { key: 'dos-hombres', label: 'Dos hombres', slug: 'duo', composicion: 'dos_hombres', people: 2, figures: 'mm', needsCode: true, note: 'PARA PAREJAS, NO PARA AMIGOS' },
  { key: 'trio', label: 'Somos tres', slug: 'trio', composicion: null, people: 3, figures: 'fmf', needsCode: false, note: null },
];

type TypeLike = { accesoSlug?: string | null; category?: string | null; status?: string | null };

/** Las opciones que se pueden elegir según los tipos de entrada del evento (el acceso tiene que existir y no estar oculto). */
export function whoAvailable<T extends TypeLike>(types: readonly T[]): (WhoOption & { type: T })[] {
  const out: (WhoOption & { type: T })[] = [];
  for (const o of WHO_OPTIONS) {
    const type = types.find((t) => t.accesoSlug === o.slug && (t.category === 'acceso' || !t.category) && t.status !== 'hidden');
    if (type) out.push({ ...o, type });
  }
  return out;
}

/** Cuántos pueden ser, de menor a mayor, entre las opciones disponibles. */
export function whoCounts(avail: readonly WhoOption[]): number[] {
  return Array.from(new Set(avail.map((o) => o.people))).sort((a, b) => a - b);
}

export function whoForCount<O extends WhoOption>(avail: readonly O[], count: number | null | undefined): O[] {
  return count ? avail.filter((o) => o.people === count) : [];
}

/** La opción que corresponde a un acceso ya elegido (por ejemplo el destacado del selector o el de un link). `duo` sin
 * composición es la pareja: lo que nunca se asume es «dos hombres». */
export function whoKeyFor(slug: string | null | undefined, composicion?: string | null): WhoKey | null {
  if (!slug) return null;
  if (slug === 'duo') return composicion === 'dos_hombres' ? 'dos-hombres' : 'pareja';
  return WHO_OPTIONS.find((o) => o.slug === slug)?.key ?? null;
}

export const whoByKey = (key: string | null | undefined): WhoOption | null => WHO_OPTIONS.find((o) => o.key === key) ?? null;

/** ¿Alguna de las opciones de esta cantidad pide código? (para avisarlo antes de elegir). */
export function countHasCodeOption(avail: readonly WhoOption[], count: number | null | undefined): boolean {
  return whoForCount(avail, count).some((o) => o.needsCode);
}
