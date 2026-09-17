import { ENV } from './_core/env';
import { IG_MESSAGING_WINDOW_MS } from '../shared/instagramAgentConfig';

/* Salida hacia Meta: mandar un mensaje directo y mantener vivo el token.
 *
 * Aparte de server/instagram.ts (que es la ENTRADA) para que la bandeja del
 * admin pueda mandar un mensaje escrito a mano sin arrastrar consigo todo el
 * webhook, su verificación de firma y el agente. */

const GRAPH_VERSION = 'v23.0';
const GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`;

export class InstagramApiError extends Error {
  constructor(message: string, readonly code?: number, readonly subcode?: number) {
    super(message);
    this.name = 'InstagramApiError';
  }
}

/** ¿Se puede responder todavía sin etiquetas especiales?
 *
 * Meta solo deja contestar dentro de las 24 horas siguientes al último
 * mensaje de la persona. Pasado ese plazo la API devuelve error 10 y el
 * envío se pierde -- conviene chequearlo antes para poder avisarle al admin
 * en la bandeja ("esta conversación ya se cerró") en vez de que parezca que
 * el mensaje salió. */
export function canReplyWithinWindow(lastInboundAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - new Date(lastInboundAt).getTime() < IG_MESSAGING_WINDOW_MS;
}

/** POST compartido al endpoint `/messages` -- lo único que cambia entre un
 * DM normal y una "Private Reply" a un comentario es la forma del
 * `recipient` (`{ id }` vs `{ comment_id }`), todo lo demás (auth, manejo
 * de errores) es idéntico. */
async function postToMessagesEndpoint(recipient: Record<string, string>, text: string): Promise<{ mid: string | null }> {
  if (!ENV.igAccessToken || !ENV.igUserId) {
    throw new InstagramApiError('Faltan IG_ACCESS_TOKEN o IG_USER_ID en el servidor.');
  }

  const response = await fetch(`${GRAPH_BASE}/${ENV.igUserId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ENV.igAccessToken}`,
    },
    body: JSON.stringify({ recipient, message: { text } }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (body as { error?: { message?: string; code?: number; error_subcode?: number } }).error;
    throw new InstagramApiError(
      error?.message ?? `Instagram respondió ${response.status}`,
      error?.code,
      error?.error_subcode,
    );
  }

  return { mid: (body as { message_id?: string }).message_id ?? null };
}

/** Manda un mensaje de texto por DM. Devuelve el `mid` que asigna Meta, para
 * poder guardarlo y reconocer después el eco de nuestro propio mensaje que
 * vuelve por el webhook. */
export async function sendInstagramMessage(input: {
  recipientId: string;
  text: string;
}): Promise<{ mid: string | null }> {
  return postToMessagesEndpoint({ id: input.recipientId }, input.text);
}

/** "Private Reply": manda un DM disparado por un comentario en un post/reel,
 * dirigido a quien comentó -- sin necesidad de que haya una conversación
 * abierta ni de respetar la ventana de 24 horas normal de mensajería (Meta
 * da 7 días desde el comentario para este tipo de respuesta). Usada por las
 * automatizaciones de palabra clave en comentarios (server/instagram.ts,
 * `handleCommentChange`) -- hoy no se ejecuta en producción porque el
 * permiso `instagram_business_manage_comments` todavía no está aprobado
 * para esta app, ver docs/INSTAGRAM-AGENT.md. */
export async function sendPrivateReply(commentId: string, text: string): Promise<{ mid: string | null }> {
  return postToMessagesEndpoint({ comment_id: commentId }, text);
}

/** Perfil público de quien escribe (arroba y nombre), solo para que la
 * bandeja del admin no muestre un id opaco. Nunca hace fallar nada: si Meta
 * no lo entrega (la persona restringió su perfil, o el permiso todavía no
 * está aprobado), el hilo se muestra igual con el IGSID. */
export async function fetchInstagramProfile(igUserId: string): Promise<{ username?: string; name?: string }> {
  if (!ENV.igAccessToken) return {};
  try {
    const response = await fetch(
      `${GRAPH_BASE}/${igUserId}?fields=username,name&access_token=${encodeURIComponent(ENV.igAccessToken)}`,
    );
    if (!response.ok) return {};
    const body = await response.json() as { username?: string; name?: string };
    return { username: body.username, name: body.name };
  } catch {
    return {};
  }
}

/** Renueva el token de larga duración (dura 60 días y se puede refrescar a
 * partir de las 24 horas de emitido).
 *
 * Devuelve el token nuevo, pero NO lo puede guardar solo: en Vercel las
 * variables de entorno son de solo lectura para la función. Por eso el cron
 * que llama a esto (server/cronRoutes.ts) avisa por correo cuando faltan
 * pocos días, y el reemplazo se pega a mano una vez cada dos meses. Es un
 * trámite chico y evita tener que guardar el token en la base, que es
 * exactamente el dato que uno no quiere que se filtre en un dump. */
export async function refreshInstagramToken(): Promise<{ accessToken: string; expiresInDays: number }> {
  if (!ENV.igAccessToken) throw new InstagramApiError('Falta IG_ACCESS_TOKEN en el servidor.');

  const response = await fetch(
    `${GRAPH_BASE}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(ENV.igAccessToken)}`,
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (body as { error?: { message?: string } }).error;
    throw new InstagramApiError(error?.message ?? `Instagram respondió ${response.status}`);
  }

  const typed = body as { access_token?: string; expires_in?: number };
  if (!typed.access_token) throw new InstagramApiError('Instagram no devolvió un token nuevo.');

  return {
    accessToken: typed.access_token,
    expiresInDays: Math.round((typed.expires_in ?? 0) / 86400),
  };
}
