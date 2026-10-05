import { and, eq, sql } from "drizzle-orm";
import { orders, orderItems, ticketTypes, discountCodes, kitchenTickets, lockerItems, ops, playcoinsLedger, prepaidLedger } from "../../drizzle/schema";
import { applyOp } from "./ops";
import { adjustPlaycoinsManually, refundPrepaidForVoidedSale } from "../db";

/** Id del op de la venta original: `createCajaSale` guarda la orden con
 * `paymentId = CAJA-<opId>`, y Playcoins/saldo/descuento quedaron ligados a
 * ESE opId (no al orderId) -- así se encuentran para revertirlos. */
export function saleOpIdFromPaymentId(paymentId: string | null | undefined): string | null {
  if (!paymentId?.startsWith("CAJA-")) return null;
  return paymentId.slice("CAJA-".length) || null;
}

/** Anulación de una venta de caja completa (pedido explícito del dueño, solo
 * con su clave de admin -- verificada en el router, no acá).
 *
 * Nunca se borra nada: la orden pasa a `refunded` (dashboard, cuadre de
 * turno y reportes ya cuentan solo `approved`, así que sale sola de los
 * totales), y cada efecto secundario de la venta se revierte con una fila
 * nueva en su propio ledger. El motivo, quién estaba logueado en la caja, la
 * IP y el detalle de la venta quedan en el ledger `ops` como `void_sale`. */
export async function voidCajaSale(
  db: any,
  params: {
    opId: string;
    orderNumber: string;
    eventId: number;
    operatorId: number;
    registerId?: number | null;
    reason: string;
    ip?: string | null;
    clientAt: Date;
  }
) {
  const orderNumber = params.orderNumber.trim().toUpperCase();
  const [order] = await db.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1);
  const items = order ? await db.select().from(orderItems).where(eq(orderItems.orderId, order.id)) : [];

  const { result, conflictNote } = await applyOp(
    db,
    {
      id: params.opId,
      type: "void_sale",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "order",
      targetId: orderNumber,
      payload: {
        orderNumber,
        reason: params.reason.trim(),
        ip: params.ip ?? null,
        total: order ? Number(order.total) : null,
        paymentMethod: order?.paymentMethod ?? null,
        buyerName: order?.buyerName ?? null,
        saleOperatorId: order?.operatorId ?? null,
        saleCreatedAt: order?.createdAt ?? null,
        items: items.map((i: any) => ({ ticketTypeId: i.ticketTypeId, quantity: i.quantity, unitPrice: Number(i.unitPrice) })),
      },
      clientAt: params.clientAt,
    },
    async () => {
      if (!order) return { result: "rejected" as const, conflictNote: "La venta no existe" };
      if (order.channel !== "caja") return { result: "rejected" as const, conflictNote: "Solo se pueden anular ventas de caja" };
      if (order.eventId !== params.eventId) return { result: "rejected" as const, conflictNote: "La venta no corresponde a este evento" };
      if (order.paymentStatus !== "approved") return { result: "rejected" as const, conflictNote: "La venta ya estaba anulada" };

      // UPDATE condicional: si dos tablets anulan la misma venta a la vez,
      // solo una pasa de approved a refunded -- la otra no revierte nada.
      const [updateResult] = await db.update(orders).set({ paymentStatus: "refunded" })
        .where(and(eq(orders.id, order.id), eq(orders.paymentStatus, "approved")));
      if ((updateResult as { affectedRows?: number } | undefined)?.affectedRows === 0) {
        return { result: "rejected" as const, conflictNote: "La venta ya estaba anulada" };
      }

      for (const item of items) {
        await db.update(ticketTypes).set({ soldCount: sql`GREATEST(soldCount - ${item.quantity}, 0)` }).where(eq(ticketTypes.id, item.ticketTypeId));
      }

      const note = `Venta ${orderNumber} anulada: ${params.reason.trim()}`.slice(0, 500);
      const saleOpId = saleOpIdFromPaymentId(order.paymentId);
      if (saleOpId) {
        // Playcoins ganados (+) y canjeados (-) en esta venta: se invierte
        // cada movimiento con un ajuste nuevo, nunca se borra la fila.
        const playcoinRows = await db.select().from(playcoinsLedger).where(eq(playcoinsLedger.opId, saleOpId));
        for (const row of playcoinRows) {
          if (row.delta !== 0) await adjustPlaycoinsManually(row.customerId, -row.delta, note);
        }

        // Saldo prepagado gastado: es plata real del cliente, se devuelve.
        const prepaidRows = await db.select().from(prepaidLedger)
          .where(and(eq(prepaidLedger.opId, saleOpId), eq(prepaidLedger.reason, "spend_caja")));
        for (const row of prepaidRows) {
          if (row.delta < 0) await refundPrepaidForVoidedSale({ customerId: row.customerId, amountClp: -row.delta, voidOpId: params.opId, note });
        }

        // El código de descuento usado vuelve a quedar disponible.
        const [saleOp] = await db.select().from(ops).where(eq(ops.id, saleOpId)).limit(1);
        const discountCode = (saleOp?.payload as { discountCode?: string } | null)?.discountCode;
        if (discountCode) {
          await db.update(discountCodes).set({ usedCount: sql`GREATEST(usedCount - 1, 0)` }).where(eq(discountCodes.code, discountCode));
        }
      }

      // Comanda y percha: salen de las pantallas de cocina/guardarropía.
      await db.update(kitchenTickets).set({ status: "anulado" }).where(eq(kitchenTickets.orderId, order.id));
      await db.update(lockerItems).set({ status: "anulado" }).where(eq(lockerItems.orderId, order.id));

      return { result: "applied" as const };
    }
  );

  return {
    result,
    conflictNote,
    order: order ? { orderNumber, total: Number(order.total), paymentMethod: order.paymentMethod as string, buyerName: order.buyerName as string } : null,
  };
}
