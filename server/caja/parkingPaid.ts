import { eq, and, inArray, ne, sql } from "drizzle-orm";
import { orders, orderItems, tickets, ticketTypes } from "../../drizzle/schema";
import { applyOp } from "./ops";
import { generateDisplayCode, fallbackInternalCode } from "./displayCode";
import { isParkingTicketType, PLACEHOLDER_BUYER_EMAILS } from "../../shared/parking";
import { verifyCardPin, spendPrepaidAuthoritative } from "../db";

/** Resuelve y valida el cobro de estacionamiento para un ticket escaneado --
 * parte compartida entre `sellParkingAtDoor` (efectivo/débito/crédito) y
 * `payParkingWithSaldo` (saldo prepagado): busca el ticket y su orden,
 * encuentra el único producto "Estacionamiento" del evento, y aplica la
 * guarda contra cobro doble. No cobra nada -- eso lo hace cada camino según
 * su propio medio de pago. */
async function resolveParkingCharge(db: any, params: { eventId: number; ticketCode: string }): Promise<
  | { ok: false; conflictNote: string }
  | { ok: true; buyerOrder: any; parkingType: any; price: number }
> {
  const [scanned] = await db.select().from(tickets).where(eq(tickets.ticketCode, params.ticketCode)).limit(1);
  if (!scanned) return { ok: false, conflictNote: "El código no existe" };
  if (scanned.eventId !== params.eventId) return { ok: false, conflictNote: "El código no corresponde a este evento" };
  if (scanned.status === "cancelled") return { ok: false, conflictNote: "El acceso fue anulado" };

  const [buyerOrder] = await db.select().from(orders).where(eq(orders.id, scanned.orderId)).limit(1);
  if (!buyerOrder) return { ok: false, conflictNote: "No se encontró la orden de este ticket" };

  // Producto "Estacionamiento" de este evento -- debe ser exactamente uno
  // para poder cobrar sin ambigüedad (excluye "Estacionamiento VIP").
  const eventTicketTypes = await db.select().from(ticketTypes).where(eq(ticketTypes.eventId, params.eventId));
  const parkingTypes = (eventTicketTypes as any[]).filter((tt) => tt.category === "extra" && isParkingTicketType(tt.name));
  if (parkingTypes.length !== 1) {
    return {
      ok: false,
      conflictNote: parkingTypes.length === 0
        ? "Este evento no tiene un producto \"Estacionamiento\" configurado en Entradas"
        : "Hay más de un producto \"Estacionamiento\" en este evento -- deja solo uno para poder cobrar en la puerta",
    };
  }
  const parkingType = parkingTypes[0];

  // Guarda contra cobro doble: server-autoritativo, corre acá (al aplicar la
  // operación de verdad), no cuando se encoló offline -- así protege incluso
  // si dos dispositivos escanearon a la misma persona casi al mismo tiempo
  // sin verse.
  const buyerEmail = (buyerOrder.buyerEmail || "").trim().toLowerCase();
  if (buyerEmail && !PLACEHOLDER_BUYER_EMAILS.has(buyerEmail)) {
    const sameBuyerOrders = await db.select({ id: orders.id }).from(orders).where(and(
      eq(orders.eventId, params.eventId),
      eq(orders.buyerEmail, buyerOrder.buyerEmail),
      eq(orders.paymentStatus, "approved"),
    ));
    const orderIds = (sameBuyerOrders as any[]).map((o) => o.id);
    if (orderIds.length > 0) {
      const existingParking = await db.select({ id: tickets.id }).from(tickets).where(and(
        inArray(tickets.orderId, orderIds),
        eq(tickets.ticketTypeId, parkingType.id),
        ne(tickets.status, "cancelled"),
      ));
      if ((existingParking as any[]).length > 0) {
        return { ok: false, conflictNote: "Este ticket ya tiene estacionamiento pagado" };
      }
    }
  }

  return { ok: true, buyerOrder, parkingType, price: Number(parkingType.price) };
}

/** Crea la orden+ítem+ticket del cobro de estacionamiento -- parte
 * compartida entre `sellParkingAtDoor` y `payParkingWithSaldo`, una vez que
 * el cobro (en el medio que sea) ya se validó/aplicó. */
async function createParkingOrderAndTicket(db: any, params: {
  eventId: number; opId: string; operatorId: number;
  buyerOrder: any; parkingType: any; price: number; paymentMethod: string; paymentId: string;
}) {
  const [orderResult] = await db.insert(orders).values({
    orderNumber: `PUERTA-${Date.now().toString(36).toUpperCase()}`,
    buyerName: params.buyerOrder.buyerName,
    buyerEmail: params.buyerOrder.buyerEmail,
    buyerPhone: params.buyerOrder.buyerPhone,
    eventId: params.eventId,
    subtotal: String(params.price),
    total: String(params.price),
    paymentStatus: "approved",
    paymentId: params.paymentId,
    paymentMethod: params.paymentMethod,
    channel: "caja",
    operatorId: params.operatorId,
    emailSent: 1, // venta en la puerta, no corresponde correo
  });
  const newOrderId = (orderResult as unknown as { insertId: number }).insertId;

  const [itemResult] = await db.insert(orderItems).values({
    orderId: newOrderId,
    ticketTypeId: params.parkingType.id,
    quantity: 1,
    unitPrice: String(params.price),
    totalPrice: String(params.price),
    unitCost: params.parkingType.costPrice != null ? String(params.parkingType.costPrice) : null,
  });
  const orderItemId = (itemResult as unknown as { insertId: number }).insertId;

  // El auto ya está en la puerta al momento de cobrar -- el ticket nace
  // directamente 'used', no queda un QR pendiente de canjear después.
  await db.insert(tickets).values({
    ticketCode: `PK-${params.opId}`,
    orderId: newOrderId,
    orderItemId,
    eventId: params.eventId,
    ticketTypeId: params.parkingType.id,
    holderName: params.buyerOrder.buyerName,
    status: "used",
    usedAt: new Date(),
    usedByOperatorId: params.operatorId,
    displayCode: generateDisplayCode(params.parkingType.internalCode || fallbackInternalCode(params.parkingType.name)),
  });

  await db.update(ticketTypes).set({ soldCount: sql`soldCount + 1` }).where(eq(ticketTypes.id, params.parkingType.id));
}

/** Cobra estacionamiento en la puerta para el comprador del ticket escaneado
 * (docs del feature: plan "Terminal de estacionamiento en /puerta").
 *
 * Es el gemelo de `createCajaSale` (venta presencial) + `checkInTicket`
 * (marca de acceso), pero a diferencia de ambas SÍ genera un `tickets` real
 * (para que quede contable/escaneable) y NO toca `orders.paymentMethod` más
 * allá del método tal cual ('efectivo'/'debito'/'credito') -- así el cálculo
 * automático de comisión de tarjeta (que mira `channel`+`paymentMethod`)
 * sigue funcionando sin cambios. La marca de "vino de la puerta" vive en
 * `paymentId` (prefijo `PUERTA-PARKING-`), que `shared/parking.ts`
 * `classifyParkingOrigin` usa para el reporte. */
export async function sellParkingAtDoor(
  db: any,
  params: {
    opId: string;
    eventId: number;
    ticketCode: string;
    paymentMethod: "efectivo" | "debito" | "credito";
    operatorId: number;
    clientAt: Date;
  }
) {
  const code = params.ticketCode.trim().toUpperCase();

  const { result, conflictNote } = await applyOp(
    db,
    {
      id: params.opId,
      type: "parking_paid",
      eventId: params.eventId,
      operatorId: params.operatorId,
      targetType: "ticket",
      targetId: code,
      payload: { ticketCode: code, paymentMethod: params.paymentMethod },
      clientAt: params.clientAt,
    },
    async () => {
      const charge = await resolveParkingCharge(db, { eventId: params.eventId, ticketCode: code });
      if (!charge.ok) return { result: "rejected" as const, conflictNote: charge.conflictNote };

      await createParkingOrderAndTicket(db, {
        eventId: params.eventId, opId: params.opId, operatorId: params.operatorId,
        buyerOrder: charge.buyerOrder, parkingType: charge.parkingType, price: charge.price,
        paymentMethod: params.paymentMethod, paymentId: `PUERTA-PARKING-${params.opId}`,
      });

      return { result: "applied" as const };
    }
  );

  return { result, conflictNote };
}

/** Cobra estacionamiento en la puerta con SALDO PREPAGADO (pedido explícito
 * del dueño, etapa 2 de la tarjeta de membresía) -- gemelo de
 * `sellParkingAtDoor`, pero SOLO se llama desde un procedure online directo
 * (`puerta.payParkingWithSaldo`), nunca desde `puerta.sync`: el saldo exige
 * conexión siempre, a diferencia de efectivo/débito/crédito.
 *
 * El email+PIN que paga es de quien está pagando en ese momento en la puerta
 * (tecleado ahí), no necesariamente el comprador del ticket escaneado --
 * mismo criterio que ya usa `handleCustomerScan` en /caja para Playcoins: el
 * QR es solo un atajo para identificar el ticket, la identidad de quién paga
 * la da el email+PIN. */
export async function payParkingWithSaldo(
  db: any,
  params: {
    opId: string;
    eventId: number;
    ticketCode: string;
    buyerEmail: string;
    cardPin: string;
    operatorId: number;
    clientAt: Date;
  }
) {
  const code = params.ticketCode.trim().toUpperCase();
  const payerEmail = params.buyerEmail.trim().toLowerCase();

  const { result, conflictNote } = await applyOp(
    db,
    {
      id: params.opId,
      type: "parking_paid",
      eventId: params.eventId,
      operatorId: params.operatorId,
      targetType: "ticket",
      targetId: code,
      payload: { ticketCode: code, paymentMethod: "saldo", payerEmail },
      clientAt: params.clientAt,
    },
    async () => {
      const charge = await resolveParkingCharge(db, { eventId: params.eventId, ticketCode: code });
      if (!charge.ok) return { result: "rejected" as const, conflictNote: charge.conflictNote };

      const pinCheck = await verifyCardPin({ email: payerEmail, pin: params.cardPin });
      if (!pinCheck.ok) return { result: "rejected" as const, conflictNote: pinCheck.reason };

      const spend = await spendPrepaidAuthoritative({
        customerId: pinCheck.customerId, amountClp: charge.price, reason: "spend_puerta", opId: params.opId,
      });
      if (!spend.ok) return { result: "rejected" as const, conflictNote: spend.conflictNote };

      await createParkingOrderAndTicket(db, {
        eventId: params.eventId, opId: params.opId, operatorId: params.operatorId,
        buyerOrder: charge.buyerOrder, parkingType: charge.parkingType, price: charge.price,
        paymentMethod: "saldo", paymentId: `PUERTA-PARKING-${params.opId}`,
      });

      return { result: "applied" as const };
    }
  );

  return { result, conflictNote };
}
