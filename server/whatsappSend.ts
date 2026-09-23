import { ENV } from './_core/env';

/* Salida hacia la WhatsApp Cloud API: texto, botones, listas, botón con link
 * y el "visto + escribiendo…". Aparte de server/whatsapp.ts (la ENTRADA) por
 * lo mismo que server/instagramSend.ts: la bandeja del admin manda mensajes
 * a mano sin arrastrar el webhook entero.
 *
 * Los armadores de payload (`build*`) son funciones puras y exportadas: los
 * topes de Meta (3 botones, 20 caracteres, 10 filas…) se aplican ahí y se
 * testean sin red. Si Meta recibe un título de 21 caracteres rechaza el
 * mensaje ENTERO -- y la persona se queda sin respuesta. */

const GRAPH_VERSION = 'v23.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class WhatsAppApiError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = 'WhatsAppApiError';
  }
}

export type WaButton = { id: string; title: string };
export type WaListRow = { id: string; title: string; description?: string };

/** Corta sin dejar espacios colgando -- Meta cuenta caracteres, no bytes. */
function clip(text: string, max: number): string {
  const chars = Array.from(text.trim());
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, max - 1).join('').trimEnd() + '…';
}

export function buildTextPayload(to: string, body: string) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: clip(body, 4096), preview_url: true },
  };
}

/** Hasta 3 botones de respuesta rápida. Con 0 botones no es un mensaje
 * interactivo válido: el llamador tiene que mandar texto normal. */
export function buildButtonsPayload(to: string, body: string, buttons: WaButton[]) {
  const seen = new Set<string>();
  const clean = buttons
    .map((b) => ({ id: clip(b.id, 256), title: clip(b.title, 20) }))
    .filter((b) => b.title.length > 0 && !seen.has(b.title.toLowerCase()) && seen.add(b.title.toLowerCase()))
    .slice(0, 3);
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: clip(body, 1024) },
      action: { buttons: clean.map((b) => ({ type: 'reply', reply: b })) },
    },
  };
}

/** Lista desplegable (hasta 10 filas en total). `buttonLabel` es el texto
 * del botón que la abre. */
export function buildListPayload(to: string, body: string, buttonLabel: string, sectionTitle: string, rows: WaListRow[]) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: clip(body, 4096) },
      action: {
        button: clip(buttonLabel, 20),
        sections: [{
          title: clip(sectionTitle, 24),
          rows: rows.slice(0, 10).map((r) => ({
            id: clip(r.id, 200),
            title: clip(r.title, 24),
            ...(r.description ? { description: clip(r.description, 72) } : {}),
          })),
        }],
      },
    },
  };
}

/** Texto + un botón que abre un link (ej. "Comprar entrada"). */
export function buildCtaUrlPayload(to: string, body: string, displayText: string, url: string) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: clip(body, 1024) },
      action: { name: 'cta_url', parameters: { display_text: clip(displayText, 20), url } },
    },
  };
}

async function postMessages(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!ENV.waAccessToken || !ENV.waPhoneNumberId) {
    throw new WhatsAppApiError('Faltan WA_ACCESS_TOKEN o WA_PHONE_NUMBER_ID en el servidor.');
  }
  const response = await fetch(`${GRAPH_BASE}/${ENV.waPhoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ENV.waAccessToken}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (body as { error?: { message?: string; code?: number } }).error;
    throw new WhatsAppApiError(error?.message ?? `WhatsApp respondió ${response.status}`, error?.code);
  }
  return body as Record<string, unknown>;
}

/** Manda un mensaje ya armado y devuelve el `wamid` que asigna Meta. */
export async function sendWhatsAppPayload(payload: Record<string, unknown>): Promise<{ wamid: string | null }> {
  const body = await postMessages(payload);
  const messages = (body as { messages?: Array<{ id?: string }> }).messages;
  return { wamid: messages?.[0]?.id ?? null };
}

export async function sendWhatsAppText(to: string, text: string): Promise<{ wamid: string | null }> {
  return sendWhatsAppPayload(buildTextPayload(to, text));
}

/** Doble check azul + "escribiendo…" mientras corre el agente. Reemplaza el
 * retraso artificial de Instagram: la persona VE que alguien está
 * contestando. El indicador se apaga solo al llegar la respuesta (o a los
 * 25 s). Nunca hace fallar nada: es cosmético. */
export async function markReadWithTyping(wamid: string): Promise<void> {
  try {
    await postMessages({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: wamid,
      typing_indicator: { type: 'text' },
    });
  } catch (err) {
    console.warn('[WhatsApp] No se pudo marcar como leído:', err);
  }
}
