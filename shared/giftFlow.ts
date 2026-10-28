/* Flujo «Regalar» en 3 pasos (Quién → Qué → Confirmar), en el panel y en la App: lógica pura del resumen, el mensaje
 * personalizado y la «última visita» de cada resultado. La hoja está en client/src/components/gifts/GiftSheet.tsx y el
 * envío en server/routers.ts (orders.gift → runGift). */

/** Largo máximo del mensaje personalizado que acompaña al regalo. */
export const GIFT_MESSAGE_MAX = 200;

/** El mensaje listo para guardar: sin espacios de más, sin saltos múltiples, hasta 200 caracteres; `null` si queda vacío. */
export function cleanGiftMessage(raw: string | null | undefined): string | null {
  const text = (raw ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return text ? text.slice(0, GIFT_MESSAGE_MAX) : null;
}

/** El mensaje del regalo viaja en `orders.attendeeData` (JSON) de la orden del regalo: así no hace falta otra columna. */
export function giftMessageData(message: string | null): string | undefined {
  return message ? JSON.stringify({ giftMessage: message }) : undefined;
}

export function giftMessageOf(attendeeData: string | null | undefined): string | null {
  if (!attendeeData || attendeeData[0] !== '{') return null;
  try {
    const v = (JSON.parse(attendeeData) as { giftMessage?: unknown }).giftMessage;
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, GIFT_MESSAGE_MAX) : null;
  } catch { return null; }
}

const DAY = 86_400_000;

/** «Hoy», «Ayer», «Hace 5 días», «Hace 2 meses», «Hace más de un año» o «Sin visitas». */
export function lastVisitLabel(at: Date | string | null | undefined, now: Date = new Date()): string {
  if (!at) return 'Sin visitas';
  const days = Math.floor((now.getTime() - new Date(at).getTime()) / DAY);
  if (days <= 0) return 'Visto hoy';
  if (days === 1) return 'Visto ayer';
  if (days < 30) return `Visto hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months < 12) return `Visto hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
  return 'Visto hace más de un año';
}

/** La inicial para el círculo de cada resultado: la del nombre, o la del correo. */
export function initialOf(name: string | null | undefined, email: string): string {
  const ch = (name?.trim() || email).trim().charAt(0);
  return ch ? ch.toLocaleUpperCase('es-CL') : '?';
}

const listar = (parts: string[]) => (parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`);

export interface GiftSummaryInput {
  /** «Camila», «3 personas» o «el grupo VIP (24 personas)». */
  to: string;
  items: { name: string; quantity: number; kind: 'acceso' | 'extra' | 'trago' }[];
  mode: 'directo' | 'pase';
  /** Pases «a elección» (cuántos). */
  anyAccessQty?: number;
  eventTitle?: string | null;
  /** «hasta el evento», «por 7 días». */
  validity?: string | null;
}

/** El resumen del paso 3 en lenguaje natural: «Le regalas a Camila 1 pase de acceso a elección y 2 Piscolas para el 2do
 * Aniversario. El pase queda en sus Cupones y vale hasta el evento.» */
export function giftSummary(s: GiftSummaryInput): string {
  const qty = (n: number, name: string) => `${n} ${name}`;
  const pase = s.mode === 'pase';
  const parts: string[] = [];
  if (pase && (s.anyAccessQty ?? 0) > 0) parts.push(`${s.anyAccessQty} ${s.anyAccessQty === 1 ? 'pase' : 'pases'} de acceso a elección`);
  for (const it of s.items) {
    if (it.quantity <= 0) continue;
    if (pase && it.kind === 'acceso') parts.push(`${it.quantity} ${it.quantity === 1 ? 'pase' : 'pases'} de ${it.name}`);
    else parts.push(qty(it.quantity, it.name));
  }
  if (parts.length === 0) return `Todavía no elegiste qué regalarle a ${s.to}.`;
  const hasPass = pase && ((s.anyAccessQty ?? 0) > 0 || s.items.some((i) => i.kind === 'acceso' && i.quantity > 0));
  const hasDrink = s.items.some((i) => i.kind === 'trago' && i.quantity > 0);
  const hasDirect = s.items.some((i) => i.quantity > 0 && (i.kind === 'extra' || (i.kind === 'acceso' && !pase)));
  const how: string[] = [];
  if (hasPass) how.push(`el pase queda en sus Cupones para canjearlo${s.validity ? ` y vale ${s.validity}` : ''}`);
  if (hasDirect) how.push('la entrada le llega por correo con su QR');
  if (hasDrink) how.push('el trago queda en sus Cupones con un QR para la barra');
  const first = `Le regalas a ${s.to} ${listar(parts)}${s.eventTitle ? ` para ${s.eventTitle}` : ''}.`;
  const cap = (t: string) => t.replace(/^./, (c) => c.toUpperCase());
  return how.length ? `${first} ${how.map((h) => `${cap(h)}.`).join(' ')}` : first;
}
