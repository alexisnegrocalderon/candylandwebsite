import { Router, Request, Response } from 'express';
import { getPaymentInfo, createTopupPreference } from './mercadopago';
import { getDb } from './db';
import { orders, orderItems, tickets, ticketTypes, events, referrals, users } from '../drizzle/schema';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { generateTicketQR } from './qr';
import { sendEmail, buildConfirmationEmail, buildMissionDepositEmail, buildMissionTopupEmail } from './email';
import { missionCutoff, missionCapPrice, personasForAccesoSlug, MISSION_300_GOAL } from '../shared/mission300';

export const webhooksRouter = Router();

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

      const db = await getDb();
      if (!db) {
        res.status(500).json({ error: 'DB unavailable' });
        return;
      }

      const orderNumber = paymentInfo.external_reference;
      if (!orderNumber) {
        res.status(200).json({ ok: true });
        return;
      }

      // Get order
      const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
      if (!order) {
        res.status(200).json({ ok: true });
        return;
      }

      // Idempotency: skip if already processed with same status
      if (order.paymentId === String(paymentId) && order.paymentStatus !== 'pending') {
        res.status(200).json({ ok: true, message: 'Already processed' });
        return;
      }

      // Map payment status
      let status: 'approved' | 'rejected' | 'pending' = 'pending';
      if (paymentInfo.status === 'approved') status = 'approved';
      else if (paymentInfo.status === 'rejected' || paymentInfo.status === 'cancelled') status = 'rejected';

      // Update order
      await db.update(orders).set({
        paymentStatus: status,
        paymentId: String(paymentId),
        paymentMethod: paymentInfo.payment_method_id || undefined,
      }).where(eq(orders.id, order.id));

      if (status === 'approved') {
        // El pago del abono de Misión 300 y el pago de la diferencia (topup)
        // son DOS pagos separados sobre la MISMA orden (mismo orderNumber
        // como external_reference). Si ya hay un topup pendiente, este pago
        // aprobado es la diferencia, no una compra nueva.
        const isTopupPayment = order.missionTopupStatus === 'pending';
        const isMissionDeposit = order.missionDeposit === 1 && order.missionTopupStatus === 'none';

        // Recién acá, con el pago confirmado, se suma al stock vendido (y por
        // lo tanto al contador de Misión 300) — createOrder no lo toca porque
        // en ese momento la orden todavía puede cancelarse o quedar
        // abandonada. El pago del topup NO vuelve a sumar: las entradas ya
        // se contaron cuando se aprobó el abono original.
        if (!isTopupPayment) {
          const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
          for (const item of items) {
            await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${item.quantity}` }).where(eq(ticketTypes.id, item.ticketTypeId));
          }
        }

        if (isMissionDeposit) {
          // Abono aprobado: todavía no se sabe si se junta la meta, así que
          // no se genera ticket/QR — solo se avisa que ya está participando.
          if (!order.depositEmailSent) {
            await sendMissionDepositEmail(order);
          }
        } else if (isTopupPayment) {
          // Diferencia pagada: ahora sí se genera el ticket con QR.
          await db.update(orders).set({ missionTopupStatus: 'paid' }).where(eq(orders.id, order.id));
          if (!order.emailSent) await processApprovedOrder(order);
        } else if (!order.emailSent) {
          // Compra normal a precio general (fuera de la ventana de Misión 300).
          await processApprovedOrder(order);
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(200).json({ ok: true });
  }
});

async function sendMissionDepositEmail(order: any) {
  const db = await getDb();
  if (!db) return;

  const [event] = await db.select().from(events).where(eq(events.id, order.eventId)).limit(1);
  if (!event) return;

  const html = buildMissionDepositEmail({
    buyerName: order.buyerName,
    eventTitle: event.title,
    eventDate: new Date(event.eventDate).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    orderNumber: order.orderNumber,
    depositTotal: Number(order.total),
    cutoffDateText: missionCutoff(new Date(event.eventDate)).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' }),
  });

  await sendEmail({
    to: order.buyerEmail,
    subject: `🍬 Ya estás en la Misión 300 - ${event.title}`,
    html,
  });

  await db.update(orders).set({ depositEmailSent: 1 }).where(eq(orders.id, order.id));
}

async function processApprovedOrder(order: any) {
  const db = await getDb();
  if (!db) return;

  // Get order items
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));

  // Get event info
  const [event] = await db.select().from(events).where(eq(events.id, order.eventId)).limit(1);
  if (!event) return;

  // Generate tickets
  const ticketCodes: string[] = [];
  let firstQrUrl = '';

  for (const item of items) {
    const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, item.ticketTypeId)).limit(1);

    for (let i = 0; i < item.quantity; i++) {
      const ticketCode = `MP-${nanoid(12).toUpperCase()}`;
      ticketCodes.push(ticketCode);

      // Generate QR
      const { qrData, qrImageUrl } = await generateTicketQR(ticketCode, event.title);
      if (!firstQrUrl) firstQrUrl = qrImageUrl;

      // Save ticket
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

  // Handle ambassador referral
  let ambassadorCode = '';
  if (order.ambassadorCode) {
    // Find ambassador user
    const [ambassador] = await db.select().from(users).where(eq(users.ambassadorCode, order.ambassadorCode)).limit(1);
    if (ambassador) {
      const totalTickets = items.reduce((sum: number, item: any) => sum + item.quantity, 0);
      await db.insert(referrals).values({
        ambassadorUserId: ambassador.id,
        ambassadorCode: order.ambassadorCode,
        orderId: order.id,
        buyerEmail: order.buyerEmail,
        ticketCount: totalTickets,
        orderTotal: order.total,
      });
      // Increment referral count
      await db.update(users).set({ totalReferrals: sql`totalReferrals + 1` }).where(eq(users.id, ambassador.id));
    }
  }

  // Generate ambassador code for buyer (find or create)
  // Always generate a stable ambassador code based on the buyer email
  ambassadorCode = nanoid(8).toUpperCase();
  // Try to find existing user by email
  const existingUsers = await db.select().from(users).where(eq(users.email, order.buyerEmail)).limit(1);
  if (existingUsers.length > 0 && existingUsers[0].ambassadorCode) {
    ambassadorCode = existingUsers[0].ambassadorCode;
  }
  // Store the ambassador code in the order for reference
  await db.update(orders).set({ ambassadorCode }).where(eq(orders.id, order.id));

  // Get ticket type names for email
  const emailItems = [];
  for (const item of items) {
    const [tt] = await db.select().from(ticketTypes).where(eq(ticketTypes.id, item.ticketTypeId)).limit(1);
    emailItems.push({
      name: tt?.name || 'Entrada',
      quantity: item.quantity,
      price: Number(item.totalPrice),
    });
  }

  // Send confirmation email
  const emailHtml = buildConfirmationEmail({
    buyerName: order.buyerName,
    eventTitle: event.title,
    eventDate: new Date(event.eventDate).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    venue: event.venue || '',
    orderNumber: order.orderNumber,
    items: emailItems,
    total: Number(order.total),
    qrImageUrl: firstQrUrl,
    ambassadorCode,
    ticketCodes,
  });

  await sendEmail({
    to: order.buyerEmail,
    subject: `🎉 Tu entrada para ${event.title} - Mansion Playroom`,
    html: emailHtml,
  });

  // Mark email as sent
  await db.update(orders).set({ emailSent: 1 }).where(eq(orders.id, order.id));
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
      eventDate: new Date(event.eventDate).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
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
