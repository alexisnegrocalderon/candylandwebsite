/** Tarjetas guardadas de los socios (Etapa A de «Mi cuenta»).
 *
 * Nunca guardamos datos de tarjeta: las tarjetas viven en Mercado Pago
 * (Clientes y Tarjetas) y acá solo queda `customers.mpCustomerId`. Para pagar
 * con una guardada, el Payment Brick pide el CVV y arma un token nuevo; el
 * cobro va con `payer: { type: 'customer', id }` (server/mercadopago.ts).
 *
 * Todo depende del interruptor `memberConfig.payments.savedCards`. */
import { eq } from 'drizzle-orm';
import { Customer, CustomerCard } from 'mercadopago';
import { getDb } from './db';
import { getClient } from './mercadopago';
import { normalizeMemberEmail } from './memberAuth';
import { customers } from '../drizzle/schema';

export interface SavedCard {
  id: string;
  brand: string;
  brandName: string;
  last4: string;
  expiry: string;
  isDefault: boolean;
  thumbnail: string | null;
}

async function customerRow(email: string) {
  const db = await getDb();
  if (!db) return null;
  const [c] = await db.select({ id: customers.id, email: customers.email, fullName: customers.fullName, mpCustomerId: customers.mpCustomerId })
    .from(customers).where(eq(customers.email, normalizeMemberEmail(email))).limit(1);
  return c ?? null;
}

/** El cliente de Mercado Pago del socio: lo busca por correo o lo crea, y guarda el id. Null sin credenciales o sin cliente nuestro. */
export async function ensureMpCustomer(email: string): Promise<string | null> {
  const row = await customerRow(email);
  if (!row) return null;
  if (row.mpCustomerId) return row.mpCustomerId;
  const client = getClient();
  if (!client) return null;
  const api = new Customer(client);
  const found = await api.search({ options: { email: row.email } });
  let id = found.results?.[0]?.id ?? null;
  if (!id) {
    const [first, ...rest] = (row.fullName ?? '').trim().split(/\s+/);
    const created = await api.create({ body: { email: row.email, first_name: first || undefined, last_name: rest.join(' ') || undefined } });
    id = created.id ?? null;
  }
  if (id) {
    const db = await getDb();
    await db?.update(customers).set({ mpCustomerId: id }).where(eq(customers.id, row.id));
  }
  return id;
}

/** Id ya guardado (sin llamar a Mercado Pago). */
export async function storedMpCustomerId(email: string): Promise<string | null> {
  return (await customerRow(email))?.mpCustomerId ?? null;
}

export async function listCards(email: string): Promise<SavedCard[]> {
  const customerId = await storedMpCustomerId(email);
  const client = getClient();
  if (!customerId || !client) return [];
  const c = await new Customer(client).get({ customerId });
  return (c.cards ?? []).map((card: any) => ({
    id: String(card.id),
    brand: String(card.payment_method?.id ?? ''),
    brandName: String(card.payment_method?.name ?? 'Tarjeta'),
    last4: String(card.last_four_digits ?? ''),
    expiry: card.expiration_month && card.expiration_year ? `${String(card.expiration_month).padStart(2, '0')}/${String(card.expiration_year).slice(-2)}` : '',
    isDefault: !!c.default_card && String(c.default_card) === String(card.id),
    thumbnail: card.payment_method?.secure_thumbnail ?? card.payment_method?.thumbnail ?? null,
  }));
}

async function assertOwnCard(email: string, cardId: string): Promise<string> {
  const customerId = await storedMpCustomerId(email);
  if (!customerId) throw new Error('No tienes tarjetas guardadas.');
  if (!(await listCards(email)).some((c) => c.id === cardId)) throw new Error('Esa tarjeta no es tuya.');
  return customerId;
}

export async function removeCard(email: string, cardId: string): Promise<void> {
  const customerId = await assertOwnCard(email, cardId);
  const client = getClient();
  if (!client) throw new Error('Pagos no configurados.');
  await new CustomerCard(client).remove({ customerId, cardId });
}

export async function setDefaultCard(email: string, cardId: string): Promise<void> {
  const customerId = await assertOwnCard(email, cardId);
  const client = getClient();
  if (!client) throw new Error('Pagos no configurados.');
  await new Customer(client).update({ customerId, body: { default_card: cardId } as any });
}

/** Guarda la tarjeta del pago recién aprobado. Si Mercado Pago no acepta reusar el token, no rompe nada: devuelve false. */
export async function saveCardFromToken(email: string, token: string): Promise<boolean> {
  try {
    const customerId = await ensureMpCustomer(email);
    const client = getClient();
    if (!customerId || !client) return false;
    await new CustomerCard(client).create({ customerId, body: { token } });
    return true;
  } catch (err) {
    console.warn('[MemberCards] No se pudo guardar la tarjeta:', err instanceof Error ? err.message : err);
    return false;
  }
}

/** Lo que el Payment Brick necesita para mostrar las tarjetas guardadas. */
export async function brickInit(email: string): Promise<{ customerId: string; cardIds: string[] } | null> {
  const customerId = await storedMpCustomerId(email);
  if (!customerId) return null;
  const cards = await listCards(email).catch(() => []);
  return { customerId, cardIds: cards.map((c) => c.id) };
}
