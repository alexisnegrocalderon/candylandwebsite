import { z } from 'zod';
import { eq, inArray, and, lte } from 'drizzle-orm';
import { getDb } from './db';
import { orders, events } from '../drizzle/schema';
import { invokeLLM } from './_core/llm';
import { sendEmail, buildPendingReminderEmail } from './email';

/* Recordatorio a quien dejó la compra a medio camino.
 *
 * El tono lo fijó el dueño: recordar y motivar, NO vender de forma agresiva.
 * Esa decisión vive en el SYSTEM_PROMPT de abajo y en el copy por defecto de
 * `buildPendingReminderEmail` (server/email.ts). */

const APP_URL = process.env.APP_URL && process.env.APP_URL !== 'https://mansionplayroom.cl'
  ? process.env.APP_URL
  : 'https://mansionplayroom.cl';

export type ReminderResult = {
  sent: number;
  skipped: { orderNumber: string; motivo: string }[];
  failed: { orderNumber: string; error: string }[];
};

/** Manda el recordatorio a las órdenes elegidas.
 *
 * ⚠️ Revalida que cada orden SIGA pendiente justo antes de mandar. Entre que
 * el admin carga la lista y aprieta enviar, alguien pudo haber pagado --
 * mandarle un "te falta completar tu compra" a quien ya pagó es el peor error
 * posible de esta función, así que se relee el estado en vez de confiar en lo
 * que traía la pantalla. */
export async function sendPendingReminders(params: {
  orderIds: number[];
  customBody?: string;
}): Promise<ReminderResult> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const resultado: ReminderResult = { sent: 0, skipped: [], failed: [] };
  if (!params.orderIds.length) return resultado;

  const filas = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      buyerName: orders.buyerName,
      buyerEmail: orders.buyerEmail,
      total: orders.total,
      paymentStatus: orders.paymentStatus,
      reminderCount: orders.reminderCount,
      eventTitle: events.title,
      eventSlug: events.slug,
      eventDate: events.eventDate,
    })
    .from(orders)
    .leftJoin(events, eq(orders.eventId, events.id))
    .where(inArray(orders.id, params.orderIds));

  for (const orden of filas) {
    if (orden.paymentStatus !== 'pending') {
      resultado.skipped.push({
        orderNumber: orden.orderNumber,
        motivo: orden.paymentStatus === 'approved' ? 'ya pagó' : `estado: ${orden.paymentStatus}`,
      });
      continue;
    }

    try {
      await sendEmail({
        to: orden.buyerEmail,
        subject: `${orden.buyerName.split(' ')[0]}, tu acceso te está esperando 🍬`,
        html: buildPendingReminderEmail({
          buyerName: orden.buyerName,
          eventTitle: orden.eventTitle ?? 'nuestra próxima fiesta',
          eventDate: orden.eventDate ? new Date(orden.eventDate) : null,
          total: Number(orden.total),
          checkoutUrl: orden.eventSlug ? `${APP_URL}/checkout/${orden.eventSlug}` : `${APP_URL}/eventos`,
          customBody: params.customBody,
        }),
      });

      await db.update(orders)
        .set({ reminderSentAt: new Date(), reminderCount: (orden.reminderCount ?? 0) + 1 })
        .where(eq(orders.id, orden.id));

      resultado.sent++;
    } catch (err) {
      resultado.failed.push({
        orderNumber: orden.orderNumber,
        error: (err as Error).message ?? 'error desconocido',
      });
    }
  }

  console.log(`[Recordatorios] Enviados: ${resultado.sent} · Omitidos: ${resultado.skipped.length} · Con error: ${resultado.failed.length}`);
  return resultado;
}

/* ── Cron diario de carrito abandonado ─────────────────────────
 * Pedido explícito del dueño: la herramienta de arriba (sendPendingReminders)
 * ya existía como botón manual en Ventas Web, pero nadie la usaba
 * sistemáticamente -- con $0 de pauta y 8 semanas de campaña, cada orden que
 * queda `pending` y nunca recibe un recordatorio es plata que se dejó sobre
 * la mesa. Esto la corre sola, todos los días (dentro del mismo cron de
 * mailing -- ver server/cronRoutes.ts: Vercel Hobby solo permite crons
 * diarios y como mucho 2 en total, confirmado en vivo al desplegar), con una
 * cadencia conservadora por orden para no transformarse en spam. */

/** No molestar a alguien que todavía está llenando el formulario de compra:
 * recién es candidata a un recordatorio 3 horas después de crearse. */
const ABANDONED_CART_MIN_AGE_MS = 3 * 60 * 60 * 1000;

/** Cadencia entre recordatorios de una misma orden (pedido explícito del
 * dueño: "revisar cada 3 días"). */
const ABANDONED_CART_REMINDER_GAP_MS = 3 * 24 * 60 * 60 * 1000;

/** Tope de recordatorios por orden -- sin esto, una orden pending que nunca
 * se paga recibiría un correo cada 3 días para siempre. */
const ABANDONED_CART_MAX_REMINDERS = 3;

/** Tope duro de recordatorios por CORRIDA del cron -- comparte la cuota
 * diaria de Resend (~100/día en el plan free) con el mailing masivo
 * (server/mailing.ts, CRON_MAX_PER_RUN=50) y, más importante, con los
 * correos transaccionales del sitio (confirmación de compra, Misión 300):
 * esos nunca deben quedarse sin cupo por vaciar la cuota en recordatorios.
 * Configurable por env var por si el dueño sube de plan. */
const ABANDONED_CART_CRON_CAP = Number(process.env.ABANDONED_CART_CRON_CAP) || 10;

/** Ids de las órdenes `pending` elegibles para el recordatorio automático,
 * de la más vieja a la más nueva (a las que llevan más tiempo esperando les
 * toca primero si el tope de la corrida no alcanza para todas). Reglas:
 * - Solo canal 'web' -- caja/import no tienen un checkout al que volver.
 * - El evento todavía no pasó: "tu entrada te espera" para una fiesta que
 *   ya fue no tiene sentido y se ve mal.
 * - Al menos `ABANDONED_CART_MIN_AGE_MS` desde que se creó la orden.
 * - Si ya recibió un recordatorio, que hayan pasado al menos
 *   `ABANDONED_CART_REMINDER_GAP_MS` desde el último, y que no haya llegado
 *   ya a `ABANDONED_CART_MAX_REMINDERS`. */
async function getOrdersDueForAbandonedCartReminder(): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const now = Date.now();
  const cutoffCreated = new Date(now - ABANDONED_CART_MIN_AGE_MS);

  const candidatas = await db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      reminderSentAt: orders.reminderSentAt,
      reminderCount: orders.reminderCount,
      eventDate: events.eventDate,
    })
    .from(orders)
    .leftJoin(events, eq(orders.eventId, events.id))
    .where(and(
      eq(orders.paymentStatus, 'pending'),
      eq(orders.channel, 'web'),
      lte(orders.createdAt, cutoffCreated),
    ))
    .orderBy(orders.createdAt);

  return candidatas
    .filter((o) => {
      if (o.eventDate && new Date(o.eventDate).getTime() < now) return false;
      if ((o.reminderCount ?? 0) >= ABANDONED_CART_MAX_REMINDERS) return false;
      if (o.reminderSentAt && now - new Date(o.reminderSentAt).getTime() < ABANDONED_CART_REMINDER_GAP_MS) return false;
      return true;
    })
    .map((o) => o.id);
}

export type AbandonedCartCronResult = ReminderResult & { eligible: number };

/** Se llama una vez por día desde server/cronRoutes.ts, dentro de la misma
 * corrida del cron de mailing (Vercel Hobby solo permite 2 crons y los dos
 * ya están ocupados -- ver el comentario en cronRoutes.ts). */
export async function runAbandonedCartCron(): Promise<AbandonedCartCronResult> {
  const eligible = await getOrdersDueForAbandonedCartReminder();
  const orderIds = eligible.slice(0, ABANDONED_CART_CRON_CAP);
  if (orderIds.length === 0) return { sent: 0, skipped: [], failed: [], eligible: eligible.length };
  const resultado = await sendPendingReminders({ orderIds });
  return { ...resultado, eligible: eligible.length };
}

/* ── Generación con IA del cuerpo del correo ──────────────────
 * Mismo molde que `generateMailingTemplate` (server/mailing.ts): prompt de
 * sistema + json_schema + validación con zod, para que un error de la IA no
 * termine en un correo roto llegando a clientes. */

export const ReminderCopySchema = z.object({
  paragraphs: z.array(z.string().min(10).max(400)).min(1).max(3),
});
export type ReminderCopy = z.infer<typeof ReminderCopySchema>;

const REMINDER_JSON_SCHEMA = {
  name: 'reminder_copy',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['paragraphs'],
    properties: {
      paragraphs: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: { type: 'string', description: 'Un párrafo del cuerpo del correo.' },
        description: 'Entre 1 y 3 párrafos cortos. Sin saludo inicial ni firma: eso ya lo pone la plantilla.',
      },
    },
  },
} as const;

const REMINDER_SYSTEM_PROMPT = `Escribes el cuerpo de un correo de Mansion Playroom, una productora de fiestas en Viña del Mar y Valparaíso (Chile), dirigido a alguien que empezó a comprar su entrada y no terminó de pagar.

REGLA MÁS IMPORTANTE: es un recordatorio amable, NO una venta agresiva.
- Nada de "última oportunidad", "no te quedes fuera", cuentas regresivas falsas ni presión artificial.
- Nada de descuentos ni promesas que no puedes cumplir: no sabes si quedan cupos ni a qué precio.
- Da por hecho que la persona simplemente se distrajo o quedó a medias, porque casi siempre es eso.

Tono: cercano, chileno neutro, tuteo. Cálido y relajado, como quien avisa "oye, quedó pendiente esto". Puedes usar algún emoji con moderación (🍬✨), nunca más de uno por párrafo.

Estructura: entre 1 y 3 párrafos cortos. El primero recuerda que la compra quedó a medio camino. El resto puede recordar por qué vale la pena la noche o facilitar retomar. NO escribas saludo ("Hola X") ni despedida ni firma: la plantilla del correo ya los pone.

Responde ÚNICAMENTE con el JSON pedido, sin explicaciones.`;

function extractContent(message: { content: string | Array<{ type: string; text?: string }> }): string {
  if (typeof message.content === 'string') return message.content;
  return message.content.map((p) => (p.type === 'text' ? p.text ?? '' : '')).join('');
}

/** Reescribe el cuerpo del recordatorio a partir de una idea del dueño. */
export async function generateReminderCopy(idea: string): Promise<ReminderCopy> {
  const result = await invokeLLM({
    messages: [
      { role: 'system', content: REMINDER_SYSTEM_PROMPT },
      { role: 'user', content: `Ángulo que quiero para este recordatorio: ${idea}` },
    ],
    responseFormat: { type: 'json_schema', json_schema: REMINDER_JSON_SCHEMA },
  });

  const raw = extractContent(result.choices[0]?.message ?? { content: '' });
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('La IA no devolvió un JSON válido. Intenta de nuevo con una idea más clara.');
  }

  const validated = ReminderCopySchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`El texto generado no tiene el formato esperado: ${validated.error.issues[0]?.message ?? 'error desconocido'}.`);
  }
  return validated.data;
}
