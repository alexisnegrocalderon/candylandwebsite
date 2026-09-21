import { getIgThreadsAwaitingFollowUp, markIgThreadFollowUpSent, appendIgMessage, getSiteSettings } from './db';
import { sendInstagramMessage, canReplyWithinWindow } from './instagramSend';
import { normalizeInstagramAgentConfig } from '../shared/instagramAgentConfig';

/* Recordatorio de cierre por silencio (pedido explícito del dueño, 17/09):
 * si alguien deja de contestar después de que el bot ya le respondió, no
 * hay ningún evento nuevo del webhook que dispare nada -- por eso esto vive
 * en su propio cron (`/api/cron/instagram-followup`, cada 15 minutos) en
 * vez de colgar de `server/instagram.ts` como el resto del agente, que
 * siempre reacciona a un mensaje entrante.
 *
 * A diferencia del cierre de "última respuesta del tope diario"
 * (server/instagramAgent.ts, isFinalReplyOfDay), este mensaje es FIJO, no lo
 * genera la IA: no hay ningún mensaje nuevo de la persona que darle de
 * contexto al modelo, así que no hay nada que "responder" -- es un
 * recordatorio de la casa, no una respuesta a una conversación. */

export type InstagramFollowUpResult = { sent: number; skipped: number; failed: number };

/** Corre el cron: manda el recordatorio a cada hilo elegible. Nunca lanza --
 * un fallo en un hilo no corta el resto (mismo criterio que
 * `sendWeeklyAmbassadorEmails`). */
export async function runInstagramFollowUps(now: Date = new Date()): Promise<InstagramFollowUpResult> {
  const settings = await getSiteSettings();
  const config = normalizeInstagramAgentConfig((settings as any)?.instagramAgentConfig);

  // El interruptor maestro manda: sin el agente prendido, este recordatorio
  // tampoco tiene sentido (nadie está contestando nada automático).
  if (!config.enabled || !config.followUpEnabled) return { sent: 0, skipped: 0, failed: 0 };

  const cutoff = new Date(now.getTime() - config.followUpMinutes * 60 * 1000);
  const threads = await getIgThreadsAwaitingFollowUp(cutoff);

  let sent = 0, skipped = 0, failed = 0;
  for (const thread of threads) {
    try {
      // Pasadas las 24 horas de la ventana de Meta, el envío se rechazaría
      // igual -- se marca como "ya tratado" sin reintentar por siempre.
      if (!canReplyWithinWindow(thread.lastInboundAt, now)) {
        await markIgThreadFollowUpSent(thread.id);
        skipped++;
        continue;
      }

      const { mid } = await sendInstagramMessage({ recipientId: thread.igUserId, text: config.followUpMessage });
      await appendIgMessage({ threadId: thread.id, mid, direction: 'out', source: 'bot', text: config.followUpMessage });
      await markIgThreadFollowUpSent(thread.id);
      sent++;
    } catch (err) {
      console.error(`[Instagram] Falló el recordatorio de cierre del hilo ${thread.id}:`, err);
      failed++;
    }
  }

  return { sent, skipped, failed };
}
