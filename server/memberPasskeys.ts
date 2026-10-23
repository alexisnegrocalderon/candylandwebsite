import { createHmac, timingSafeEqual } from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { getDb } from './db';
import { ENV } from './_core/env';
import { normalizeMemberEmail } from './memberAuth';
import { memberPasskeys } from '../drizzle/schema';

/* Face ID / Touch ID / huella para «Mi cuenta» (passkeys). Es ADEMÁS del
 * código al correo, no en su reemplazo: el socio entra una vez con el código,
 * activa Face ID desde la app y las próximas veces entra con un toque.
 *
 * Mismo esquema que las passkeys del panel (server/webauthn.ts: rpID fijo en
 * producción, credenciales «discoverable», verificación del usuario
 * obligatoria) pero con su propia tabla y sus propios vales: una llave de
 * socio nunca abre el panel ni al revés. El challenge viaja firmado (HMAC con
 * otro «dominio» que la cookie de socio) en vez de guardarse en el servidor;
 * el de registro va además ligado al correo de la sesión. */

export const MEMBER_PASSKEY_RP_NAME = 'Mansion Playroom';
const TICKET_TTL_MS = 2 * 60 * 1000;

function secret(): string {
  if (!ENV.cookieSecret) throw new Error('JWT_SECRET no configurado');
  return ENV.cookieSecret;
}

/** Identidad del socio en el llavero: fija por correo (registrar de nuevo reemplaza la llave en vez
 * de sumar otra) y sin el correo a la vista (la especificación pide que el userID no sea un dato personal). */
export function memberPasskeyUserId(email: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(createHmac('sha256', secret()).update(`member-passkey-user:${normalizeMemberEmail(email)}`).digest());
}

type TicketKind = 'reg' | 'auth';

export function signPasskeyTicket(kind: TicketKind, challenge: string, email = '', now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ k: kind, c: challenge, e: email ? normalizeMemberEmail(email) : '', x: now + TICKET_TTL_MS })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(`member-passkey-ticket:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

/** El challenge del vale, o null si venció, está adulterado, es de otro tipo o de otro correo. */
export function readPasskeyTicket(kind: TicketKind, ticket: string, email = '', now = Date.now()): string | null {
  const [payload, sig] = ticket.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(createHmac('sha256', secret()).update(`member-passkey-ticket:${payload}`).digest('base64url'));
  const got = Buffer.from(sig);
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  try {
    const t = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { k?: string; c?: string; e?: string; x?: number };
    if (t.k !== kind || !t.c || typeof t.x !== 'number' || t.x < now) return null;
    if ((t.e ?? '') !== (email ? normalizeMemberEmail(email) : '')) return null;
    return t.c;
  } catch {
    return null;
  }
}

/** Nombre corto del dispositivo, para reconocer la llave en la lista. */
export function passkeyDeviceLabel(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  return 'Otro dispositivo';
}

export async function listMemberPasskeys(email: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(memberPasskeys).where(eq(memberPasskeys.email, normalizeMemberEmail(email))).orderBy(desc(memberPasskeys.createdAt));
}

export async function deleteMemberPasskey(email: string, id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  // Siempre con el correo de la sesión: nadie puede quitar la llave de otro.
  await db.delete(memberPasskeys).where(and(eq(memberPasskeys.id, id), eq(memberPasskeys.email, normalizeMemberEmail(email))));
}

export async function registrationOptions(params: { rpID: string; email: string; displayName: string | null }) {
  const existing = await listMemberPasskeys(params.email);
  const options = await generateRegistrationOptions({
    rpName: MEMBER_PASSKEY_RP_NAME,
    rpID: params.rpID,
    userID: memberPasskeyUserId(params.email),
    userName: normalizeMemberEmail(params.email),
    userDisplayName: params.displayName || normalizeMemberEmail(params.email),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({ id: c.credentialId })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required', authenticatorAttachment: 'platform' },
  });
  return { options, ticket: signPasskeyTicket('reg', options.challenge, params.email) };
}

export async function verifyAndSaveRegistration(params: { email: string; ticket: string; response: RegistrationResponseJSON; rpID: string; origin: string; userAgent?: string }): Promise<boolean> {
  const challenge = readPasskeyTicket('reg', params.ticket, params.email);
  if (!challenge) return false;
  const v = await verifyRegistrationResponse({ response: params.response, expectedChallenge: challenge, expectedOrigin: params.origin, expectedRPID: params.rpID }).catch(() => null);
  if (!v?.verified || !v.registrationInfo) return false;
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const { credential } = v.registrationInfo;
  await db.insert(memberPasskeys).values({
    email: normalizeMemberEmail(params.email),
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: credential.transports ?? null,
    deviceLabel: passkeyDeviceLabel(params.userAgent),
  });
  return true;
}

export async function authenticationOptions(rpID: string) {
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'required' });
  return { options, ticket: signPasskeyTicket('auth', options.challenge) };
}

export type PasskeyLoginResult = { ok: true; email: string } | { ok: false; reason: 'unknown'; credentialId: string } | { ok: false; reason: 'invalid' };

/** Verifica el Face ID y devuelve el correo de la llave. `unknown`: la llave ya no existe acá
 * (se quitó desde la app): el cliente le avisa al llavero para que la borre. */
export async function verifyPasskeyLogin(params: { ticket: string; response: AuthenticationResponseJSON; rpID: string; origin: string }): Promise<PasskeyLoginResult> {
  const challenge = readPasskeyTicket('auth', params.ticket);
  if (!challenge) return { ok: false, reason: 'invalid' };
  const credentialId = typeof params.response?.id === 'string' ? params.response.id : '';
  const db = await getDb();
  if (!db) throw new Error('Database not available');
  const [row] = credentialId ? await db.select().from(memberPasskeys).where(eq(memberPasskeys.credentialId, credentialId)).limit(1) : [];
  if (!row) return { ok: false, reason: 'unknown', credentialId };
  const v = await verifyAuthenticationResponse({
    response: params.response,
    expectedChallenge: challenge,
    expectedOrigin: params.origin,
    expectedRPID: params.rpID,
    credential: {
      id: row.credentialId,
      publicKey: new Uint8Array(Buffer.from(row.publicKey, 'base64url')),
      counter: row.counter,
      transports: (row.transports as any) ?? undefined,
    } as Parameters<typeof verifyAuthenticationResponse>[0]['credential'],
  }).catch(() => null);
  if (!v?.verified) return { ok: false, reason: 'invalid' };
  await db.update(memberPasskeys).set({ counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() }).where(eq(memberPasskeys.id, row.id));
  return { ok: true, email: row.email };
}
