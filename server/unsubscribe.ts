/* Baja de correos de promociones: el link va en el pie de cada correo de
 * marketing y en el header List-Unsubscribe (un clic, RFC 8058: lo usan Gmail
 * y Yahoo para mostrar "Cancelar suscripción"). El link lleva el correo y una
 * firma HMAC, así nadie puede dar de baja a otra persona adivinando su correo.
 * La baja marca `customers.emailOptOut`, que ya respetan el mailing, las
 * encuestas y los correos del concurso. */
import crypto from 'crypto';
import type { Express, Request, Response } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { customers } from '../drizzle/schema';
import { getDb } from './db';
import { ENV } from './_core/env';
import { EMAIL_BASE_URL } from './emailLayout';

const secret = () => ENV.cookieSecret || 'dev-unsubscribe-secret';

const normalize = (email: string) => email.trim().toLowerCase();

export function unsubscribeToken(email: string): string {
  return crypto.createHmac('sha256', secret()).update(`unsub:${normalize(email)}`).digest('hex').slice(0, 32);
}

export function verifyUnsubscribe(email: string, token: string): boolean {
  if (!email || !/^[a-f0-9]{32}$/.test(token)) return false;
  const expected = Buffer.from(unsubscribeToken(email));
  const given = Buffer.from(token);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

const encode = (email: string) => Buffer.from(normalize(email)).toString('base64url');
export const decodeEmail = (value: string): string => {
  try { return Buffer.from(value, 'base64url').toString('utf8').trim().toLowerCase(); } catch { return ''; }
};

/** Página pública (confirmación) y endpoint de un clic. */
export function unsubscribePageUrl(email: string): string {
  return `${EMAIL_BASE_URL}/baja?e=${encode(email)}&t=${unsubscribeToken(email)}`;
}
export function unsubscribeOneClickUrl(email: string): string {
  return `${EMAIL_BASE_URL}/api/unsubscribe?e=${encode(email)}&t=${unsubscribeToken(email)}`;
}

/** Marca la baja en la ficha del cliente. `false` si ese correo no tiene ficha. */
export async function applyEmailOptOut(email: string, reason = 'Se dio de baja desde el correo'): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [res] = await db.update(customers).set({ emailOptOut: 1, optOutAt: new Date(), optOutReason: reason.slice(0, 200) })
    .where(and(sql`LOWER(${customers.email}) = ${normalize(email)}`, eq(customers.emailOptOut, 0)));
  const changed = Number((res as unknown as { affectedRows?: number })?.affectedRows ?? 0) > 0;
  if (changed) return true;
  const [row] = await db.select({ id: customers.id }).from(customers).where(sql`LOWER(${customers.email}) = ${normalize(email)}`).limit(1);
  return !!row;
}

/** ¿Pidió no recibir correos de promociones? */
export async function isEmailOptedOut(email: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const [row] = await db.select({ out: customers.emailOptOut }).from(customers).where(sql`LOWER(${customers.email}) = ${normalize(email)}`).limit(1);
  return !!row?.out;
}

export function registerUnsubscribeRoutes(app: Express) {
  // Un clic desde el cliente de correo (POST, RFC 8058).
  app.post('/api/unsubscribe', async (req: Request, res: Response) => {
    const email = decodeEmail(String(req.query.e ?? ''));
    if (!verifyUnsubscribe(email, String(req.query.t ?? ''))) { res.status(400).json({ success: false }); return; }
    await applyEmailOptOut(email).catch(() => false);
    res.json({ success: true });
  });
  // Si alguien abre el link directo (GET): se lleva a la página de confirmación.
  app.get('/api/unsubscribe', (req: Request, res: Response) => {
    res.redirect(302, `/baja?e=${encodeURIComponent(String(req.query.e ?? ''))}&t=${encodeURIComponent(String(req.query.t ?? ''))}`);
  });
}
