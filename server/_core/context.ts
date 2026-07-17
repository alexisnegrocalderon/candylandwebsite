import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookieHeader } from "cookie";
import { CAJA_COOKIE_NAME } from "@shared/const";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifyOperatorSession, type OperatorSessionPayload } from "../caja/auth";
import { getOperatorById } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  // Sesión de operador de /caja (login por PIN) — independiente de `user`
  // (login admin/OAuth). Ver docs/ARQUITECTURA-CAJA.md §0.2.
  operator: OperatorSessionPayload | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  const cookies = parseCookieHeader(opts.req.headers.cookie ?? "");
  const sessionPayload = await verifyOperatorSession(cookies[CAJA_COOKIE_NAME]);

  // El JWT solo prueba que el operador se autenticó alguna vez -- se revisa
  // contra la base de datos en cada request para que desactivar un operador
  // o cambiarle el rol desde /admin corte el acceso al instante, en vez de
  // esperar a que expire la sesión (hasta 12h). El rol viene siempre de la
  // base de datos, nunca del JWT, para que un cambio de rol tampoco quede
  // "congelado" en una sesión vieja.
  let operator: OperatorSessionPayload | null = null;
  if (sessionPayload) {
    const dbOperator = await getOperatorById(sessionPayload.operatorId);
    if (dbOperator && dbOperator.active) {
      operator = { operatorId: dbOperator.id, role: dbOperator.role, name: dbOperator.name };
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    operator,
  };
}
