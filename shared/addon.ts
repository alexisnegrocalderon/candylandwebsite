/** Agregar un extra (estacionamiento, piscolas...) a una compra ya hecha, con su
 * propio link de pago. Solo lógica pura -- lo que toca base de datos y Mercado
 * Pago vive en server/orderAddon.ts. */
import { isAnyParkingTicketType } from './parking';

/** Prefijo del `external_reference` del pago de un extra agregado. Como el de
 * los upgrades (`UPG-`), lo distingue del pago de la compra original para que
 * el webhook NO lo procese como una orden (esa ruta pisaría `orders.paymentId`
 * y volvería a sumar stock). */
export const ADDON_REFERENCE_PREFIX = 'ADD-';

/** Monto mínimo de un link de pago de Mercado Pago (CLP). */
export const MIN_ADDON_PAYMENT = 1000;

/** Tope de unidades por solicitud de un extra normal. */
export const MAX_ADDON_QUANTITY = 10;

export function buildAddonReference(addonId: number): string {
  return `${ADDON_REFERENCE_PREFIX}${addonId}`;
}

/** 'ADD-7' → 7. Cualquier otra cosa (un número de orden, 'UPG-3', vacío) → null. */
export function parseAddonReference(reference: string | null | undefined): number | null {
  if (!reference) return null;
  const m = reference.match(/^ADD-(\d+)$/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

type AddonCandidate = {
  category: string;
  status: string;
  topupAmount?: number | null;
};

/** ¿Este producto se puede agregar a una compra ya hecha? Solo extras que se
 * venden hoy en la web: se excluyen los ocultos/agotados y los productos de
 * "carga de saldo" (esos acreditan saldo en la PlayCard, no son un derecho
 * canjeable). */
export function isSellableAddon(type: AddonCandidate): boolean {
  if (type.category !== 'extra') return false;
  if (type.status !== 'active') return false;
  const topup = type.topupAmount;
  if (typeof topup === 'number' && Number.isFinite(topup) && topup > 0) return false;
  return true;
}

/** Cuántas unidades se pueden pedir de este extra en una solicitud. Un auto es
 * un auto: el estacionamiento (VIP incluido) va de a uno por compra, igual que
 * el cobro en la puerta, que bloquea un segundo estacionamiento por comprador. */
export function maxAddonQuantity(name: string, remaining: number): number {
  const cap = isAnyParkingTicketType(name) ? 1 : MAX_ADDON_QUANTITY;
  return Math.max(0, Math.min(cap, Math.floor(remaining)));
}

/** Lo que cuesta una solicitud: siempre precio de la base de datos por la
 * cantidad, nunca un monto que mande el cliente. */
export function addonAmount(unitPrice: number, quantity: number): number {
  const price = Number(unitPrice);
  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(price) || !Number.isFinite(qty) || price < 0 || qty < 1) return 0;
  return Math.round(price) * qty;
}
