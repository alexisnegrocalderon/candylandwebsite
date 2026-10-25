/* Los filtros de Clientes viajan en la URL del CSV y de la vista de impresión: «exporta lo que estás viendo».
 * Una sola lectura de esos parámetros para el servidor y la impresión, con los mismos nombres que usa la
 * tabla (customers.page / listAll). Lo que no se reconoce se ignora. */

export const CUSTOMER_LEVELS = ['sin_compras', 'nuevo', 'recurrente', 'vip', 'inactivo'] as const;
type Level = (typeof CUSTOMER_LEVELS)[number];

export type CustomerFilterParams = {
  search?: string; accessType?: string; tag?: string; eventId?: number;
  level?: Level; city?: string; gender?: string; source?: string;
  birthdayMonth?: number; optedOut?: 'email' | 'any'; hasApp?: boolean;
};

const text = (v: string | null | undefined) => v?.trim() || undefined;

export function parseCustomerFilterParams(get: (key: string) => string | null | undefined): CustomerFilterParams {
  const eventId = Number(get('eventId'));
  const month = Number(get('birthdayMonth'));
  const level = get('level') as Level | null | undefined;
  const optedOut = get('optedOut');
  const out: CustomerFilterParams = {
    search: text(get('search')), accessType: text(get('accessType')), tag: text(get('tag')),
    city: text(get('city')), gender: text(get('gender')), source: text(get('source')),
  };
  if (Number.isInteger(eventId) && eventId > 0) out.eventId = eventId;
  if (Number.isInteger(month) && month >= 1 && month <= 12) out.birthdayMonth = month;
  if (level && (CUSTOMER_LEVELS as readonly string[]).includes(level)) out.level = level;
  if (optedOut === 'email' || optedOut === 'any') out.optedOut = optedOut;
  if (get('hasApp') === '1') out.hasApp = true;
  for (const k of Object.keys(out) as (keyof CustomerFilterParams)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** La inversa: los parámetros de URL de los filtros activos de la tabla. */
export function customerFilterQuery(f: CustomerFilterParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(f)) {
    if (value === undefined || value === false || value === '') continue;
    params.set(key, value === true ? '1' : String(value));
  }
  return params;
}
