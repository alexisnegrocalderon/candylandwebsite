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
    })
  );
  return app;
}
