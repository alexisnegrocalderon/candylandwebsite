import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
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
