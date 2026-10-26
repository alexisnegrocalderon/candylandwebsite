/* Regalar cupones desde el panel (sección App): a una persona, a una lista pegada o a un grupo de
 * clientes. Lógica pura; el servidor está en server/members.ts (grantManualCoupon / grantCouponBatch). */

export type CouponGiftType = 'percentage' | 'fixed';

/** A quién se regala: correos pegados o un grupo de clientes. */
export type CouponAudience =
  | { kind: 'emails'; emails: string[] }
  | { kind: 'level'; level: 'vip' | 'recurrente' | 'nuevo' | 'inactivo' }
  | { kind: 'birthdayMonth'; month: number }
  | { kind: 'app' }
  | { kind: 'members' };

/** Tope por envío: un lote más grande se parte en varios. */
export const COUPON_BATCH_MAX = 500;

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

/** Correos de un texto pegado (comas, saltos de línea, «Nombre <correo>»): normalizados, sin repetir. */
export function parseEmailList(text: string): { emails: string[]; invalid: string[] } {
  const emails: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    const token = raw.replace(/^[<("']+|[>)"'.]+$/g, '').trim().toLowerCase();
    if (!token) continue;
    if (!EMAIL_RE.test(token)) { if (token.includes('@')) invalid.push(token); continue; }
    if (seen.has(token)) continue;
    seen.add(token);
    emails.push(token);
  }
  return { emails, invalid };
}

const clp = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

/** «15%» o «$5.000». */
export function couponValueLabel(type: CouponGiftType, value: number): string {
  return type === 'fixed' ? clp(value) : `${value}%`;
}

/** Título por defecto cuando el dueño no escribe un motivo. */
export function defaultCouponTitle(type: CouponGiftType, value: number): string {
  return `${couponValueLabel(type, value)} de regalo`;
}

/** Valida lo que llega del panel; devuelve el error para mostrar o null. */
export function couponGiftError(input: { type: CouponGiftType; value: number; days: number }): string | null {
  if (!Number.isFinite(input.value) || input.value <= 0) return 'El descuento tiene que ser mayor a cero.';
  if (input.type === 'percentage' && input.value > 100) return 'El porcentaje no puede pasar de 100.';
  if (input.type === 'fixed' && input.value > 1_000_000) return 'El monto es demasiado alto.';
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 365) return 'La validez va de 1 a 365 días.';
  return null;
}

/** Texto de la notificación que avisa el cupón. */
export function couponPushText(input: { name?: string | null; title: string; days: number; eventTitle?: string | null }): { title: string; body: string } {
  const who = input.name?.trim() ? `${input.name.trim()}, ` : '';
  const where = input.eventTitle ? ` para ${input.eventTitle}` : '';
  return { title: '🎁 Tienes un cupón de regalo', body: `${who}${input.title}${where}. Míralo en tu cuenta: vale ${input.days} ${input.days === 1 ? 'día' : 'días'}.` };
}
