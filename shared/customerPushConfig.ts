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
  /** Al activar los avisos (si ya está ligado a un correo de compra). */
  welcome: AutoPushText;
  /** El día del cumpleaños. */
  birthday: AutoPushText;
  /** Quedan pocos cupos en una tanda del próximo evento: a quienes aún no tienen entrada. */
  lowStock: AutoPushText & { threshold: number };
  /** Día siguiente del evento: gracias + encuesta, a quienes fueron. */
  thanks: AutoPushText & { hour: number };
  /** Compraron alguna vez y llevan N días sin comprar, con un evento por venir. */
  winback: AutoPushText & { days: number };
  /** Saldo PlayCard sin gastar a pocos días de un evento. */
  balance: AutoPushText;
  /** Regalo por activar los avisos (una vez por correo): Playcoins. 0 = sin regalo. */
  incentive: { playcoins: number };
}

export const DEFAULT_CUSTOMER_PUSH_CONFIG: CustomerPushConfig = {
  eventReminder: { enabled: false, hour: 18, title: 'Hoy es la noche ✨', body: 'Te esperamos en {evento}. Ten tu QR listo para entrar más rápido.' },
  newEvent: { enabled: false, mode: 'draft', title: '🔥 Nuevo evento', body: '{evento} ya tiene entradas. Asegura la tuya antes que suba el precio.' },
  presale: { enabled: false, mode: 'draft', title: '⏳ Sube el precio', body: 'Se acabó la tanda en {evento}. La siguiente ya está a la venta.' },
  abandonedCart: { enabled: false, title: 'Tu entrada te espera 🎟️', body: 'Dejaste tu compra para {evento} a medias. Retómala en un toque.' },
  welcome: { enabled: false, title: 'Listo, avisos activados 🔔', body: '{nombre}, te avisaremos de preventas, concursos y del recordatorio de tu evento.' },
  birthday: { enabled: false, title: '🎂 ¡Feliz cumpleaños!', body: '{nombre}, en tu cumple tienes beneficios en Playroom. Míralos aquí.' },
  lowStock: { enabled: false, threshold: 30, title: '🔥 Quedan pocos cupos', body: 'La tanda de {evento} se está agotando. Asegura tu entrada antes que suba el precio.' },
  thanks: { enabled: false, hour: 15, title: 'Gracias por venir 💜', body: '{nombre}, ¿cómo estuvo {evento}? Cuéntanos en 1 minuto, nos ayuda mucho.' },
  winback: { enabled: false, days: 60, title: 'Te extrañamos 💫', body: '{nombre}, vuelve a Playroom: ya hay entradas para {evento}.' },
  balance: { enabled: false, title: 'Tienes saldo PlayCard 💳', body: '{nombre}, tu saldo te espera para {evento}. Pasa por la barra sin efectivo.' },
  incentive: { playcoins: 0 },
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

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normalizeCustomerPushConfig(raw: unknown): CustomerPushConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as any;
  const d = DEFAULT_CUSTOMER_PUSH_CONFIG;
  const hour = Number(r.eventReminder?.hour);
  return {
    eventReminder: { ...base(r.eventReminder, d.eventReminder), hour: Number.isInteger(hour) && hour >= 8 && hour <= 23 ? hour : d.eventReminder.hour },
    newEvent: { ...base(r.newEvent, d.newEvent), mode: mode(r.newEvent?.mode) },
    presale: { ...base(r.presale, d.presale), mode: mode(r.presale?.mode) },
    abandonedCart: base(r.abandonedCart, d.abandonedCart),
    welcome: base(r.welcome, d.welcome),
    birthday: base(r.birthday, d.birthday),
    lowStock: { ...base(r.lowStock, d.lowStock), threshold: clampInt(r.lowStock?.threshold, 1, 500, d.lowStock.threshold) },
    thanks: { ...base(r.thanks, d.thanks), hour: clampInt(r.thanks?.hour, 9, 22, d.thanks.hour) },
    winback: { ...base(r.winback, d.winback), days: clampInt(r.winback?.days, 14, 730, d.winback.days) },
    balance: base(r.balance, d.balance),
    incentive: { playcoins: Math.min(500, Math.max(0, Math.round(Number(r.incentive?.playcoins)) || 0)) },
  };
}

/** Cambia {evento} por el nombre del evento. */
export function fillPushText(template: string, vars: { evento?: string | null }): string {
  return template.replace(/\{evento\}/g, vars.evento?.trim() || 'el próximo evento');
}
