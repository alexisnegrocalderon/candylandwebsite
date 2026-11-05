/* Tanda vigente de la landing PLAYMORE: qué se está vendiendo hoy, cuánto
 * falta para que cierre y cuánto del cupo ya se llevó. Mismo criterio que la
 * tarjeta de tanda de la home de Playroom (Home.tsx): el acceso destacado es
 * el Dúo, o el más barato. Solo se muestran porcentajes: nunca cupos exactos
 * (ni el total ni lo que queda). */

export interface PlaymoreTicketView {
  id: number;
  name: string;
  price: number;
  status: string;
  accesoSlug: string | null;
  category: string;
  originalPrice: number | null;
  /** ISO: cuando cierra esta tanda y sube el precio. */
  salesEnd: string | null;
  /** ¿Queda cupo? (sin tope = true). El número exacto nunca sale del servidor. */
  hasStock: boolean;
  /** Porcentaje del cupo ya vendido, 0-100 (null = sin tope). Nunca 100 si todavía queda cupo. */
  soldPct: number | null;
}

export interface PlaymoreTanda {
  featured: PlaymoreTicketView;
  soldPct: number | null;
  /** Cuándo sube el precio (solo si todavía no pasó). */
  salesEnd: string | null;
  soldOut: boolean;
}

export function deriveTanda(types: PlaymoreTicketView[], nowMs: number): PlaymoreTanda | null {
  const accesos = types.filter((t) => t.category === 'acceso');
  const active = accesos.filter((t) => t.status === 'active');
  const pool = active.length > 0 ? active : accesos.filter((t) => t.status === 'soldout');
  if (pool.length === 0) return null;
  const featured = pool.find((t) => t.accesoSlug === 'duo') ?? [...pool].sort((a, b) => a.price - b.price)[0];
  const end = featured.salesEnd ? Date.parse(featured.salesEnd) : NaN;
  return {
    featured,
    soldPct: featured.soldPct,
    salesEnd: Number.isFinite(end) && end > nowMs ? featured.salesEnd : null,
    soldOut: active.length === 0 || !featured.hasStock,
  };
}

/** "¿Con quién vienes?": cada grupo reúne los accesos de esa cantidad de personas. */
export const ACCESO_GROUPS = [
  { key: 'solo', label: 'Voy solx', people: 1, slugs: ['soltera', 'soltero'] },
  { key: 'duo', label: 'Dúo', people: 2, slugs: ['duo', 'duo_mujeres'] },
  { key: 'trio', label: 'Trío', people: 3, slugs: ['trio'] },
  { key: 'grupo', label: 'Grupo', people: 4, slugs: ['grupo'] },
] as const;
export type AccesoGroupKey = (typeof ACCESO_GROUPS)[number]['key'];

export function groupOf(slug: string | null | undefined): (typeof ACCESO_GROUPS)[number] | null {
  if (!slug) return null;
  return ACCESO_GROUPS.find((g) => (g.slugs as readonly string[]).includes(slug)) ?? null;
}

/** Link de compra de un acceso: el checkout lo deja preseleccionado
 * (?items=slug:cantidad) y, si la persona escribió su nombre en el ticket,
 * llega ya puesto en el formulario (?nombre=). */
export function buyHrefFor(buyHref: string, t: Pick<PlaymoreTicketView, 'accesoSlug' | 'category'>, opts: { qty?: number; nombre?: string; quien?: string | null } = {}): string {
  const params: string[] = [];
  if (t.category === 'acceso' && t.accesoSlug) params.push(`items=${encodeURIComponent(t.accesoSlug)}:${Math.max(1, Math.floor(opts.qty ?? 1))}`);
  // «¿Con quién vienes?»: la opción elegida (pareja, dos hombres…) viaja al checkout para no volver a preguntarla.
  if (t.category === 'acceso' && t.accesoSlug && opts.quien && /^[a-z-]{3,20}$/.test(opts.quien)) params.push(`quien=${opts.quien}`);
  const nombre = opts.nombre?.trim();
  if (nombre) params.push(`nombre=${encodeURIComponent(nombre.slice(0, 60))}`);
  return params.length ? `${buyHref}${buyHref.includes('?') ? '&' : '?'}${params.join('&')}` : buyHref;
}
