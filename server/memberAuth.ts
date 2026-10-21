import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { parse as parseCookieHeader } from 'cookie';
import { ENV } from './_core/env';

/* Sesión de «Mi cuenta» (socios): código de 6 dígitos al correo y una cookie
 * firmada de 90 días. Mismo esquema sin tablas que /recargar
 * (server/topupAccess.ts) pero con otro «dominio» en el HMAC: un código de
 * recarga nunca abre la cuenta ni al revés. Los intentos fallidos se frenan
 * aparte con el rate limit de server/db.ts, que es lo que hace seguro un
 * código corto. */

export const MEMBER_COOKIE = 'mp_member';
export const MEMBER_CODE_WINDOW_MS = 10 * 60 * 1000;
export const MEMBER_SESSION_MS = 90 * 24 * 3600 * 1000;

function secret(): string {
  if (!ENV.cookieSecret) throw new Error('JWT_SECRET no configurado');
  return ENV.cookieSecret;
}

export const normalizeMemberEmail = (email: string): string => email.trim().toLowerCase();

function codeForWindow(email: string, windowIndex: number): string {
  const digest = createHmac('sha256', secret()).update(`member-code:${normalizeMemberEmail(email)}:${windowIndex}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

/** El código de 6 dígitos vigente para este correo (reenviar manda el mismo número en la misma ventana). */
export function currentMemberCode(email: string, now: number = Date.now()): string {
  return codeForWindow(email, Math.floor(now / MEMBER_CODE_WINDOW_MS));
}

const safeEqual = (a: string, b: string): boolean => {
  const l = Buffer.from(a), r = Buffer.from(b);
  return l.length === r.length && timingSafeEqual(l, r);
};

export function verifyMemberCode(email: string, rawCode: string, now: number = Date.now()): boolean {
  const code = rawCode.replace(/\D/g, '');
  if (code.length !== 6) return false;
  const w = Math.floor(now / MEMBER_CODE_WINDOW_MS);
  const current = safeEqual(code, codeForWindow(email, w));
  const previous = safeEqual(code, codeForWindow(email, w - 1));
  return current || previous;
}

export function signMemberSession(email: string, now: number = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ e: normalizeMemberEmail(email), x: now + MEMBER_SESSION_MS })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(`member-session:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

/** El correo de la sesión, o null si está vencida o adulterada. */
export function verifyMemberSession(token: string, now: number = Date.now()): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret()).update(`member-session:${payload}`).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { e?: string; x?: number };
    if (!e || typeof x !== 'number' || x < now) return null;
    return e;
  } catch {
    return null;
  }
}

/** Correo de la persona que entró a «Mi cuenta» en este navegador, o null. */
export function getMemberEmail(req: Request): string | null {
  try {
    const token = parseCookieHeader(req.headers.cookie ?? '')[MEMBER_COOKIE];
    return token ? verifyMemberSession(token) : null;
  } catch {
    return null;
  }
}

function secureRequest(req: Request): boolean {
  if (req.protocol === 'https') return true;
  const fwd = req.headers['x-forwarded-proto'];
  return (Array.isArray(fwd) ? fwd : (fwd ?? '').split(',')).some((p) => p.trim().toLowerCase() === 'https');
}

export function setMemberSession(req: Request, res: Response, email: string): void {
  res.cookie(MEMBER_COOKIE, signMemberSession(email), { httpOnly: true, sameSite: 'lax', secure: secureRequest(req), path: '/', maxAge: MEMBER_SESSION_MS });
}

export function clearMemberSession(req: Request, res: Response): void {
  res.clearCookie(MEMBER_COOKIE, { httpOnly: true, sameSite: 'lax', secure: secureRequest(req), path: '/' });
}

const COUPON_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Código de cupón legible, sin letras que se confunden (0/O, 1/I/L). */
export function randomCouponCode(): string {
  return `PLAY-${Array.from({ length: 6 }, () => COUPON_ALPHABET[randomInt(COUPON_ALPHABET.length)]).join('')}`;
}
