import { chileDateKey } from './chileDate';

/* Cupos de correo (Resend Pro desde el 21/10: 50.000 al mes, sin tope diario,
 * máx. 2 envíos por segundo). Reglas puras; el envío de los avisos vive en
 * server/emailQuotaAlert.ts. */

/** Correos por mes del plan Pro; el período se renueva el día 21. */
export const RESEND_MONTHLY_LIMIT = 50_000;
export const RESEND_RENEWAL_DAY = 21;

/** Tope diario "de cortesía" (50.000 / 30 ≈ 1.600): Pro no tiene límite diario,
 * pero se reparte el mes para no gastarlo de golpe. Se puede cambiar con la
 * variable RESEND_DAILY_EMAIL_CAP. */
export const RESEND_DAILY_DEFAULT = 1_500;

/** Correos del día que se dejan SIEMPRE libres para los transaccionales (la
 * confirmación de compra con el QR). */
export const TRANSACTIONAL_RESERVE = 300;

/** Correos del día a partir de los cuales se avisa (se puede cambiar con la
 * variable EMAIL_DAILY_ALERT_AT en Vercel). */
export const EMAIL_DAILY_ALERT_DEFAULT = 1_400;

/** Aviso del mes: al llegar al 80 % de los 50.000 (variable EMAIL_MONTHLY_ALERT_AT). */
export const EMAIL_MONTHLY_ALERT_DEFAULT = 40_000;

/** Cuándo empezó el período de facturación vigente (el último día 21, 00:00 UTC). */
export function billingPeriodStart(now: Date = new Date()): Date {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  return now.getUTCDate() >= RESEND_RENEWAL_DAY
    ? new Date(Date.UTC(y, m, RESEND_RENEWAL_DAY))
    : new Date(Date.UTC(y, m - 1, RESEND_RENEWAL_DAY));
}

/** Clave para avisar una sola vez por período de facturación. */
export function emailMonthlyAlertKey(now: Date = new Date()): string {
  return `email-monthly-alert:${billingPeriodStart(now).toISOString().slice(0, 10)}`;
}

export function emailMonthlyThreshold(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : EMAIL_MONTHLY_ALERT_DEFAULT;
}

/** Tope de correos del día para los envíos del concurso (ranking, invitación a
 * quienes ya compraron): deja libre el resto para entradas y avisos. */
export const CONTEST_EMAIL_DAILY_LIMIT = 700;

export function emailAlertThreshold(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : EMAIL_DAILY_ALERT_DEFAULT;
}

/** ¿Ya se llegó al umbral? Cuenta todos los intentos del día (éxitos y fallos),
 * igual que el contador del admin. */
export function isEmailAlertDue(sentToday: number, threshold: number): boolean {
  return sentToday >= threshold;
}

/** Clave para avisar una sola vez por día de Chile. */
export function emailAlertDayKey(now: Date = new Date()): string {
  return `email-quota-alert:${chileDateKey(now)}`;
}
