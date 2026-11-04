/* Link firmado del inventario en PDF: se abre sin sesión (celular, WhatsApp) y genera el PDF en el momento con lo que
 * hay en la base, así siempre sale actualizado. El token lleva el evento, las personas esperadas y el vencimiento,
 * firmados con HMAC: no se puede cambiar de evento ni alargar. Mismo patrón que server/dosierLink.ts. */
import { createHmac, timingSafeEqual } from "crypto";
import { ENV } from "./_core/env";

const secret = () => {
  if (ENV.cookieSecret) return `inventario:${ENV.cookieSecret}`;
  if (ENV.isProduction) throw new Error("Falta JWT_SECRET para firmar el link del inventario");
  return "inventario:dev";
};
const b64 = (b: Buffer) => b.toString("base64url");
const sign = (body: string) => b64(createHmac("sha256", secret()).update(body).digest()).slice(0, 32);

export interface InventarioToken { eventId: number; /** 0 = las personas con entrada. */ personas: number }

export function firmarInventario(t: InventarioToken, ttlMs: number, now = Date.now()): { token: string; expiresAt: Date } {
  const exp = Math.floor((now + ttlMs) / 1000);
  const body = b64(Buffer.from(JSON.stringify({ e: t.eventId, p: t.personas, x: exp })));
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp * 1000) };
}

/** Lo que dice el token, o `null` si la firma no calza o ya venció. */
export function verificarInventario(token: string, now = Date.now()): InventarioToken | null {
  const [body, sig] = String(token).replace(/\.pdf$/, "").split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { e, p, x } = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!Number.isInteger(e) || e <= 0 || !Number.isInteger(p) || p < 0 || p > 100_000 || !Number.isFinite(x) || x * 1000 < now) return null;
    return { eventId: e, personas: p };
  } catch {
    return null;
  }
}

export const INVENTARIO_TTL = 7 * 24 * 3600 * 1000;
export const inventarioPath = (token: string) => `/api/inventario/${token}.pdf`;
