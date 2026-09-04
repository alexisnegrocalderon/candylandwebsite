import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerAdminRoutes } from "../adminRoutes";
import { registerCronRoutes } from "../cronRoutes";
import { registerTicketAssetRoutes } from "../calendar";
import { registerBlobUploadRoutes } from "../blobUpload";
import { appRouter } from "../routers";
import { webhooksRouter } from "../webhooks";
import { createContext } from "./context";
import { resetDb } from "../db";

// Errores de conexión típicos de un pool "envenenado" (socket cerrado por el
// proveedor, prepared statement cacheado que quedó inválido tras un cambio
// de esquema, etc.) -- ver el comentario de `resetDb` en server/db.ts. No es
// una lista exhaustiva de todos los códigos de mysql2, es lo suficientemente
// amplia para no dejar pasar el patrón real sin arriesgar falsos positivos
// (un 500 de negocio normal, ej. "Falta el nombre del cliente", no calza
// con ninguno de estos).
const DB_CONNECTION_ERROR_PATTERN = /Failed query|ECONNRESET|ETIMEDOUT|ECONNREFUSED|PROTOCOL_CONNECTION_LOST|EPIPE|Too many connections|connection is in closed state|Unknown prepared statement/i;

function looksLikeDbConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const message = String((error as { message?: unknown }).message ?? '');
  const causeMessage = String((error as { cause?: { message?: unknown } }).cause?.message ?? '');
  return DB_CONNECTION_ERROR_PATTERN.test(message) || DB_CONNECTION_ERROR_PATTERN.test(causeMessage);
}

/**
 * Arma la app Express con todas las rutas de API (tRPC, webhooks, oauth,
 * export de admin) sin `listen()` ni nada de Vite/estáticos — así se puede
 * reusar tal cual tanto en el server local (`_core/index.ts`) como en la
 * función serverless de Vercel (`server/vercel-entry.ts`).
 *
 * A propósito NO registra las rutas SSR de `server/ssrMeta.ts` (su catch-all
 * `app.get('*', ...)` se comería cualquier GET, incluida la propia SPA de
 * Vite en dev local) -- esas se agregan solo en `vercel-entry.ts`, después
 * de esta app ya armada. Ver el comentario de `registerSsrMetaRoutes`.
 */
export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  registerOAuthRoutes(app);
  registerAdminRoutes(app);
  registerCronRoutes(app);
  registerTicketAssetRoutes(app);
  registerBlobUploadRoutes(app);
  // Webhooks antes de tRPC para evitar conflictos de middleware.
  app.use(webhooksRouter);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError({ error }) {
        // Autorrecuperación de un pool de base de datos envenenado -- ver
        // `resetDb` en server/db.ts. Descartar el pool acá no repite esta
        // request (el cliente ya recibió el 500 y reintenta solo), pero deja
        // la SIGUIENTE con un pool sano en vez de fallar igual hasta que
        // Vercel recicle la función por su cuenta.
        if (looksLikeDbConnectionError(error) || looksLikeDbConnectionError(error.cause)) {
          resetDb();
        }
      },
    })
  );
  return app;
}
