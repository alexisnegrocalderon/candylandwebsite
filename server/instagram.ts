import crypto from 'crypto';
import express, { Router, type Request, type Response } from 'express';
import { ENV } from './_core/env';
import {
  getOrCreateIgThread,
  appendIgMessage,
  getIgMessages,
  setIgThreadBotPaused,
  countIgBotRepliesSince,
  getSiteSettings,
  findMatchingIgKeywordAutomation,
  hasRedeemedIgKeywordAutomation,
  recordIgKeywordRedemption,
  getDiscountCodeByCode,
  getTicketTypeById,
  getFeaturedEvent,
} from './db';
import { runInstagramAgent } from './instagramAgent';
import { sendInstagramMessage, sendPrivateReply, sendButtonMessage, fetchInstagramProfile, canReplyWithinWindow } from './instagramSend';
import { resolveInstagramBuyLink } from './instagramInteractive';
import { sendPushToAdmins } from './push';
import { normalizeInstagramAgentConfig } from '../shared/instagramAgentConfig';
import { buildAutomationReplyText, splitAutomationLink } from './instagramAutomations';

/* Entrada de los mensajes directos de Instagram (Messenger Platform, campo
 * `messages`). Ver docs/INSTAGRAM-AGENT.md para el alta en el panel de Meta.
 *
 * Este router se monta ANTES del `express.json()` global de _core/app.ts y
 * parsea su propio body como raw: la firma `X-Hub-Signature-256` se calcula
 * sobre los bytes exactos que mandó Meta, y un JSON ya parseado y vuelto a
 * serializar no reproduce esos bytes (basta una tilde escapada distinto para
 * que la firma no cuadre). */

export const instagramRouter = Router();

const WEBHOOK_PATH = '/api/webhooks/instagram';

// Sin el replace, un APP_URL guardado con "/" al final en Vercel deja los
// links armados acá con doble slash -- mismo criterio ya usado en
// server/instagramAgent.ts.
const APP_URL = (process.env.APP_URL || 'https://mansionplayroom.cl').replace(/\/+$/, '');

/** Alta y reactivación del webhook: Meta pega un GET con el token que uno
 * configuró y espera de vuelta el `hub.challenge` tal cual, en texto plano. */
instagramRouter.get(WEBHOOK_PATH, (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (!ENV.igVerifyToken) {
    console.error('[Instagram] IG_VERIFY_TOKEN no está configurada -- no se puede verificar el webhook.');
    res.sendStatus(500);
    return;
  }
  if (mode === 'subscribe' && token === ENV.igVerifyToken) {
    res.status(200).send(String(challenge ?? ''));
    return;
  }
  res.sendStatus(403);
});

/** Compara la firma de Meta con la nuestra en tiempo constante.
 *
 * Exportada para poder testearla: es la única barrera entre este endpoint
 * (público y de URL adivinable) y cualquiera que quiera hacer que la cuenta
 * de Instagram de la productora le conteste cosas a quien él quiera. */
export function verifyMetaSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header || !appSecret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

type MetaMessaging = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    attachments?: unknown[];
    // Presente cuando el mensaje es una respuesta a una historia -- mismo
    // webhook `messaging` de siempre, sin permiso nuevo que pedirle a Meta.
    reply_to?: { story?: { id?: string; url?: string } };
  };
};

// Forma real que manda Meta para un comentario nuevo en un post/reel (campo
// de webhook "comments", ver docs/INSTAGRAM-AGENT.md) -- hoy no llega nada
// acá porque el permiso todavía no está aprobado, ver handleCommentChange.
type MetaCommentChange = {
  field?: string;
  value?: {
    id?: string;
    text?: string;
    from?: { id?: string; username?: string };
  };
};

type MetaWebhookBody = {
  object?: string;
  entry?: Array<{ id?: string; messaging?: MetaMessaging[]; changes?: MetaCommentChange[] }>;
};

instagramRouter.post(
  WEBHOOK_PATH,
  express.raw({ type: '*/*', limit: '1mb' }),
  async (req: Request, res: Response) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');

    if (!ENV.igAppSecret) {
      // Sin secreto no hay forma de saber si esto lo mandó Meta. En
      // desarrollo se deja pasar avisando (para poder probar con curl); en
      // producción se rechaza, porque aceptar acá es dejar que cualquiera
      // dispare mensajes desde la cuenta de la productora.
      if (ENV.isProduction) {
        console.error('[Instagram] IG_APP_SECRET no configurada -- se rechaza la entrega.');
        res.sendStatus(403);
        return;
      }
      console.warn('[Instagram] IG_APP_SECRET no configurada -- entrega aceptada SIN verificar firma (solo en desarrollo).');
    } else if (!verifyMetaSignature(raw, req.header('x-hub-signature-256'), ENV.igAppSecret)) {
      res.sendStatus(403);
      return;
    }

    let body: MetaWebhookBody;
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      res.sendStatus(400);
      return;
    }

    /* Se procesa ANTES de responder, a propósito. En una función serverless
     * todo lo que quede pendiente después de `res.end()` se puede cortar a
     * mitad de camino, así que "responder 200 al toque y seguir trabajando
     * en segundo plano" acá significa perder respuestas en silencio. Meta
     * tolera unos segundos de espera, y el agente es una sola llamada.
     *
     * El 200 se manda pase lo que pase: si respondiéramos 500, Meta
     * reintentaría la misma entrega y la persona podría terminar recibiendo
     * la respuesta dos veces. La idempotencia igual está cubierta por el
     * UNIQUE de `igMessages.mid`; el 200 evita darle trabajo de más. */
    try {
      for (const entry of body.entry ?? []) {
        for (const messaging of entry.messaging ?? []) {
          await handleMessagingEvent(messaging);
        }
        for (const change of entry.changes ?? []) {
          if (change.field === 'comments') await handleCommentChange(change.value);
        }
      }
    } catch (err) {
      console.error('[Instagram] Error procesando la entrega del webhook:', err);
    }

    res.sendStatus(200);
  },
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retraso corto antes de contestar, para que no se sienta instantáneo/
 * robótico -- pedido explícito del dueño. Acotado a pocos segundos (no los
 * 20-30s que hubiera sido lo ideal de verdad) porque el webhook procesa
 * TODO antes de responderle 200 a Meta (ver el comentario grande más abajo,
 * dentro del handler del POST): unos segundos los tolera bien, medio minuto
 * ya arriesga que Meta piense que la entrega se perdió y reintente.
 * Aleatorio dentro del rango para que tampoco se sienta como un timer fijo. */
export function humanReplyDelayMs(): number {
  const MIN_MS = 3000;
  const MAX_MS = 8000;
  return MIN_MS + Math.floor(Math.random() * (MAX_MS - MIN_MS));
}

async function handleMessagingEvent(event: MetaMessaging): Promise<void> {
  const senderId = event.sender?.id;
  const message = event.message;
  if (!senderId || !message) return;
  if (message.is_deleted) return;

  // El eco de nuestros propios mensajes salientes vuelve por el mismo
  // webhook -- tanto los que ya mandamos nosotros (el agente, o una
  // respuesta manual desde el panel) como los que el dueño escribe directo
  // en SU PROPIA app de Instagram, sin pasar por el panel para nada (así es
  // como de verdad habla con los clientes, según él mismo). Ambos casos
  // comparten la bandera `is_echo` de Meta -- se procesan aparte para
  // distinguirlos (ver `handleOwnerEcho`), en vez de ignorarlos todos como
  // antes (eso dejaba al bot sin enterarse de que el dueño ya contestó a
  // mano desde su teléfono, y seguía respondiendo solo encima).
  if (message.is_echo) {
    await handleOwnerEcho(event, message);
    return;
  }
  // El id de nuestra propia cuenta apareciendo como remitente SIN el flag de
  // eco no debería pasar nunca -- guarda extra por si acaso, para no leernos
  // a nosotros mismos como si fuera un cliente.
  if (senderId === ENV.igUserId) return;

  const text = (message.text ?? '').trim();
  const attachments = message.attachments ?? null;
  if (text.length === 0 && !attachments) return;

  const profile = await fetchInstagramProfile(senderId);
  const thread = await getOrCreateIgThread({
    igUserId: senderId,
    username: profile.username,
    name: profile.name,
  });
  if (!thread) {
    console.error('[Instagram] Sin base de datos: el mensaje entrante se pierde.');
    return;
  }

  const saved = await appendIgMessage({
    threadId: thread.id,
    mid: message.mid,
    direction: 'in',
    source: 'user',
    text: text.length > 0 ? text : null,
    attachments,
  });
  // `null` = este `mid` ya estaba guardado, o sea que Meta está reintentando
  // una entrega que ya contestamos. Cortar acá es lo que evita responder dos
  // veces lo mismo.
  if (!saved) return;

  // Automatización por palabra clave (respuesta a historia): independiente
  // del agente conversacional de IA -- funciona aunque el agente esté
  // apagado o el hilo pausado, porque es una promesa puntual de una
  // historia, no una conversación de venta. Si calza, se contesta acá y no
  // se corre el agente para este mensaje.
  if (message.reply_to?.story && text.length > 0) {
    const handled = await tryHandleKeywordTrigger({
      threadId: thread.id,
      igUserId: senderId,
      text,
      source: 'story_reply',
    });
    if (handled) return;
  }

  const settings = await getSiteSettings();
  const config = normalizeInstagramAgentConfig((settings as any)?.instagramAgentConfig);

  if (!config.enabled) return;
  // El hilo ya está en manos de una persona (lo derivó el agente antes, o lo
  // tomó el admin desde la bandeja): el bot no vuelve a meterse.
  if (thread.botPaused === 1) {
    await notifyHandoff(thread.username ?? senderId, text, 'El hilo está en manos del equipo');
    return;
  }
  // Solo texto: un adjunto suelto (reel, meme, foto, audio) no se puede leer
  // para saber si es una consulta de cliente o un amigo compartiendo algo --
  // se deja en silencio para que lo vea una persona, sin mandar ningún
  // mensaje automático (mandar el aviso de derivación acá sería contestarle
  // como negocio a lo que puede ser, y de hecho suele ser, un chat personal).
  if (text.length === 0) {
    await silentHandoff(thread.id, 'Llegó un adjunto sin texto (reel, foto, audio)');
    return;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const repliesToday = await countIgBotRepliesSince(thread.id, since);
  if (repliesToday >= config.dailyReplyLimitPerThread) {
    // Red de seguridad: en el día a día esto no debería pasar, porque la
    // respuesta anterior (repliesToday === límite - 1) ya cerró la
    // conversación como isFinalReplyOfDay. Cubre el caso borde de que el
    // dueño haya bajado el tope a mitad del día.
    await handoff(thread.id, thread.username ?? senderId, text, 'Se pasó del tope diario de respuestas automáticas', config.handoffMessage, senderId);
    return;
  }
  // Pedido del dueño: si esta respuesta va a ser la última del día para este
  // hilo, que no quede la conversación a medias hasta mañana -- se le pide
  // al modelo que cierre (con el link si corresponde) en vez de mandar acá
  // un mensaje genérico de "dame un minuto".
  const isFinalReplyOfDay = repliesToday === config.dailyReplyLimitPerThread - 1;

  const history = await getIgMessages(thread.id, config.historyLimit + 1);
  // El mensaje que acaba de llegar viaja aparte en el prompt, no como parte
  // del historial -- si no, el modelo lo vería dos veces.
  const previous = history.filter((m) => m.id !== saved.id);

  const result = await runInstagramAgent({
    incomingText: text,
    history: previous,
    config,
    isFinalReplyOfDay,
  });

  // Mensaje personal (amigo, meme, plan, saludo -- nada que ver con la
  // productora): no se manda nada automático, queda en la bandeja para que
  // el dueño lo vea y conteste él como cualquier DM normal.
  if (result.isPersonal) {
    await silentHandoff(thread.id, 'La IA lo marcó como mensaje personal, no de cliente');
    return;
  }

  // Pedido del dueño: que no se sienta instantáneo/robótico. Un retraso
  // corto (no los 20-30s que hubiera sido lo ideal) porque Meta espera la
  // confirmación del webhook pronto -- ver el comentario grande más abajo
  // en el handler del POST, que explica por qué se procesa TODO antes de
  // responder 200. Unos segundos los tolera bien; medio minuto ya arriesga
  // que Meta reintente la entrega pensando que se perdió.
  await sleep(humanReplyDelayMs());

  let buyButton: { title: string; url: string } | undefined;
  if (result.action === 'buy_link' && !result.handoff) {
    const resolved = await resolveInstagramBuyLink();
    if (resolved) buyButton = { title: 'Comprar entrada', url: resolved.url };
  }
  await deliver(thread.id, senderId, result.reply, 'bot', buyButton);

  if (isFinalReplyOfDay) {
    const reason = 'Llegó al tope diario de respuestas automáticas -- se cerró la conversación con un mensaje final';
    await setIgThreadBotPaused(thread.id, true, reason);
    await notifyHandoff(thread.username ?? senderId, text, reason);
  } else if (result.handoff) {
    await setIgThreadBotPaused(thread.id, true, result.handoffReason || 'La IA derivó la conversación');
    await notifyHandoff(thread.username ?? senderId, text, result.handoffReason);
  }
}

/** Busca una automatización de palabra clave que calce con el texto, para
 * la fuente que corresponda (comentario o respuesta a historia). Si la
 * persona ya la recibió antes, no cuenta como calce -- el llamador sigue
 * su flujo normal (para una respuesta a historia, eso es dejar que
 * conteste el agente conversacional de siempre). */
async function matchKeywordTrigger(
  text: string,
  igUserId: string,
  source: 'comment' | 'story_reply',
) {
  const automation = await findMatchingIgKeywordAutomation(text, source);
  if (!automation) return null;
  if (await hasRedeemedIgKeywordAutomation(automation.id, igUserId)) return null;
  return automation;
}

/** Resuelve los placeholders `{{producto}}`/`{{link}}` del mensaje de una
 * automatización: el nombre del producto que regala (si es de "producto de
 * regalo", `discountCodes.giftTicketTypeId`) y el link de compra del evento
 * destacado, con el código pegado como `?code=` cuando la automatización
 * tiene uno -- así se aplica solo al entrar a comprar (ver el `useEffect`
 * nuevo en `client/src/pages/Checkout.tsx`, mismo patrón que ya usa el link
 * de embajador). Nunca lanza: si algo no se puede resolver (evento sin
 * publicar, producto borrado), el mensaje se manda igual sin ese dato. */
async function resolveAutomationExtras(automation: { discountCode: string | null }): Promise<{ productName?: string; link?: string }> {
  const event = await getFeaturedEvent();
  if (!automation.discountCode) {
    return event ? { link: `${APP_URL}/eventos/${event.slug}` } : {};
  }

  const link = event ? `${APP_URL}/eventos/${event.slug}?code=${automation.discountCode}` : undefined;
  const discount = await getDiscountCodeByCode(automation.discountCode);
  if (!discount?.giftTicketTypeId) return { link };

  const product = await getTicketTypeById(discount.giftTicketTypeId);
  return { link, productName: product?.name };
}

/** Respuesta a una historia con la palabra clave correcta: manda el regalo
 * configurado (link, mensaje, producto, o código de descuento) por DM
 * normal y lo registra en el hilo como cualquier mensaje saliente. Devuelve
 * `true` cuando manejó el mensaje (para que `handleMessagingEvent` no corra
 * además el agente conversacional encima del mismo mensaje). */
export async function tryHandleKeywordTrigger(input: {
  threadId: number;
  igUserId: string;
  text: string;
  source: 'story_reply';
}): Promise<boolean> {
  const automation = await matchKeywordTrigger(input.text, input.igUserId, input.source);
  if (!automation) return false;

  const extras = await resolveAutomationExtras(automation);
  const { text: replyText, mid } = await sendAutomationReply(
    automation,
    extras,
    (text, button) => (button
      ? sendButtonMessage({ id: input.igUserId }, text, button)
      : sendInstagramMessage({ recipientId: input.igUserId, text })),
  );
  await appendIgMessage({ threadId: input.threadId, mid, direction: 'out', source: 'bot', text: replyText });
  await recordIgKeywordRedemption({ automationId: automation.id, igUserId: input.igUserId, source: input.source });
  return true;
}

/** Arma y manda el mensaje de una automatización, con botón "Comprar" real
 * cuando el mensaje trae `{{link}}` y el texto sin el link entra en el tope
 * del Button Template de Meta (640 caracteres) -- si no entra (mensaje
 * largo escrito a mano), cae a texto plano con el link pegado, para no
 * perder el mensaje por un límite de formato. `send` abstrae el destino
 * real (DM normal vs. Private Reply de comentario), que ya difiere entre
 * `tryHandleKeywordTrigger` y `handleCommentChange`. */
async function sendAutomationReply(
  automation: { replyMessage: string; discountCode: string | null },
  extras: { productName?: string; link?: string },
  send: (text: string, button?: { title: string; url: string }) => Promise<{ mid: string | null }>,
): Promise<{ text: string; mid: string | null }> {
  const { text, buttonUrl } = splitAutomationLink(automation, extras);
  if (buttonUrl && text.length <= 640) {
    const { mid } = await send(text, { title: automation.discountCode ? 'Comprar con código' : 'Ver más', url: buttonUrl });
    return { text, mid };
  }
  const fallbackText = buildAutomationReplyText(automation, extras);
  const { mid } = await send(fallbackText);
  return { text: fallbackText, mid };
}

/** Comentario nuevo en un post/reel, con la forma que manda el campo de
 * webhook "comments". Hoy Meta nunca manda uno de estos -- el permiso
 * `instagram_business_manage_comments` (Advanced Access) todavía no está
 * aprobado para esta app, ver docs/INSTAGRAM-AGENT.md -- pero apenas se
 * suscriba ese campo del webhook, esto queda funcionando sin tocar nada
 * más. Usa "Private Replies" de Meta (`sendPrivateReply`): un DM fuera de
 * cualquier hilo/ventana de 24h, dirigido al comentario, no a la persona. */
export async function handleCommentChange(value: { id?: string; text?: string; from?: { id?: string; username?: string } } | undefined): Promise<void> {
  const commentId = value?.id;
  const igUserId = value?.from?.id;
  const text = (value?.text ?? '').trim();
  if (!commentId || !igUserId || text.length === 0) return;

  const automation = await matchKeywordTrigger(text, igUserId, 'comment');
  if (!automation) return;

  const extras = await resolveAutomationExtras(automation);
  await sendAutomationReply(
    automation,
    extras,
    (replyText, button) => (button
      ? sendButtonMessage({ comment_id: commentId }, replyText, button)
      : sendPrivateReply(commentId, replyText)),
  );
  await recordIgKeywordRedemption({ automationId: automation.id, igUserId, source: 'comment' });
}

/** Eco de un mensaje SALIENTE de la cuenta de la productora. En un eco,
 * `sender` es la cuenta propia y `recipient` es la persona del otro lado --
 * al revés que en un mensaje entrante, por eso el hilo se resuelve por
 * `recipient.id`, no por `sender.id`.
 *
 * Dos orígenes posibles, indistinguibles salvo por el `mid`:
 * 1. Un mensaje que YA mandamos nosotros (el agente vía `deliver()`, o una
 *    respuesta manual vía `sendManualInstagramReply`) -- ambos guardan el
 *    mensaje con su `mid` real ANTES de que llegue este eco, así que
 *    `appendIgMessage` lo descarta solo por el `mid` duplicado (mismo
 *    mecanismo que ya evita procesar dos veces un reintento de Meta). No
 *    hay nada más que hacer acá.
 * 2. Un mensaje que el dueño escribió directo en SU PROPIA app de Instagram,
 *    sin pasar por el panel -- genuinamente nuevo para nosotros. Se guarda
 *    recién acá y se pausa el bot, para que no le conteste encima al mismo
 *    cliente con el que el dueño ya está hablando a mano. */
export async function handleOwnerEcho(event: MetaMessaging, message: NonNullable<MetaMessaging['message']>): Promise<void> {
  const recipientId = event.recipient?.id;
  if (!recipientId) return;
  const text = (message.text ?? '').trim();
  // Un adjunto suelto del dueño (foto, sticker) sin texto no se guarda --
  // el mismo criterio que ya usa el lado entrante, no hay nada que mostrar
  // en el historial del agente igual, y no vale la pena pausar por eso.
  if (text.length === 0) return;

  const thread = await getOrCreateIgThread({ igUserId: recipientId });
  if (!thread) return;

  const saved = await appendIgMessage({
    threadId: thread.id,
    mid: message.mid,
    direction: 'out',
    source: 'admin',
    text,
  });
  if (!saved) return; // Ya lo teníamos guardado -- lo mandamos nosotros mismos por la API.

  await setIgThreadBotPaused(thread.id, true, 'El dueño contestó directo desde Instagram');
}

/** Manda la respuesta y la guarda en el hilo. Si Meta la rechaza (token
 * vencido, ventana de 24 horas cerrada) NO se guarda como enviada: la
 * bandeja tiene que mostrar lo que realmente le llegó a la persona. */
async function deliver(threadId: number, recipientId: string, text: string, source: 'bot' | 'admin', button?: { title: string; url: string }): Promise<void> {
  try {
    const { mid } = button
      ? await sendButtonMessage({ id: recipientId }, text, button)
      : await sendInstagramMessage({ recipientId, text });
    await appendIgMessage({ threadId, mid, direction: 'out', source, text });
  } catch (err) {
    console.error('[Instagram] No se pudo enviar la respuesta:', err);
    await setIgThreadBotPaused(threadId, true, 'Falló el envío a Instagram, revisar el token');
  }
}

async function handoff(
  threadId: number,
  who: string,
  incoming: string,
  reason: string,
  handoffMessage: string,
  recipientId: string,
): Promise<void> {
  await deliver(threadId, recipientId, handoffMessage, 'bot');
  await setIgThreadBotPaused(threadId, true, reason);
  await notifyHandoff(who, incoming, reason);
}

/** Deriva sin mandar ningún mensaje automático ni avisar por push -- para lo
 * que probablemente ni siquiera es una consulta de cliente (un adjunto suelto
 * o un mensaje que la IA marcó como personal). El mensaje queda guardado en
 * la bandeja del admin, tal cual llegó, esperando que el dueño lo vea y
 * conteste él mismo como cualquier DM normal. Sin push a propósito: no es
 * una alerta de negocio, es un chat personal que no necesita interrumpir. */
async function silentHandoff(threadId: number, reason: string): Promise<void> {
  await setIgThreadBotPaused(threadId, true, reason);
}

/** Push al celular del admin. Solo en las derivaciones, no en cada DM: un
 * agente que avisa de todo termina silenciado, y entonces no avisa de nada. */
async function notifyHandoff(who: string, incoming: string, reason: string): Promise<void> {
  await sendPushToAdmins('pushInstagramHandoff', {
    title: `📩 Instagram: ${who}`,
    body: `${reason || 'Necesita respuesta de una persona'} — "${incoming.slice(0, 80)}"`,
    url: '/admin?section=instagram',
  });
}

/** Respuesta escrita a mano desde la bandeja del admin. Vive acá y no en
 * routers.ts para que la validación de la ventana de 24 horas y el guardado
 * en el hilo sean los mismos que usa el agente.
 *
 * Pedido del dueño: si él toma el control y contesta a mano, el bot no debe
 * volver a meterse en ese hilo solo -- se pausa automáticamente, mismo
 * mecanismo que ya usa una derivación de la IA (`setIgThreadBotPaused`), sin
 * que tenga que acordarse de apagar el switch aparte. */
export async function sendManualInstagramReply(input: {
  threadId: number;
  igUserId: string;
  lastInboundAt: Date | null;
  text: string;
}): Promise<void> {
  if (!canReplyWithinWindow(input.lastInboundAt)) {
    throw new Error('Pasaron más de 24 horas desde el último mensaje de esta persona: Instagram ya no deja responderle por acá.');
  }
  const { mid } = await sendInstagramMessage({ recipientId: input.igUserId, text: input.text });
  await appendIgMessage({ threadId: input.threadId, mid, direction: 'out', source: 'admin', text: input.text });
  await setIgThreadBotPaused(input.threadId, true, 'El dueño tomó la conversación a mano');
}
