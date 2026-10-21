import { chileDateKey } from './chileDate';

/* Alerta del cupo diario de correos (plan de Resend: ~100 al día). Reglas
 * puras; el envío del aviso vive en server/emailQuotaAlert.ts. */

/** Correos del día a partir de los cuales se avisa (se puede cambiar con la
 * variable EMAIL_DAILY_ALERT_AT en Vercel). */
export const EMAIL_DAILY_ALERT_DEFAULT = 95;

/** Tope de correos del día para los envíos del concurso (ranking, invitación a
 * quienes ya compraron): deja ~30 libres para entradas y avisos. */
export const CONTEST_EMAIL_DAILY_LIMIT = 70;

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
