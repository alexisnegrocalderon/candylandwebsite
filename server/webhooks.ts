import { Router, Request, Response } from 'express';
import { getPaymentInfo, createTopupPreference, createCardPayment } from './mercadopago';
import { getDb, parseAttendeeNames, getOrderExtras } from './db';
import { orders, orderItems, tickets, ticketTypes, events, referrals, users } from '../drizzle/schema';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { generateTicketQR } from './qr';
import { sendEmail, buildOrderEmail, buildMissionTopupEmail } from './email';
import { missionCutoff, missionCapPrice, personasForAccesoSlug, MISSION_300_GOAL } from '../shared/mission300';

export const webhooksRouter = Router();

/** `toLocaleDateString`/`toLocaleTimeString` con locale "es-CL" solo define el
 * IDIOMA del formato -- la ZONA HORARIA sigue siendo la del runtime, que en
 * Vercel es UTC. Sin `timeZone` explícito, un evento guardado como 21:00
 * hora de Chile (01:00 UTC del día siguiente) se mostraba en los emails
 * como "01:00" (y a veces con la fecha corrida un día) -- de ahí que el
 * correo dijera "1am" en vez de "21:00". */
const CHILE_TZ = 'America/Santiago';
function formatEventDate(date: Date): string {
  return date.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: CHILE_TZ });
}
function formatEventTime(date: Date): string {
  return date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: CHILE_TZ });
}

/** Mapea el estado crudo de Mercado Pago a nuestro enum de 3 estados. */
export function mapPaymentStatus(mpStatus: string | undefined): 'approved' | 'rejected' | 'pending' {
  if (mpStatus === 'approved') return 'approved';
  if (mpStatus === 'rejected' || mpStatus === 'cancelled') return 'rejected';
  return 'pending';
}

/** Aplica el resultado de un pago (via webhook o via respuesta directa del
 * Payment Brick) a la orden correspondiente: actualiza el estado, suma stock
 * si corresponde, y dispara el email/generación de ticket que toque según si
 * es una compra normal, un abono de Misión 300, o el pago de la diferencia.
 * Idempotente — se puede llamar más de una vez para el mismo pago sin
 * duplicar nada (tanto el webhook como el endpoint directo del Brick pueden
 * terminar llamándola para el mismo pago). */
export async function applyPaymentResult(input: {
  orderNumber: string;
  paymentId: string;
  status: 'approved' | 'rejected' | 'pending';
  paymentMethodId?: string;
}): Promise<{ ok: boolean; alreadyProcessed?: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) return { ok: false, reason: 'Database not available' };

  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, input.orderNumber)).limit(1);
  if (!order) return { ok: false, reason: 'Order not found' };

  // Idempotencia: si ya se proceso este mismo pago, no repetir nada.
  if (order.paymentId === input.paymentId && order.paymentStatus !== 'pending') {
    return { ok: true, alreadyProcessed: true };
  }

  await db.update(orders).set({
    paymentStatus: input.status,
    paymentId: input.paymentId,
    paymentMethod: input.paymentMethodId || undefined,
  }).where(eq(orders.id, order.id));

  if (input.status === 'approved') {
    // El pago del abono de Misión 300 y el pago de la diferencia (topup)
    // son DOS pagos separados sobre la MISMA orden (mismo orderNumber
    // como external_reference). Si ya hay un topup pendiente, este pago
    // aprobado es la diferencia, no una compra nueva.
    const isTopupPayment = order.missionTopupStatus === 'pending';
    const isMissionDeposit = order.missionDeposit === 1 && order.missionTopupStatus === 'none';

    // Recién acá, con el pago confirmado, se suma al stock vendido (y por lo
    // tanto al contador de Misión 300) — createOrder no lo toca porque en ese
    // momento la orden todavía puede cancelarse o quedar abandonada. El pago
    // del topup NO vuelve a sumar: las entradas ya se contaron cuando se
    // aprobó el abono original.
    if (!isTopupPayment) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
      for (const item of items) {
        await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${item.quantity}` }).where(eq(ticketTypes.id, item.ticketTypeId));
      }
    }

    if (isMissionDeposit) {
      // Abono aprobado: todavía no se sabe si se junta la meta, así que no se
      // genera ticket/QR — solo se avisa que ya está participando.
      if (!order.depositEmailSent) await sendMissionDepositEmail(order);
    } else if (isTopupPayment) {
      // Diferencia pagada: ahora sí se genera el ticket con QR.
      await db.update(orders).set({ missionTopupStatus: 'paid' }).where(eq(orders.id, order.id));
      if (!order.emailSent) await processApprovedOrder(order);
    } else if (!order.emailSent) {
      // Compra normal a precio general (fuera de la ventana de Misión 300).
      await processApprovedOrder(order);
    }
  }

  return { ok: true };
}

/** Cobra una orden ya creada (pending) directamente con el Payment Brick —
 * sin modal ni redirect de Mercado Pago. El monto SIEMPRE sale de la orden
 * guardada en nuestra base (nunca de lo que mande el cliente), así que aunque
 * alguien manipule el formData del navegador, se cobra el monto correcto. */
export async function processCardPaymentForOrder(input: {
  orderNumber: string;
  token: string;
  paymentMethodId: string;
  issuerId?: string | number;
  installments?: number;
  identificationType?: string;
  identificationNumber?: string;
}): Promise<{ status: 'approved' | 'rejected' | 'in_process' | 'pending'; statusDetail?: string }> {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, input.orderNumber)).limit(1);
  if (!order) throw new Error('Order not found');
  if (order.paymentStatus === 'approved') throw new Error('Order already paid');

  const [event] = await db.select().from(events).where(eq(events.id, order.eventId)).limit(1);

  const result = await createCardPayment({
    orderNumber: order.orderNumber,
    amount: Number(order.total),
    description: `Candyland - ${event?.title ?? 'Mansion Playroom'}`,
    token: input.token,
    paymentMethodId: input.paymentMethodId,
    issuerId: input.issuerId,
    installments: input.installments,
    payerEmail: order.buyerEmail,
    identificationType: input.identificationType,
    identificationNumber: input.identificationNumber,
  });

  await applyPaymentResult({
    orderNumber: order.orderNumber,
    paymentId: result.paymentId,
    status: result.status === 'in_process' ? 'pending' : result.status,
    paymentMethodId: result.paymentMethodId,
  });

  return { status: result.status, statusDetail: result.statusDetail };
}

/** Envía el email de bienvenida + QR para una orden que quedó confirmada al
 * instante por cubrir el 100% con un código de descuento (ver `createOrder`
 * en db.ts, que ya la marcó paymentStatus="approved" y sumó el stock). Reusa
 * el mismo email de ticket que una compra pagada normal — no hay diferencia
 * pendiente que cobrar, así que nunca pasa por el flujo de abono/topup. */
export async function confirmFreeOrder(orderNumber: string) {
  const db = await getDb();
  if (!db) return;

  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  if (!order || order.paymentStatus !== 'approved' || order.emailSent) return;

  await processApprovedOrder(order);
}

webhooksRouter.post('/api/webhooks/mercadopago', async (req: Request, res: Response) => {
  try {
    const { type, data } = req.body;

    if (type === 'payment') {
      const paymentId = data?.id;
      if (!paymentId) {
        res.status(400).json({ error: 'No payment ID' });
        return;
      }

      const paymentInfo = await getPaymentInfo(String(paymentId));
      if (!paymentInfo) {
        res.status(200).json({ ok: true });
        return;
      }

      const orderNumber = paymentInfo.external_reference;
      if (!orderNumber) {
        res.status(200).json({ ok: true });
        return;
      }

      await applyPaymentResult({
        orderNumber,
        paymentId: String(paymentId),
        status: mapPaymentStatus(paymentInfo.status),
        paymentMethodId: paymentInfo.payment_method_id,
      });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(200).json({ ok: true });
  }
});

/** Resuelve (o genera si no existe) el código de embajador propio del
 * comprador y lo guarda en la orden. Se llama tanto desde el email de abono
 * como desde el email final, así el código ya sale desde el primer correo
 * que recibe. No acredita referidos (eso solo pasa una vez, en
 * processApprovedOrder, usando el código que el comprador ingresó al pagar). */
async function ensureOwnAmbassadorCode(db: any, order: any): Promise<string> {
  const existingUsers = await db.select().from(users).where(eq(users.email, order.buyerEmail)).limit(1);
  const code = existingUsers[0]?.ambassadorCode || nanoid(8).toUpperCase();
  await db.update(orders).set({ ambassadorCode: code }).where(eq(orders.id, order.id));
  return code;
}

async function sendMissionDepositEmail(order: any): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) return { success: false };

  const [event] = await db.select().from(events).where(eq(events.id, order.eventId)).limit(1);
  if (!event) return { success: false };

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const emailItems = [];
  for (const item of items) {
    const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, item.ticketTypeId)).limit(1);
    emailItems.push({ name: tt?.name || 'Entrada', quantity: item.quantity, price: Number(item.totalPrice) });
  }

  const ambassadorCode = await ensureOwnAmbassadorCode(db, order);

  const html = buildOrderEmail({
    buyerName: order.buyerName,
    eventTitle: event.title,
    eventDate: formatEventDate(new Date(event.eventDate)),
    doorsOpenText: event.doorsOpen ? formatEventTime(new Date(event.doorsOpen)) : undefined,
    venue: event.venue || '',
    address: event.address || undefined,
    orderNumber: order.orderNumber,
    items: emailItems,
    total: Number(order.total),
    serviceFee: Number(order.serviceFee ?? 0),
    ambassadorCode,
    isMissionDeposit: true,
    ticketReady: false,
  });

  const result = await sendEmail({
    to: order.buyerEmail,
    subject: `🍬 Ya estás en la Misión 300 - ${event.title}`,
    html,
  });

  // Solo se marca como enviado si Resend realmente lo aceptó -- si no, el
  // flag se queda en 0 y se puede reintentar (antes se marcaba igual aunque
  // Resend rechazara el envío, dejando el correo perdido para siempre).
  if (result.success) {
    await db.update(orders).set({ depositEmailSent: 1 }).where(eq(orders.id, order.id));
  }
  return result;
}

/** Arma y manda el email final (con QR) de una orden ya aprobada, usando los
 * tickets que YA existen — no genera tickets nuevos. Se usa tanto la primera
 * vez (justo después de generarlos en processApprovedOrder) como para
 * reenviar manualmente desde el admin (resendConfirmationEmail, más abajo). */
async function sendConfirmationEmailForOrder(order: any): Promise<{ success: boolean }> {
  const db = await getDb();
  if (!db) return { success: false };

  const [event] = await db.select().from(events).where(eq(events.id, order.eventId)).limit(1);
  if (!event) return { success: false };

  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  const emailItems = [];
  for (const item of items) {
    const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, item.ticketTypeId)).limit(1);
    emailItems.push({ name: tt?.name || 'Entrada', quantity: item.quantity, price: Number(item.totalPrice) });
  }

  // Ticket principal para el QR del email: el primero de category="acceso"
  // (nunca un extra) — antes se asumía que era el primero insertado, ahora
  // se filtra explícito para que no dependa del orden de inserción.
  const orderTickets = await db.select().from(tickets).where(eq(tickets.orderId, order.id));
  let mainTicket = null;
  for (const t of orderTickets) {
    const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, t.ticketTypeId)).limit(1);
    if (tt?.category === 'acceso') { mainTicket = t; break; }
  }
  if (!mainTicket) mainTicket = orderTickets[0];

  const extras = await getOrderExtras(order.id);

  const html = buildOrderEmail({
    buyerName: order.buyerName,
    eventTitle: event.title,
    eventDate: formatEventDate(new Date(event.eventDate)),
    doorsOpenText: event.doorsOpen ? formatEventTime(new Date(event.doorsOpen)) : undefined,
    venue: event.venue || '',
    address: event.address || undefined,
    mapsUrl: event.mapsUrl || undefined,
    orderNumber: order.orderNumber,
    items: emailItems,
    total: Number(order.total),
    serviceFee: Number(order.serviceFee ?? 0),
    ambassadorCode: order.ambassadorCode || '',
    isMissionDeposit: order.missionDeposit === 1,
    ticketReady: true,
    ticketCode: mainTicket?.ticketCode,
    attendeeNames: parseAttendeeNames(order.attendeeData),
    extras,
  });

  return sendEmail({
    to: order.buyerEmail,
    subject: `🎉 Tu entrada para ${event.title} - Mansion Playroom`,
    html,
  });
}

/** Reenvía manualmente el email de una orden ya aprobada — para el botón
 * "Reenviar email" del panel admin. Si la orden es un abono de Misión 300
 * que todavía no generó tickets (ver processApprovedOrder), reenvía el
 * correo de bienvenida al abono en vez del correo final con QR -- antes esto
 * siempre mandaba el correo final, que para un abono sin tickets aún no
 * corresponde. No genera tickets nuevos ni vuelve a acreditar referidos. */
export async function resendConfirmationEmail(orderNumber: string) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  if (!order) throw new Error('Orden no encontrada');
  if (order.paymentStatus !== 'approved') throw new Error('La orden todavía no está aprobada');

  const existingTickets = await db.select().from(tickets).where(eq(tickets.orderId, order.id)).limit(1);
  const isUnresolvedDeposit = existingTickets.length === 0 && order.missionDeposit === 1;

  const result = isUnresolvedDeposit
    ? await sendMissionDepositEmail(order)
    : await sendConfirmationEmailForOrder(order);

  if (!result.success) throw new Error('Resend rechazó el envío -- revisa la configuración de RESEND_API_KEY/RESEND_FROM_EMAIL en Vercel.');
  return { success: true };
}

async function processApprovedOrder(order: any) {
  const db = await getDb();
  if (!db) return;

  // Get order items
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));

  // Get event info
  const [event] = await db.select().from(events).where(eq(events.id, order.eventId)).limit(1);
  if (!event) return;

  // Generate tickets — uno por cada UNIDAD comprada, sea acceso o extra
  // (estacionamiento, piscolón, etc.): cada extra ya queda con su propio
  // código/QR individual, solo faltaba mostrarlo (ver getOrderExtras en db.ts).
  for (const item of items) {
    for (let i = 0; i < item.quantity; i++) {
      const ticketCode = `MP-${nanoid(12).toUpperCase()}`;
      const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, event.title);

      await db.insert(tickets).values({
        ticketCode,
        orderId: order.id,
        orderItemId: item.id,
        eventId: order.eventId,
        ticketTypeId: item.ticketTypeId,
        holderName: order.buyerName,
        qrData,
        qrImageUrl,
        status: 'valid',
      });
    }
  }

  // Handle ambassador referral (con el código que el comprador ingresó al pagar, si corresponde).
  // El "dueño" del código casi nunca tiene fila en `users` -esa tabla solo la
  // usa el login OAuth/admin, que los compradores normales no usan- así que
  // se busca directo en sus propias órdenes aprobadas, donde
  // ensureOwnAmbassadorCode ya le dejó su código estampado. (Antes esto
  // buscaba en `users`, que para compradores reales nunca tenía match -el
  // acreditado de referidos nunca se estaba registrando en la práctica.)
  if (order.ambassadorCode) {
    const [ambassadorOrder] = await db.select().from(orders)
      .where(and(eq(orders.ambassadorCode, order.ambassadorCode), eq(orders.paymentStatus, 'approved')))
      .limit(1);
    if (ambassadorOrder && ambassadorOrder.id !== order.id) {
      const totalTickets = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
      await db.insert(referrals).values({
        ambassadorCode: order.ambassadorCode,
        orderId: order.id,
        buyerEmail: order.buyerEmail,
        ticketCount: totalTickets,
        orderTotal: order.total,
      });
    }
  }

  await ensureOwnAmbassadorCode(db, order);
  const [refreshedOrder] = await db.select().from(orders).where(eq(orders.id, order.id)).limit(1);

  const result = await sendConfirmationEmailForOrder(refreshedOrder ?? order);

  // Solo se marca como enviado si Resend realmente lo aceptó (mismo criterio
  // que sendMissionDepositEmail) -- si no, queda en 0 para poder reintentar.
  if (result.success) {
    await db.update(orders).set({ emailSent: 1 }).where(eq(orders.id, order.id));
  }
}

/** Cuántas personas lleva juntadas la Misión 300 de un evento (solo abonos aprobados, sin resolver todavía). */
export async function getMission300Status(eventId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new Error('Event not found');

  const eligible = await db.select().from(orders).where(and(
    eq(orders.eventId, eventId),
    eq(orders.missionDeposit, 1),
    eq(orders.paymentStatus, 'approved'),
    eq(orders.missionTopupStatus, 'none'),
  ));

  let totalPersonas = 0;
  for (const order of eligible) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    for (const item of items) {
      const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, item.ticketTypeId)).limit(1);
      if (tt?.category === 'acceso') totalPersonas += personasForAccesoSlug(tt.accesoSlug) * item.quantity;
    }
  }

  return {
    totalPersonas,
    goal: MISSION_300_GOAL,
    ordersCount: eligible.length,
    cutoffDate: missionCutoff(new Date(event.eventDate)),
    wouldSucceed: totalPersonas >= MISSION_300_GOAL,
  };
}

/** Liquida la Misión 300 de un evento: si se cumplió la meta, genera tickets/QR
 * para todos los abonos ya pagados; si no, calcula y cobra la diferencia
 * (link de pago por email) a cada uno. Se dispara a mano desde el admin —
 * no hay cron automático todavía, ver nota en el panel. */
export async function evaluateMission300(eventId: number) {
  const db = await getDb();
  if (!db) throw new Error('Database not available');

  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!event) throw new Error('Event not found');

  const eligible = await db.select().from(orders).where(and(
    eq(orders.eventId, eventId),
    eq(orders.missionDeposit, 1),
    eq(orders.paymentStatus, 'approved'),
    eq(orders.missionTopupStatus, 'none'),
  ));

  // Personas por orden (para el total) + detalle de items acceso por orden (para el topup si hace falta).
  const orderItemsByOrder = new Map<number, any[]>();
  let totalPersonas = 0;
  for (const order of eligible) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    const withTt = [];
    for (const item of items) {
      const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, item.ticketTypeId)).limit(1);
      withTt.push({ ...item, ticketType: tt });
      if (tt?.category === 'acceso') totalPersonas += personasForAccesoSlug(tt.accesoSlug) * item.quantity;
    }
    orderItemsByOrder.set(order.id, withTt);
  }

  const success = totalPersonas >= MISSION_300_GOAL;
  let resolved = 0;
  let topupRequested = 0;

  for (const order of eligible) {
    if (success) {
      // "paid" acá significa "no debe topup" (se cumplió la meta), no que
      // haya un segundo pago — así esta orden sale de la lista de
      // "pendientes de resolver" y una segunda corrida no la reprocesa.
      await db.update(orders).set({ missionTopupStatus: 'paid', missionTopupAmount: '0' }).where(eq(orders.id, order.id));
      if (!order.emailSent) await processApprovedOrder(order);
      resolved++;
      continue;
    }

    // No se cumplió: cobrar diferencia hasta el 60% del valor general (el
    // abono ya cuenta como parte de ese 60%). Los extras de la misma orden
    // ya se pagaron completos, no suman a esta diferencia.
    const items = orderItemsByOrder.get(order.id) ?? [];
    let topupAmount = 0;
    for (const item of items) {
      if (item.ticketType?.category !== 'acceso') continue;
      const cap = missionCapPrice(Number(item.ticketType.price));
      const alreadyPaidUnit = Number(item.unitPrice);
      topupAmount += Math.max(0, cap - alreadyPaidUnit) * item.quantity;
    }

    if (topupAmount <= 0) {
      // El abono ya alcanzó o superó el tope del 60% (entrada barata) — no hay nada más que cobrar.
      await db.update(orders).set({ missionTopupStatus: 'paid', missionTopupAmount: '0' }).where(eq(orders.id, order.id));
      if (!order.emailSent) await processApprovedOrder(order);
      resolved++;
      continue;
    }

    const pref = await createTopupPreference({
      orderNumber: order.orderNumber,
      eventTitle: event.title,
      amount: topupAmount,
      buyerEmail: order.buyerEmail,
      buyerName: order.buyerName,
    });

    await db.update(orders).set({
      missionTopupStatus: 'pending',
      missionTopupAmount: String(topupAmount),
      missionTopupPreferenceId: pref.id,
    }).where(eq(orders.id, order.id));

    const html = buildMissionTopupEmail({
      buyerName: order.buyerName,
      eventTitle: event.title,
      eventDate: formatEventDate(new Date(event.eventDate)),
      orderNumber: order.orderNumber,
      topupAmount,
      paymentUrl: pref.initPoint || '',
    });

    await sendEmail({
      to: order.buyerEmail,
      subject: `Completa tu entrada — Misión 300 no alcanzó la meta - ${event.title}`,
      html,
    });

    topupRequested++;
  }

  return { totalPersonas, goal: MISSION_300_GOAL, success, ordersEvaluated: eligible.length, resolved, topupRequested };
}
