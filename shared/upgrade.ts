/** Pasar un acceso Dúo a Trío cobrando la diferencia (Ventas Web). Solo lógica
 * pura -- lo que toca base de datos y Mercado Pago vive en server/. */

/** Prefijo del `external_reference` del pago de un upgrade. El pago de la
 * compra original usa el número de orden; el del upgrade usa este prefijo
 * para que el webhook lo distinga y NO pase por `applyPaymentResult` (esa
 * función pisa `orders.paymentId` y suma stock). */
export const UPGRADE_REFERENCE_PREFIX = 'UPG-';

/** Monto mínimo de un link de pago de Mercado Pago (CLP). */
export const MIN_UPGRADE_PAYMENT = 1000;

export function buildUpgradeReference(upgradeId: number): string {
  return `${UPGRADE_REFERENCE_PREFIX}${upgradeId}`;
}

/** 'UPG-12' → 12. Cualquier otra cosa (un número de orden, vacío) → null. */
export function parseUpgradeReference(reference: string | null | undefined): number | null {
  if (!reference) return null;
  const m = reference.match(/^UPG-(\d+)$/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Hoy solo se puede subir de Dúo a Trío (no Soltera, Grupo ni Dúo mujeres). */
export function canUpgradeToTrio(accesoSlug: string | null | undefined): boolean {
  return accesoSlug === 'duo';
}

/** Monto sugerido: lo que cuesta hoy el Trío menos lo que esa persona
 * realmente pagó por su Dúo (nunca negativo). */
export function computeUpgradeQuote(input: { paidUnitPrice: number; targetPrice: number }): number {
  const paid = Number(input.paidUnitPrice);
  const target = Number(input.targetPrice);
  if (!Number.isFinite(paid) || !Number.isFinite(target)) return 0;
  return Math.max(0, Math.round(target - paid));
}

/** Agrega a la tercera persona al `attendeeData` de la orden.
 *
 * Escribe SIEMPRE las dos claves (`acceso__acomp2_nombre` y `_rut`), aunque
 * vengan vacías: el listado de personas editables (listAttendeeSlots, ver
 * server/db.ts) se arma a partir de las claves que existen, así la tercera
 * persona aparece en "Editar nombres" y el dueño la completa después.
 * Es idempotente: aplicarlo dos veces deja el mismo resultado, y si no se
 * pasa nombre/RUT conserva lo que ya hubiera. Todo lo demás del JSON se
 * conserva tal cual. */
export function addThirdAttendee(
  attendeeDataJson: string | null | undefined,
  third: { name?: string | null; rut?: string | null } = {},
): string {
  let parsed: Record<string, unknown> = {};
  try {
    const value = attendeeDataJson ? JSON.parse(attendeeDataJson) : {};
    if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const campos: Record<string, unknown> =
    parsed.campos && typeof parsed.campos === 'object' && !Array.isArray(parsed.campos)
      ? { ...(parsed.campos as Record<string, unknown>) }
      : {};

  const keepOr = (key: string, next: string | null | undefined): string => {
    const wanted = (next ?? '').trim();
    if (wanted) return wanted;
    const current = campos[key];
    return typeof current === 'string' ? current : '';
  };
  campos['acceso__acomp2_nombre'] = keepOr('acceso__acomp2_nombre', third.name);
  campos['acceso__acomp2_rut'] = keepOr('acceso__acomp2_rut', third.rut);

  return JSON.stringify({ ...parsed, acceso: 'trio', campos });
}
