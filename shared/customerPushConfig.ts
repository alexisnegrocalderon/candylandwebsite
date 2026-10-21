/** Avisos push automáticos a clientes -- los edita el dueño en el panel
 * (pestaña Push), se guardan como JSON en siteSettings.customerPushConfig.
 *
 * Arrancan APAGADOS: desplegar esto no debe empezar a mandar avisos solo
 * (mismo criterio que adminAlertsConfig). En los textos, {evento} se cambia
 * por el nombre del evento. */
import { clip, PUSH_BODY_MAX, PUSH_TITLE_MAX } from './pushText';

export type AutoPushMode = 'draft' | 'send';

export interface AutoPushText {
  enabled: boolean;
  title: string;
  body: string;
}

export interface CustomerPushConfig {
  /** El día del evento, a quienes tienen entrada (transaccional: no cuenta para el tope diario). */
  eventReminder: AutoPushText & { hour: number };
  /** Al publicar un evento nuevo: deja la campaña en borrador o la manda sola. */
  newEvent: AutoPushText & { mode: AutoPushMode };
  /** Al cambiar de tanda (sube el precio): "la preventa se acaba". */
  presale: AutoPushText & { mode: AutoPushMode };
  /** Junto al correo de carrito abandonado, si el email tiene avisos activos. */
  abandonedCart: AutoPushText;
}

export const DEFAULT_CUSTOMER_PUSH_CONFIG: CustomerPushConfig = {
  eventReminder: { enabled: false, hour: 18, title: 'Hoy es la noche ✨', body: 'Te esperamos en {evento}. Ten tu QR listo para entrar más rápido.' },
  newEvent: { enabled: false, mode: 'draft', title: '🔥 Nuevo evento', body: '{evento} ya tiene entradas. Asegura la tuya antes que suba el precio.' },
  presale: { enabled: false, mode: 'draft', title: '⏳ Sube el precio', body: 'Se acabó la tanda en {evento}. La siguiente ya está a la venta.' },
  abandonedCart: { enabled: false, title: 'Tu entrada te espera 🎟️', body: 'Dejaste tu compra para {evento} a medias. Retómala en un toque.' },
};

function text(v: unknown, fallback: string, max: number): string {
  return typeof v === 'string' && v.trim() ? clip(v, max) : fallback;
}

function base(raw: any, def: AutoPushText): AutoPushText {
  return {
    enabled: raw?.enabled === true,
    title: text(raw?.title, def.title, PUSH_TITLE_MAX),
    body: text(raw?.body, def.body, PUSH_BODY_MAX),
  };
}

function mode(v: unknown): AutoPushMode {
  return v === 'send' ? 'send' : 'draft';
}

export function normalizeCustomerPushConfig(raw: unknown): CustomerPushConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as any;
  const d = DEFAULT_CUSTOMER_PUSH_CONFIG;
  const hour = Number(r.eventReminder?.hour);
  return {
    eventReminder: { ...base(r.eventReminder, d.eventReminder), hour: Number.isInteger(hour) && hour >= 8 && hour <= 23 ? hour : d.eventReminder.hour },
    newEvent: { ...base(r.newEvent, d.newEvent), mode: mode(r.newEvent?.mode) },
    presale: { ...base(r.presale, d.presale), mode: mode(r.presale?.mode) },
    abandonedCart: base(r.abandonedCart, d.abandonedCart),
  };
}

/** Cambia {evento} por el nombre del evento. */
export function fillPushText(template: string, vars: { evento?: string | null }): string {
  return template.replace(/\{evento\}/g, vars.evento?.trim() || 'el próximo evento');
}
