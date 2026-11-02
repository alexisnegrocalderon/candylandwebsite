/** De dónde viene un código de descuento. Los "manuales" son los que escribe el dueño en Descuentos;
 * el resto los crea el sistema solo y se muestran aparte. Se deduce del nombre y la descripción (no hay
 * columna): así sirve también para los códigos que ya existen. */
export type DiscountOrigin = 'manual' | 'socio' | 'cumpleanero' | 'relampago' | 'instagram' | 'prueba';

export const DISCOUNT_ORIGIN_LABEL: Record<DiscountOrigin, string> = {
  manual: 'Míos (manuales)',
  socio: 'Cupones de socio',
  cumpleanero: 'Cumpleañeros',
  relampago: 'Promo relámpago',
  instagram: 'Automatizaciones de Instagram',
  prueba: 'Cuenta de prueba',
};

export function discountOrigin(d: { code: string; description?: string | null }): DiscountOrigin {
  const desc = (d.description ?? '').trim();
  const code = d.code.toUpperCase();
  if (/^Cupón de socio:/i.test(desc)) return 'socio';
  if (/^Cumpleañero:/i.test(desc)) return 'cumpleanero';
  if (/^Automatización de Instagram:/i.test(desc)) return 'instagram';
  if (desc === 'Cuenta de prueba' || code.startsWith('DEMO-')) return 'prueba';
  if (/^FLASH[A-Z0-9_-]{4}$/.test(code)) return 'relampago';
  return 'manual';
}

export const isAutomaticDiscount = (d: { code: string; description?: string | null }) => discountOrigin(d) !== 'manual';
