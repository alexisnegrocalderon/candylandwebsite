import { Router, Request, Response } from 'express';
import { getPaymentInfo } from './mercadopago';
import { getDb } from './db';
import { orders, orderItems, tickets, ticketTypes, referrals, users } from '../drizzle/schema';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { generateTicketQR } from './qr';
import { sendEmail, buildConfirmationEmail } from './email';

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

      // If approved, generate tickets and send email (idempotent check)
      if (status === 'approved' && !order.emailSent) {
        await processApprovedOrder(order);
      }

      // If rejected, release stock
      if (status === 'rejected') {
        const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
        for (const item of items) {
          await db.update(ticketTypes).set({ soldCount: sql`GREATEST(0, soldCount - ${item.quantity})` }).where(eq(ticketTypes.id, item.ticketTypeId));
        }
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[Webhook] Error:', error);
    res.status(200).json({ ok: true });
  }
});

async function processApprovedOrder(order: any) {
  const db = await getDb();
  if (!db) return;

  // Get order items
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));

  // Get event info
  const { events } = await import('../drizzle/schema');
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
