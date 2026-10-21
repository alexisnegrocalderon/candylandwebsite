import { countEmailsSentSince, countEmailsSentToday, getDb } from './db';
import { sendPushToAdminsAlways } from './push';
import { rateLimits } from '../drizzle/schema';
import { billingPeriodStart, emailAlertDayKey, emailAlertThreshold, emailMonthlyAlertKey, emailMonthlyThreshold, isEmailAlertDue, RESEND_MONTHLY_LIMIT } from '../shared/emailQuota';

/* Avisos por push del cupo de correos (Resend Pro: 50.000 al mes, sin tope
 * diario): uno al llegar a EMAIL_DAILY_ALERT_AT en el día (1.400 por defecto) y
 * otro al llegar al 80 % del mes (40.000). Se revisa
 * después de cada correo registrado (server/email.ts) y avisa UNA vez por día de
 * Chile. Va por push y no por correo a propósito: un correo de aviso gastaría
 * justo el cupo que se quiere cuidar. Nunca lanza. */
export async function checkEmailQuotaAlert(now: Date = new Date()): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await checkMonthlyAlert(now);
    const threshold = emailAlertThreshold(process.env.EMAIL_DAILY_ALERT_AT);
    const sentToday = await countEmailsSentToday(now);
    if (!isEmailAlertDue(sentToday, threshold)) return;
    // Reclamo atómico: la clave es única, así que si dos correos cruzan el
    // umbral a la vez (o ya se avisó hoy) solo uno de los dos inserta.
    try {
      await db.insert(rateLimits).values({ key: emailAlertDayKey(now), attempts: sentToday });
    } catch {
      return;
    }
    await sendPushToAdminsAlways({
      title: `⚠️ ${sentToday} correos enviados hoy`,
      body: `Llevas ${sentToday} correos hoy, más de lo normal. Revisa que no haya un envío masivo repetido: con Resend Pro el límite es mensual (50.000).`,
      url: '/admin',
    });
  } catch (err) {
    console.warn('[emailQuotaAlert] No se pudo revisar el cupo diario de correos:', err);
  }
}

/** Aviso único por período al llegar al 80 % del límite mensual. */
async function checkMonthlyAlert(now: Date): Promise<void> {
  const threshold = emailMonthlyThreshold(process.env.EMAIL_MONTHLY_ALERT_AT);
  const sentMonth = await countEmailsSentSince(billingPeriodStart(now));
  if (!isEmailAlertDue(sentMonth, threshold)) return;
  const db = await getDb();
  if (!db) return;
  try {
    await db.insert(rateLimits).values({ key: emailMonthlyAlertKey(now), attempts: sentMonth });
  } catch {
    return;
  }
  await sendPushToAdminsAlways({
    title: `⚠️ ${sentMonth.toLocaleString('es-CL')} correos este mes`,
    body: `Llevas el ${Math.round((sentMonth / RESEND_MONTHLY_LIMIT) * 100)}% del límite mensual de Resend Pro (${RESEND_MONTHLY_LIMIT.toLocaleString('es-CL')}). Se renueva el 21.`,
    url: '/admin',
  });
}
