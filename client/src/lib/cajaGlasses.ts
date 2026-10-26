import { GLASSES, glassInfo, glassesDeProducto, type GlassId, type RecetaLinea } from '@shared/insumos';
import type { CajaCatalogItem } from '@/pages/caja/db';

/** Un trago con receta en varios vasos (vaso 500 ml, copa 400 ml, shot) aparece en
 * /caja como una tarjeta por vaso. Cada tarjeta es un "producto virtual" con su propio
 * id, así el carrito, los favoritos y la cantidad por tarjeta siguen funcionando igual.
 * Al cobrar se vuelve al producto real y se manda con qué vaso se sirvió. */
const VARIANT_BASE = 1_000_000;

export interface CatalogEntry extends CajaCatalogItem {
  /** Id del producto real (el de la carta). Igual a `id` salvo en las tarjetas por vaso. */
  baseId: number;
  /** Solo en las tarjetas por vaso. */
  glass?: GlassId;
}

export function expandCatalog(catalog: CajaCatalogItem[], recetas: RecetaLinea[]): CatalogEntry[] {
  return catalog.flatMap((p): CatalogEntry[] => {
    const glasses = glassesDeProducto(recetas, p.id).filter((g): g is GlassId => GLASSES.some((x) => x.id === g));
    if (glasses.length < 2) return [{ ...p, baseId: p.id }];
    return glasses.map((glass) => ({
      ...p, baseId: p.id, glass,
      id: VARIANT_BASE + p.id * 10 + GLASSES.findIndex((x) => x.id === glass) + 1,
      name: `${p.name} · ${glassInfo(glass)?.label ?? glass}`,
    }));
  });
}

/** Id del producto real detrás de un id del carrito. */
export function baseIdOf(cartId: number): number {
  return cartId >= VARIANT_BASE ? Math.floor((cartId - VARIANT_BASE) / 10) : cartId;
}

/** El carrito (por id de tarjeta) como líneas de venta: producto real + vaso. */
export function cartToItems(cart: Record<number, number>): { ticketTypeId: number; quantity: number; glass?: GlassId }[] {
  return Object.entries(cart).filter(([, q]) => q > 0).map(([id, quantity]) => {
    const n = Number(id);
    if (n < VARIANT_BASE) return { ticketTypeId: n, quantity };
    return { ticketTypeId: baseIdOf(n), quantity, glass: GLASSES[((n - VARIANT_BASE) % 10) - 1]?.id };
  });
}
