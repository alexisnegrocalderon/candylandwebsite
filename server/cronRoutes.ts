import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import { processMailingCronBatch } from "./mailing";
import { purgeOldPartyMessages, purgeOldPartyProfiles, expireOldGiftInvitations, getEventHappeningToday, getCajaDashboard } from "./db";
import { sendEmail, buildCheckinSummaryEmail } from "./email";

const CHECKIN_SUMMARY_EMAIL = 'contacto@mansionplayroom.cl';

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

      // Aprovecha la misma corrida diaria para borrar los chats de fiestas
      // ya terminadas (Vercel Hobby solo permite crons diarios, así que un
      // segundo cron no aportaría nada). Va aparte del try del mailing: si
      // la purga falla, el mailing igual reporta lo que alcanzó a mandar.
      let partyMessagesPurgedFor = 0;
      let partyProfilesPurged = 0;
      let giftInvitationsExpired = 0;
      try {
        const purge = await purgeOldPartyMessages();
        partyMessagesPurgedFor = purge.deletedFor;
        // Plazo de conservación prometido en la política de privacidad.
        const profiles = await purgeOldPartyProfiles();
        partyProfilesPurged = profiles.profilesDeleted;
        // Invitaciones a un trago que nadie llegó a pagar. Nunca toca un
        // regalo ya pagado: ese sigue válido para la próxima fiesta.
        const expired = await expireOldGiftInvitations();
        giftInvitationsExpired = expired.expired;
      } catch (err) {
        console.error('[Cron] Error limpiando datos de fiestas terminadas:', err);
      }

      res.json({ success: true, ...result, partyMessagesPurgedFor, partyProfilesPurged, giftInvitationsExpired });
    } catch (err) {
      console.error('[Cron] Error procesando la cola de mailing:', err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error desconocido' });
    }
  });

  // Correo de las 3am con el total de gente que entró (pedido explícito del
  // dueño). Corre todos los días -- si ningún evento cae hoy no manda nada,
  // así que no hace falta desactivarlo entre fiestas. `vercel.json` la
  // programa a las 06:00 UTC ≈ 03:00 en Chile con horario de verano (CLST,
  // UTC-3) / 02:00 con horario de invierno (CLT, UTC-4) -- ver
  // shared/eventDay.ts sobre esta misma imprecisión.
  app.get("/api/cron/checkin-summary", async (req: Request, res: Response) => {
    if (!requireCronSecret(req, res)) return;
    try {
      const event = await getEventHappeningToday();
      if (!event) { res.json({ success: true, sent: false, reason: 'no hay evento hoy' }); return; }

      const dashboard = await getCajaDashboard(event.id);
      if (!dashboard) { res.json({ success: true, sent: false, reason: 'sin datos de caja para el evento' }); return; }

      await sendEmail({
        to: CHECKIN_SUMMARY_EMAIL,
        subject: `[Candyland] Ingresos del día — ${event.title}`,
        html: buildCheckinSummaryEmail({
          eventTitle: event.title,
          eventDate: event.eventDate,
          insideCount: dashboard.insideCount,
          expectedCount: dashboard.expectedCount,
        }),
      });
      res.json({ success: true, sent: true, insideCount: dashboard.insideCount, expectedCount: dashboard.expectedCount });
    } catch (err) {
      console.error('[Cron] Error mandando el resumen de ingresos:', err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error desconocido' });
    }
  });
}
