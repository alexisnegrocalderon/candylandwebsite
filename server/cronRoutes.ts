import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import { processMailingCronBatch } from "./mailing";

/** Vercel manda `Authorization: Bearer <CRON_SECRET>` en cada invocación de
 * un cron job cuando esa variable está seteada en el proyecto -- es el
 * mecanismo oficial recomendado para que este endpoint no quede abierto a
 * cualquiera que adivine la URL. Si CRON_SECRET no está configurada (ej. en
 * desarrollo local), se deja pasar igual, pero avisando por consola. */
function requireCronSecret(req: Request, res: Response): boolean {
  if (!ENV.cronSecret) {
    console.warn('[Cron] CRON_SECRET no configurada -- el endpoint del cron queda sin autenticar.');
    return true;
  }
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${ENV.cronSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function registerCronRoutes(app: Express) {
  // Cola de envío automática del mailing masivo (pedido explícito del
  // usuario, ver server/mailing.ts processMailingCronBatch) -- Vercel Hobby
  // solo permite cron jobs con frecuencia diaria, así que esta corrida manda
  // la próxima tanda de pendientes y corta antes de agotar el presupuesto de
  // tiempo; lo que no alcanza queda para la corrida de mañana.
  app.get("/api/cron/mailing-queue", async (req: Request, res: Response) => {
    if (!requireCronSecret(req, res)) return;
    try {
      const result = await processMailingCronBatch();
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[Cron] Error procesando la cola de mailing:', err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error desconocido' });
    }
  });
}
