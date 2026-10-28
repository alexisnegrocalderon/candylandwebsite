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

/** `accesoSlug` de un pase «a elección»: vale por UNA unidad de cualquier acceso que la persona escoja al comprar. */
export const ANY_ACCESS_SLUG = '*';

/** Datos de un pase REGALADO. Viajan en la columna `note` del crédito (JSON), así regalar no necesita migración: un crédito
 * de siempre tiene una nota de texto y `parseGiftNote` devuelve `null`. */
export interface GiftMeta {
  gift: 1;
  /** Evento para el que vale (solo ese). */
  eventId: number;
  eventTitle: string | null;
  /** ISO: vence en esta fecha; `null` = sin vencimiento propio. */
  validUntil: string | null;
  reason: string | null;
  by: string | null;
}

export function giftNote(meta: Omit<GiftMeta, 'gift'>): string {
  const trim = (v: string | null) => (v ? v.slice(0, 80) : null);
  return JSON.stringify({ gift: 1, eventId: meta.eventId, eventTitle: trim(meta.eventTitle), validUntil: meta.validUntil, reason: trim(meta.reason), by: trim(meta.by) });
}

export function parseGiftNote(note: string | null | undefined): GiftMeta | null {
  if (!note || note[0] !== '{') return null;
  try {
    const v = JSON.parse(note) as Partial<GiftMeta>;
    if (v.gift !== 1 || !Number.isFinite(Number(v.eventId))) return null;
    return { gift: 1, eventId: Number(v.eventId), eventTitle: v.eventTitle ?? null, validUntil: v.validUntil ?? null, reason: v.reason ?? null, by: v.by ?? null };
  } catch { return null; }
}

export type CreditAvailability = 'available' | 'used' | 'cancelled' | 'expired';

/** El estado real de un crédito. `order` es la orden que lo reservó (o null). Un pase regalado además vence. */
export function creditAvailability(
  credit: { status: string; usedOrderId: number | null; reservedAt: Date | string | null; note?: string | null },
  order: { paymentStatus: string; createdAt: Date | string } | null,
  now: Date = new Date(),
): CreditAvailability {
  const base = baseAvailability(credit, order, now);
  if (base !== 'available') return base;
  const gift = parseGiftNote(credit.note);
  return gift?.validUntil && new Date(gift.validUntil).getTime() < now.getTime() ? 'expired' : 'available';
}

/** Por qué un pase regalado no sirve para esta compra (otro evento, o ya venció); `null` si sirve. Un crédito de siempre sirve en cualquiera. */
export function giftPassError(credit: { note?: string | null }, eventId: number, now: Date = new Date()): string | null {
  const gift = parseGiftNote(credit.note);
  if (!gift) return null;
  if (gift.validUntil && new Date(gift.validUntil).getTime() < now.getTime()) return 'Este pase venció.';
  if (gift.eventId !== eventId) return `Este pase es para ${gift.eventTitle ?? 'otro evento'}.`;
  return null;
}

function baseAvailability(
  credit: { status: string; usedOrderId: number | null; reservedAt: Date | string | null },
  order: { paymentStatus: string; createdAt: Date | string } | null,
  now: Date,
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
 * mismo tipo (cualquier acceso, si el pase es «a elección»; la más barata si hubiera varias). `null` si el carrito no tiene
 * ese acceso. Aunque compren 3, solo una sale gratis. */
export function creditDiscount(accesoSlug: string, lines: CartAccessLine[]): { amount: number; ticketTypeId: number } | null {
  const matching = lines.filter((l) => l.category === 'acceso' && (accesoSlug === ANY_ACCESS_SLUG || l.accesoSlug === accesoSlug) && l.quantity > 0);
  if (matching.length === 0) return null;
  const cheapest = matching.reduce((a, b) => (b.unitPrice < a.unitPrice ? b : a));
  return { amount: cheapest.unitPrice, ticketTypeId: cheapest.ticketTypeId };
}
