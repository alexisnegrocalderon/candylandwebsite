import {
  appendIgMessage,
  getEventBuyerCandidates,
  getIgFollowUpStates,
  getIgMessages,
  getIgThreadLastClicks,
  getIgThreadsForFollowUp,
  getSiteSettings,
  markIgThreadFollowUpSent,
  saveIgFollowUp,
  stopIgFollowUps,
} from './db';
import { sendInstagramMessage, sendButtonMessage, canReplyWithinWindow } from './instagramSend';
import { resolveInstagramBuyLink } from './instagramInteractive';
import { getUpcomingPublicEvents } from './instagramAgent';
import { draftFollowUp } from './instagramFollowUpDraft';
import { stripUrlsFromReply, trackedUrl } from './agentLinks';
import { BUTTON_CARD_CAPTION } from './instagram';
import { normalizeInstagramAgentConfig, DEFAULT_INSTAGRAM_AGENT_CONFIG } from '../shared/instagramAgentConfig';
import { followUpIntent, planFollowUp } from '../shared/followUp';
import { normalizeIgHandle, saysAlreadyBought } from '../shared/igCustomerLink';

/* Seguimientos del agente de ventas (pedido del dueño: llevar a la persona a
 * comprar sin que él intervenga). Corre en su propio cron
 * (`/api/cron/instagram-followup`, cada 15 minutos) porque no hay ningún
 * evento del webhook que lo dispare: la persona simplemente dejó de contestar.
 *
 * Hasta DOS seguimientos por conversación, siempre dentro de la ventana de 24
 * horas de Meta (el cálculo de cuándo y a quién vive en shared/followUp.ts):
 *   1) tras unos minutos de silencio, o ~20 min después de tocar el botón de
 *      compra sin comprar;
 *   2) horas después, antes de que se cierre la ventana.
 * Cada uno lo escribe la IA con lo que la persona dijo (server/
 * instagramFollowUpDraft.ts) y trae el botón con su acceso ya elegido; si la
 * IA falla, el 1 cae al mensaje fijo de siempre y el 2 no sale. Se detienen si
 * dijo que no, si ya compró o si el hilo pasó a manos de una persona. */

export type InstagramFollowUpResult = { sent: number; skipped: number; failed: number };

/** @ de Instagram de quienes ya compraron la próxima fecha: a ellos no se les insiste. */
async function loadBuyerHandles(now: Date): Promise<Set<string>> {
  try {
    const event = (await getUpcomingPublicEvents(now))[0];
    if (!event) return new Set();
    const buyers = await getEventBuyerCandidates(event.id);
    return new Set(buyers.map((b) => normalizeIgHandle(b.instagram)).filter(Boolean));
  } catch (err) {
    console.warn('[Instagram] No se pudo leer quiénes ya compraron para los seguimientos:', err);
    return new Set();
  }
}

/** Corre el cron: manda el seguimiento a cada hilo que corresponda. Nunca
 * lanza -- un fallo en un hilo no corta el resto. */
export async function runInstagramFollowUps(now: Date = new Date()): Promise<InstagramFollowUpResult> {
  const settings = await getSiteSettings();
  const config = normalizeInstagramAgentConfig((settings as any)?.instagramAgentConfig);

  // El interruptor maestro manda: sin el agente prendido, los seguimientos
  // tampoco tienen sentido (nadie está contestando nada automático).
  if (!config.enabled || !config.followUpEnabled) return { sent: 0, skipped: 0, failed: 0 };

  const rows = await getIgThreadsForFollowUp(now);
  if (rows.length === 0) return { sent: 0, skipped: 0, failed: 0 };
  const ids = rows.map((r) => r.thread.id);
  const [states, clicks, buyers] = await Promise.all([
    getIgFollowUpStates(ids),
    getIgThreadLastClicks(ids, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
    loadBuyerHandles(now),
  ]);

  // Regla del dueño (27/09): nunca una URL a la vista. Un texto guardado
  // antes de esta regla ("...en mansionplayroom.cl/entradas") se limpia acá,
  // y el link va como botón de compra debajo, con su UTM de recordatorio.
  const fixedText = stripUrlsFromReply(config.followUpMessage).text || DEFAULT_INSTAGRAM_AGENT_CONFIG.followUpMessage;

  let sent = 0, skipped = 0, failed = 0;
  for (const { thread, lastFromBot } of rows) {
    try {
      const state = states.get(thread.id) ?? null;
      const clickAt = clicks.get(thread.id) ?? null;
      const input = {
        now,
        lastInboundAt: thread.lastInboundAt,
        lastMessageAt: thread.lastMessageAt,
        lastFromBot,
        legacyClosingSentAt: thread.closingMessageSentAt,
        state,
        clickAt,
        minutes: config.followUpMinutes,
        secondHours: config.followUp2Hours,
      };
      // Primera pasada barata (sin leer mensajes): ¿toca escribirle a este hilo?
      if (!planFollowUp({ ...input, intent: 'ok' })) continue;

      const history = await getIgMessages(thread.id, 12);
      const inbound = history.filter((m) => m.direction === 'in').map((m) => m.text);
      const intent = followUpIntent(inbound);
      const handle = normalizeIgHandle(thread.username);
      const alreadyBought = (handle && buyers.has(handle)) || saysAlreadyBought(inbound);
      if (intent === 'stop' || alreadyBought) {
        await stopIgFollowUps(thread.id);
        await markIgThreadFollowUpSent(thread.id);
        skipped++;
        continue;
      }
      const plan = planFollowUp({ ...input, intent });
      if (!plan) continue;

      // Fuera de la ventana de 24h de Meta el envío se rechazaría igual -- se
      // marca como atendido para no reintentar por siempre, pero sin mandar nada.
      if (!canReplyWithinWindow(thread.lastInboundAt, now)) {
        await markIgThreadFollowUpSent(thread.id);
        skipped++;
        continue;
      }

      let text = '';
      let access: { key: any; quantity: number } | undefined;
      if (config.followUpPersonalized) {
        const draft = await draftFollowUp({ stage: plan.stage, variant: plan.variant, history, customerNotes: thread.customerNotes, now });
        if (draft?.action === 'send') {
          text = draft.message;
          access = { key: draft.accessOption, quantity: draft.quantity };
        } else if (draft) {
          // La IA decidió no escribir (o que no le escriban más): queda así hasta que la persona vuelva a hablar.
          await stopIgFollowUps(thread.id);
          await markIgThreadFollowUpSent(thread.id);
          skipped++;
          continue;
        }
      }
      if (!text) {
        // Sin IA (apagada o caída): el mensaje fijo solo para el primer seguimiento.
        if (plan.stage !== 1) { skipped++; continue; }
        text = fixedText;
      }

      const buyLink = await resolveInstagramBuyLink(now, plan.stage === 1 ? 'agente-recordatorio' : 'agente-recordatorio-2', undefined, access);
      const { mid } = await sendInstagramMessage({ recipientId: thread.igUserId, text });
      await appendIgMessage({ threadId: thread.id, mid, direction: 'out', source: 'bot', text });
      if (buyLink) {
        const button = { title: buyLink.accessLabel ? buyLink.buttonTitle : 'Ver fechas y entradas', url: trackedUrl(buyLink.url, thread.id) };
        const { mid: buttonMid } = await sendButtonMessage({ id: thread.igUserId }, BUTTON_CARD_CAPTION, button);
        await appendIgMessage({ threadId: thread.id, mid: buttonMid, direction: 'out', source: 'bot', text: `[botón] ${button.title}` });
      }
      await markIgThreadFollowUpSent(thread.id);
      await saveIgFollowUp(thread.id, plan.stage, now);
      sent++;
    } catch (err) {
      console.error(`[Instagram] Falló el seguimiento del hilo ${thread.id}:`, err);
      failed++;
    }
  }

  return { sent, skipped, failed };
}
