import { createHash, randomBytes } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { ENV } from "../_core/env";

/* Enrolamiento de dispositivo (pedido explícito del usuario, más estricto
 * que docs/ARQUITECTURA-CAJA.md): solo tablets/navegadores enrolados por un
 * admin pueden llegar siquiera a la pantalla de PIN de /caja. */

const ENROLL_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"; // sin 0/O/1/I/L, igual que displayCode
const ENROLL_CODE_TTL_MS = 24 * 60 * 60 * 1000;
export const DEVICE_SESSION_MS = 400 * 24 * 60 * 60 * 1000; // ~13 meses (tope real de Set-Cookie)

export function generateEnrollCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += ENROLL_CODE_ALPHABET[randomBytes(1)[0] % ENROLL_CODE_ALPHABET.length];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function enrollCodeExpiry(): Date {
  return new Date(Date.now() + ENROLL_CODE_TTL_MS);
}

/** El token de dispositivo tiene alta entropía (256 bits) -- a diferencia
 * del PIN humano, no hace falta un hash lento (scrypt); SHA-256 alcanza. */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyDeviceToken(token: string, hash: string): boolean {
  return hashDeviceToken(token) === hash;
}

export type DeviceSessionPayload = { deviceId: number };

function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function signDeviceSession(deviceId: number): Promise<string> {
  const expirationSeconds = Math.floor((Date.now() + DEVICE_SESSION_MS) / 1000);
  return new SignJWT({ deviceId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSecret());
}

export async function verifyDeviceSession(cookieValue: string | undefined | null): Promise<DeviceSessionPayload | null> {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, getSecret(), { algorithms: ["HS256"] });
    const { deviceId } = payload as Record<string, unknown>;
    if (typeof deviceId !== "number") return null;
    return { deviceId };
  } catch {
    return null;
  }
}
