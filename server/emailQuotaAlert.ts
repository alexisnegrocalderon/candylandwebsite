import { countEmailsSentToday, getDb } from './db';
import { sendPushToAdminsAlways } from './push';
import { rateLimits } from '../drizzle/schema';
import { emailAlertDayKey, emailAlertThreshold, isEmailAlertDue } from '../shared/emailQuota';

/* Aviso por push al llegar a 95 correos en el día (el plan de Resend deja ~100):
 * pasado ese tope, la confirmación de compra con el QR deja de salir. Se revisa
 * después de cada correo registrado (server/email.ts) y avisa UNA vez por día de
 * Chile. Va por push y no por correo a propósito: un correo de aviso gastaría
 * justo el cupo que se quiere cuidar. Nunca lanza. */
export async function checkEmailQuotaAlert(now: Date = new Date()): Promise<void> {
  try {
    const threshold = emailAlertThreshold(process.env.EMAIL_DAILY_ALERT_AT);
    const sentToday = await countEmailsSentToday(now);
    if (!isEmailAlertDue(sentToday, threshold)) return;
    const db = await getDb();
    if (!db) return;
    // Reclamo atómico: la clave es única, así que si dos correos cruzan el
    // umbral a la vez (o ya se avisó hoy) solo uno de los dos inserta.
    try {
      await db.insert(rateLimits).values({ key: emailAlertDayKey(now), attempts: sentToday });
    } catch {
      return;
    }
    await sendPushToAdminsAlways({
      title: `⚠️ ${sentToday} correos enviados hoy`,
      body: `Estás cerca del límite diario de Resend (~100). Pasado el tope, los correos con el QR de las compras no salen hasta mañana.`,
      url: '/admin',
    });
  } catch (err) {
    console.warn('[emailQuotaAlert] No se pudo revisar el cupo diario de correos:', err);
  }
}
