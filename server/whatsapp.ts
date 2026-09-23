import express, { Router, type Request, type Response } from 'express';
import { ENV } from './_core/env';
import {
  getOrCreateWaThread,
  appendWaMessage,
  getWaMessages,
  setWaThreadBotPaused,
  countWaBotRepliesSince,
  getSiteSettings,
} from './db';
import { runInstagramAgent } from './instagramAgent';
import { verifyMetaSignature } from './instagram';
import { canReplyWithinWindow } from './instagramSend';
import { sendWhatsAppPayload, markReadWithTyping, buildTextPayload } from './whatsappSend';
import {
  WA_IDS,
  welcomeMenuMessage,
  replyWithButtons,
  eventListMessage,
  eventDetailMessage,
  replyWithBuyLink,
  type WaOutgoing,
} from './whatsappInteractive';
import { sendPushToAdmins } from './push';
import { normalizeInstagramAgentConfig } from '../shared/instagramAgentConfig';
import { normalizeWhatsAppAgentConfig } from '../shared/whatsappAgentConfig';

/* Entrada de los mensajes de WhatsApp (Cloud API, campo `messages` del
 * webhook de la cuenta de WhatsApp Business). Ver docs/WHATSAPP-AGENT.md.
 *
 * Es el mismo agente que contesta el Instagram (server/instagramAgent.ts,
 * con `channel: 'whatsapp'`), con dos agregados que solo WhatsApp permite:
 * - botones y listas que el servidor resuelve SIN IA cuando la persona los
 *   toca (fechas, precios, hablar con alguien), y
 * - el eco de coexistencia (`smb_message_echoes`): el número sigue
 *   funcionando en la app WhatsApp Business del teléfono, y cuando el dueño
 *   contesta desde ahí el bot se hace a un lado en ese hilo.
 *
 * Se monta ANTES del express.json() global, por la misma razón que el de
 * Instagram: la firma se calcula sobre los bytes crudos. */

export const whatsappRouter = Router();

const WEBHOOK_PATH = '/api/webhooks/whatsapp';

whatsappRouter.get(WEBHOOK_PATH, (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (!ENV.waVerifyToken) {
    console.error('[WhatsApp] WA_VERIFY_TOKEN no está configurada -- no se puede verificar el webhook.');
    res.sendStatus(500);
    return;
  }
  if (mode === 'subscribe' && token === ENV.waVerifyToken) {
    res.status(200).send(String(challenge ?? ''));
    return;
  }
  res.sendStatus(403);
});

export type WaInboundMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string; description?: string };
  };
  // Botón de respuesta rápida de una PLANTILLA (no de un mensaje interactivo).
  button?: { payload?: string; text?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string };
  [key: string]: unknown;
};

type WaEcho = {
  from?: string;
  to?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
};

type WaStatus = {
  id?: string;
  status?: string;
  recipient_id?: string;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
};

export type WaChangeValue = {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: WaInboundMessage[];
  message_echoes?: WaEcho[];
  statuses?: WaStatus[];
};

type WaWebhookBody = {
  object?: string;
  entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: WaChangeValue }> }>;
};

whatsappRouter.post(
  WEBHOOK_PATH,
  express.raw({ type: '*/*', limit: '1mb' }),
  async (req: Request, res: Response) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    if (!ENV.waAppSecret) {
      if (ENV.isProduction) {
        console.error('[WhatsApp] WA_APP_SECRET no configurada -- se rechaza la entrega.');
        res.sendStatus(403);
        return;
      }
      console.warn('[WhatsApp] WA_APP_SECRET no configurada -- entrega aceptada SIN verificar firma (solo en desarrollo).');
    } else if (!verifyMetaSignature(raw, req.header('x-hub-signature-256'), ENV.waAppSecret)) {
      res.sendStatus(403);
      return;
    }

    let body: WaWebhookBody;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      res.sendStatus(400);
      return;
    }

    // Se procesa ANTES de responder 200 -- mismo razonamiento que el webhook
    // de Instagram (serverless corta lo que quede después de res.end()).
    try {
      for (const entry of body.entry ?? []) {
        for (const change of entry.changes ?? []) {
          await handleChange(change.field, change.value);
        }
      }
    } catch (err) {
      console.error('[WhatsApp] Error procesando la entrega del webhook:', err);
    }

    res.sendStatus(200);
  },
);

export async function handleChange(field: string | undefined, value: WaChangeValue | undefined): Promise<void> {
  if (!value) return;
  // Una cuenta de WhatsApp Business puede tener varios números: solo se
  // atiende el configurado.
  const phoneNumberId = value.metadata?.phone_number_id;
  if (ENV.waPhoneNumberId && phoneNumberId && phoneNumberId !== ENV.waPhoneNumberId) return;

  if (field === 'messages') {
    for (const message of value.messages ?? []) {
      const contact = value.contacts?.find((c) => c.wa_id === message.from) ?? value.contacts?.[0];
      await handleInboundMessage(message, contact?.profile?.name);
    }
    for (const status of value.statuses ?? []) {
      handleStatus(status);
    }
  } else if (field === 'smb_message_echoes') {
    for (const echo of value.message_echoes ?? []) {
      await handleOwnerAppEcho(echo);
    }
  }
}

/** Qué dijo o tocó la persona, normalizado. `replyId` viene solo cuando tocó
 * un botón o una fila que mandamos nosotros. */
export function parseInbound(message: WaInboundMessage): { text: string; replyId: string | null; hasMedia: boolean } {
  if (message.type === 'text') return { text: (message.text?.body ?? '').trim(), replyId: null, hasMedia: false };
  if (message.type === 'interactive') {
    const reply = message.interactive?.button_reply ?? message.interactive?.list_reply;
    return { text: (reply?.title ?? '').trim(), replyId: reply?.id ?? null, hasMedia: false };
  }
  if (message.type === 'button') {
    return { text: (message.button?.text ?? '').trim(), replyId: message.button?.payload ?? null, hasMedia: false };
  }
  const caption = message.image?.caption ?? message.video?.caption ?? message.document?.caption ?? '';
  return { text: caption.trim(), replyId: null, hasMedia: true };
}

/** "hola", "holaa", "buenas", "hey" y parecidos, sin nada más. */
export function isSimpleGreeting(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(h+o+l+a+s?|buen[oa]s?( (dias|tardes|noches))?|hey+|ey+|hi+|hello|alo+|wena+s?)( (que tal|como estas))?$/.test(normalized);
}

export async function handleInboundMessage(message: WaInboundMessage, profileName?: string): Promise<void> {
  const waId = message.from;
  if (!waId || !message.id) return;
  // Reacciones (👍 a un mensaje nuestro) y avisos de sistema no son algo a
  // lo que haya que contestar.
  if (message.type === 'reaction' || message.type === 'system' || message.type === 'unsupported') return;

  const { text, replyId, hasMedia } = parseInbound(message);
  if (text.length === 0 && !hasMedia) return;

  const thread = await getOrCreateWaThread({ waId, profileName });
  if (!thread) {
    console.error('[WhatsApp] Sin base de datos: el mensaje entrante se pierde.');
    return;
  }
  const isNewThread = thread.lastMessageAt == null;

  const saved = await appendWaMessage({
    threadId: thread.id,
    wamid: message.id,
    direction: 'in',
    source: 'user',
    text: text.length > 0 ? text : null,
    interactive: replyId ? { type: 'reply', id: replyId, title: text } : null,
    attachments: hasMedia ? { type: message.type, data: message[message.type as string] ?? null } : null,
  });
  // Reintento de Meta de algo que ya contestamos.
  if (!saved) return;

  const settings = await getSiteSettings();
  const waConfig = normalizeWhatsAppAgentConfig((settings as any)?.whatsappAgentConfig);
  const agentConfig = normalizeInstagramAgentConfig((settings as any)?.instagramAgentConfig);
  const who = thread.profileName ?? profileName ?? `+${waId}`;

  if (!waConfig.enabled) return;
  if (thread.botPaused === 1) {
    await notifyHandoff(who, text || '[adjunto]', 'El hilo está en manos del equipo');
    return;
  }
  // Audio, foto o sticker sin texto: no se puede saber qué pide. Queda para
  // una persona, sin mandar nada automático (mismo criterio que Instagram).
  if (text.length === 0) {
    await setWaThreadBotPaused(thread.id, true, 'Llegó un adjunto sin texto (audio, foto, sticker)');
    await notifyHandoff(who, '[adjunto]', 'Mandó un audio o archivo sin texto');
    return;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const repliesToday = await countWaBotRepliesSince(thread.id, since);
  if (repliesToday >= waConfig.dailyReplyLimitPerThread) {
    await deliver(thread.id, waId, textOnly(waId, agentConfig.handoffMessage));
    await setWaThreadBotPaused(thread.id, true, 'Se pasó del tope diario de respuestas automáticas');
    await notifyHandoff(who, text, 'Se pasó del tope diario de respuestas automáticas');
    return;
  }

  await markReadWithTyping(message.id);

  // 1. Botones y filas nuestros: respuesta exacta desde la base, sin IA.
  if (replyId === WA_IDS.dates) {
    await deliver(thread.id, waId, await eventListMessage(waId));
    return;
  }
  if (replyId === WA_IDS.prices) {
    await deliver(thread.id, waId, await eventListMessage(waId, 'Elige la fecha y te muestro los precios 💜'));
    return;
  }
  if (replyId === WA_IDS.human) {
    await deliver(thread.id, waId, textOnly(waId, agentConfig.handoffMessage));
    await setWaThreadBotPaused(thread.id, true, 'Pidió hablar con una persona (botón del menú)');
    await notifyHandoff(who, text, 'Pidió hablar con una persona');
    return;
  }
  if (replyId?.startsWith(WA_IDS.eventPrefix)) {
    await deliver(thread.id, waId, await eventDetailMessage(waId, replyId.slice(WA_IDS.eventPrefix.length)));
    return;
  }

  // 2. Primer contacto con un saludo suelto: menú de bienvenida, sin IA.
  if (isNewThread && waConfig.welcomeMenuEnabled && isSimpleGreeting(text)) {
    await deliver(thread.id, waId, welcomeMenuMessage(waId, waConfig.welcomeMessage));
    return;
  }

  // 3. Todo lo demás (incluidas las respuestas rápidas que sugirió la IA,
  // cuyo texto llega como si la persona lo hubiera escrito): el agente.
  const isFinalReplyOfDay = repliesToday === waConfig.dailyReplyLimitPerThread - 1;
  const history = await getWaMessages(thread.id, agentConfig.historyLimit + 1);
  const previous = history.filter((m) => m.id !== saved.id);

  const result = await runInstagramAgent({
    incomingText: text,
    history: previous,
    config: agentConfig,
    isFinalReplyOfDay,
    channel: 'whatsapp',
  });

  if (result.isPersonal) {
    await setWaThreadBotPaused(thread.id, true, 'La IA lo marcó como mensaje personal, no de cliente');
    return;
  }

  let outgoing: WaOutgoing[];
  if (result.action === 'event_list' && !result.handoff) {
    const list = await eventListMessage(waId, result.reply);
    // Con una sola fecha (o ninguna) la "lista" es el detalle o un aviso con
    // su propio texto: la respuesta de la IA va antes, como mensaje aparte.
    outgoing = list.text === result.reply ? [list] : [textOnly(waId, result.reply), list];
  } else if (result.action === 'buy_link' && !result.handoff) {
    outgoing = [await replyWithBuyLink(waId, result.reply)];
  } else {
    outgoing = [replyWithButtons(waId, result.reply, result.handoff ? [] : result.buttons)];
  }
  for (const out of outgoing) {
    await deliver(thread.id, waId, out);
  }

  if (isFinalReplyOfDay) {
    const reason = 'Llegó al tope diario de respuestas automáticas -- se cerró la conversación con un mensaje final';
    await setWaThreadBotPaused(thread.id, true, reason);
    await notifyHandoff(who, text, reason);
  } else if (result.handoff) {
    await setWaThreadBotPaused(thread.id, true, result.handoffReason || 'La IA derivó la conversación');
    await notifyHandoff(who, text, result.handoffReason);
  }
}

/** Coexistencia: el dueño escribió desde la app WhatsApp Business del
 * teléfono. En el eco, `to` es la persona. Si el `id` ya estaba guardado es
 * un mensaje que mandamos nosotros por la API (se descarta solo por el
 * UNIQUE); si es nuevo, lo escribió el dueño a mano -> se guarda y el bot se
 * hace a un lado en ese hilo, igual que handleOwnerEcho en Instagram. */
export async function handleOwnerAppEcho(echo: WaEcho): Promise<void> {
  const to = echo.to;
  if (!to || !echo.id) return;
  const text = (echo.text?.body ?? '').trim();
  if (text.length === 0) return;

  const thread = await getOrCreateWaThread({ waId: to });
  if (!thread) return;

  const saved = await appendWaMessage({
    threadId: thread.id,
    wamid: echo.id,
    direction: 'out',
    source: 'owner_app',
    text,
  });
  if (!saved) return;

  await setWaThreadBotPaused(thread.id, true, 'El dueño contestó directo desde la app de WhatsApp');
}

/** Estados de entrega de lo que mandamos. Solo interesan los fallidos: un
 * mensaje que no llegó y que nadie ve es una persona sin respuesta. */
function handleStatus(status: WaStatus): void {
  if (status.status !== 'failed') return;
  const error = status.errors?.[0];
  console.error(`[WhatsApp] No se entregó el mensaje ${status.id} a ${status.recipient_id}:`, error?.title ?? error?.message ?? 'sin detalle');
}

function textOnly(to: string, text: string): WaOutgoing {
  return { payload: buildTextPayload(to, text), text, interactive: null };
}

/** Manda y guarda. Si Meta lo rechaza NO se guarda como enviado (la bandeja
 * muestra lo que de verdad le llegó) y el hilo queda para una persona. */
async function deliver(threadId: number, waId: string, out: WaOutgoing): Promise<boolean> {
  try {
    const { wamid } = await sendWhatsAppPayload(out.payload);
    await appendWaMessage({ threadId, wamid, direction: 'out', source: 'bot', text: out.text, interactive: out.interactive });
    return true;
  } catch (err) {
    console.error('[WhatsApp] No se pudo enviar la respuesta:', err);
    await setWaThreadBotPaused(threadId, true, 'Falló el envío a WhatsApp, revisar el token');
    await notifyHandoff(`+${waId}`, out.text, 'Falló el envío a WhatsApp');
    return false;
  }
}

async function notifyHandoff(who: string, incoming: string, reason: string): Promise<void> {
  await sendPushToAdmins('pushWhatsAppHandoff', {
    title: `💬 WhatsApp: ${who}`,
    body: `${reason || 'Necesita respuesta de una persona'} — "${incoming.slice(0, 80)}"`,
    url: '/admin?section=whatsapp',
  });
}

/** Respuesta escrita a mano desde la bandeja del admin. Mismo criterio que
 * sendManualInstagramReply: valida la ventana de 24 horas y pausa el bot. */
export async function sendManualWhatsAppReply(input: {
  threadId: number;
  waId: string;
  lastInboundAt: Date | null;
  text: string;
}): Promise<void> {
  if (!canReplyWithinWindow(input.lastInboundAt)) {
    throw new Error('Pasaron más de 24 horas desde el último mensaje de esta persona: WhatsApp solo deja escribirle con una plantilla aprobada. Contéstale desde la app del teléfono.');
  }
  const { wamid } = await sendWhatsAppPayload(buildTextPayload(input.waId, input.text));
  await appendWaMessage({ threadId: input.threadId, wamid, direction: 'out', source: 'admin', text: input.text });
  await setWaThreadBotPaused(input.threadId, true, 'El dueño tomó la conversación a mano');
}
