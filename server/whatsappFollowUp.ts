import { getWaThreadsAwaitingFollowUp, markWaThreadFollowUpSent, appendWaMessage, getSiteSettings } from './db';
import { canReplyWithinWindow } from './instagramSend';
import { sendWhatsAppText } from './whatsappSend';
import { normalizeWhatsAppAgentConfig } from '../shared/whatsappAgentConfig';

/* Recordatorio de cierre por silencio en WhatsApp -- mismo mecanismo que
 * server/instagramFollowUp.ts, colgado del mismo cron
 * (`/api/cron/instagram-followup`, cada 15 minutos). Mensaje FIJO, no IA.
 * Dentro de la ventana de 24 horas un mensaje de texto normal no tiene
 * costo en la Cloud API; fuera de ella se rechazaría, así que se salta. */

export type WhatsAppFollowUpResult = { sent: number; skipped: number; failed: number };

export async function runWhatsAppFollowUps(now: Date = new Date()): Promise<WhatsAppFollowUpResult> {
  const settings = await getSiteSettings();
  const config = normalizeWhatsAppAgentConfig((settings as any)?.whatsappAgentConfig);
  if (!config.enabled || !config.followUpEnabled) return { sent: 0, skipped: 0, failed: 0 };

  const cutoff = new Date(now.getTime() - config.followUpMinutes * 60 * 1000);
  const threads = await getWaThreadsAwaitingFollowUp(cutoff);

  let sent = 0, skipped = 0, failed = 0;
  for (const thread of threads) {
    try {
      if (!canReplyWithinWindow(thread.lastInboundAt, now)) {
        await markWaThreadFollowUpSent(thread.id);
        skipped++;
        continue;
      }
      const { wamid } = await sendWhatsAppText(thread.waId, config.followUpMessage);
      await appendWaMessage({ threadId: thread.id, wamid, direction: 'out', source: 'bot', text: config.followUpMessage });
      await markWaThreadFollowUpSent(thread.id);
      sent++;
    } catch (err) {
      console.error(`[WhatsApp] Falló el recordatorio de cierre del hilo ${thread.id}:`, err);
      failed++;
    }
  }

  return { sent, skipped, failed };
}
