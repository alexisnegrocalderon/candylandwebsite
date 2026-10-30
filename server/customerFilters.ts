/* La tabla de Clientes con los filtros en la base: antes `listCustomers` traía la tabla entera y filtraba
 * en memoria; acá cada filtro es un WHERE y solo viaja la página que se ve (LIMIT/OFFSET) más el total.
 * Mismas reglas que `listCustomers` (server/db.ts), que se mantiene para las audiencias de mailing y el
 * CSV. Si la consulta fallara, `customers.page` cae a la lista en memoria (server/routers.ts). */
import { and, asc, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { customers, orders } from '../drizzle/schema';
import { INACTIVE_AFTER_DAYS, VIP_SPENT_THRESHOLD_CLP, type CustomerLevel } from '../shared/customerInsights';
import { escapeLikePattern } from '../shared/sqlLike';
import { PLACEHOLDER_BUYER_EMAILS } from '../shared/parking';
import { COMPANION_EMAIL_SUFFIX } from '../shared/companion';
import { getDb, looksLikeRutSearch, rutDigits, type CustomerListFilters } from './db';

export type CustomerPageFilters = CustomerListFilters & { hasApp?: boolean; withoutApp?: boolean };

const MS_PER_DAY = 86_400_000;

/** `col` contiene el texto dentro de un campo JSON de lista (`["a","b"]`). */
const jsonHas = (col: unknown, value: string): SQL => sql`COALESCE(JSON_CONTAINS(${col}, ${JSON.stringify(value)}), 0) = 1`;

/** Compró (orden aprobada) este evento. Con IN en vez de un EXISTS por cliente, la base lo resuelve de una vez. */
const approvedInEvent = (eventId: number): SQL =>
  sql`LOWER(${customers.email}) IN (SELECT LOWER(${orders.buyerEmail}) FROM ${orders} WHERE ${orders.eventId} = ${eventId} AND ${orders.paymentStatus} = 'approved')`;

/** El nivel calculado en SQL, igual que `computeCustomerLevel` (shared/customerInsights.ts). */
export function levelCondition(level: CustomerLevel, now: Date): SQL {
  // computeCustomerLevel cuenta días enteros: inactivo = más de 90 días cumplidos, o sea 91 o más.
  const cutoff = new Date(now.getTime() - (INACTIVE_AFTER_DAYS + 1) * MS_PER_DAY);
  const forced = sql`${customers.levelOverride} IN ('vip', 'inactivo')`;
  const auto = (extra: SQL) => and(sql`NOT COALESCE(${forced}, 0)`, extra)!;
  const hasOrders = sql`${customers.totalOrders} > 0`;
  const isVip = sql`${customers.totalSpent} >= ${VIP_SPENT_THRESHOLD_CLP}`;
  const stale = sql`${customers.lastSeenAt} <= ${cutoff}`;
  switch (level) {
    case 'vip': return or(eq(customers.levelOverride, 'vip'), auto(and(hasOrders, isVip)!))!;
    case 'inactivo': return or(eq(customers.levelOverride, 'inactivo'), auto(and(hasOrders, sql`NOT (${isVip})`, stale)!))!;
    case 'sin_compras': return auto(sql`${customers.totalOrders} <= 0`);
    case 'recurrente': return auto(and(sql`${customers.totalOrders} >= 2`, sql`NOT (${isVip})`, sql`NOT (${stale})`)!);
    case 'nuevo': return auto(and(sql`${customers.totalOrders} = 1`, sql`NOT (${isVip})`, sql`NOT (${stale})`)!);
  }
}

/** Todos los filtros de la tabla de Clientes como una condición SQL (undefined = sin filtros). */
export function customerWhere(filters: CustomerPageFilters, now: Date, appEmails?: Set<string>): SQL | undefined {
  const c: SQL[] = [];
  const search = filters.search?.trim();
  if (search) {
    const pattern = `%${escapeLikePattern(search.toLowerCase())}%`;
    const parts: SQL[] = [
      sql`LOWER(${customers.email}) LIKE ${pattern}`,
      sql`LOWER(${customers.fullName}) LIKE ${pattern}`,
      sql`${customers.phone} LIKE ${`%${escapeLikePattern(search)}%`}`,
    ];
    if (looksLikeRutSearch(search)) {
      parts.push(sql`REPLACE(REPLACE(REPLACE(LOWER(${customers.rut}), '.', ''), '-', ''), ' ', '') LIKE ${`%${rutDigits(search)}%`}`);
    }
    c.push(or(...parts)!);
  }
  if (filters.accessType) c.push(jsonHas(customers.accessTypes, filters.accessType));
  if (filters.tag) c.push(jsonHas(customers.tags, filters.tag));
  for (const tag of filters.excludeTags ?? []) c.push(sql`NOT (${jsonHas(customers.tags, tag)})`);
  if (filters.forMailing) {
    c.push(eq(customers.emailOptOut, 0));
    c.push(sql`LOWER(${customers.email}) NOT LIKE ${`%${COMPANION_EMAIL_SUFFIX}`}`);
    // Las cuentas internas (caja, invitaciones) no son personas: nunca van en un mailing.
    c.push(sql`LOWER(${customers.email}) NOT IN (${sql.join(Array.from(PLACEHOLDER_BUYER_EMAILS).map((e) => sql`${e}`), sql`, `)})`);
  }
  if (filters.optedOut === 'email') c.push(sql`${customers.emailOptOut} <> 0`);
  if (filters.optedOut === 'any') c.push(or(sql`${customers.emailOptOut} <> 0`, sql`${customers.whatsappOptOut} <> 0`)!);
  const city = filters.city?.trim().toLowerCase();
  if (city) c.push(sql`LOWER(${customers.city}) LIKE ${`%${escapeLikePattern(city)}%`}`);
  if (filters.gender) c.push(sql`${customers.gender} = ${filters.gender}`);
  if (filters.source) c.push(eq(customers.source, filters.source));
  if (filters.birthdayMonth) {
    const mm = String(filters.birthdayMonth).padStart(2, '0');
    // «AAAA-MM-DD» o, cuando no se sabe el año, «MM-DD».
    c.push(or(
      and(sql`${customers.birthDate} REGEXP '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`, sql`SUBSTRING(${customers.birthDate}, 6, 2) = ${mm}`),
      and(sql`${customers.birthDate} REGEXP '^[0-9]{2}-[0-9]{2}$'`, sql`LEFT(${customers.birthDate}, 2) = ${mm}`),
    )!);
  }
  if (filters.level) c.push(levelCondition(filters.level as CustomerLevel, now));
  if (filters.eventId) c.push(approvedInEvent(filters.eventId));
  if (filters.notPurchasedEventId) c.push(sql`NOT (${approvedInEvent(filters.notPurchasedEventId)})`);
  if (filters.hasApp) {
    const emails = Array.from(appEmails ?? []);
    c.push(emails.length ? inArray(sql`LOWER(${customers.email})`, emails) : sql`1 = 0`);
  }
  // Quien todavía NO tiene la app (la campaña del bono por instalarla no tiene sentido para quien ya la tiene).
  if (filters.withoutApp) {
    const emails = Array.from(appEmails ?? []);
    if (emails.length) c.push(sql`LOWER(${customers.email}) NOT IN (${sql.join(emails.map((e) => sql`${e}`), sql`, `)})`);
  }
  return c.length ? and(...c) : undefined;
}

/** Una página de clientes (los más recientes primero) y cuántos hay en total con esos filtros. */
export async function pageCustomers(filters: CustomerPageFilters, page: number, pageSize: number, opts: { now?: Date; appEmails?: Set<string> } = {}) {
  const db = await getDb();
  if (!db) return { rows: [] as (typeof customers.$inferSelect)[], total: 0, page: 0, pages: 1 };
  const where = customerWhere(filters, opts.now ?? new Date(), opts.appEmails);
  const [{ n }] = await db.select({ n: sql<number>`COUNT(*)` }).from(customers).where(where);
  const total = Number(n ?? 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(0, page), pages - 1);
  const rows = await db.select().from(customers).where(where)
    .orderBy(desc(customers.lastSeenAt), asc(customers.id)).limit(pageSize).offset(current * pageSize);
  return { rows, total, page: current, pages };
}

/** Búsqueda de un cliente registrado desde caja: por nombre, correo, teléfono o RUT. Solo devuelve lo
 * necesario para asociar la venta (correo, nombre, Playcoins) y deja fuera los correos marcador. */
export async function findCustomersForCaja(db: any, query: string) {
  const rows = await db.select({ email: customers.email, fullName: customers.fullName, playcoins: customers.playcoins })
    .from(customers).where(customerWhere({ search: query }, new Date())).orderBy(desc(customers.totalOrders)).limit(8);
  return (rows as { email: string; fullName: string | null; playcoins: number }[])
    .filter((r) => r.email && !PLACEHOLDER_BUYER_EMAILS.has(r.email.toLowerCase()));
}

/** Lo que se busca en el «¿A quién?» de Regalar: el texto tal cual (nombre, apellido o correo), los dígitos (teléfono, desde 3)
 * y el RUT si lo parece. `null` con menos de 2 caracteres. */
export function quickSearchTerms(query: string): { pattern: string; digits: string | null; rut: string | null } | null {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < 2) return null;
  const digits = q.replace(/\D/g, '');
  return {
    pattern: `%${escapeLikePattern(q)}%`,
    digits: digits.length >= 3 && /^[\d\s+()-]+$/.test(q) ? `%${digits}%` : null,
    rut: looksLikeRutSearch(q) ? `%${rutDigits(q)}%` : null,
  };
}

export interface QuickCustomer { id: number; email: string; fullName: string | null; phone: string | null; lastSeenAt: Date | null }

/** Búsqueda en vivo del «¿A quién?» de Regalar: nombre y apellido (van juntos en `fullName`), correo, teléfono o RUT, sin
 * importar mayúsculas ni tildes («jose» encuentra «José»), hasta 8, los vistos más recientemente primero. Sin los correos marcador.
 * La comparación sin tildes usa la collation `utf8mb4_general_ci`; si la base no la aceptara, se busca igual sin mayúsculas. */
export async function quickSearchCustomers(db: any, query: string, limit = 8): Promise<QuickCustomer[]> {
  const t = quickSearchTerms(query);
  if (!t) return [];
  const cols = { id: customers.id, email: customers.email, fullName: customers.fullName, phone: customers.phone, lastSeenAt: customers.lastSeenAt };
  const extra: SQL[] = [];
  if (t.digits) extra.push(sql`REPLACE(REPLACE(REPLACE(REPLACE(${customers.phone}, ' ', ''), '+', ''), '-', ''), '.', '') LIKE ${t.digits}`);
  if (t.rut) extra.push(sql`REPLACE(REPLACE(REPLACE(LOWER(${customers.rut}), '.', ''), '-', ''), ' ', '') LIKE ${t.rut}`);
  const run = (text: SQL[]) => db.select(cols).from(customers).where(or(...text, ...extra)).orderBy(desc(customers.lastSeenAt), asc(customers.id)).limit(limit + 4);
  let rows: QuickCustomer[];
  try {
    rows = await run([
      sql`${customers.fullName} COLLATE utf8mb4_general_ci LIKE ${t.pattern}`,
      sql`${customers.email} COLLATE utf8mb4_general_ci LIKE ${t.pattern}`,
    ]);
  } catch (err) {
    console.warn('[clientes] búsqueda sin tildes no disponible, busco sin mayúsculas:', err);
    const lower = t.pattern.toLowerCase();
    rows = await run([sql`LOWER(${customers.fullName}) LIKE ${lower}`, sql`LOWER(${customers.email}) LIKE ${lower}`]);
  }
  return rows.filter((r) => r.email && !PLACEHOLDER_BUYER_EMAILS.has(r.email.toLowerCase())).slice(0, limit);
}
