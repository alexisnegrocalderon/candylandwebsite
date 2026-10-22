/** «Pagar en caja» con la app de socios (Etapa A).
 *
 * El socio abre un QR en «Mi cuenta»; la cajera lo escanea y cobra con su
 * saldo (o le descuenta Playcoins) sin pedir el PIN: el teléfono con la
 * sesión iniciada reemplaza al PIN. Por eso el QR:
 *  - vence en 2 minutos (la app lo renueva sola),
 *  - sirve una sola vez (UPDATE condicional sobre `usedAt`),
 *  - va firmado con HMAC y ligado al correo (la firma no sirve para otro correo).
 * Interruptor: `memberConfig.payments.cajaPay`. */
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { getDb } from './db';
import { ENV } from './_core/env';
import { normalizeMemberEmail } from './memberAuth';
import { memberPayTokens } from '../drizzle/schema';
import { PAY_QR_PREFIX } from '../shared/qr';

export const PAY_TOKEN_TTL_MS = 2 * 60 * 1000;

function sign(nonce: string, email: string): string {
  if (!ENV.cookieSecret) throw new Error('JWT_SECRET no configurado');
  return createHmac('sha256', ENV.cookieSecret).update(`member-pay:${nonce}:${normalizeMemberEmail(email)}`).digest('base64url').slice(0, 22);
}

/** Separa `PLAYPAY:v1:<nonce>.<firma>`. Null si no tiene esa forma. */
export function parsePayToken(raw: string): { nonce: string; sig: string } | null {
  const s = (raw ?? '').trim();
  if (!s.startsWith(PAY_QR_PREFIX)) return null;
  const [nonce, sig] = s.slice(PAY_QR_PREFIX.length).split('.');
  if (!nonce || !sig || !/^[A-Za-z0-9_-]{8,32}$/.test(nonce) || !/^[A-Za-z0-9_-]{10,40}$/.test(sig)) return null;
  return { nonce, sig };
}

function sigOk(nonce: string, email: string, sig: string): boolean {
  const expected = Buffer.from(sign(nonce, email));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export async function createPayToken(email: string, now = new Date()): Promise<{ token: string; expiresAt: Date }> {
  const db = await getDb();
  if (!db) throw new Error('Base de datos no disponible');
  const clean = normalizeMemberEmail(email);
  const nonce = randomBytes(12).toString('base64url');
  const expiresAt = new Date(now.getTime() + PAY_TOKEN_TTL_MS);
  await db.insert(memberPayTokens).values({ nonce, email: clean, expiresAt });
  return { token: `${PAY_QR_PREFIX}${nonce}.${sign(nonce, clean)}`, expiresAt };
}

export type PayTokenCheck = { ok: true; email: string } | { ok: false; reason: string };

/** Valida firma, vigencia y que no esté usado. No lo consume. */
export async function resolvePayToken(raw: string, now = new Date()): Promise<PayTokenCheck> {
  const parsed = parsePayToken(raw);
  if (!parsed) return { ok: false, reason: 'Ese QR no es un pago de la app.' };
  const db = await getDb();
  if (!db) return { ok: false, reason: 'Base de datos no disponible' };
  const [row] = await db.select().from(memberPayTokens).where(eq(memberPayTokens.nonce, parsed.nonce)).limit(1);
  if (!row || !sigOk(parsed.nonce, row.email, parsed.sig)) return { ok: false, reason: 'QR de pago inválido.' };
  if (row.usedAt) return { ok: false, reason: 'Ese QR ya se usó. Pídele que abra uno nuevo en la app.' };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'El QR venció. Pídele que lo actualice en la app.' };
  return { ok: true, email: row.email };
}

/** Lo marca usado por esta venta (una sola vez). Si la misma venta (opId) se reintenta, sigue valiendo. */
export async function consumePayToken(raw: string, email: string, opId: string, now = new Date()): Promise<PayTokenCheck> {
  const parsed = parsePayToken(raw);
  if (!parsed) return { ok: false, reason: 'Ese QR no es un pago de la app.' };
  const db = await getDb();
  if (!db) return { ok: false, reason: 'Base de datos no disponible' };
  const clean = normalizeMemberEmail(email);
  const [row] = await db.select().from(memberPayTokens).where(eq(memberPayTokens.nonce, parsed.nonce)).limit(1);
  if (!row || row.email !== clean || !sigOk(parsed.nonce, row.email, parsed.sig)) return { ok: false, reason: 'El QR de pago no corresponde a este cliente.' };
  if (row.usedOpId === opId) return { ok: true, email: clean };
  const [res] = await db.update(memberPayTokens).set({ usedAt: now, usedOpId: opId })
    .where(and(eq(memberPayTokens.nonce, parsed.nonce), isNull(memberPayTokens.usedAt), gt(memberPayTokens.expiresAt, now))) as any;
  if (Number(res?.affectedRows ?? 0) === 1) return { ok: true, email: clean };
  const [again] = await db.select().from(memberPayTokens).where(eq(memberPayTokens.nonce, parsed.nonce)).limit(1);
  if (again?.usedOpId === opId) return { ok: true, email: clean };
  return { ok: false, reason: again?.usedAt ? 'Ese QR ya se usó. Pídele que abra uno nuevo en la app.' : 'El QR venció. Pídele que lo actualice en la app.' };
}

/** Si el cobro falla después de consumir el QR (ej. saldo insuficiente), se libera para reintentar. */
export async function releasePayToken(raw: string, opId: string): Promise<void> {
  const parsed = parsePayToken(raw);
  const db = await getDb();
  if (!parsed || !db) return;
  await db.update(memberPayTokens).set({ usedAt: null, usedOpId: null })
    .where(and(eq(memberPayTokens.nonce, parsed.nonce), eq(memberPayTokens.usedOpId, opId)));
}

/** Limpieza oportunista: tokens de más de un día. */
export async function purgeOldPayTokens(now = new Date()): Promise<void> {
  const db = await getDb();
  await db?.delete(memberPayTokens).where(sql`${memberPayTokens.createdAt} < ${new Date(now.getTime() - 86_400_000)}`);
}
