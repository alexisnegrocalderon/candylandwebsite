/* Unir dos fichas de la misma persona (compró con dos correos). Lógica pura: qué queda en la ficha que se
 * conserva. El servidor (server/customerMerge.ts) mueve compras, saldos, cupones y dispositivos. */

export interface MergeableCustomer {
  email: string;
  fullName: string | null; phone: string | null; rut: string | null; instagram: string | null;
  birthDate: string | null; gender: string | null; city: string | null; source: string | null; ambassadorCode: string | null; levelOverride: string | null;
  accessTypes: unknown; tags: unknown;
  totalOrders: number; totalSpent: string | number; playcoins: number; prepaidBalance: number;
  memberSince: Date | string | null; firstSeenAt: Date | string; lastSeenAt: Date | string;
  cardPinHash: string | null; cardPinSetAt: Date | string | null;
  emailOptOut: number; whatsappOptOut: number; optOutAt: Date | string | null; optOutReason: string | null;
}

export const ALIAS_TAG_PREFIX = 'alias:';
export const aliasTag = (email: string) => `${ALIAS_TAG_PREFIX}${email.trim().toLowerCase()}`;

const list = (v: unknown): string[] => {
  // Según el motor, una columna JSON llega ya como lista o como texto.
  let value = v;
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return []; } }
  return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
};
const empty = (v: string | null | undefined) => !v || !v.trim();
const time = (v: Date | string) => new Date(v).getTime();
const date = (v: Date | string | null | undefined): Date | null => (v ? new Date(v) : null);

/** Los campos de la ficha que se conserva después de sumarle la repetida. */
export function mergeCustomerFields(keep: MergeableCustomer, from: MergeableCustomer) {
  const pick = <K extends 'fullName' | 'phone' | 'rut' | 'instagram' | 'birthDate' | 'gender' | 'city' | 'source' | 'ambassadorCode' | 'levelOverride'>(k: K) =>
    (empty(keep[k] as string | null) ? from[k] : keep[k]) ?? null;
  const members = [keep.memberSince, from.memberSince].filter((d): d is Date | string => !!d);
  const optedOut = !!(keep.emailOptOut || from.emailOptOut || keep.whatsappOptOut || from.whatsappOptOut);
  const useFromPin = !keep.cardPinHash && !!from.cardPinHash;
  return {
    fullName: pick('fullName'), phone: pick('phone'), rut: pick('rut'), instagram: pick('instagram'), birthDate: pick('birthDate'),
    gender: pick('gender') as MergeableCustomer['gender'], city: pick('city'), source: pick('source'), ambassadorCode: pick('ambassadorCode'), levelOverride: pick('levelOverride'),
    accessTypes: Array.from(new Set([...list(keep.accessTypes), ...list(from.accessTypes)])),
    // El correo viejo queda como alias: quien entre con él llega a esta ficha.
    tags: Array.from(new Set([...list(keep.tags), ...list(from.tags), aliasTag(from.email)])),
    totalOrders: keep.totalOrders + from.totalOrders,
    totalSpent: String(Number(keep.totalSpent) + Number(from.totalSpent)),
    playcoins: keep.playcoins + from.playcoins,
    prepaidBalance: keep.prepaidBalance + from.prepaidBalance,
    memberSince: members.length ? new Date(Math.min(...members.map(time))) : null,
    firstSeenAt: new Date(Math.min(time(keep.firstSeenAt), time(from.firstSeenAt))),
    lastSeenAt: new Date(Math.max(time(keep.lastSeenAt), time(from.lastSeenAt))),
    cardPinHash: useFromPin ? from.cardPinHash : keep.cardPinHash,
    cardPinSetAt: date(useFromPin ? from.cardPinSetAt : keep.cardPinSetAt),
    // Una baja de contacto de cualquiera de las dos se respeta.
    emailOptOut: keep.emailOptOut || from.emailOptOut ? 1 : 0,
    whatsappOptOut: keep.whatsappOptOut || from.whatsappOptOut ? 1 : 0,
    optOutAt: optedOut ? date(keep.optOutAt ?? from.optOutAt) ?? new Date() : null,
    optOutReason: optedOut ? keep.optOutReason ?? from.optOutReason : null,
  };
}
