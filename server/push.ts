/** Web Push al /admin instalado en el iPad -- sin terceros (Firebase,
 * OneSignal, etc.), es el estándar del navegador (VAPID). El service worker
 * que recibe estos envíos es client/public/admin/sw.js.
 *
 * Requiere las variables de entorno VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 * (par generado una sola vez, ver README o pedirle el par al asistente) y
 * VAPID_SUBJECT (un mailto: o https: de contacto, lo exige la spec). Sin
 * esas variables, sendPushToAdmins() no manda nada y no rompe nada -- mismo
 * criterio que sendEmail() sin RESEND_API_KEY. */
import webpush from 'web-push';
import { getDb, getSiteSettings } from './db';
import { pushSubscriptions, partyPushSubscriptions } from '../drizzle/schema';
import { eq } from 'drizzle-orm';
import { normalizeAdminAlertsConfig, type AdminAlertsConfig } from '../shared/adminAlertsConfig';

let configured = false;
function ensureConfigured(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  }
  return true;
}

interface PushPayload {
  title: string;
  body: string;
  /** Ruta del admin a abrir al tocar la notificación, ej. "/admin" (se
   * abre la sección "Ventas Web" o la que corresponda -- el service worker
   * decide con esto). */
  url?: string;
}

interface SubscriptionRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Entrega genérica a una lista de filas de suscripción (admin o
 * invitados) -- ambas tablas comparten el mismo shape endpoint/p256dh/auth,
 * solo cambia de dónde salen las filas y qué hacer al borrar una muerta. */
async function deliverTo(subs: SubscriptionRow[], payload: PushPayload, onStale: (id: number) => Promise<unknown>): Promise<void> {
  if (subs.length === 0) return;
  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification({
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }, body);
    } catch (err: any) {
      // 404/410 = el navegador invalidó esa suscripción (app desinstalada,
      // permiso revocado) -- se borra para no seguir intentando para
      // siempre contra un endpoint muerto.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await onStale(sub.id);
      } else {
        console.error('[Push] Error mandando a una suscripción:', err?.statusCode, err?.body || err);
      }
    }
  }));
}

async function deliverToAllSubscriptions(payload: PushPayload): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const subs = await db.select().from(pushSubscriptions);
  await deliverTo(subs, payload, (id) => db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id)));
}

/** Push a UN invitado (todas sus suscripciones -- puede tener más de un
 * dispositivo) -- para "te escribieron" en Playmatch. Nunca lanza. */
export async function sendPushToProfile(profileId: number, payload: PushPayload): Promise<void> {
  try {
    if (!ensureConfigured()) return;
    const db = await getDb();
    if (!db) return;
    const subs = await db.select().from(partyPushSubscriptions).where(eq(partyPushSubscriptions.profileId, profileId));
    await deliverTo(subs, payload, (id) => db.delete(partyPushSubscriptions).where(eq(partyPushSubscriptions.id, id)));
  } catch (err) {
    console.error('[Push] Error mandando a un invitado:', err);
  }
}

/** Push a TODOS los invitados suscritos de un evento -- para la promo
 * relámpago (broadcast en vivo desde el admin). Nunca lanza. */
export async function sendPushToEventGuests(eventId: number, payload: PushPayload): Promise<{ sent: number }> {
  try {
    if (!ensureConfigured()) return { sent: 0 };
    const db = await getDb();
    if (!db) return { sent: 0 };
    const subs = await db.select().from(partyPushSubscriptions).where(eq(partyPushSubscriptions.eventId, eventId));
    await deliverTo(subs, payload, (id) => db.delete(partyPushSubscriptions).where(eq(partyPushSubscriptions.id, id)));
    return { sent: subs.length };
  } catch (err) {
    console.error('[Push] Error mandando la promo relámpago:', err);
    return { sent: 0 };
  }
}

/** Manda `payload` a TODOS los dispositivos suscritos, solo si `alertKey`
 * está prendido en la config guardada. Nunca lanza -- un fallo de push no
 * puede tumbar el flujo real (aprobar una orden, crear una postulación). */
export async function sendPushToAdmins(alertKey: keyof AdminAlertsConfig, payload: PushPayload): Promise<void> {
  try {
    if (!ensureConfigured()) return;
    const settings = await getSiteSettings();
    const config = normalizeAdminAlertsConfig((settings as any).adminAlertsConfig);
    if (!config[alertKey]) return;
    await deliverToAllSubscriptions(payload);
  } catch (err) {
    console.error('[Push] Error general:', err);
  }
}

/** Push de prueba: ignora los interruptores a propósito -- es lo que usa el
 * botón "Mandar prueba" en Ajustes, para confirmar que la suscripción de
 * este dispositivo funciona antes de prender ninguna alerta real. */
export async function sendTestPushToAllAdmins(): Promise<void> {
  try {
    if (!ensureConfigured()) throw new Error('Faltan las variables VAPID en el servidor (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT).');
    await deliverToAllSubscriptions({
      title: '🍭 Notificaciones activadas',
      body: 'Así se va a ver una alerta real. Todo listo.',
      url: '/admin',
    });
  } catch (err) {
    console.error('[Push] Error en push de prueba:', err);
    throw err;
  }
}
