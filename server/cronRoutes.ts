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
  /* Cola de envío del mailing masivo (server/mailing.ts
   * processMailingCronBatch).
   *
   * Este archivo tenía TODO amontonado en una sola corrida diaria porque
   * Vercel Hobby permite como mucho 2 crons y solo con frecuencia diaria --
   * Vercel devolvió "Hobby accounts are limited to daily cron jobs" en vivo
   * al intentar un tercero. Con el proyecto ya en un equipo Pro esa
   * restricción desaparece, así que cada tarea vuelve a tener su propio
   * endpoint y su propia frecuencia (ver `crons` en vercel.json).
   *
   * Lo que NO cambia es cuántos correos se mandan por día: eso lo limita el
   * plan de Resend, no Vercel. Correr cada 15 minutos sirve para que una
   * campaña salga el mismo día en vez de estirarse una semana, con el
   * presupuesto diario compartido de `AUTOMATED_EMAIL_DAILY_CAP` cuidando
   * que los correos transaccionales nunca se queden sin cupo. */
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

  /* Recordatorio de carrito abandonado. Antes viajaba de polizón en la
   * corrida diaria del mailing, así que una orden abandonada a las 22:00
   * recibía su recordatorio recién al otro día a las 10:00 de la mañana --
   * cuando la urgencia ya se pasó. Cada hora, el recordatorio sale a las 3-4
   * horas de abandonada, que es la ventana que ya definía
   * ABANDONED_CART_MIN_AGE_MS y que hasta ahora no se podía cumplir. */
  app.get("/api/cron/abandoned-cart", async (req: Request, res: Response) => {
    if (!requireCronSecret(req, res)) return;
    try {
      const result = await runAbandonedCartCron();
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[Cron] Error mandando recordatorios de carrito abandonado:', err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error desconocido' });
    }
  });

  /* Avance automático de tanda por fecha o por cupo.
   *
   * El chequeo sigue corriendo además en cada consulta pública de precios y
   * después de cada pago aprobado (server/tandaAutoAdvance.ts) -- eso no
   * cambia y sigue siendo lo que hace que el cambio de fase se note al
   * instante cuando hay tráfico. Lo que cambia es el respaldo: era una vez al
   * día, así que una fase con fecha de corte a las 23:00 sin visitas podía
   * quedarse vencida hasta 24 horas vendiendo al precio viejo. Cada 10
   * minutos ese peor caso pasa a ser de minutos. */
  app.get("/api/cron/tanda", async (req: Request, res: Response) => {
    if (!requireCronSecret(req, res)) return;
    try {
      let advanced = 0;
      const homeEvents = await getHomeEvents();
      for (const ev of homeEvents) {
        const result = await checkAndAdvanceTandaIfNeeded(ev.id);
        if (result.advanced) advanced++;
      }
      res.json({ success: true, eventsChecked: homeEvents.length, advanced });
    } catch (err) {
      console.error('[Cron] Error chequeando avance automático de tanda:', err);
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Error desconocido' });
    }
  });

  /* Mantenimiento diario: purgas con plazo prometido en la política de
   * privacidad, invitaciones a tragos vencidas y el correo semanal de
   * embajadores. Nada de esto necesita frecuencia alta -- son tareas de
   * calendario, no de reacción -- pero sí merecen no estar mezcladas con el
   * mailing: cuando compartían corrida, un fallo de una podía tapar a la
   * otra en los logs. Cada bloque va en su propio try para que una falla no
   * cancele el resto. */
  app.get("/api/cron/maintenance", async (req: Request, res: Response) => {
    if (!requireCronSecret(req, res)) return;

    let partyMessagesPurgedFor = 0;
    let partyProfilesPurged = 0;
    let giftInvitationsExpired = 0;
    try {
      partyMessagesPurgedFor = (await purgeOldPartyMessages()).deletedFor;
      partyProfilesPurged = (await purgeOldPartyProfiles()).profilesDeleted;
      // Nunca toca un regalo ya pagado: ese sigue válido para la próxima fiesta.
      giftInvitationsExpired = (await expireOldGiftInvitations()).expired;
    } catch (err) {
      console.error('[Cron] Error limpiando datos de fiestas terminadas:', err);
    }

    let ambassadorWeekly: { sent: number; skipped: number; failed: number } | null = null;
    try {
      const config = await getProgramConfig();
      if (config.weeklyEmailEnabled && isWeeklyEmailDay(new Date(), config.weeklyEmailWeekday)) {
        ambassadorWeekly = await sendWeeklyAmbassadorEmails();
      }
    } catch (err) {
      console.error('[Cron] Error mandando el correo semanal de embajadores:', err);
    }

    res.json({ success: true, partyMessagesPurgedFor, partyProfilesPurged, giftInvitationsExpired, ambassadorWeekly });
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
