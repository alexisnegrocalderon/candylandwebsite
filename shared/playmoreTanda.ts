/* Tanda vigente de la landing PLAYMORE: qué se está vendiendo hoy, cuánto
 * falta para que cierre y cuánto del cupo ya se llevó. Mismo criterio que la
 * tarjeta de tanda de la home de Playroom (Home.tsx): el acceso destacado es
 * el Dúo, o el más barato. Nunca se muestra el cupo total, solo lo que queda
 * y el porcentaje vendido. */

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
  /** Cupo que queda (null = sin tope). */
  remaining: number | null;
  /** Porcentaje del cupo ya vendido, 0-100 (null = sin tope). */
  soldPct: number | null;
}

export interface PlaymoreTanda {
  featured: PlaymoreTicketView;
  remaining: number | null;
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
    remaining: featured.remaining,
    soldPct: featured.soldPct,
    salesEnd: Number.isFinite(end) && end > nowMs ? featured.salesEnd : null,
    soldOut: active.length === 0 || (featured.remaining != null && featured.remaining <= 0),
  };
}

/** Link de compra de un acceso: el checkout lo deja preseleccionado (?items=slug:1). */
export function buyHrefFor(buyHref: string, t: Pick<PlaymoreTicketView, 'accesoSlug' | 'category'>): string {
  return t.category === 'acceso' && t.accesoSlug ? `${buyHref}?items=${encodeURIComponent(t.accesoSlug)}:1` : buyHref;
}
