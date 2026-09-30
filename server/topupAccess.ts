import { createHmac, timingSafeEqual } from 'crypto';
import { ENV } from './_core/env';

/* Acceso a la recarga de PlayCard "por código al correo" (/recargar).
 *
 * Sin tablas nuevas: el código de 6 dígitos se DERIVA (HMAC del email + la
 * ventana de tiempo) en vez de guardarse. Reenviar el código dentro de la
 * misma ventana manda el mismo número -- a propósito, así nadie queda con dos
 * códigos distintos en la bandeja sin saber cuál vale.
 *
 * Un código vale la ventana en que se pidió y la siguiente (entre 10 y 20
 * minutos). Los intentos fallidos se frenan aparte con el rate limit de
 * server/db.ts, que es lo que hace seguro un código corto. */

export const CODE_WINDOW_MS = 10 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 60 * 1000;

function secret(): string {
  if (!ENV.cookieSecret) throw new Error('JWT_SECRET no configurado');
  return ENV.cookieSecret;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function codeForWindow(email: string, windowIndex: number): string {
  const digest = createHmac('sha256', secret()).update(`topup-code:${normalizeEmail(email)}:${windowIndex}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, '0');
}

/** El código de 6 dígitos vigente para este correo. */
export function currentLoginCode(email: string, now: number = Date.now()): string {
  return codeForWindow(email, Math.floor(now / CODE_WINDOW_MS));
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Acepta lo que la gente pega: espacios, guiones ("123 456", "123-456"). */
export function cleanLoginCode(raw: string): string {
  return raw.replace(/\D/g, '');
}

export function verifyLoginCode(email: string, rawCode: string, now: number = Date.now()): boolean {
  const code = cleanLoginCode(rawCode);
  if (code.length !== 6) return false;
  const windowIndex = Math.floor(now / CODE_WINDOW_MS);
  const current = safeEqual(code, codeForWindow(email, windowIndex));
  const previous = safeEqual(code, codeForWindow(email, windowIndex - 1));
  return current || previous;
}

/** Sesión corta que el navegador guarda después de validar el código: así la
 * persona no vuelve a pedir un correo por cada paso. Firmada, sin estado. */
export function signTopupSession(email: string, now: number = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ e: normalizeEmail(email), x: now + SESSION_TTL_MS })).toString('base64url');
  const sig = createHmac('sha256', secret()).update(`topup-session:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

/** Devuelve el email de la sesión, o null si está vencida o adulterada. */
export function verifyTopupSession(token: string, now: number = Date.now()): string | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = createHmac('sha256', secret()).update(`topup-session:${payload}`).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { e?: string; x?: number };
    if (!e || typeof x !== 'number' || x < now) return null;
    return e;
  } catch {
    return null;
  }
}
