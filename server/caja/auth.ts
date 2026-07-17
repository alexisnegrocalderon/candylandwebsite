import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { CAJA_SESSION_MS } from "@shared/const";
import { ENV } from "../_core/env";

// PIN hashing: scrypt con salt aleatorio, formato "salt:hash" (ambos hex).
// No se usa bcrypt (no está en las dependencias del proyecto) — scrypt viene
// en el módulo `crypto` nativo de Node, sin agregar paquetes nuevos.
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(pin, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export type OperatorSessionPayload = {
  operatorId: number;
  role: "admin" | "supervisor" | "caja" | "barra" | "acceso";
  name: string;
};

function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function signOperatorSession(payload: OperatorSessionPayload): Promise<string> {
  const expirationSeconds = Math.floor((Date.now() + CAJA_SESSION_MS) / 1000);
  return new SignJWT({ operatorId: payload.operatorId, role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSecret());
}

export async function verifyOperatorSession(cookieValue: string | undefined | null): Promise<OperatorSessionPayload | null> {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, getSecret(), { algorithms: ["HS256"] });
    const { operatorId, role, name } = payload as Record<string, unknown>;
    if (typeof operatorId !== "number" || typeof role !== "string" || typeof name !== "string") return null;
    return { operatorId, role: role as OperatorSessionPayload["role"], name };
  } catch {
    return null;
  }
}
