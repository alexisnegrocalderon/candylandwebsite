import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import { processMailingCronBatch } from "./mailing";
import { purgeOldPartyMessages, purgeOldPartyProfiles, expireOldGiftInvitations, getEventHappeningToday, getCajaDashboard, getHomeEvents } from "./db";
import { sendEmail, buildCheckinSummaryEmail } from "./email";
import { getProgramConfig, sendWeeklyAmbassadorEmails } from "./ambassadorProgram";
import { runAbandonedCartCron } from "./orderReminders";
import { checkAndAdvanceTandaIfNeeded } from "./tandaAutoAdvance";
import { isWeeklyEmailDay } from "../shared/ambassadorProgram";
import { ADMIN_NOTIFICATION_EMAIL } from "@shared/const";

const CHECKIN_SUMMARY_EMAIL = ADMIN_NOTIFICATION_EMAIL;

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
  // solo permite cron jobs con frecuencia diaria (y como mucho 2 en total,
  // ver el comentario del recordatorio de carrito abandonado más abajo:
  // Vercel devolvió ese error en vivo al desplegar, así que quedó
  // confirmado en la práctica, no es una suposición). Esta corrida manda la
  // próxima tanda de pendientes y corta antes de agotar el presupuesto de
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

      // Correo semanal de los embajadores VIP. Va en la misma corrida diaria
      // porque Vercel Hobby ya tiene sus 2 crons ocupados y un tercero
      // rompería el despliegue -- este chequeo decide si hoy toca mandar.
      // Try/catch propio: si el envío falla, la cola de mailing igual reporta.
      let ambassadorWeekly: { sent: number; skipped: number; failed: number } | null = null;
      try {
        const config = await getProgramConfig();
        if (config.weeklyEmailEnabled && isWeeklyEmailDay(new Date(), config.weeklyEmailWeekday)) {
          ambassadorWeekly = await sendWeeklyAmbassadorEmails();
        }
      } catch (err) {
        console.error('[Cron] Error mandando el correo semanal de embajadores:', err);
      }

      // Recordatorio automático de carrito abandonado (pedido explícito del
      // dueño): la herramienta ya existía como botón manual en Ventas Web
      // (sendPendingReminders), pero nadie la usaba sistemáticamente. Va en
      // la misma corrida diaria -- Vercel devolvió "Hobby accounts are
      // limited to daily cron jobs" al intentar darle un cron propio cada 6
      // horas, así que confirmado: este proyecto corre en cuenta Hobby (o al
      // menos así lo ve Vercel), no Pro. Try/catch propio: si esto falla, el
      // mailing y la purga igual reportan lo que alcanzaron a hacer.
      let abandonedCart: Awaited<ReturnType<typeof runAbandonedCartCron>> | null = null;
      try {
        abandonedCart = await runAbandonedCartCron();
      } catch (err) {
        console.error('[Cron] Error mandando recordatorios de carrito abandonado:', err);
      }

      // Red de seguridad del avance automático de tanda (ver
      // server/tandaAutoAdvance.ts): el chequeo real ya corre en cada
      // consulta pública de precios y después de cada pago aprobado, así
      // que esto solo cubre el caso límite de una fase vencida por fecha
      // sin ninguna visita ese día. Mismo motivo de siempre para ir acá
      // adentro y no en un cron propio: Vercel Hobby ya tiene los 2 cupos
      // ocupados.
      let tandaAutoAdvanced = 0;
      try {
        const homeEvents = await getHomeEvents();
        for (const ev of homeEvents) {
          const advance = await checkAndAdvanceTandaIfNeeded(ev.id);
          if (advance.advanced) tandaAutoAdvanced++;
        }
      } catch (err) {
        console.error('[Cron] Error chequeando avance automático de tanda:', err);
      }

      res.json({ success: true, ...result, partyMessagesPurgedFor, partyProfilesPurged, giftInvitationsExpired, ambassadorWeekly, abandonedCart, tandaAutoAdvanced });
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
