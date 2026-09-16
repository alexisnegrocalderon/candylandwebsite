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
} from './db';
import { runInstagramAgent } from './instagramAgent';
import { sendInstagramMessage, fetchInstagramProfile, canReplyWithinWindow } from './instagramSend';
import { sendPushToAdmins } from './push';
import { normalizeInstagramAgentConfig } from '../shared/instagramAgentConfig';

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
  };
};

type MetaWebhookBody = {
  object?: string;
  entry?: Array<{ id?: string; messaging?: MetaMessaging[] }>;
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

  // El eco de nuestros propios mensajes vuelve por el mismo webhook. Sin
  // este corte el agente se leería a sí mismo y se respondería solo: el
  // bucle infinito clásico de estos bots. Doble guarda: la bandera
  // `is_echo` de Meta y el id de nuestra propia cuenta.
  if (message.is_echo || senderId === ENV.igUserId) return;
  if (message.is_deleted) return;

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
    await handoff(thread.id, thread.username ?? senderId, text, 'Se pasó del tope diario de respuestas automáticas', config.handoffMessage, senderId);
    return;
  }

  const history = await getIgMessages(thread.id, config.historyLimit + 1);
  // El mensaje que acaba de llegar viaja aparte en el prompt, no como parte
  // del historial -- si no, el modelo lo vería dos veces.
  const previous = history.filter((m) => m.id !== saved.id);

  const result = await runInstagramAgent({
    incomingText: text,
    history: previous,
    config,
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

  await deliver(thread.id, senderId, result.reply, 'bot');

  if (result.handoff) {
    await setIgThreadBotPaused(thread.id, true, result.handoffReason || 'La IA derivó la conversación');
    await notifyHandoff(thread.username ?? senderId, text, result.handoffReason);
  }
}

/** Manda la respuesta y la guarda en el hilo. Si Meta la rechaza (token
 * vencido, ventana de 24 horas cerrada) NO se guarda como enviada: la
 * bandeja tiene que mostrar lo que realmente le llegó a la persona. */
async function deliver(threadId: number, recipientId: string, text: string, source: 'bot' | 'admin'): Promise<void> {
  try {
    const { mid } = await sendInstagramMessage({ recipientId, text });
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
 * en el hilo sean los mismos que usa el agente. */
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
}
