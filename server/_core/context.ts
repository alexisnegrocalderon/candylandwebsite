import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse as parseCookieHeader } from "cookie";
import { CAJA_COOKIE_NAME } from "@shared/const";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { verifyOperatorSession, type OperatorSessionPayload } from "../caja/auth";

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
  const operator = await verifyOperatorSession(cookies[CAJA_COOKIE_NAME]);

  return {
    req: opts.req,
    res: opts.res,
    user,
    operator,
  };
}
