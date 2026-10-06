/* Crédito de acceso (server/accessCredit.ts, createOrder en server/db.ts):
 * "1 unidad de este tipo de acceso" para un evento futuro. Acá vive lo puro:
 * generar el código, saber si sigue disponible y calcular cuánto descuenta. */

/** Minutos que un crédito reservado sin orden (el checkout falló antes de
 * crearla) espera antes de volver a quedar disponible. */
export const CREDIT_RESERVATION_ORPHAN_MINUTES = 15;
/** Horas que una orden sin pagar mantiene reservado el crédito. */
export const CREDIT_RESERVATION_UNPAID_HOURS = 2;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I
export const CREDIT_CODE_PREFIX = 'CREDITO-';

/** `CREDITO-K7M2QX`. `random` devuelve un número en [0,1) (inyectable en tests). */
export function generateCreditCode(random: () => number = Math.random, length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return `${CREDIT_CODE_PREFIX}${out}`;
}

export function normalizeCreditCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export type CreditAvailability = 'available' | 'used' | 'cancelled';

/** El estado real de un crédito. `order` es la orden que lo reservó (o null). */
export function creditAvailability(
  credit: { status: string; usedOrderId: number | null; reservedAt: Date | string | null },
  order: { paymentStatus: string; createdAt: Date | string } | null,
  now: Date = new Date(),
): CreditAvailability {
  if (credit.status === 'cancelled') return 'cancelled';
  if (credit.status === 'used') return 'used';
  if (credit.status === 'available') return 'available';
  // reserved
  if (!credit.usedOrderId || !order) {
    const reservedAt = credit.reservedAt ? new Date(credit.reservedAt).getTime() : 0;
    return now.getTime() - reservedAt > CREDIT_RESERVATION_ORPHAN_MINUTES * 60_000 ? 'available' : 'used';
  }
  if (order.paymentStatus === 'approved') return 'used';
  if (order.paymentStatus === 'rejected' || order.paymentStatus === 'refunded') return 'available';
  const age = now.getTime() - new Date(order.createdAt).getTime();
  return age > CREDIT_RESERVATION_UNPAID_HOURS * 3_600_000 ? 'available' : 'used';
}

export interface CartAccessLine {
  ticketTypeId: number;
  accesoSlug: string | null | undefined;
  category: string | null | undefined;
  unitPrice: number;
  quantity: number;
}

/** Cuánto descuenta el crédito: el precio de UNA sola unidad del acceso del
 * mismo tipo (la más barata si hubiera varias). `null` si el carrito no tiene
 * ese acceso. Aunque compren 3, solo una sale gratis. */
export function creditDiscount(accesoSlug: string, lines: CartAccessLine[]): { amount: number; ticketTypeId: number } | null {
  const matching = lines.filter((l) => l.category === 'acceso' && l.accesoSlug === accesoSlug && l.quantity > 0);
  if (matching.length === 0) return null;
  const cheapest = matching.reduce((a, b) => (b.unitPrice < a.unitPrice ? b : a));
  return { amount: cheapest.unitPrice, ticketTypeId: cheapest.ticketTypeId };
}
