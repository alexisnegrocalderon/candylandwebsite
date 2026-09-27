import { getWaThreadsAwaitingFollowUp, markWaThreadFollowUpSent, appendWaMessage, getSiteSettings } from './db';
import { canReplyWithinWindow } from './instagramSend';
import { sendWhatsAppPayload } from './whatsappSend';
import { replyWithBuyLink } from './whatsappInteractive';
import { stripUrlsFromReply } from './agentLinks';
import { normalizeWhatsAppAgentConfig, DEFAULT_WHATSAPP_AGENT_CONFIG } from '../shared/whatsappAgentConfig';

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
  if (threads.length === 0) return { sent: 0, skipped: 0, failed: 0 };

  // Nunca una URL a la vista (regla del dueño, 27/09): el texto se limpia y
  // el link va como botón de compra, con su UTM de recordatorio.
  const text = stripUrlsFromReply(config.followUpMessage).text || DEFAULT_WHATSAPP_AGENT_CONFIG.followUpMessage;

  let sent = 0, skipped = 0, failed = 0;
  for (const thread of threads) {
    try {
      if (!canReplyWithinWindow(thread.lastInboundAt, now)) {
        await markWaThreadFollowUpSent(thread.id);
        skipped++;
        continue;
      }
      const out = await replyWithBuyLink(thread.waId, text, now, 'agente-recordatorio');
      const { wamid } = await sendWhatsAppPayload(out.payload);
      await appendWaMessage({ threadId: thread.id, wamid, direction: 'out', source: 'bot', text: out.text, interactive: out.interactive });
      await markWaThreadFollowUpSent(thread.id);
      sent++;
    } catch (err) {
      console.error(`[WhatsApp] Falló el recordatorio de cierre del hilo ${thread.id}:`, err);
      failed++;
    }
  }

  return { sent, skipped, failed };
}
