import type { IgKeywordAutomation } from '../drizzle/schema';

/* Automatizaciones por palabra clave del Instagram: comentar o responder a
 * una historia con la palabra justa dispara un DM automático -- un link, un
 * mensaje, o un código de descuento, según lo que el dueño configuró para
 * esa campaña puntual. Ver server/instagram.ts (dónde se engancha al
 * webhook) y server/db.ts (findMatchingIgKeywordAutomation y las demás
 * funciones de datos). */

/** Arma el texto final a mandar: si la automatización tiene un código de
 * descuento asociado, reemplaza el placeholder {{codigo}} -- si no lo
 * tiene, el mensaje se manda tal cual lo escribió el dueño (un link, un
 * texto de premio, lo que sea). */
export function buildAutomationReplyText(automation: Pick<IgKeywordAutomation, 'replyMessage' | 'discountCode'>): string {
  if (!automation.discountCode) return automation.replyMessage;
  return automation.replyMessage.split('{{codigo}}').join(automation.discountCode);
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
