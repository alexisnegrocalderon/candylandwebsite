import { eq, sql, inArray } from "drizzle-orm";
import { orders, orderItems, ticketTypes } from "../../drizzle/schema";
import { applyOp } from "./ops";
import { awardPlaycoins, redeemPlaycoinsAuthoritative } from "../db";

/** Venta presencial en caja (docs/ARQUITECTURA-CAJA.md §0.4, §3.1.5): se
 * cobra en el terminal externo (fuera del sistema) y acá solo se registra --
 * `orders` con `channel='caja'`, aprobada al instante, sin email al cliente
 * (no hay a quién mandárselo: recibe el ticket físico en el momento) ni copia
 * a contacto@ (a pedido explícito: en la noche del evento pasan muchas
 * ventas por minuto, saturaría el correo -- esa copia queda solo para las
 * ventas web, ver processApprovedOrder en webhooks.ts). Se reutiliza
 * `orders`/`orderItems` en vez de una tabla `sales` aparte para que el
 * reporting/CSV/stats del admin ya existentes la vean sola. */
export async function createCajaSale(
  db: any,
  params: {
    opId: string;
    eventId: number;
    operatorId: number;
    registerId?: number | null;
    items: { ticketTypeId: number; quantity: number }[];
    paymentMethod: "efectivo" | "debito" | "credito";
    clientAt: Date;
    // Playcoins (pedido explícito del usuario): captura opcional del email
    // del cliente para que la venta también gane puntos, y canje opcional de
    // puntos ya ganados como descuento del total.
    buyerEmail?: string;
    redeemPlaycoins?: number;
  }
) {
  if (params.items.length === 0) throw new Error("La venta necesita al menos un producto");

  const ticketTypeIds = params.items.map(i => i.ticketTypeId);
  const tts = await db.select().from(ticketTypes).where(inArray(ticketTypes.id, ticketTypeIds));
  const ttById = new Map<number, any>(tts.map((t: any) => [t.id, t]));

  let total = 0;
  const lineItems: { ticketTypeId: number; quantity: number; unitPrice: number; unitCost: number | null; name: string }[] = [];
  for (const item of params.items) {
    const tt = ttById.get(item.ticketTypeId);
    if (!tt) throw new Error(`Producto ${item.ticketTypeId} no encontrado`);
    const available = tt.totalStock - tt.soldCount;
    if (item.quantity > available) throw new Error(`Sin stock suficiente de ${tt.name}`);
    const unitPrice = Number(tt.price);
    total += unitPrice * item.quantity;
    lineItems.push({ ticketTypeId: tt.id, quantity: item.quantity, unitPrice, unitCost: tt.costPrice != null ? Number(tt.costPrice) : null, name: tt.name });
  }

  const { result, conflictNote } = await applyOp(
    db,
    {
      id: params.opId,
      type: "sale",
      eventId: params.eventId,
      operatorId: params.operatorId,
      registerId: params.registerId,
      targetType: "order",
      targetId: params.opId, // la orden todavía no existe al momento de armar el op -- se referencia por el mismo opId
      payload: { items: lineItems, paymentMethod: params.paymentMethod, total, buyerEmail: params.buyerEmail ?? null, redeemRequested: params.redeemPlaycoins ?? 0 },
      clientAt: params.clientAt,
    },
    async () => {
      // Canje de Playcoins: SERVER-AUTHORITATIVE, dentro de este mismo
      // mutate() -- se relee el saldo real en el instante en que esta
      // operación finalmente se aplica (no cuando el cajero la encoló
      // offline). Si falla (otro dispositivo canjeó primero), la venta
      // igual se aplica a precio completo -- no se bloquea la entrega de
      // productos en el evento por una carrera de saldo entre dispositivos.
      let redeemedAmount = 0;
      let redeemConflictNote: string | undefined;
      if (params.redeemPlaycoins && params.redeemPlaycoins > 0 && params.buyerEmail) {
        const redemption = await redeemPlaycoinsAuthoritative({
          email: params.buyerEmail, requestedAmount: params.redeemPlaycoins, opId: params.opId,
        });
        if (redemption.ok) redeemedAmount = redemption.redeemed;
        else redeemConflictNote = redemption.conflictNote;
      }

      const finalTotal = total - redeemedAmount;
      const orderNumber = `CAJA-${Date.now().toString(36).toUpperCase()}`;
      const [orderResult] = await db.insert(orders).values({
        orderNumber,
        buyerName: "Venta en caja",
        buyerEmail: params.buyerEmail?.trim().toLowerCase() || "caja@mansionplayroom.cl",
        eventId: params.eventId,
        subtotal: String(total),
        discount: String(redeemedAmount),
        total: String(finalTotal),
        paymentStatus: "approved",
        paymentId: `CAJA-${params.opId}`,
        paymentMethod: params.paymentMethod,
        channel: "caja",
        operatorId: params.operatorId,
        registerId: params.registerId ?? null,
        emailSent: 1, // no corresponde email al cliente en una venta presencial
      });
      const orderId = (orderResult as unknown as { insertId: number }).insertId;

      for (const item of lineItems) {
        await db.insert(orderItems).values({
          orderId,
          ticketTypeId: item.ticketTypeId,
          quantity: item.quantity,
          unitPrice: String(item.unitPrice),
          totalPrice: String(item.unitPrice * item.quantity),
          unitCost: item.unitCost != null ? String(item.unitCost) : null,
        });
        await db.update(ticketTypes).set({ soldCount: sql`soldCount + ${item.quantity}` }).where(eq(ticketTypes.id, item.ticketTypeId));
      }

      // Ganar Playcoins por esta venta (pedido explícito del usuario, si el
      // cajero capturó el email) -- sobre lo efectivamente pagado, no sobre
      // el precio antes del canje.
      if (params.buyerEmail) {
        await awardPlaycoins({ email: params.buyerEmail, totalClp: finalTotal, reason: 'earn_caja', opId: params.opId });
      }

      return { result: "applied" as const, conflictNote: redeemConflictNote };
    }
  );

  return { result, conflictNote };
}
