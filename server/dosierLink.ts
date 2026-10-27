/* Link firmado para descargar el dosier de barra sin sesión (admin, tablet de la barra o el grupo de WhatsApp del
 * staff). El token lleva el evento y el vencimiento, firmado con HMAC: no se puede cambiar de evento ni alargarlo. */
import { createHmac, timingSafeEqual } from "crypto";
import { ENV } from "./_core/env";

const secret = () => {
  if (ENV.cookieSecret) return `dosier:${ENV.cookieSecret}`;
  if (ENV.isProduction) throw new Error("Falta JWT_SECRET para firmar el link del dosier");
  return "dosier:dev";
};
const b64 = (b: Buffer) => b.toString("base64url");
const sign = (body: string) => b64(createHmac("sha256", secret()).update(body).digest()).slice(0, 32);

export function firmarDosier(eventId: number, ttlMs: number, now = Date.now()): { token: string; expiresAt: Date } {
  const exp = Math.floor((now + ttlMs) / 1000);
  const body = b64(Buffer.from(JSON.stringify({ e: eventId, x: exp })));
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp * 1000) };
}

/** El evento del token, o `null` si la firma no calza o ya venció. */
export function verificarDosier(token: string, now = Date.now()): number | null {
  const [body, sig] = String(token).replace(/\.pdf$/, "").split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { e, x } = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!Number.isInteger(e) || e <= 0 || !Number.isFinite(x) || x * 1000 < now) return null;
    return e;
  } catch {
    return null;
  }
}

export const DOSIER_TTL_ADMIN = 7 * 24 * 3600 * 1000;
export const DOSIER_TTL_CAJA = 12 * 3600 * 1000;
export const dosierPath = (token: string) => `/api/dosier/${token}.pdf`;
