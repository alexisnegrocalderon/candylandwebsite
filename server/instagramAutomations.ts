import type { IgKeywordAutomation } from '../drizzle/schema';

/* Automatizaciones por palabra clave del Instagram: comentar o responder a
 * una historia con la palabra justa dispara un DM automático -- un link, un
 * mensaje, o un código de descuento, según lo que el dueño configuró para
 * esa campaña puntual. Ver server/instagram.ts (dónde se engancha al
 * webhook) y server/db.ts (findMatchingIgKeywordAutomation y las demás
 * funciones de datos). */

/** Arma el texto final a mandar, reemplazando los placeholders que el dueño
 * haya usado en el mensaje:
 * - `{{codigo}}` -- el código de descuento/regalo de la automatización, si
 *   tiene uno.
 * - `{{producto}}` -- el nombre del producto que regala, si esta
 *   automatización es de "producto de regalo" (no de descuento en dinero).
 * - `{{link}}` -- el link de compra ya resuelto (con el código pegado como
 *   `?code=` si corresponde, para que se aplique solo al entrar, ver
 *   `client/src/pages/Checkout.tsx`).
 * Ninguno es obligatorio: un mensaje de puro texto sin ningún placeholder
 * se manda tal cual lo escribió el dueño. */
export function buildAutomationReplyText(
  automation: Pick<IgKeywordAutomation, 'replyMessage' | 'discountCode'>,
  extra: { productName?: string | null; link?: string | null } = {},
): string {
  let text = automation.replyMessage;
  if (automation.discountCode) text = text.split('{{codigo}}').join(automation.discountCode);
  if (extra.productName) text = text.split('{{producto}}').join(extra.productName);
  if (extra.link) text = text.split('{{link}}').join(extra.link);
  return text;
}

/** Separa el link del cuerpo del mensaje: si el mensaje usa `{{link}}` y hay
 * un link resuelto, lo saca del texto (junto con el salto de línea que haya
 * quedado suelto alrededor) para mandarlo aparte como un botón real
 * "Comprar" en vez de una URL pegada en el texto (ver `sendButtonMessage`,
 * `server/instagramSend.ts`). `{{codigo}}`/`{{producto}}` se sustituyen
 * igual que siempre. */
export function splitAutomationLink(
  automation: Pick<IgKeywordAutomation, 'replyMessage' | 'discountCode'>,
  extra: { productName?: string | null; link?: string | null } = {},
): { text: string; buttonUrl: string | null } {
  const withoutLink = buildAutomationReplyText(automation, { productName: extra.productName });
  const hasLinkPlaceholder = withoutLink.includes('{{link}}');
  if (!hasLinkPlaceholder) return { text: withoutLink, buttonUrl: null };
  if (!extra.link) return { text: withoutLink.split('{{link}}').join(''), buttonUrl: null };

  const text = withoutLink
    .split('{{link}}').join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, buttonUrl: extra.link };
}

/** Normaliza para comparar sin que mayúsculas o tildes rompan el calce
 * ("Disfraz", "disfraz!", "DISFRAZ" tienen que calzar todas con "disfraz"). */
function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** `true` si el texto entrante contiene la palabra clave, sin importar
 * mayúsculas/tildes. `includes()` a propósito, no palabra exacta -- "me
 * encanta el disfraz!" calza con la palabra clave "disfraz". */
export function matchesKeyword(text: string, keyword: string): boolean {
  return normalizeForMatch(text).includes(normalizeForMatch(keyword));
}
